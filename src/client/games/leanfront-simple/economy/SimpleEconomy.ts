import type { SimplePlotEconomyConfig } from "../../../../core/configuration/Config";
import { setUrbanTickProvider } from "../../../../core/execution/utils/UrbanGrowth";
import type { Game, Player } from "../../../../core/game/Game";
import { UnitType } from "../../../../core/game/Game";
import type {
  LiveActionResolution,
  LivePlotAction,
  LiveRuntimeStats,
} from "../../LiveGameRuntime";

export type { SimplePlotEconomyConfig } from "../../../../core/configuration/Config";

export type SimplePlotKind = "city" | "farm";

export interface SimplePlotInput {
  unitId: number;
  tile: number;
  owner: number;
  kind: SimplePlotKind;
  level: number;
  stock: number;
}

export interface SimplePlotGrowth extends SimplePlotInput {
  capacity: number;
  growth: number;
  nextStock: number;
}

export type SimpleGrowthBatch = (
  records: readonly SimplePlotInput[],
  config: SimplePlotEconomyConfig,
) => Promise<readonly SimplePlotGrowth[]>;

export interface SimpleEconomyActions {
  resolvePlotAction(
    game: Game,
    player: Player,
    action: LivePlotAction,
    tile: number,
  ): LiveActionResolution;
  stats(player: Player): LiveRuntimeStats;
}

export function growSimplePlot(
  record: SimplePlotInput,
  config: SimplePlotEconomyConfig,
): SimplePlotGrowth {
  const level = Math.max(1, Math.floor(record.level));
  const capacity = config.capacityPerLevel * level;
  const stock = record.stock;
  if (stock >= capacity) {
    return { ...record, level, stock, capacity, growth: 0, nextStock: stock };
  }
  const capacityF = Math.fround(capacity);
  const stockF = Math.fround(stock);
  const ratio = Math.fround(capacityF / Math.max(1, stockF));
  const raw = Math.fround(
    Math.fround(
      Math.fround(
        record.kind === "city" ? config.cityGrowthRate : config.farmGrowthRate,
      ) * stockF,
    ) * Math.fround(Math.log(ratio)),
  );
  const growth = Math.max(1, Math.floor(raw));
  return {
    ...record,
    level,
    stock,
    capacity,
    growth,
    nextStock: Math.min(capacity, stock + growth),
  };
}

export async function growSimplePlotsCpu(
  records: readonly SimplePlotInput[],
  config: SimplePlotEconomyConfig,
): Promise<readonly SimplePlotGrowth[]> {
  return records.map((record) => growSimplePlot(record, config));
}

export function apportion(
  total: number,
  weighted: readonly { unitId: number; weight: number }[],
): Map<number, number> {
  if (total <= 0 || weighted.length === 0) return new Map();
  const ordered = [...weighted].sort((a, b) => a.unitId - b.unitId);
  const weight = ordered.reduce(
    (sum, entry) => sum + BigInt(Math.max(0, Math.floor(entry.weight))),
    0n,
  );
  const shares = new Map<number, number>();
  let assigned = 0n;
  const exactTotal = BigInt(Math.floor(total));
  for (const entry of ordered) {
    const share = Number(
      weight > 0n
        ? (exactTotal * BigInt(Math.max(0, Math.floor(entry.weight)))) / weight
        : 0n,
    );
    shares.set(entry.unitId, share);
    assigned += BigInt(share);
  }
  for (let i = assigned; i < exactTotal; i++) {
    const entry = ordered[Number((i - assigned) % BigInt(ordered.length))]!;
    shares.set(entry.unitId, (shares.get(entry.unitId) ?? 0) + 1);
  }
  return shares;
}

interface Balance {
  troops: number;
  food: bigint;
}

const chargeFor = (people: number, milli: bigint): bigint =>
  (BigInt(Math.max(0, Math.floor(people))) * milli + 999n) / 1000n;
const affordablePeople = (food: bigint, milli: bigint): number =>
  Number((food * 1000n) / milli);

/** Compact client-side stocks; the core remains authoritative for units. */
export class SimpleEconomy {
  constructor(
    private readonly growth: SimpleGrowthBatch = growSimplePlotsCpu,
  ) {}

