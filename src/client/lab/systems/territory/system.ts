import { defineFieldSystem } from "../../../webgpu/FieldDynamics";
import { nearestEnemyAI, playerIntent } from "../../shared";

// Phase 2 proof system (docs/FieldDynamics.md): OpenFront-flavored cellular
// territory combat. Ownership is a u32 layer; attacks are directional
// pressure fields resolved by one shared conquest rule; players (4 bots +
// neutral slot 0) push toward targets the lab's bot driver re-rolls
// periodically. Paint spawns with the spawnP* brushes, hit Play, and watch
// the wars.
export const territory = defineFieldSystem({
  id: "territory",
  name: "Territory",
  description: "Cellular territory combat: empires push fronts over the map.",
  kind: "game",
  defaultMap: "EarthXL",
  defaultView: "territory",

  // Bots drive slots 1..4 (slot 0 neutral); paint spawns with spawnP* (click).
  ai: { decide: (ctx) => nearestEnemyAI(ctx) },

  params: {
    regen: { value: 0.004, min: 0, max: 0.05 },
    attackPower: { value: 2.0, min: 0, max: 6 },
    defensePower: { value: 1.0, min: 0, max: 3 },
    neutralDefense: { value: 0.08, min: 0, max: 0.5 },
    conquestGarrison: { value: 0.7, min: 0, max: 1 },
    attrition: { value: 0.06, min: 0, max: 0.5 },
    commitDrain: { value: 0.002, min: 0, max: 0.05 },
    flipMargin: { value: 1.3, min: 1, max: 3 },
    flipChance: { value: 0.18, min: 0.01, max: 1 },
  },

  players: playerIntent(5), // slot 0 = neutral

  phases: [["attack"], ["owner", "troops"]],

  scalars: {
    tilesOwned: { reduce: "count", groupBy: "owner" },
    totalTroops: { reduce: "sum", layer: "troops", groupBy: "owner" },
  },

  brushes: {
    spawnP1: { target: "owner", mode: "set", value: 1, radius: 5 },
    spawnP2: { target: "owner", mode: "set", value: 2, radius: 5 },
    spawnP3: { target: "owner", mode: "set", value: 3, radius: 5 },
    spawnP4: { target: "owner", mode: "set", value: 4, radius: 5 },
    raze: { target: "owner", mode: "set", value: 0, radius: 8 },
    garrison: { target: "troops", mode: "set", value: 1, radius: 5 },
  },

  views: {
    territory: {
      source: "views/territory.wesl",
      ramp: ["#141a22", "#e05555", "#4d97e0", "#58c470", "#e0b84d"],
    },
    troops: { layer: "troops", ramp: ["#0b1220", "#f0f0d8"] },
    battles: {
      source: "views/pressure.wesl",
      ramp: ["#101418", "#ff5533"],
    },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
