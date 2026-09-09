import { CityDevelopmentUpdates } from "../../../src/client/webgpu/CityDevelopmentUpdates";
import type { GrowthConfig } from "../../../src/core/development/CityDevelopmentConfig";
import { attachPaintedAI } from "../../../src/core/execution/PaintedAIExecution";
import {
  paintedAIState,
  type PaintedAIPolicy,
} from "../../../src/core/execution/utils/PaintedAI";
import { paintedResources } from "../../../src/core/execution/utils/PaintedEconomy";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  UnitType,
  type Game,
  type GameUpdates,
  type Player,
} from "../../../src/core/game/Game";
import type { GameImpl } from "../../../src/core/game/GameImpl";
import type { GameMapLoader } from "../../../src/core/game/GameMapLoader";
import type { GameUpdateViewData } from "../../../src/core/game/GameUpdates";
import { GameUpdateType } from "../../../src/core/game/GameUpdates";
import type { PlayerImpl } from "../../../src/core/game/PlayerImpl";
import { createGameRunner } from "../../../src/core/GameRunner";
import { PseudoRandom } from "../../../src/core/PseudoRandom";
import type { StampedIntent } from "../../../src/core/Schemas";
import { simpleHash } from "../../../src/core/Util";

export interface PaintedBalanceOptions {
  seed: string;
  maxTicks: number;
  sampleEvery: number;
  policyRotation: 0 | 1 | 2;
  comparePolicies: boolean;
  cityDevelopment?: GrowthConfig;
}
interface CadenceEvent {
  gameTick: number;
  elapsedSeconds: number;
  event: string;
  player: string;
  data: Record<string, unknown>;
}

/** Preserve retained painted digests; organic runs use the core's current hash,
 * including physical work, neutral tiles and frontier ownership/eligibility. */
export function paintedBalanceHash(
  game: Game,
  cohort: Player[] = game.players(),
): number {
  if ((game as GameImpl).cityDevelopment) return (game as GameImpl).hash();
  const players = [...cohort].sort((a, b) => a.id().localeCompare(b.id()));
  const playerState = players
    .map((p) => `${p.id()}:${(p as PlayerImpl).hash()}`)
    .join("|");
  return simpleHash(playerState);
}

/** Benchmark-only observer. Reads authoritative deltas without draining game state. */
export class BalanceDevelopmentObserver {
  readonly events: CadenceEvent[] = [];
  private readonly development = new CityDevelopmentUpdates();
  private readonly tiles = new Map<number, { level: number; owner: number }>();
  private readonly centres = new Map<number, number>();
  private readonly historicalSeeds = new Map<string, number>();
  private readonly first = new Set<string>();
  private readonly stalled = new Set<string>();
  private readonly blocked = new Map<string, number>();

  private event(
    game: Game,
    event: string,
    player: string,
    data: Record<string, unknown> = {},
    first = false,
  ): void {
    const key = `${player}:${event}`;
    if (first && this.first.has(key)) return;
    this.first.add(key);
    this.events.push({
      gameTick: game.ticks(),
      elapsedSeconds: game.elapsedGameSeconds(),
      event,
      player,
      data,
    });
  }

