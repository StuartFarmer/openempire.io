import { readFileSync } from "fs";
import {
  LEAN_ACTION,
  LEAN_RESULT,
  decodeLeanResult,
} from "../src/client/games/leanfront/actions";
import { leanfront } from "../src/client/games/leanfront/system";
import { composeTerrain } from "../src/client/lab/systems/terrain/system";
import { compileFieldSystem } from "../src/client/webgpu/FieldDynamics";

function storageBindingCount(code: string): number {
  return code.match(/var<storage\b/g)?.length ?? 0;
}

test("declares only the simple economy state and tuning surface", async () => {
  const compiled = await compileFieldSystem(composeTerrain(leanfront));
  expect(compiled.layerNames).toEqual([
    "cityLevel",
    "command",
    "farmLevel",
    "food",
    "incursion",
    "owner",
    "troops",
  ]);
  expect(Object.keys(leanfront.params ?? {})).toEqual([
    "cityCapacityPerLevel",
    "farmCapacityPerLevel",
    "cityGrowthRate",
    "farmGrowthRate",
    "seedFraction",
    "cityLevelCost",
    "farmLevelCost",
    "razeCost",
    "attackCostPerPerson",
    "seaLevel",
    "attackPower",
    "attrition",
    "conquestGarrison",
    "neutralDefense",
    "terrainWeight",
    "flipMargin",
  ]);
  expect(leanfront.phases).toEqual([
    ["command"],
    ["incursion"],
    ["owner", "troops", "cityLevel", "farmLevel", "food"],
  ]);
  expect(compiled.playerOutputNames).toEqual([
    "actionResult",
    "foodSpendFx",
    "resolvedResult",
    "resolvedCostFx",
    "resolvedLevel",
    "spawnCityTile",
    "spawnFarmTile",
  ]);
  expect(leanfront.scalars).toEqual({
    totalFood: { reduce: "sum", layer: "food", groupBy: "owner" },
    totalPeople: { reduce: "sum", layer: "troops", groupBy: "owner" },
    tilesOwned: { reduce: "count", groupBy: "owner" },
    totalCityLevels: {
      reduce: "sum",
      layer: "cityLevel",
      groupBy: "owner",
    },
    totalFarmLevels: {
      reduce: "sum",
      layer: "farmLevel",
      groupBy: "owner",
    },
  });
  expect(compiled.localPlayer).toBe(1);
  expect(compiled.intentForBrush("city")).toBe(LEAN_ACTION.city);
  expect(compiled.intentForBrush("farm")).toBe(LEAN_ACTION.farm);
  expect(compiled.intentForBrush("raze")).toBe(LEAN_ACTION.raze);
});

test("every composed LeanFront pass fits the ten-storage-buffer WebGPU limit", async () => {
  const compiled = await compileFieldSystem(composeTerrain(leanfront));
  const counts = Object.fromEntries(
    compiled.kernelConfig.passes.map((pass) => [
      pass.name,
      storageBindingCount(pass.code),
    ]),
  );
  expect(Object.keys(counts).length).toBeGreaterThan(0);
  expect(
    Object.fromEntries(
      Object.entries(counts).filter(([, count]) => count > 10),
    ),
  ).toEqual({});
});

test("packs a result code with its originating tick", () => {
  expect(decodeLeanResult((123 << 8) | LEAN_RESULT.accepted)).toEqual({
    tick: 123,
    code: LEAN_RESULT.accepted,
  });
});

test("plot shaders never derive a new plot from neighboring plots", () => {
  const city = leanfront.modules["layers/cityLevel.wesl"];
  const farm = leanfront.modules["layers/farmLevel.wesl"];
  expect(city).not.toMatch(/cityLevel::at|farmLevel::at/);
  expect(farm).not.toMatch(/cityLevel::at|farmLevel::at/);
  expect(city).toContain("actionTile");
  expect(farm).toContain("actionTile");
});

test("mounts LeanFront on the field path and submits queued actions", () => {
  const shell = readFileSync("src/client/GameShellPage.ts", "utf8");
  expect(shell).toContain(
    'import { leanfront } from "./games/leanfront/system";',
  );
  expect(shell).toContain("composeTerrain(leanfront)");
  expect(shell).toContain("ticks = this.beginSimulationBatch(ticks);");
});