  private records = new Map<number, SimplePlotInput>();
  private published = new Map<string, Balance>();
  private dormantTroops = new Map<string, number>();
  private staged = new Map<string, Balance>();
  private frame = new Map<number, SimplePlotGrowth>();
  private seenAttackIds = new Set<string>();
  private attackConsumption = new Map<string, number>();
  private unpaidFoodDebits = new Map<string, number>();
  private readonly urbanTickProvider = (game: Game, player: Player) =>
    this.applyPlayer(game, player);
  private game: Game | null = null;

  install(game: Game): void {
    this.game = game;
    setUrbanTickProvider(game, this.urbanTickProvider);
  }

  async prepare(
    game: Game,
    grow: SimpleGrowthBatch = this.growth,
    synchronize = false,
  ): Promise<void> {
    const config = game.config().simplePlotEconomy();
    if (config === null) return;

    const active = new Map<number, SimplePlotInput>();
    const surviving = new Map<number, SimplePlotInput[]>();
    const createdFarms = new Map<number, SimplePlotInput[]>();
    for (const unit of game.units(UnitType.Settlement, UnitType.Farmland)) {
      if (!unit.isActive() || unit.isUnderConstruction()) continue;
      const kind: SimplePlotKind =
        unit.type() === UnitType.Settlement ? "city" : "farm";
      const previous = this.records.get(unit.id());
      const owner = unit.owner().smallID();
      const record: SimplePlotInput = {
        unitId: unit.id(),
        tile: unit.tile(),
        owner,
        kind,
        level: unit.level(),
        stock:
          previous !== undefined && previous.owner === owner
            ? previous.stock
            : kind === "farm" || previous === undefined
              ? Math.floor(config.capacityPerLevel * config.seedFraction)
              : 0,
      };
      active.set(unit.id(), record);
      if (previous?.owner === owner) {
        const records = surviving.get(owner) ?? [];
        records.push(record);
        surviving.set(owner, records);
      }
      if (previous === undefined && kind === "farm") {
        const farms = createdFarms.get(owner) ?? [];
        farms.push(record);
        createdFarms.set(owner, farms);
      }
    }

    this.records = active;
    if (!synchronize) this.frame.clear();
    else {
      for (const id of this.frame.keys()) {
        if (!active.has(id)) this.frame.delete(id);
      }
    }
    this.staged.clear();
    if (!synchronize) this.attackConsumption.clear();

    const byOwner = new Map<number, SimplePlotInput[]>();
    for (const record of this.records.values()) {
      const records = byOwner.get(record.owner) ?? [];
      records.push(record);
      byOwner.set(record.owner, records);
    }

    const activeAttackIds = new Set<string>();
    for (const player of game.allPlayers()) {
      const key = player.id();
      const records = byOwner.get(player.smallID()) ?? [];
      const priorRecords = surviving.get(player.smallID()) ?? [];
      const current = { troops: player.troops(), food: player.food() };
      const prior = this.published.get(key);
      const shouldPublish =
        prior !== undefined ||
        player.isAlive() ||
        records.length > 0 ||
        player.outgoingAttacks().length > 0;
      if (prior === undefined) {
        // Spawn balances are replaced by plot seeds rather than added twice.
        if (shouldPublish) this.published.set(key, current);
      } else {
        const rawFoodDelta = current.food - prior.food;
        if (rawFoodDelta > 0n) {
          this.reconcile(
            priorRecords,
            key,
            Number(rawFoodDelta),
            "farm",
            config,
          );
        } else if (rawFoodDelta < 0n) {
          const unpaid = this.debitFarmBalance(
            priorRecords,
            createdFarms.get(player.smallID()) ?? [],
            -rawFoodDelta,
          );
          if (unpaid > 0) {
            this.unpaidFoodDebits.set(
              key,
              (this.unpaidFoodDebits.get(key) ?? 0) + unpaid,
            );
          }
        }
      }
      this.repayFoodDebt(records, key);
      if (!synchronize) {
        this.chargeAttacks(player, records, config, activeAttackIds);
      }
      const troopsAfterAttacks = player.troops();
      if (prior !== undefined) {
        this.reconcile(
          priorRecords,
          key,
          troopsAfterAttacks - prior.troops,
          "city",
          config,
        );
      }
      this.replaceFood(player, BigInt(this.total(records, "farm")));

      const cities = records.filter((record) => record.kind === "city");
      const dormant = this.dormantTroops.get(key) ?? 0;
      if (cities.length > 0 && dormant > 0) {
        this.distribute(
          cities,
          dormant,
          (record) =>
            config.capacityPerLevel * Math.max(1, Math.floor(record.level)),
        );
        this.dormantTroops.delete(key);
      }

      const grown = synchronize
        ? records.map((record) => ({
            ...record,
            capacity: config.capacityPerLevel * Math.max(1, Math.floor(record.level)),
            growth: this.frame.get(record.unitId)?.growth ?? 0,
            nextStock: record.stock,
          }))
        : await grow(records, config);
      for (const result of grown) {
        const record = this.records.get(result.unitId);
        if (record === undefined) continue;
        record.stock = result.nextStock;
      }
      this.repayFoodDebt(records, key);
      for (const result of grown) {
        const record = this.records.get(result.unitId);
        if (record === undefined) continue;
        this.frame.set(result.unitId, { ...result, nextStock: record.stock });
      }
      const stage = {
        troops:
          this.total(records, "city") + (this.dormantTroops.get(key) ?? 0),
        food: BigInt(this.total(records, "farm")),
      };
      this.staged.set(key, stage);
      if ((synchronize || !player.isAlive()) && shouldPublish) {
        this.applyPlayer(game, player);
      }
    }
    if (!synchronize) this.seenAttackIds = activeAttackIds;
  }

