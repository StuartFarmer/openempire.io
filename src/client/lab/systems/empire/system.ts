import { defineFieldSystem } from "../../../webgpu/FieldDynamics";
import { nearestEnemyAI, playerIntent } from "../../shared";

// Age of Food — the 4X vertical slice (openspec/changes/add-age-of-food).
// The settlement ecology reframed as a game: `potential` is the unowned,
// seasonal carrying capacity (the opportunity map); players own `pop`
// (civilians) and `troops` (mobilized) tagged by `owner`. Fertile supplied
// land feeds more people and, through them, fields a bigger army — so wars
// are fought over the valleys the ecology makes valuable. Organic-flow
// control (OpenFront-style border growth), deterministic-attrition combat.
// Lab slice: brush the starting territories (spawnP*), hit Play, and the
// generic bot driver pushes the players' targets around while the empires
// grow, meet, and fight.
export const empire = defineFieldSystem({
  id: "empire",
  name: "Empire",
  description: "4X vertical slice: empires grow over the ecology and fight.",
  kind: "game",
  defaultMap: "EarthXL",
  defaultView: "empire",

  // Bots push slots 1..4 toward wandering targets (slot 0 = neutral, dormant);
  // paint the starting territories with the spawnP* brushes (click on the map).
  ai: { decide: (ctx) => nearestEnemyAI(ctx) },

  params: {
    // Seasonal temperature comes from the terrain base (layers::temperature) —
    // real continentality + seasons, advanced by the viewer's season tier.

    // Carrying capacity (potential).
    baseTempC: { value: 5, min: 0, max: 15, step: 0.5 },
    warmSpanC: { value: 20, min: 5, max: 40, step: 1 },
    rainWeight: { value: 0.7, min: 0, max: 1.5 },
    riverWeight: { value: 0.5, min: 0, max: 1.5 },
    dryThreshold: { value: 0.32, min: 0, max: 1 },
    wetThreshold: { value: 0.55, min: 0, max: 1.5 },

    // Supply (logistical reach).
    settleThreshold: { value: 0.15, min: 0, max: 1 },
    supplyStep: { value: 0.04, min: 0.005, max: 0.3, step: 0.005 },
    supplyMountainCost: { value: 0.12, min: 0, max: 0.6 },

    // Economy. Harvest must beat appetite on decent land (production
    // ≈ harvest·potential vs consumption ≈ eat), so food banks a surplus.
    growthRate: { value: 0.08, min: 0, max: 0.5 },
    starveRate: { value: 0.05, min: 0, max: 0.5 },
    harvestRate: { value: 0.14, min: 0, max: 0.4 },
    eatRate: { value: 0.02, min: 0, max: 0.2 },
    foodDecay: { value: 0.01, min: 0, max: 0.1 },

    // Military.
    mobilizeRate: { value: 0.06, min: 0, max: 0.3 },
    attackPower: { value: 2.0, min: 0, max: 6 },
    attrition: { value: 0.06, min: 0, max: 0.5 },
    starveAttrition: { value: 0.04, min: 0, max: 0.3 },
    unsupplyAttrition: { value: 0.08, min: 0, max: 0.5 },
    conquestGarrison: { value: 0.7, min: 0, max: 1 },
    // Defense bars.
    neutralDefense: { value: 0.06, min: 0, max: 0.5 },
    militiaFrac: { value: 0.35, min: 0, max: 1 },
    terrainDefense: { value: 0.5, min: 0, max: 2 },
    flipMargin: { value: 1.6, min: 1, max: 3 },
  },

  players: playerIntent(5), // slot 0 = neutral; up to 4 empires

  // Incursion pressure resolves before ownership/troops flip on it, same as
  // the territory prototype.
  phases: [["incursion"], ["owner", "troops"]],

  scalars: {
    tilesOwned: { reduce: "count", groupBy: "owner" },
    totalPop: { reduce: "sum", layer: "pop", groupBy: "owner" },
    totalTroops: { reduce: "sum", layer: "troops", groupBy: "owner" },
  },

  brushes: {
    spawnP1: { target: "owner", mode: "set", value: 1, radius: 5 },
    spawnP2: { target: "owner", mode: "set", value: 2, radius: 5 },
    spawnP3: { target: "owner", mode: "set", value: 3, radius: 5 },
    spawnP4: { target: "owner", mode: "set", value: 4, radius: 5 },
    settlers: { target: "pop", mode: "set", value: 0.6, radius: 4 },
    raze: { target: "owner", mode: "set", value: 0, radius: 8 },
  },

  views: {
    empire: { source: "views/empire.wesl" },
    potential: { layer: "potential", ramp: ["#141210", "#3f8f34"] },
    population: { layer: "pop", ramp: ["#0b1220", "#f4d58d", "#ffffff"] },
    troops: { layer: "troops", ramp: ["#0b1220", "#f0f0d8"] },
    supply: { layer: "supply", ramp: ["#0b1018", "#54b0e0"] },
    food: { layer: "food", ramp: ["#141008", "#e8b84b"] },
    frontline: { source: "views/frontline.wesl", ramp: ["#101418", "#ff5533"] },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