  read(game: Game, updates: Partial<GameUpdates>) {
    const paid = new Set<number>();
    for (const action of updates[GameUpdateType.PaintedAction] ?? []) {
      if (action.outcome === "committed") {
        if (action.kind === "city" && action.tile !== undefined)
          paid.add(action.tile);
        const name =
          action.kind === "city"
            ? "centre-purchase"
            : action.kind === "farm"
              ? "farm-purchase"
              : "first-attack";
        this.event(
          game,
          name,
          action.player,
          { ...action },
          name === "first-attack",
        );
      } else if (action.reason === "unaffordable") {
        this.event(game, "food-blocked-action", action.player, { ...action });
      }
    }
    // Unit identity distinguishes historical founding from ownership transfer.
    for (const player of game.players()) {
      for (const centre of player.units(UnitType.Settlement)) {
        const previous = this.centres.get(centre.id());
        if (previous === undefined) {
          this.historicalSeeds.set(
            player.id(),
            (this.historicalSeeds.get(player.id()) ?? 0) + 1,
          );
        } else if (previous !== player.smallID()) {
          this.event(game, "centre-capture", player.id(), {
            tile: centre.tile(),
            from: previous,
            unit: centre.id(),
          });
        }
        this.centres.set(centre.id(), player.smallID());
      }
      const blocked = paintedAIState(player)?.foodBlockedTicks ?? 0;
      if (blocked > (this.blocked.get(player.id()) ?? 0))
        this.event(game, "food-blocked-decision", player.id(), {
          count: blocked,
        });
      this.blocked.set(player.id(), blocked);
      if (
        (game as GameImpl).cityDevelopment &&
        player.isAlive() &&
        player.hasSpawned() &&
        !game.inSpawnPhase()
      ) {
        const resources = paintedResources(game, player);
        const stalled = resources.totalTroops >= resources.troopCapacity;
        if (stalled && !this.stalled.has(player.id()))
          this.event(game, "housing-stall", player.id(), {
            population: resources.totalTroops,
            housing: resources.troopCapacity,
          });
        if (stalled) this.stalled.add(player.id());
        else this.stalled.delete(player.id());
      }
    }
    const update = this.development.read(game);
    if (update) {
      for (let i = 0; i < update.tiles.length; i += 4) {
        const tile = update.tiles[i],
          level = update.tiles[i + 1],
          owner = update.tiles[i + 2];
        const previous = this.tiles.get(tile);
        const player = game.playerBySmallID(owner);
        if (player.isPlayer() && level) {
          if (
            !previous &&
            !paid.has(tile) &&
            game.plotAt(tile)?.type() !== UnitType.Settlement
          )
            this.event(
              game,
              "first-organic-expansion",
              player.id(),
              { tile, level },
              true,
            );
          if (previous && level > previous.level)
            this.event(
              game,
              "first-upgrade",
              player.id(),
              { tile, from: previous.level, level },
              true,
            );
        }
        if (level) this.tiles.set(tile, { level, owner });
        else this.tiles.delete(tile);
      }
    }
    return { payloadBytes: update?.tiles.byteLength ?? 0 };
  }

  summary(game: Game, player?: string) {
    let developedArea = 0,
      summedLevels = 0,
      physicalHousing = 0,
      neutralDevelopedArea = 0;
    const model = (game as GameImpl).cityDevelopment;
    for (const [tile, state] of this.tiles) {
      if (player !== undefined && game.owner(tile).id() !== player) continue;
      developedArea++;
      summedLevels += state.level;
      physicalHousing += model?.capacity[tile] ?? 0;
      if (!state.owner) neutralDevelopedArea++;
    }
    return {
      developedArea,
      summedLevels,
      physicalHousing,
      neutralDevelopedArea,
      historicalCentreSeeds:
        player === undefined
          ? [...this.historicalSeeds.values()].reduce((a, b) => a + b, 0)
          : (this.historicalSeeds.get(player) ?? 0),
    };
  }
}

