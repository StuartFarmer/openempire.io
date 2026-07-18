import { defineFieldSystem } from "../../../webgpu/FieldDynamics";

// Settlement ecology, modeled as pure fields on the real climate substrate.
// The chain, one layer per file: seasonal temp → growing-degree-days (frost
// resets the season) → crop biomass (soil × warmth × water × GDD) → harvested
// food store → population density (births on food, deaths on starvation,
// migration down the crowding gradient). Population is the "agent" layer — no
// discrete actors, just density that gathers where the land can feed it.
//
// Runs on any layered map (#lab); on EarthXL the soil/humidity/water come from
// the real ingest, so crops green the real farmland and settlement pools in
// the fertile, frost-free, watered regions.
export const settlement = defineFieldSystem({
  id: "settlement",
  name: "Settlement",

  params: {
    // Seasonal temperature (same model as the world system).
    tilt: { value: 23.4, min: 0, max: 45, step: 0.1 },
    yearTicks: { value: 520, min: 120, max: 36000, step: 10 },
    seasonStrength: { value: 1.0, min: 0, max: 3 },

    // Growing season: warmth accounting.
    baseTempC: { value: 5, min: 0, max: 15, step: 0.5 },
    warmSpanC: { value: 20, min: 5, max: 40, step: 1 },
    gddGain: { value: 0.0006, min: 0, max: 0.005, step: 0.0001 },

    // Crops.
    rainWeight: { value: 0.7, min: 0, max: 1.5 },
    riverWeight: { value: 0.5, min: 0, max: 1.5 },
    dryThreshold: { value: 0.32, min: 0, max: 1 },
    wetThreshold: { value: 0.55, min: 0, max: 1.5 },
    cropGrowth: { value: 0.1, min: 0, max: 0.5 },
    frostKill: { value: 0.3, min: 0, max: 1 },

    // Food store. Decay both spoils the store and keeps it tracking current
    // production, so a marginal trickle can't integrate into a false surplus.
    harvestRate: { value: 0.04, min: 0, max: 0.2 },
    foodDecay: { value: 0.02, min: 0, max: 0.1 },

    // Population. Equilibrium exists only where food > deathRate/birthRate
    // (≈0.25 here), which is what makes settlement concentrate on good land.
    eatRate: { value: 0.04, min: 0, max: 0.3 },
    birthRate: { value: 0.08, min: 0, max: 0.3 },
    deathRate: { value: 0.02, min: 0, max: 0.3 },
    migrate: { value: 0.05, min: 0, max: 0.5 },
  },

  scalars: {
    // Peaks are i32-fixed-point safe on any map size; the population total is
    // the payoff metric (may saturate on the very largest maps).
    peakPop: { reduce: "max", layer: "pop" },
    peakCrops: { reduce: "max", layer: "crops" },
    totalPop: { reduce: "sum", layer: "pop" },
  },

  brushes: {
    seedPop: { target: "pop", mode: "set", value: 1, radius: 4 },
    clearPop: { target: "pop", mode: "set", value: 0, radius: 8 },
  },

  views: {
    life: { source: "views/life.wesl" },
    population: { layer: "pop", ramp: ["#0b1220", "#f4d58d", "#ffffff"] },
    crops: { layer: "crops", ramp: ["#141210", "#3f8f34"] },
    food: { layer: "food", ramp: ["#141008", "#e8b84b"] },
    growingDegreeDays: { layer: "gdd", ramp: ["#101418", "#d98b3a"] },
    temperature: { layer: "temp", ramp: ["#2850a0", "#e8dc78", "#c83c32"] },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