  /** Reconcile the core after combat/actions without another growth or charge. */
  async afterTick(game: Game): Promise<void> {
    await this.prepare(game, this.growth, true);
  }

  applyPlayer(game: Game, player: Player): boolean {
    if (game.config().simplePlotEconomy() === null) return false;
    const stage = this.staged.get(player.id());
    if (stage === undefined) return false;
    player.removeTroops(player.troops());
    player.addTroops(stage.troops);
    player.removeFood(player.food());
    player.addFood(stage.food);
    this.published.set(player.id(), stage);
    return true;
  }

  plotFrame(): Float64Array {
    const values: number[] = [];
    for (const result of [...this.frame.values()].sort(
      (a, b) => a.tile - b.tile,
    )) {
      values.push(
        result.tile,
        result.kind === "city" ? 1 : 2,
        result.level,
        result.nextStock,
        result.capacity,
        result.growth,
      );
    }
    return Float64Array.from(values);
  }

  resolvePlotAction(
    game: Game,
    player: Player,
    action: LivePlotAction,
    tile: number,
  ): LiveActionResolution {
    const config = game.config().simplePlotEconomy()!;
    const plot = game.plotAt(tile);
    if (action === "raze") {
      if (!plot || plot.owner() !== player) {
        return { ok: false, message: "No owned plot here" };
      }
      if (player.food() < config.razeCost) {
        return { ok: false, message: "Not enough food" };
      }
      return { ok: true, intent: { type: "delete_unit", unitId: plot.id() } };
    }
    const unit = action === "city" ? UnitType.Settlement : UnitType.Farmland;
    if (plot?.type() === unit && plot.owner() === player) {
      if (!player.canUpgradeUnit(plot)) {
        return { ok: false, message: "Cannot upgrade this plot" };
      }
      return {
        ok: true,
        intent: { type: "upgrade_structure", unit, unitId: plot.id() },
      };
    }
    if (plot) return { ok: false, message: "Raze the existing plot first" };
    if (player.canBuild(unit, tile) === false) {
      return { ok: false, message: "Cannot build here" };
    }
    return { ok: true, intent: { type: "build_unit", unit, tile } };
  }

  stats(player: Player): LiveRuntimeStats {
    let production = 0;
    for (const result of this.frame.values()) {
      if (result.owner === player.smallID() && result.kind === "farm") {
        production += result.growth;
      }
    }
    return {
      population: player.troops(),
      production,
      consumption: this.attackConsumption.get(player.id()) ?? 0,
      starved: 0,
    };
  }

  dispose(): void {
    if (this.game !== null) {
      setUrbanTickProvider(this.game, null, this.urbanTickProvider);
    }
    this.game = null;
    this.records.clear();
    this.published.clear();
    this.dormantTroops.clear();
    this.staged.clear();
    this.frame.clear();
    this.seenAttackIds.clear();
    this.attackConsumption.clear();
    this.unpaidFoodDebits.clear();
  }