function distribution(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const total = values.reduce((a, b) => a + b, 0);
  const percentile = (p: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return {
    count: values.length,
    total,
    mean: values.length ? total / values.length : 0,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}
export interface PaintedBalanceResult {
  seed: string;
  config: Record<string, unknown>;
  requestedBots: number;
  requestedNations: number;
  spawned: number;
  completed: boolean;
  victorySeconds: number | null;
  finalHash: number;
  wallMs: number;
  elapsedSimulationSeconds: number;
  cadenceEvents: CadenceEvent[];
  performance: {
    methodology: string;
    tickMs: ReturnType<typeof distribution>;
    runnerMs: ReturnType<typeof distribution>;
    observerMs: ReturnType<typeof distribution>;
    developmentPayloadBytes: ReturnType<typeof distribution>;
    memorySamples: {
      gameTick: number;
      rss: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    }[];
  };
  events: {
    tick: number;
    event: string;
    player: string;
    data: Record<string, unknown>;
  }[];
  samples: {
    tick: number;
    gameTick: number;
    elapsedSeconds: number;
    alivePlayers: number;
    cityCount: number;
    development: ReturnType<BalanceDevelopmentObserver["summary"]>;
    players: Record<string, unknown>[];
  }[];
}

export async function runPaintedBalance(
  options: PaintedBalanceOptions,
  loader: GameMapLoader,
): Promise<PaintedBalanceResult> {
  if (
    !options.seed ||
    !Number.isSafeInteger(options.maxTicks) ||
    options.maxTicks < 1 ||
    !Number.isSafeInteger(options.sampleEvery) ||
    options.sampleEvery < 1 ||
    ![0, 1, 2].includes(options.policyRotation)
  )
    throw new Error("Invalid benchmark options");
  const started = performance.now(),
    clientID = "painted-balance-human";
  let update: GameUpdateViewData | null = null;
  const runner = await createGameRunner(
    {
      gameID: options.seed,
      lobbyCreatedAt: 0,
      config: {
        gameMap: GameMapType.Verdantia,
        gameType: GameType.Singleplayer,
        gameMode: GameMode.FFA,
        difficulty: Difficulty.Medium,
        nations: "default",
        bots: 50,
        donateGold: false,
        donateTroops: false,
        infiniteGold: false,
        infiniteTroops: false,
        instantBuild: false,
        randomSpawn: false,
      },
      players: [{ clientID, username: "Human-slot AI", clanTag: null }],
    },
    clientID,
    loader,
    (value) => {
      if ("errMsg" in value) throw new Error(value.errMsg);
      update = value;
    },
    "simplefront",
    options.cityDevelopment,
  );
  const game = runner.game;
  const observer = new BalanceDevelopmentObserver();
  const tickMs: number[] = [],
    runnerMs: number[] = [],
    observerMs: number[] = [],
    payloadBytes: number[] = [];
  const memorySamples: PaintedBalanceResult["performance"]["memorySamples"] =
    [];
  const memory = () => {
    const { rss, heapUsed, external, arrayBuffers } = process.memoryUsage();
    memorySamples.push({
      gameTick: game.ticks(),
      rss,
      heapUsed,
      external,
      arrayBuffers,
    });
  };
  memory();
  let turn = 0;
  const step = (intents: StampedIntent[] = []): GameUpdateViewData => {
    const started = performance.now();
    update = null;
    runner.addTurn({ turnNumber: turn++, intents });
    if (!runner.executeNextTick() || !update)
      throw new Error("Runner failed to advance");
    runnerMs.push(performance.now() - started);
    const duration = (update as GameUpdateViewData).tickExecutionDuration;
    if (duration === undefined) throw new Error("Runner omitted tick timing");
    tickMs.push(duration);
    const observing = performance.now();
    payloadBytes.push(
      observer.read(game, (update as GameUpdateViewData).updates).payloadBytes,
    );
    observerMs.push(performance.now() - observing);
    return update;
  };
  // Let authored nations and normal bot spawners settle before choosing the human slot.
  for (let i = 0; i < 100; i++) step();
  const human = game.playerByClientID(clientID)!;
  const random = new PseudoRandom(simpleHash(options.seed + ":human-spawn"));
  for (let i = 0; i < 1000 && !human.hasSpawned(); i++) {
    const tile = random.nextInt(0, game.width() * game.height());
    if (
      game.isLand(tile) &&
      !game.isImpassable(tile) &&
      !game.owner(tile).isPlayer()
    )
      step([{ type: "spawn", tile, clientID }]);
  }
  if (!human.hasSpawned())
    throw new Error("Human stand-in could not spawn within 1000 candidates");
  attachPaintedAI(options.seed, game, human);
  const players = game.players().sort((a, b) => a.id().localeCompare(b.id()));
  const policies: PaintedAIPolicy[] = [
    "farm-first",
    "expansion-first",
    "military-first",
  ];
  if (options.comparePolicies)
    players.forEach((p, i) => {
      const state = paintedAIState(p);
      if (state) state.policy = policies[(i + options.policyRotation) % 3];
    });
  const result: PaintedBalanceResult = {
    seed: options.seed,
    config: {
      ruleset: "simplefront",
      ...game.config().gameConfig(),
      economy: game.config().paintedEconomy(),
      ai: game.config().paintedAI(),
      ...(game.config().cityDevelopment()
        ? { cityDevelopment: game.config().cityDevelopment() }
        : {}),
      width: game.width(),
      height: game.height(),
      landTiles: game.numLandTiles(),
      spawnTicks: game.ticks(),
      humanID: human.id(),
      humanStandIn: true,
      normalTickMs: 100,
      maxTicks: options.maxTicks,
      comparePolicies: options.comparePolicies,
      policyRotation: options.policyRotation,
      sampleEvery: options.sampleEvery,
      finalHashFormat: game.config().cityDevelopment()
        ? "core-game-hash"
        : "players-v1",
    },
    requestedBots: 50,
    requestedNations: game.nations().length,
    spawned: players.filter((p) => p.hasSpawned()).length,
    completed: false,
    victorySeconds: null,
    finalHash: 0,
    wallMs: 0,
    elapsedSimulationSeconds: 0,
    cadenceEvents: observer.events,
    performance: {
      methodology:
        "All executed ticks, including spawn setup. tickMs is the runner's core executeNextTick duration; runnerMs also includes view packing. observerMs measures read-only development/action/AI observation, including housing scans, outside runnerMs. developmentPayloadBytes is the actual CityDevelopmentUpdates tiles.byteLength (transferable buffer only, excluding object metadata and other worker messages). No rendering or worker structured clone runs here. Process memory samples include the map, benchmark buffers, event retention and runtime; they are not isolated simulation allocations. wallMs includes setup and all instrumentation. Cadence events use absolute gameTick and elapsedSeconds; legacy events/samples use post-setup tick. Historical centre seeds count each first-seen settlement identity, attributed to its founding owner; captures never add seeds.",
      tickMs: distribution([]),
      runnerMs: distribution([]),
      observerMs: distribution([]),
      developmentPayloadBytes: distribution([]),
      memorySamples,
    },
    events: [],
    samples: [],
  };
  const owners = new Uint16Array(game.width() * game.height());
  game.forEachTile((t) => (owners[t] = game.ownerID(t)));
  const totals = new Map(
    players.map((p) => [
      p.id(),
      {
        farm: 0n,
        city: 0n,
        land: 0n,
        transport: 0n,
        neutralCaptures: 0,
        enemyCaptures: 0,
        rejected: 0,
      },
    ]),
  );
  const alive = new Set(players.filter((p) => p.isAlive()).map((p) => p.id()));
  const first = new Set<string>();
  const event = (
    tick: number,
    name: string,
    player: string,
    data: Record<string, unknown>,
  ) => result.events.push({ tick, event: name, player, data });
  const firstEvent = (
    tick: number,
    name: string,
    player: string,
    data: Record<string, unknown>,
  ) => {
    const key = `${player}:${name}`;
    if (first.has(key)) return;
    first.add(key);
    event(tick, name, player, data);
  };
  const sample = (tick: number) => {
    memory();
    result.samples.push({
      tick,
      gameTick: game.ticks(),
      elapsedSeconds: game.elapsedGameSeconds(),
      alivePlayers: players.filter((p) => p.isAlive()).length,
      cityCount: players.reduce(
        (sum, p) => sum + p.units(UnitType.Settlement).length,
        0,
      ),
      development: observer.summary(game),
      players: players.map((p) => ({
        id: p.id(),
        name: p.name(),
        type: p.type(),
        policy: paintedAIState(p)?.policy,
        alive: p.isAlive(),
        tiles: p.numTilesOwned(),
        landShare: p.numTilesOwned() / game.numLandTiles(),
        ...paintedResources(game, p),
        ...totals.get(p.id()),
        ...(game.config().cityDevelopment()
          ? observer.summary(game, p.id())
          : {}),
        foodBlockedTicks: paintedAIState(p)?.foodBlockedTicks ?? 0,
        hash: (p as PlayerImpl).hash(),
      })),
    });
  };
  sample(0);
  for (let tick = 1; tick <= options.maxTicks; tick++) {
    const view = step();
    for (const action of view.updates[GameUpdateType.PaintedAction]) {
      const total = totals.get(action.player)!;
      if (action.outcome === "committed")
        total[action.kind] += action.spentMilli;
      else total.rejected++;
      event(tick, "action", action.player, { ...action });
    }
    const changes = view.packedTileUpdates;
    for (let i = 0; i < changes.length; i += 2) {
      const tile = changes[i],
        owner = game.ownerID(tile),
        previous = owners[tile];
      owners[tile] = owner;
      if (owner === previous || owner === 0) continue;
      const p = game.playerBySmallID(owner);
      if (!p.isPlayer()) continue;
      const total = totals.get(p.id());
      if (!total) continue;
      if (previous === 0) {
        total.neutralCaptures++;
        firstEvent(tick, "first-neutral-capture", p.id(), {});
      } else {
        total.enemyCaptures++;
        firstEvent(tick, "first-enemy-capture", p.id(), { from: previous });
      }
    }
    for (const p of players)
      if (alive.has(p.id()) && !p.isAlive()) {
        alive.delete(p.id());
        event(tick, "eliminated", p.id(), {});
      }
    if (
      tick % options.sampleEvery === 0 ||
      game.getWinner() ||
      tick === options.maxTicks
    )
      sample(tick);
    if (game.getWinner()) {
      result.completed = true;
      result.victorySeconds = game.elapsedGameSeconds();
      const winner = game.getWinner()!;
      event(
        tick,
        "winner",
        typeof winner === "string" ? winner : winner.id(),
        {},
      );
      break;
    }
  }
  result.finalHash = paintedBalanceHash(game, players);
  result.elapsedSimulationSeconds = game.elapsedGameSeconds();
  Object.assign(result.performance, {
    tickMs: distribution(tickMs),
    runnerMs: distribution(runnerMs),
    observerMs: distribution(observerMs),
    developmentPayloadBytes: distribution(payloadBytes),
  });
  result.wallMs = performance.now() - started;
  return result;
}
