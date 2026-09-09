import { capacityScaledGain } from "../../configuration/PaintedEconomyConfig";
import { cityDevelopmentState } from "../../development/CityDevelopmentExecution";
import { Game, Player, PlayerID, Structures, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import type { PlayerImpl } from "../../game/PlayerImpl";
import { canBuildTransportShip } from "../../game/TransportShipUtils";
import { paintedResources } from "./PaintedEconomy";

export type PaintedAIPolicy =
  | "balanced"
  | "farm-first"
  | "expansion-first"
  | "military-first";
export interface PaintedAIState {
  attached: boolean;
  phase: number;
  reserveRatio: number;
  policy: PaintedAIPolicy;
  lastDecisionTick: number;
  plotCursor: number;
  borderCursor: number;
  coastCursor: number;
  campaign: null | {
    targetID: PlayerID;
    sampleTick: number;
    targetTiles: number;
    ourTroops: number;
    stalled: number;
  };
  pendingCoast: TileRef | null;
  foodBlockedTicks: number;
}
export type PaintedAIDecision =
  | {
      kind: "wait";
      reason: "food" | "troops" | "threat" | "no-target" | "no-site";
    }
  | { kind: "paint"; plot: "farm" | "city"; tile: TileRef }
  | {
      kind: "attack";
      targetID: PlayerID | null;
      sourceTiles: TileRef[];
      troops: number;
    }
  | { kind: "transport"; tile: TileRef; troops: number }
  | { kind: "retreat"; attackID: string }
  | { kind: "boat-retreat"; unitID: number };

export function paintedAIState(player: Player): PaintedAIState | null {
  return (player as PlayerImpl)._paintedAI;
}

export function dispatchTroops(
  idle: number,
  total: number,
  reserveRatio: number,
  share: number,
  foodMilli: bigint,
  costMilliPerTroop: bigint,
): number {
  if (
    ![idle, total].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    idle > total ||
    ![reserveRatio, share].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    ) ||
    foodMilli < 0n ||
    costMilliPerTroop < 0n
  )
    return 0;
  const desired = Math.max(
    0,
    Math.min(Math.floor(idle * share), idle - Math.ceil(total * reserveRatio)),
  );
  const affordable =
    costMilliPerTroop === 0n ? BigInt(desired) : foodMilli / costMilliPerTroop;
  return Number(BigInt(desired) < affordable ? BigInt(desired) : affordable);
}

/** Inspect a bounded window, rotating deterministically across successive decisions. */
function windowTiles(
  tiles: ReadonlySet<TileRef>,
  cursor: number,
  limit: number,
): TileRef[] {
  if (tiles.size === 0) return [];
  const start = cursor % tiles.size;
  const result: TileRef[] = [];
  let index = 0;
  for (const tile of tiles) {
    if (index++ < start) continue;
    result.push(tile);
    if (result.length === limit) break;
  }
  return result;
}

function paintSite(
  game: Game,
  player: Player,
  state: PaintedAIState,
): Record<"farm" | "city", TileRef | null> {
  const candidates = windowTiles(
    player.tiles(),
    state.plotCursor,
    game.config().paintedAI()!.candidateBudget,
  );
  state.plotCursor =
    (state.plotCursor + candidates.length) %
    Math.max(1, player.numTilesOwned());
  const organic = cityDevelopmentState(player)?.model;
  const best: Record<"farm" | "city", TileRef | null> = {
    farm: null,
    city: null,
  };
  const score = { farm: -Infinity, city: -Infinity };
  for (const tile of candidates) {
    if (
      !game.isLand(tile) ||
      game.isImpassable(tile) ||
      game.tileDamage(tile) > 0 ||
      organic?.level(tile) ||
      game.plotAt(tile) ||
      game.nearbyUnits(tile, 0, Structures.types, undefined, true).length > 0
    )
      continue;
    const interior = game
      .neighbors(tile)
      .filter((t) => game.owner(t) === player).length;
    const neighbours = game.neighbors(tile);
    const urbanNeighbours = organic
      ? neighbours.filter((t) => organic.level(t) > 0).length
      : 0;
    for (const kind of ["farm", "city"] as const) {
      if (organic && kind === "city") continue;
      // Keep a young neighbourhood's support ring free when another farm site exists.
      const value =
        interior -
        (organic && kind === "farm"
          ? urbanNeighbours * 5 + (organic.work(tile) > 0 ? 5 : 0)
          : 0);
      if (
        value > score[kind] ||
        (value === score[kind] && (best[kind] === null || tile < best[kind]!))
      ) {
        best[kind] = tile;
        score[kind] = value;
      }
    }
  }
  return best;
}

