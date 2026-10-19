import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CityDevelopmentUpdates } from "../src/client/webgpu/CityDevelopmentUpdates";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
} from "../src/core/game/Game";
import type { GameImpl } from "../src/core/game/GameImpl";
import type { PlayerImpl } from "../src/core/game/PlayerImpl";
import { createGameRunner } from "../src/core/GameRunner";
import type { GameStartInfo, StampedIntent } from "../src/core/Schemas";
import {
  canonicalJSON,
  sealTick,
  verifyTick,
} from "../src/core/sync/TickChain";
import { TickChainAuthority } from "../src/core/sync/TickChainAuthority";
import { TickChainSession } from "../src/core/sync/TickChainSession";
import { loadTickGenesis } from "../src/core/sync/TickGenesis";
import { paintedMapLoader } from "./painted-map-loader";
import { computeSimulationBuildID } from "./simulation-build-id";

const { values } = parseArgs({
  options: {
    map: { type: "string", default: "SPQR" },
    seed: { type: "string", default: "simplefront-pace-01" },
    ticks: { type: "string", default: "10000" },
    repeats: { type: "string", default: "3" },
    out: { type: "string" },
    record: { type: "string" },
  },
});
const ticks = Number(values.ticks),
  repeats = Number(values.repeats);
if (
  !Number.isSafeInteger(ticks) ||
  ticks < 1 ||
  !Number.isSafeInteger(repeats) ||
  repeats < 1
)
  throw new Error("Invalid benchmark dimensions");