  private chargeAttacks(
    player: Player,
    records: SimplePlotInput[],
    config: SimplePlotEconomyConfig,
    activeAttackIds: Set<string>,
  ): void {
    // New attacks are removed from the core before the next urban-provider
    // publish.  After a capture that core can still contain the old city's
    // aggregate, so only commit people represented by surviving city plots.
    let availablePeople = this.total(records, "city");
    for (const attack of player.outgoingAttacks()) {
      const id = `${player.id()}:${attack.id()}`;
      const troops = attack.troops();
      if (!this.seenAttackIds.has(id)) {
        const capped = Math.min(
          troops,
          availablePeople,
          affordablePeople(
            BigInt(this.total(records, "farm")),
            config.attackMilliPerPerson,
          ),
        );
        availablePeople -= capped;
        attack.setTroops(capped);
        player.addTroops(troops - capped);
        const charge = chargeFor(capped, config.attackMilliPerPerson);
        this.debitFood(records, charge);
        this.recordAttackConsumption(player, charge);
        if (attack.isActive()) activeAttackIds.add(id);
        continue;
      }
      const charge = chargeFor(troops, config.attackMilliPerPerson);
      if (BigInt(this.total(records, "farm")) >= charge) {
        this.debitFood(records, charge);
        this.recordAttackConsumption(player, charge);
      } else {
        player.addTroops(troops);
        attack.delete();
      }
      if (attack.isActive()) activeAttackIds.add(id);
    }
  }

  private debitFood(records: SimplePlotInput[], charge: bigint): void {
    if (charge === 0n) return;
    const farms = records.filter((record) => record.kind === "farm");
    const available = this.total(farms, "farm");
    if (charge > BigInt(available)) {
      throw new Error("simple attack charge exceeds farm stock");
    }
    this.distribute(farms, -Number(charge));
  }

  private debitFarmBalance(
    surviving: SimplePlotInput[],
    created: SimplePlotInput[],
    charge: bigint,
  ): number {
    let remaining = Number(charge);
    for (const farms of [
      surviving.filter((record) => record.kind === "farm"),
      created,
    ]) {
      const debit = Math.min(remaining, this.total(farms, "farm"));
      if (debit > 0) this.distribute(farms, -debit);
      remaining -= debit;
      if (remaining === 0) return 0;
    }
    return remaining;
  }

  private repayFoodDebt(records: SimplePlotInput[], key: string): void {
    const debt = this.unpaidFoodDebits.get(key) ?? 0;
    if (debt === 0) return;
    const payment = Math.min(debt, this.total(records, "farm"));
    if (payment > 0) this.debitFood(records, BigInt(payment));
    const remaining = debt - payment;
    if (remaining === 0) this.unpaidFoodDebits.delete(key);
    else this.unpaidFoodDebits.set(key, remaining);
  }

  private replaceFood(player: Player, food: bigint): void {
    player.removeFood(player.food());
    player.addFood(food);
  }

  private reconcile(
    records: SimplePlotInput[],
    key: string,
    delta: number,
    kind: SimplePlotKind,
    config: SimplePlotEconomyConfig,
  ): void {
    if (delta === 0) return;
    const plots = records.filter((record) => record.kind === kind);
    if (plots.length === 0) {
      if (kind === "city") {
        this.dormantTroops.set(
          key,
          Math.max(0, (this.dormantTroops.get(key) ?? 0) + delta),
        );
      }
      return;
    }
    this.distribute(
      plots,
      delta,
      kind === "city" && delta > 0
        ? (record) =>
            config.capacityPerLevel * Math.max(1, Math.floor(record.level))
        : undefined,
    );
  }

  private distribute(
    records: SimplePlotInput[],
    delta: number,
    weightOf: (record: SimplePlotInput) => number = (record) => record.stock,
  ): void {
    const direction = Math.sign(delta);
    const shares = apportion(
      Math.abs(delta),
      records.map((record) => ({
        unitId: record.unitId,
        weight: weightOf(record),
      })),
    );
    for (const record of records) {
      const next = record.stock + direction * (shares.get(record.unitId) ?? 0);
      if (next < 0) throw new Error("simple plot stock cannot be negative");
      record.stock = next;
    }
  }

  private recordAttackConsumption(player: Player, charge: bigint): void {
    this.attackConsumption.set(
      player.id(),
      (this.attackConsumption.get(player.id()) ?? 0) + Number(charge),
    );
  }

  private total(
    records: readonly SimplePlotInput[],
    kind: SimplePlotKind,
  ): number {
    return records
      .filter((record) => record.kind === kind)
      .reduce((sum, record) => sum + record.stock, 0);
  }
}