test("two nearby same-tick spawns use one linked player-priority reservation decision", async () => {
  const compiled = await compileFieldSystem(composeTerrain(leanfront));
  const arbitration = leanfront.modules["lib/actions.wesl"] ?? "";

  // Players 1 and 2 are resolved in order. Removing the earlier-player scan or
  // either reservation comparison makes this contract fail before Task 5's GPU
  // scenario can exercise the same pair of intents.
  expect(arbitration).toMatch(
    /for \(var candidatePlayer = 1u; candidatePlayer <= player;/,
  );
  expect(arbitration).toMatch(
    /for \(var earlierPlayer = 1u; earlierPlayer < candidatePlayer;/,
  );
  expect(arbitration).toMatch(/acceptedSpawns\[earlierPlayer\]/);
  expect(arbitration).toMatch(/reservedCities\[earlierPlayer\]/);
  expect(arbitration).toMatch(/reservedFarms\[earlierPlayer\]/);
  expect(arbitration).toMatch(/layers::land::val\(tile\) != 0\.0/);
  expect(arbitration).toMatch(/layers::owner::val\(tile\) == 0u/);
  expect(arbitration).toMatch(/layers::cityLevel::val\(tile\) == 0u/);
  expect(arbitration).toMatch(/layers::farmLevel::val\(tile\) == 0u/);
  expect(arbitration.match(/earlierPlayer < candidatePlayer/g)).toHaveLength(2);
  expect(arbitration).toMatch(
    /acceptedSpawns\[earlierPlayer\] == 0u[\s\S]*insideSpawnClaim\(reservedCities\[earlierPlayer\], action\.actionTile\)[\s\S]*insideSpawnClaim\(action\.actionTile, reservedFarms\[earlierPlayer\]\)/,
  );
  expect(arbitration).toMatch(
    /acceptedSpawns\[earlierPlayer\] != 0u[\s\S]*neighbor == reservedCities\[earlierPlayer\][\s\S]*neighbor == reservedFarms\[earlierPlayer\]/,
  );

  const command = leanfront.modules["layers/command.wesl"] ?? "";
  expect(command).toContain("resolveAction");
  const commandPass = compiled.kernelConfig.passes.find(
    ({ name }) => name === "stock/command",
  );
  expect(commandPass?.code).toContain("acceptedSpawns");
  expect(commandPass?.code).toContain("reservedCities");
  expect(commandPass?.code).toContain("reservedFarms");

  for (const name of [
    "cityLevel",
    "farmLevel",
    "food",
    "incursion",
    "owner",
    "troops",
  ]) {
    const source = leanfront.modules[`layers/${name}.wesl`];
    expect(source).not.toMatch(/fn firstSpawnFarmTile/);
    expect(source).not.toContain("resolveAction");
    expect(source).toMatch(/playerOutputs::resolved(Result|CostFx)/);
    const pass = compiled.kernelConfig.passes.find(
      ({ name: passName }) => passName === `stock/${name}`,
    );
    expect(pass?.code).not.toContain("acceptedSpawns");
    expect(pass?.code).not.toContain("reservedCities");
    expect(pass?.code).not.toContain("reservedFarms");
  }

  expect(leanfront.modules["layers/cityLevel.wesl"]).toContain(
    "playerOutputs::spawnCityTile(p)",
  );
  expect(leanfront.modules["layers/cityLevel.wesl"]).not.toContain(
    "playerOutputs::spawnFarmTile(p)",
  );
  expect(leanfront.modules["layers/farmLevel.wesl"]).toContain(
    "playerOutputs::spawnFarmTile(p)",
  );
  expect(leanfront.modules["layers/farmLevel.wesl"]).not.toContain(
    "playerOutputs::spawnCityTile(p)",
  );
  expect(leanfront.modules["layers/food.wesl"]).toContain(
    "playerOutputs::spawnFarmTile(p)",
  );
  expect(leanfront.modules["layers/owner.wesl"]).toContain(
    "playerOutputs::spawnCityTile(p)",
  );
  expect(leanfront.modules["layers/owner.wesl"]).toContain(
    "var spawnClaimed = false",
  );
  expect(leanfront.modules["layers/owner.wesl"]).toMatch(
    /!spawnClaimed[\s\S]*next = p;[\s\S]*spawnClaimed = true/,
  );
  expect(leanfront.modules["layers/troops.wesl"]).toContain(
    "playerOutputs::spawnCityTile(p)",
  );
});

test("reports due valid and invalid actions from one player invocation", () => {
  const command = leanfront.modules["layers/command.wesl"];
  expect(command).toMatch(/i == 0u \|\| i >= players::count\(\)/);
  expect(command).toMatch(/action\.actionTick == sim::tick\(\)/);
  expect(command).toContain("playerOutputs::set_actionResult(i,");
});

test("documents debit error as less than one quantum per contributing farm", () => {
  const design = readFileSync(
    "docs/superpowers/specs/2026-09-04-leanfront-simple-gpu-economy-design.md",
    "utf8",
  );
  const plan = readFileSync(
    "docs/superpowers/plans/2026-09-04-leanfront-simple-gpu-economy.md",
    "utf8",
  );
  expect(design).toContain(
    "less than one `1 / 256` quantum per contributing farm",
  );
  expect(plan).toContain("contributingFarmCount / 256");
});

test("maps the human's first click to spawn and later clicks to attack", () => {
  const persistent: Record<string, number> = { commit: 0.7 };
  const writes: Record<string, number>[] = [];
  const queued: Record<string, number>[] = [];
  const ctx = {
    mapWidth: 20,
    mapHeight: 10,
    running: true,
    localPlayer: 1,
    scalars: { tilesOwned: [0, 0, 0, 0, 0] },
    stamp: () => undefined,
    setPlayer: (_p: number, fields: Record<string, number>) => {
      Object.assign(persistent, fields);
      writes.push(fields);
    },
    queuePlayer: (_p: number, fields: Record<string, number>) =>
      queued.push(fields),
    player: () => persistent,
  };

  leanfront.input!.onTile!(ctx, 4, 5, {} as PointerEvent);
  expect(writes.pop()).toEqual({ alive: 1, attacking: 0, commit: 0.7 });
  expect(queued.pop()).toEqual({
    actionKind: LEAN_ACTION.spawn,
    actionTile: 104,
  });

  ctx.scalars.tilesOwned[1] = 1;
  leanfront.input!.onTile!(ctx, 7, 8, {} as PointerEvent);
  expect(writes.pop()).toEqual({
    alive: 1,
    attacking: 1,
    commit: 0.7,
    targetX: 7,
    targetY: 8,
  });
});

test("gives bots a free anchor spawn before food-gated build and attack", () => {
  const writes: { p: number; fields: Record<string, number> }[] = [];
  const queued: { p: number; fields: Record<string, number> }[] = [];
  leanfront.ai!.decide({
    playerCount: 5,
    tick: 40,
    mapWidth: 100,
    mapHeight: 80,
    localPlayer: 1,
    scalars: {
      tilesOwned: [0, 1, 0, 1, 1],
      totalFood: [0, 0, 0, 0.4, 0.6],
    },
    rand: () => 0.5,
    setPlayer: (p, fields) => writes.push({ p, fields }),
    queuePlayer: (p, fields) => queued.push({ p, fields }),
  });

  expect(writes[0]).toEqual({
    p: 2,
    fields: { alive: 1, attacking: 0, commit: 0.6 },
  });
  expect(queued[0]).toEqual({
    p: 2,
    fields: { actionKind: LEAN_ACTION.spawn, actionTile: 2075 },
  });
  expect(queued.map(({ p, fields }) => [p, fields.actionKind])).toEqual([
    [2, LEAN_ACTION.spawn],
    [3, LEAN_ACTION.farm],
    [4, LEAN_ACTION.city],
  ]);
  expect(writes.find(({ p }) => p === 3)?.fields.attacking).toBe(0);
  expect(writes.find(({ p }) => p === 4)?.fields.attacking).toBe(1);
});