const map = GameMapType[values.map as keyof typeof GameMapType];
if (!map) throw new Error("Unknown map");
const root = fileURLToPath(new URL("../", import.meta.url));
const build = await computeSimulationBuildID(root);
const start: GameStartInfo = {
  gameID: createHash("sha256").update(values.seed).digest("hex").slice(0, 8),
  lobbyCreatedAt: 0,
  config: {
    gameMap: map,
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
  players: [{ clientID: "bench123", username: "Benchmark", clanTag: null }],
};
const startup = performance.now();
const loaded = await loadTickGenesis(
  start,
  DEFAULT_CONFIG,
  paintedMapLoader(),
  build,
  "normal",
);
const startupMs = performance.now() - startup;
const stats = (a: number[]) => {
  const s = [...a].sort((a, b) => a - b);
  return {
    count: a.length,
    total: a.reduce((a, b) => a + b, 0),
    p50: s[Math.floor(s.length * 0.5)] ?? 0,
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? 0,
  };
};
const micro = [];
for (const count of [0, 1, 32, 256]) {
  const intents: StampedIntent[] = Array.from({ length: count }, (_, i) => ({
    type: "spawn",
    tile: i,
    clientID: "bench123",
  }));
  const previous = { tick: -1, chainHash: "a".repeat(64) },
    costs: number[] = [];
  let bytes = 0;
  for (let i = 0; i < 120; i++) {
    const now = performance.now(),
      block = await sealTick(previous, intents);
    await verifyTick(previous, block);
    if (i >= 20) costs.push(performance.now() - now);
    bytes = new TextEncoder().encode(canonicalJSON(block)).byteLength;
  }
  micro.push({ intents: count, bytes, sealAndVerifyMs: stats(costs) });
}
const runs = [];
let reference: string | undefined;
for (let repeat = 0; repeat < repeats; repeat++)
  for (const mode of ["legacy", "disabled", "chain"] as const) {
    const runner = await createGameRunner(
      start,
      "bench123",
      loaded.freshLoader(),
      (update) => {
        if ("errMsg" in update) throw new Error(update.errMsg);
      },
      "simplefront",
      DEFAULT_CONFIG,
      { stateHashEveryTicks: mode === "legacy" ? 10 : 0 },
    );
    const game = runner.game as GameImpl;
    const oldHash = game.hash.bind(game);
    let hashCalls = 0,
      hashMs = 0;
    game.hash = () => {
      const now = performance.now();
      const hash = oldHash();
      if (game.ticks() >= ticks - 1000) {
        hashCalls++;
        hashMs += performance.now() - now;
      }
      return hash;
    };
    const authority =
      mode === "chain" ? await TickChainAuthority.create(loaded.genesis) : null;
    let executionMs = 0;
    const apply = (tick: number, intents: StampedIntent[]) => {
      const now = performance.now();
      runner.addTurn({ turnNumber: tick, intents });
      if (!runner.executeNextTick()) throw new Error("Benchmark tick failed");
      executionMs = performance.now() - now;
    };
    const session = authority
      ? await TickChainSession.create(loaded.genesis, (b) =>
          apply(b.tick, b.intents),
        )
      : null;
    let tile =
      Math.floor(game.height() / 2) * game.width() +
      Math.floor(game.width() / 2);
    while (!game.isLand(tile) || game.isImpassable(tile)) tile++;
    const observer = new CityDevelopmentUpdates();
    const core: number[] = [],
      verification: number[] = [],
      observation: number[] = [];
    const began = performance.now();
    for (let tick = 0; tick < ticks; tick++) {
      const intents: StampedIntent[] =
        tick === 0 ? [{ type: "spawn", tile, clientID: "bench123" }] : [];
      const now = performance.now();
      if (authority && session) {
        if (tick === 0) authority.submit("bench123", 0, intents[0]);
        await session.receive(await authority.sealNext());
      } else apply(tick, intents);
      const elapsed = performance.now() - now;
      const obs = performance.now();
      observer.read(game);
      const obsMs = performance.now() - obs;
      if (tick >= ticks - 1000) {
        core.push(executionMs);
        verification.push(elapsed - executionMs);
        observation.push(obsMs);
      }
      if ((tick + 1) % 1000 === 0)
        console.log(
          JSON.stringify({
            repeat,
            mode,
            tick: tick + 1,
            elapsedMs: performance.now() - began,
          }),
        );
    }
    const wallMs = performance.now() - began;
    // Outside timed regions: explicit terrain, development and player state, not the input chain.
    const diagnostic = oldHash();
    const physical = createHash("sha256")
      .update(
        JSON.stringify(
          [
            game.cityDevelopment?.deterministicState(),
            Array.from({ length: game.width() * game.height() }, (_, t) => [
              game.ownerID(t),
              game.tileDamage(t),
            ]),
            game
              .allPlayers()
              .map((p) => [
                p.id(),
                p.troops(),
                String(p.food()),
                p.numTilesOwned(),
                (p as PlayerImpl).hash(),
              ]),
          ],
          (_, v) => (typeof v === "bigint" ? String(v) : v),
        ),
      )
      .digest("hex");
    const parity = `${diagnostic}:${physical}`;
    if (reference !== undefined && reference !== parity)
      throw new Error(`Simulation parity failed: ${mode}/${repeat}`);
    reference = parity;
    const row = {
      repeat,
      mode,
      wallMs,
      measuredTicks: core.length,
      coreMs: stats(core),
      chainOverheadMs: stats(verification),
      observerMs: stats(observation),
      hashCalls,
      hashMs,
      diagnostic,
      physical,
      heapMB: process.memoryUsage().heapUsed / 1048576,
    };
    runs.push(row);
    console.log(JSON.stringify(row));
    if (values.record && repeat === 0 && authority && session)
      await writeFile(
        values.record,
        JSON.stringify(authority.record(session.appliedThrough())),
        { flag: "wx" },
      );
  }
if ((await computeSimulationBuildID(root)) !== build)
  throw new Error(
    "Simulation source changed during benchmark; discard timings",
  );
const report = {
  generatedAt: new Date().toISOString(),
  build,
  map,
  seed: values.seed,
  ticks,
  repeats,
  assets: loaded.genesis.assets,
  startupMs,
  micro,
  runs,
  limitations:
    "Sequential headless real-core runs; final 1000 ticks measured; one startup asset load; no browser/render FPS claim; heap includes unreclaimed objects.",
};
if (values.out)
  await writeFile(values.out, JSON.stringify(report, null, 2), { flag: "wx" });
