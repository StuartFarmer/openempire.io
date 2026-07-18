import { defineFieldSystem } from "../../../webgpu/FieldDynamics";

// First proof system for Field Dynamics (docs/FieldDynamics.md). The dynamic
// layers live in layers/*.wesl — one file per layer; this manifest is pure
// data.
export const grazing = defineFieldSystem({
  id: "grazing",
  name: "Grazing",
  kind: "study",
  defaultMap: "Verdantia",
  defaultView: "herds",

  params: {
    grassGrowth: { value: 0.04, min: 0, max: 0.2 },
    grazeRate: { value: 0.3, min: 0, max: 1 },
    herdBirth: { value: 0.12, min: 0, max: 0.5 },
    herdDeath: { value: 0.05, min: 0, max: 0.5 },
    herdSpread: { value: 0.15, min: 0, max: 0.5 },
  },

  scalars: {
    totalHerd: { reduce: "sum", layer: "herd" },
    peakGrass: { reduce: "max", layer: "grass" },
  },

  brushes: {
    seedHerds: { target: "herd", mode: "set", value: 1, radius: 4 },
    clearHerds: { target: "herd", mode: "set", value: 0, radius: 8 },
  },

  views: {
    herds: { layer: "herd", ramp: ["#0b1220", "#f0c86e"] },
    grass: { layer: "grass", ramp: ["#1a140b", "#6fae4e"] },
    fertility: { layer: "crop", ramp: ["#141414", "#b9e08a"] },
    pressure: { source: "views/pressure.wesl", ramp: ["#101418", "#e05555"] },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