function borderSources(
  game: Game,
  player: Player,
  state: PaintedAIState,
): Map<PlayerID | null, TileRef[]> {
  const border = player.borderTiles();
  const candidates = windowTiles(
    border,
    state.borderCursor,
    game.config().paintedAI()!.candidateBudget,
  );
  state.borderCursor =
    (state.borderCursor + candidates.length) % Math.max(1, border.size);
  const groups = new Map<PlayerID | null, TileRef[]>();
  for (const tile of candidates) {
    if (game.owner(tile) !== player) continue;
    for (const t of game.neighbors(tile)) {
      if (!game.isLand(t) || game.isImpassable(t) || game.owner(t) === player)
        continue;
      const owner = game.owner(t),
        id = owner.isPlayer() ? owner.id() : null;
      const group = groups.get(id) ?? [];
      if (!group.includes(tile)) group.push(tile);
      groups.set(id, group);
    }
  }
  for (const [id, tiles] of groups) {
    const available = new Set(tiles);
    const front = [tiles[0]];
    available.delete(tiles[0]);
    // Keep organic pushes concentrated; population scaling does not change tactics.
    const width = game.config().cityDevelopment() ? 1 : 8;
    for (let i = 0; i < front.length && front.length < width; i++) {
      for (const neighbor of game.neighbors(front[i])) {
        if (front.length === width) break;
        if (available.delete(neighbor)) front.push(neighbor);
      }
    }
    groups.set(id, front);
  }
  return groups;
}

function campaignRetreat(
  game: Game,
  player: Player,
  state: PaintedAIState,
): PaintedAIDecision | null {
  const cfg = game.config().paintedAI()!,
    resources = paintedResources(game, player);
  const attack = player
    .outgoingAttacks()
    .find((a) => a.target().isPlayer() && !a.retreating() && !a.retreated());
  const activeTarget = attack?.target();
  if (!state.campaign && activeTarget?.isPlayer()) {
    state.campaign = {
      targetID: activeTarget.id(),
      sampleTick: game.ticks(),
      targetTiles: activeTarget.numTilesOwned(),
      ourTroops: resources.totalTroops,
      stalled: 0,
    };
  }
  const campaign = state.campaign;
  if (!campaign) return null;
  const target = game.hasPlayer(campaign.targetID)
    ? game.player(campaign.targetID)
    : null;
  if (
    !target?.isAlive() ||
    !player.canAttackPlayer(target) ||
    target.isImmune()
  ) {
    state.campaign = null;
    return null;
  }
  if (game.ticks() - campaign.sampleTick >= cfg.campaignSampleTicks) {
    campaign.stalled =
      target.numTilesOwned() < campaign.targetTiles &&
      resources.totalTroops >= campaign.ourTroops * 0.7
        ? 0
        : campaign.stalled + 1;
    campaign.sampleTick = game.ticks();
    campaign.targetTiles = target.numTilesOwned();
    campaign.ourTroops = resources.totalTroops;
  }
  if (
    campaign.stalled >= cfg.stallSamples ||
    resources.idleTroops < Math.ceil(resources.totalTroops * state.reserveRatio)
  ) {
    const retreat = player
      .outgoingAttacks()
      .find((a) => a.target() === target && !a.retreating() && !a.retreated());
    if (retreat) return { kind: "retreat", attackID: retreat.id() };
    state.campaign = null;
  }
  return null;
}

