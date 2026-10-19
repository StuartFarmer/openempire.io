import { createHash, webcrypto } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { computeSimulationBuildID } from "../scripts/simulation-build-id";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import { loadTerrainMap } from "../src/core/game/TerrainMapLoader";
import { hashGenesis } from "../src/core/sync/TickChain";
import { loadTickGenesis } from "../src/core/sync/TickGenesis";
import { chainLoader, chainStart } from "./util/TickChainFixture";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

test("genesis hashes the same immutable bytes served to every fresh runner", async () => {
  const start = chainStart(),
    loader = chainLoader();
  const loaded = await loadTickGenesis(
    start,
    DEFAULT_CONFIG,
    loader,
    "1".repeat(64),
    "normal",
  );
  const originalBytes = await loader.getMapData(start.config.gameMap).mapBin();
  expect(loaded.genesis.assets.map).toBe(
    createHash("sha256").update(originalBytes).digest("hex"),
  );
  expect(loaded.genesis.gameStartInfo.gameID).toBe(start.gameID);
  start.gameID = "changed1";
  expect(loaded.genesis.gameStartInfo.gameID).toBe("chain123");
  const first = loaded.freshLoader().getMapData(start.config.gameMap);
  const second = loaded.freshLoader().getMapData(start.config.gameMap);
  (await first.mapBin())[0] = 0;
  expect((await second.mapBin())[0]).toBe(originalBytes[0]);
  const a = await loadTerrainMap(start.config.gameMap, loaded.freshLoader());
  const b = await loadTerrainMap(start.config.gameMap, loaded.freshLoader());
  expect(a.gameMap).not.toBe(b.gameMap);
  expect(await hashGenesis(loaded.genesis)).toBe(
    await hashGenesis(
      (
        await loadTickGenesis(
          chainStart(),
          DEFAULT_CONFIG,
          chainLoader(),
          "1".repeat(64),
          "normal",
        )
      ).genesis,
    ),
  );
});

test("changed build, terrain, timing mode or config cannot share genesis", async () => {
  const load = (
    build = "1".repeat(64),
    initialization: "normal" | "ambient" = "normal",
  ) =>
    loadTickGenesis(
      chainStart(),
      DEFAULT_CONFIG,
      chainLoader(),
      build,
      initialization,
    );
  const normal = await load();
  const digest = await hashGenesis(normal.genesis);
  expect(await hashGenesis((await load("2".repeat(64))).genesis)).not.toBe(
    digest,
  );
  expect(
    await hashGenesis((await load("1".repeat(64), "ambient")).genesis),
  ).not.toBe(digest);
  await expect(
    loadTickGenesis(
      chainStart(),
      DEFAULT_CONFIG,
      chainLoader(),
      "DEV",
      "normal",
    ),
  ).rejects.toThrow();
});

test("build identity hashes current source and is shared with the Vite build", async () => {
  const root = path.resolve(__dirname, "..");
  const first = await computeSimulationBuildID(root);
  expect(first).toMatch(/^[0-9a-f]{64}$/);
  expect(await computeSimulationBuildID(root)).toBe(first);
  expect(__SIMPLEFRONT_SIMULATION_BUILD__).toBe(first);
  await expect(
    computeSimulationBuildID(path.join(root, "missing-source")),
  ).rejects.toThrow();
});
