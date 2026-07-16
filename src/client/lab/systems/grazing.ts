import type { FieldSystem } from "../../webgpu/FieldDynamics";

// First proof system for Field Dynamics (docs/FieldDynamics.md): grass
// regrows toward the map's crop fertility and is eaten by herds; herds grow
// where they eat, die at a base rate, diffuse toward neighbors, and cannot
// exist off land. Paint herds with the brush and watch the ecology settle.
export const grazing: FieldSystem = {
  id: "grazing",
  name: "Grazing",

  params: {
    grassGrowth: { value: 0.04, min: 0, max: 0.2 },
    grazeRate: { value: 0.3, min: 0, max: 1 },
    herdBirth: { value: 0.12, min: 0, max: 0.5 },
    herdDeath: { value: 0.05, min: 0, max: 0.5 },
    herdSpread: { value: 0.15, min: 0, max: 0.5 },
  },

  fields: {
    grass: {
      init: "crop[i]",
      update: /* wgsl */ `
        let regrow = P.grassGrowth * crop[i] * (1.0 - grass_in[i]);
        let grazed = P.grazeRate * herd_in[i] * grass_in[i];
        grass_out[i] = clamp(grass_in[i] + regrow - grazed, 0.0, 1.0);
      `,
    },
    herd: {
      init: "0.0",
      update: /* wgsl */ `
        var v = herd_in[i];
        v += P.herdBirth * v * grass_in[i];
        v -= P.herdDeath * v;
        v += P.herdSpread * (avg8_herd(x, y) - v);
        herd_out[i] = select(0.0, clamp(v, 0.0, 1.0), land[i] != 0.0);
      `,
    },
  },

  scalars: {
    totalHerd: { reduce: "sum", of: "herd_in[i]" },
    peakGrass: { reduce: "max", of: "grass_in[i]" },
  },

  brushes: {
    seedHerds: { target: "herd", mode: "set", value: 1, radius: 4 },
    clearHerds: { target: "herd", mode: "set", value: 0, radius: 8 },
  },

  views: {
    herds: { expr: "herd_in[i]", ramp: ["#0b1220", "#f0c86e"] },
    grass: { expr: "grass_in[i]", ramp: ["#1a140b", "#6fae4e"] },
    pressure: {
      expr: "P.grazeRate * herd_in[i] * grass_in[i]",
      ramp: ["#101418", "#e05555"],
    },
  },
};
