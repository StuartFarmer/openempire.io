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
} from "../../../src/core/game/Game";
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
  events: {
    tick: number;
    event: string;
    player: string;
    data: Record<string, unknown>;
  }[];
  samples: { tick: number; players: Record<string, unknown>[] }[];
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
  );
  const game = runner.game;
  let turn = 0;
  const step = (intents: StampedIntent[] = []): GameUpdateViewData => {
    update = null;
    runner.addTurn({ turnNumber: turn++, intents });
    if (!runner.executeNextTick() || !update)
      throw new Error("Runner failed to advance");
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
    },
    requestedBots: 50,
    requestedNations: game.nations().length,
    spawned: players.filter((p) => p.hasSpawned()).length,
    completed: false,
    victorySeconds: null,
    finalHash: 0,
    wallMs: 0,
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
  const sample = (tick: number) =>
    result.samples.push({
      tick,
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
        foodBlockedTicks: paintedAIState(p)?.foodBlockedTicks ?? 0,
        hash: (p as PlayerImpl).hash(),
      })),
    });
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
  result.finalHash = simpleHash(
    players.map((p) => `${p.id()}:${(p as PlayerImpl).hash()}`).join("|"),
  );
  result.wallMs = performance.now() - started;
  return result;
}