function enemyOrder(
  game: Game,
  player: Player,
  state: PaintedAIState,
  groups: Map<PlayerID | null, TileRef[]>,
  foodBudget?: bigint,
): Extract<PaintedAIDecision, { kind: "attack" }> | null {
  const cfg = game.config().paintedAI()!,
    c = game.config().paintedEconomy()!;
  const resources = paintedResources(game, player);
  const troops = dispatchTroops(
    resources.idleTroops,
    resources.totalTroops,
    state.reserveRatio,
    cfg.enemyShare,
    foodBudget ?? resources.foodMilli,
    c.landDispatchMilliPerTroop,
  );
  if (troops <= 0) return null;
  let best: Extract<PaintedAIDecision, { kind: "attack" }> | null = null,
    bestScore = -Infinity;
  for (const [id, sources] of groups) {
    if (id === null || (state.campaign && id !== state.campaign.targetID))
      continue;
    const enemy = game.player(id);
    if (!enemy.isAlive() || enemy.isImmune() || !player.canAttackPlayer(enemy))
      continue;
    const targets = [
      ...new Set(
        sources
          .flatMap((t) => game.neighbors(t))
          .filter(
            (t) =>
              game.owner(t) === enemy &&
              game.isLand(t) &&
              !game.isImpassable(t),
          ),
      ),
    ];
    const local = troops / Math.max(1, targets.length);
    let loss = 0,
      reward = 0,
      contact = 0;
    for (const tile of targets) {
      const estimate = game
        .config()
        .attackLogic(
          game,
          local * game.config().food().frontReferenceWidth,
          player,
          enemy,
          tile,
        );
      loss += estimate.attackerTroopLoss;
      const organic = cityDevelopmentState(player)?.model;
      reward +=
        estimate.defenderTroopLoss +
        (organic
          ? (organic.capacity[tile] / organic.config.ruralCapacity) * 25 +
            (game.plotAt(tile)?.type() === UnitType.Farmland ? 25 : 0)
          : game.plotAt(tile)
            ? 25
            : 0);
      for (const outgoing of enemy.outgoingAttacks())
        for (const t of game.neighbors(tile)) contact += outgoing.troopsAt(t);
    }
    if (loss + contact >= troops || targets.length === 0) continue;
    const score =
      reward / Math.max(1, loss) +
      troops / Math.max(1, enemy.troops() + contact);
    if (
      score > bestScore ||
      (score === bestScore && best && id < best.targetID!)
    ) {
      bestScore = score;
      best = { kind: "attack", targetID: id, sourceTiles: sources, troops };
    }
  }
  return best;
}

function transportOrder(
  game: Game,
  player: Player,
  state: PaintedAIState,
): PaintedAIDecision | null {
  const cfg = game.config().paintedAI()!,
    c = game.config().paintedEconomy()!,
    resources = paintedResources(game, player);
  const boats = player.units(UnitType.TransportShip);
  state.pendingCoast = boats[0]?.targetTile() ?? null;
  if (boats.length >= game.config().boatMaxNumber()) return null;
  const troops = dispatchTroops(
    resources.idleTroops,
    resources.totalTroops,
    state.reserveRatio,
    cfg.neutralShare,
    resources.foodMilli,
    c.transportDispatchMilliPerTroop,
  );
  const available =
    resources.idleTroops -
    Math.ceil(resources.totalTroops * state.reserveRatio);
  if (available <= 0) return null;
  const origin = [...player.borderTiles()].find((t) => game.isShore(t));
  if (origin === undefined) return null;
  const max = (2 * cfg.coastRadius + 1) ** 2;
  let routes = 0;
  for (let i = 0; i < cfg.candidateBudget; i++) {
    const n = state.coastCursor++ % max;
    const radius = Math.ceil((Math.sqrt(n + 1) - 1) / 2);
    if (radius === 0) continue;
    const side = radius * 2,
      offset = n - (side - 1) ** 2;
    let dx: number, dy: number;
    if (offset < side) {
      dx = -radius + offset;
      dy = -radius;
    } else if (offset < side * 2) {
      dx = radius;
      dy = -radius + offset - side;
    } else if (offset < side * 3) {
      dx = radius - (offset - side * 2);
      dy = radius;
    } else {
      dx = -radius;
      dy = radius - (offset - side * 3);
    }
    const x = game.x(origin) + dx,
      y = game.y(origin) + dy;
    if (!game.isValidCoord(x, y)) continue;
    const tile = game.ref(x, y),
      owner = game.owner(tile);
    if (
      !game.isShore(tile) ||
      game.isImpassable(tile) ||
      owner === player ||
      (owner.isPlayer() &&
        (!player.canAttackPlayer(owner) || owner.isImmune())) ||
      boats.some((b) => b.targetTile() === tile)
    )
      continue;
    if (canBuildTransportShip(game, player, tile) !== false) {
      return troops > 0
        ? { kind: "transport", tile, troops }
        : { kind: "wait", reason: "food" };
    }
    if (++routes >= 4) break;
  }
  state.coastCursor %= max;
  return null;
}

