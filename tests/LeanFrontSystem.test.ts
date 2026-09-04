import { readFileSync } from "fs";
import {
  LEAN_ACTION,
  LEAN_RESULT,
  decodeLeanResult,
} from "../src/client/games/leanfront/actions";
import { leanfront } from "../src/client/games/leanfront/system";
import { composeTerrain } from "../src/client/lab/systems/terrain/system";
import { compileFieldSystem } from "../src/client/webgpu/FieldDynamics";

test("declares only the simple economy state and tuning surface", async () => {
  const compiled = await compileFieldSystem(composeTerrain(leanfront));
  expect(compiled.layerNames).toEqual([
    "cityLevel",
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
    ["incursion"],
    ["owner", "troops", "cityLevel", "farmLevel", "food"],
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

test("spawn selects the first neutral empty land neighbor in every pass", async () => {
  await compileFieldSystem(composeTerrain(leanfront));
  for (const name of [
    "cityLevel",
    "farmLevel",
    "food",
    "incursion",
    "owner",
    "troops",
  ]) {
    const source = leanfront.modules[`layers/${name}.wesl`];
    expect(source).toContain("firstSpawnFarmTile");
    expect(source).toMatch(/layers::owner::val\(neighbor\)\s*==\s*0u/);
    expect(source).toMatch(/layers::cityLevel::val\(neighbor\)\s*==\s*0u/);
    expect(source).toMatch(/layers::farmLevel::val\(neighbor\)\s*==\s*0u/);
  }
  for (const name of ["farmLevel", "food"]) {
    const source = leanfront.modules[`layers/${name}.wesl`];
    expect(source.match(/firstSpawnFarmTile\(/g)).toHaveLength(3);
  }
});

test("reports valid actions at their target and invalid tile indices from tile zero", () => {
  const owner = leanfront.modules["layers/owner.wesl"];
  expect(owner).toMatch(/validTile\s*&&\s*i\s*==\s*action\.actionTile/);
  expect(owner).toMatch(/!validTile\s*&&\s*i\s*==\s*0u/);
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
