import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { paintedMapLoader } from "../../scripts/painted-map-loader.ts";
import {
  CityDevelopmentUpdates,
  cityDevelopmentSummary,
} from "../../src/client/webgpu/CityDevelopmentUpdates.ts";
import { createGameRunner } from "../../src/core/GameRunner.ts";
import { DEFAULT_CONFIG } from "../../src/core/development/CityDevelopmentConfig.ts";
import { paintedResources } from "../../src/core/execution/utils/PaintedEconomy.ts";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
} from "../../src/core/game/Game.ts";

// Run from the repository root: node --import tsx simplefront/docs/performance/spqr-turbo-core.mts
// Simulation + the production city observer; excludes browser rendering, timers,
// worker transfer and the rest of ShellSim's frame construction.
const output = process.env.PROBE_OUTPUT ?? "/tmp/spqr-turbo-result.json";
const seed = process.env.PROBE_SEED ?? "spqr-turbo-6000";
const maxTicks = Number(process.env.PROBE_TICKS ?? 8000);
const checkpoints = process.env.PROBE_CHECKPOINTS === "1";
const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 1000 });
let pending: any;
const runner = await createGameRunner(
  {
    gameID: seed,
    lobbyCreatedAt: 0,
    config: {
      gameMap: GameMapType.SPQR,
      gameType: GameType.Singleplayer,
      gameMode: GameMode.FFA,
      difficulty: Difficulty.Medium,
      donateGold: false,
      donateTroops: false,
      nations: "default",
      bots: 50,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    },
    players: [{ clientID: "probe-human", username: "Probe", clanTag: null }],
  },
  "probe-human",
  paintedMapLoader(),
  (data: any) => {
    if (data.errMsg) throw Error(data.errMsg);
    pending = data;
  },
  "simplefront",
  DEFAULT_CONFIG,
);
const game: any = runner.game;
let tile =
  Math.floor(game.height() / 2) * game.width() + Math.floor(game.width() / 2);
while (
  !game.isLand(tile) ||
  game.isImpassable(tile) ||
  game.owner(tile).smallID() !== 0
)
  tile++;
const observer = new CityDevelopmentUpdates();
const windows: any[] = [];
let costs: number[] = [],
  observerCosts: number[] = [],
  bytes = 0,
  last = performance.now(),
  profiling = false;
const quantile = (a: number[], q: number) =>
  [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * q)];
console.log(
  JSON.stringify({
    seed,
    dimensions: [game.width(), game.height()],
    spawn: tile,
    maxTicks,
  }),
);
for (let turn = 0; game.ticks() < maxTicks; turn++) {
  if (game.ticks() >= 5000 && !profiling) {
    await session.post("Profiler.start");
    profiling = true;
  }
  runner.addTurn({
    turnNumber: turn,
    intents:
      turn === 0 ? [{ type: "spawn", tile, clientID: "probe-human" }] : [],
  });
  const start = performance.now();
  runner.executeNextTick();
  costs.push(performance.now() - start);
  const obs = performance.now();
  const development = observer.read(game);
  const human = game.playerByClientID("probe-human");
  if (human) cityDevelopmentSummary(game, human, paintedResources(game, human));
  observerCosts.push(performance.now() - obs);
  bytes +=
    (development?.tiles.byteLength ?? 0) +
    (pending?.packedTileUpdates?.byteLength ?? 0) +
    (pending?.packedDensityUpdates?.byteLength ?? 0);
  if (game.ticks() % 500 === 0) {
    const row = {
      tick: game.ticks(),
      simMs: {
        p50: quantile(costs, 0.5),
        p95: quantile(costs, 0.95),
        total: costs.reduce((a, b) => a + b, 0),
      },
      observerMs: {
        p50: quantile(observerCosts, 0.5),
        p95: quantile(observerCosts, 0.95),
        total: observerCosts.reduce((a, b) => a + b, 0),
      },
      payloadBytes: bytes,
      ...(checkpoints && {
        // Outside the measured tick/observer intervals. Keep the complete
        // physical city field, fractional work and per-player random states.
        checkpoint: createHash("sha256")
          .update(
            JSON.stringify(
              [game.hash(), game.cityDevelopment.deterministicState()],
              (_, value) =>
                typeof value === "bigint" ? value.toString() : value,
            ),
          )
          .digest("hex"),
      }),
      developed: [...game.cityDevelopment.developedTiles()].length,
      owned: game
        .players()
        .reduce((n: any, p: any) => n + p.numTilesOwned(), 0),
      alive: game.players().filter((p: any) => p.isAlive()).length,
      heapMB: process.memoryUsage().heapUsed / 1048576,
      wallMs: performance.now() - last,
    };
    windows.push(row);
    console.log(JSON.stringify(row));
    costs = [];
    observerCosts = [];
    bytes = 0;
    last = performance.now();
  }
}
if (profiling) {
  const { profile } = await session.post("Profiler.stop");
  writeFileSync(output + ".cpuprofile", JSON.stringify(profile));
}
session.disconnect();
writeFileSync(
  output,
  JSON.stringify({ seed, windows, hash: game.hash() }, null, 2),
);