export function decidePaintedAI(
  game: Game,
  player: Player,
  state: PaintedAIState,
): PaintedAIDecision {
  const cfg = game.config().paintedAI(),
    c = game.config().paintedEconomy();
  if (
    !cfg ||
    !c ||
    game.inSpawnPhase() ||
    !player.isAlive() ||
    game.getWinner()
  )
    return { kind: "wait", reason: "no-target" };
  const resources = paintedResources(game, player);
  const boats = player.units(UnitType.TransportShip);
  state.pendingCoast = boats[0]?.targetTile() ?? null;
  for (const boat of boats) {
    const tile = boat.targetTile();
    if (
      tile === undefined ||
      tile === null ||
      boat.transportShipState().isRetreating
    )
      continue;
    const owner = game.owner(tile);
    if (owner === player || (owner.isPlayer() && player.isFriendly(owner)))
      return { kind: "boat-retreat", unitID: boat.id() };
  }
  const retreat = campaignRetreat(game, player, state);
  if (retreat) return retreat;
  const organic = cityDevelopmentState(player)?.model;
  const noHousing = !organic && resources.cities === 0;
  const sites = paintSite(game, player, state);
  const plot = (
    kind: "farm" | "city",
    reserve = 0n,
  ): PaintedAIDecision | null => {
    const site = sites[kind];
    if (
      site === null ||
      game
        .config()
        .isUnitDisabled(
          kind === "farm" ? UnitType.Farmland : UnitType.Settlement,
        )
    )
      return null;
    const cost = kind === "farm" ? c.farmCostMilli : c.cityCostMilli;
    return resources.foodMilli >= cost + reserve
      ? { kind: "paint", plot: kind, tile: site }
      : { kind: "wait", reason: "food" };
  };
  if (resources.farms === 0) {
    const action = plot("farm");
    if (action) return action;
  }
  if (noHousing) {
    const action = plot("city");
    if (action) return action;
  }
  if (noHousing && sites.city === null && resources.idleTroops === 0)
    return { kind: "wait", reason: "no-site" };
  const incoming = player
    .incomingAttacks()
    .filter(
      (a) =>
        !a.retreating() &&
        [...a.frontTiles()].some((t) => game.owner(t) === player),
    )
    .reduce((sum, a) => sum + a.troops(), 0);
  if (incoming > resources.idleTroops)
    return { kind: "wait", reason: "threat" };
  const groups = borderSources(game, player, state);
  const sources = groups.get(null) ?? [];
  const enemy = enemyOrder(game, player, state, groups);
  if (
    state.campaign &&
    !groups.has(state.campaign.targetID) &&
    !player
      .outgoingAttacks()
      .some((a) => a.target().id() === state.campaign!.targetID) &&
    player.borderTiles().size <= cfg.candidateBudget
  )
    state.campaign = null;
  const troops = dispatchTroops(
    resources.idleTroops,
    resources.totalTroops,
    state.reserveRatio,
    cfg.neutralShare,
    resources.foodMilli,
    c.landDispatchMilliPerTroop,
  );
  const neutral: PaintedAIDecision | null =
    sources.length && troops > 0
      ? { kind: "attack", targetID: null, sourceTiles: sources, troops }
      : null;
  const pressing =
    enemy &&
    (state.campaign !== null ||
      resources.totalTroops >
        paintedResources(game, game.player(enemy.targetID!)).totalTroops *
          1.25);
  const transport =
    !enemy && !neutral ? transportOrder(game, player, state) : null;
  let military =
    (state.policy === "military-first" || pressing
      ? (enemy ?? neutral)
      : (neutral ?? enemy)) ?? transport;
  const dispatchCost =
    military?.kind === "attack"
      ? BigInt(military.troops) * c.landDispatchMilliPerTroop
      : military?.kind === "transport"
        ? BigInt(military.troops) * c.transportDispatchMilliPerTroop
        : 0n;
  // A food-clipped army can spend the entire treasury. Reserving that full
  // amount permanently prevents the farm investment needed to support it.
  const reserve =
    dispatchCost < c.farmCostMilli / 3n ? dispatchCost : c.farmCostMilli / 3n;
  const cityWanted =
    !organic && resources.totalTroops >= resources.troopCapacity * cfg.cityFill;
  const city = cityWanted ? plot("city", reserve) : null;
  let projected = Number(resources.foodMilli);
  for (let i = 0; i < cfg.budgetHorizonTicks; i++)
    projected += capacityScaledGain(
      projected,
      Number(resources.foodCapacityMilli),
      c.foodBootstrapFraction,
      c.foodGrowthRate,
    );
  let budgetTroops = resources.idleTroops,
    budgetPopulation = resources.totalTroops,
    commitments = 0;
  const hostileFront = [...groups.keys()].some(
    (id) =>
      id !== null &&
      player.canAttackPlayer(game.player(id)) &&
      !game.player(id).isImmune(),
  );
  const budgetShare = sources.length ? cfg.neutralShare : cfg.enemyShare;
  if (sources.length || hostileFront || transport)
    for (let i = 0; i < cfg.budgetHorizonTicks; i += cfg.decisionTicks) {
      // Forecast recruitment into existing vacancies, without inventing future housing.
      const recruits = organic
        ? Math.min(
            Math.max(0, resources.troopCapacity - budgetPopulation),
            resources.troopGain * cfg.decisionTicks,
          )
        : 0;
      budgetTroops += recruits;
      budgetPopulation += recruits;
      const next = Math.max(
        0,
        Math.min(
          Math.floor(budgetTroops * budgetShare),
          Math.floor(
            budgetTroops - Math.ceil(budgetPopulation * state.reserveRatio),
          ),
        ),
      );
      commitments += next;
      budgetTroops -= next;
    }
  const planned =
    (cityWanted ? c.cityCostMilli : c.farmCostMilli) +
    BigInt(commitments) *
      (military?.kind === "transport"
        ? c.transportDispatchMilliPerTroop
        : c.landDispatchMilliPerTroop);
  // One additional farm funds future expeditions as the opening grows.
  const foodShortfall = Number(planned) > projected;
  const farm =
    foodShortfall || (organic && resources.farms < 2)
      ? plot("farm", organic ? 0n : reserve)
      : null;
  // Continuous capacity demand must not consume every decision forever.
  // Reserve one in three discretionary decisions for an available expedition.
  const militaryDue = Math.floor(game.ticks() / cfg.decisionTicks) % 3 === 2;
  let savingForArmy = false;
  if (organic) {
    if (military?.kind === "attack" || military?.kind === "transport") {
      const price =
        military.kind === "transport"
          ? c.transportDispatchMilliPerTroop
          : c.landDispatchMilliPerTroop;
      const share =
        military.kind === "attack" && military.targetID !== null
          ? cfg.enemyShare
          : cfg.neutralShare;
      const desired = Math.max(
        0,
        Math.min(
          Math.floor(resources.idleTroops * share),
          resources.idleTroops -
            Math.ceil(resources.totalTroops * state.reserveRatio),
        ),
      );
      // Wait for a useful force, capped by what a full treasury could support.
      // The cap keeps a landlocked/no-farm-site AI from waiting for impossible food.
      const treasuryTroops =
        price > 0n ? Number(resources.foodCapacityMilli / price) : desired;
      const minimum = Math.max(
        1,
        Math.min(
          Math.floor(Math.min(desired, treasuryTroops) / 4),
          price > 0n ? Number(c.farmCostMilli / 3n / price) : desired,
        ),
      );
      const savings = foodShortfall && farm ? c.farmCostMilli : 0n;
      const availableFood =
        resources.foodMilli > savings ? resources.foodMilli - savings : 0n;
      if (price > 0n && dispatchCost > availableFood) {
        // Re-score hostile targets with the smaller affordable force; never
        // use the winning estimate from an army we can no longer dispatch.
        military =
          military.kind === "attack" && military.targetID !== null
            ? enemyOrder(game, player, state, groups, availableFood)
            : { ...military, troops: Number(availableFood / price) };
      }
      savingForArmy = !military || military.troops < minimum;
      if (savingForArmy) military = null;
    }
    // Savings are real: a required but unaffordable farm must not fall through
    // to an attack that spends its construction money. Keep expedition slots
    // only when the attack leaves the entire farm cost untouched.
    if (foodShortfall && farm && (!militaryDue || !military)) return farm;
  }
  const choices =
    militaryDue ||
    state.policy === "expansion-first" ||
    state.policy === "military-first"
      ? [military, city, farm]
      : state.policy === "farm-first"
        ? [farm, city, military]
        : [city, farm, military];
  for (const choice of choices)
    if (choice && choice.kind !== "wait") return choice;
  if (
    savingForArmy ||
    city?.kind === "wait" ||
    farm?.kind === "wait" ||
    transport?.kind === "wait" ||
    (sources.length && resources.foodMilli < c.landDispatchMilliPerTroop)
  )
    return { kind: "wait", reason: "food" };
  return { kind: "wait", reason: sources.length ? "troops" : "no-target" };
}
