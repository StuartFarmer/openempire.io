import { defineFieldSystem } from "../../../webgpu/FieldDynamics";
import { nearestEnemyAI, playerIntent } from "../../shared";

// OpenFront conquest, ported to a cellular terrain game (port-openfront-conquest).
// Territory expands over the terrain base: population grows toward the land's
// carrying capacity (real climate), troops mobilize from it, and the frontier
// advances by attack — where the TERRAIN sets the cost (OpenFront's Plains /
// Highland / Mountain magnitudes, in conquest/lib/conquest.wesl). Paint the
// starting territories with the spawn brushes, hit Play, and the bots push
// their empires over the plains and stall on the mountains.
export const conquest = defineFieldSystem({
  id: "conquest",
  name: "Conquest",
  description: "OpenFront territory conquest: the terrain sets the cost.",
  kind: "game",
  defaultMap: "EarthXL",
  defaultView: "conquest",

  ai: { decide: (ctx) => nearestEnemyAI(ctx) },

  params: {
    // Carrying capacity from the terrain climate (warmth × moisture × soil).
    baseTempC: { value: 5, min: 0, max: 15, step: 0.5 },
    rainWeight: { value: 0.7, min: 0, max: 1.5 },
    riverWeight: { value: 0.5, min: 0, max: 1.5 },
    dryThreshold: { value: 0.32, min: 0, max: 1 },
    wetThreshold: { value: 0.55, min: 0, max: 1.5 },

    // Economy.
    growthRate: { value: 0.08, min: 0, max: 0.5 },
    mobilizeRate: { value: 0.06, min: 0, max: 0.3 },

    // Conquest (OpenFront terrain-typed cost + troop-ratio combat).
    seaLevel: { value: 0.46, min: 0.2, max: 0.8, step: 0.01 },
    attackPower: { value: 2.0, min: 0, max: 6 },
    attrition: { value: 0.06, min: 0, max: 0.5 },
    conquestGarrison: { value: 0.7, min: 0, max: 1 },
    neutralDefense: { value: 0.06, min: 0, max: 0.5 },
    militiaFrac: { value: 0.35, min: 0, max: 1 },
    // How much the terrain magnitude (0.8 plains … 1.2 mountain) weighs into
    // the tile's defense — the strength of OpenFront's terrain cost.
    terrainWeight: { value: 0.5, min: 0, max: 2 },
    flipMargin: { value: 1.6, min: 1, max: 3 },
  },

  players: playerIntent(5), // slot 0 = neutral; up to 4 empires

  // Attack pressure resolves before ownership/troops flip on it.
  phases: [["incursion"], ["owner", "troops"]],

  scalars: {
    tilesOwned: { reduce: "count", groupBy: "owner" },
    totalTroops: { reduce: "sum", layer: "troops", groupBy: "owner" },
    totalPop: { reduce: "sum", layer: "pop", groupBy: "owner" },
  },

  brushes: {
    spawnP1: { target: "owner", mode: "set", value: 1, radius: 5 },
    spawnP2: { target: "owner", mode: "set", value: 2, radius: 5 },
    spawnP3: { target: "owner", mode: "set", value: 3, radius: 5 },
    spawnP4: { target: "owner", mode: "set", value: 4, radius: 5 },
    raze: { target: "owner", mode: "set", value: 0, radius: 8 },
  },

  views: {
    conquest: { source: "views/conquest.wesl" },
    troops: { layer: "troops", ramp: ["#0b1220", "#f0f0d8"] },
    population: { layer: "pop", ramp: ["#0b1220", "#f4d58d", "#ffffff"] },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
