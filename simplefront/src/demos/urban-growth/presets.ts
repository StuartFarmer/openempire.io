import { DEFAULT_CONFIG, GrowthConfig } from "./config";
import { makeTerrain, Terrain, TerrainKind } from "./terrain";

export interface Scenario {
  preset: TerrainKind;
  seed: number;
  relief: number;
  centre: number | null;
  config: GrowthConfig;
  terrain: Terrain;
}
export const PRESETS: {
  id: TerrainKind;
  name: string;
  description: string;
  seed: number;
  centre: [number, number];
  relief: number;
  config: GrowthConfig;
}[] = [
  {
    id: "plain",
    name: "01 · Open plain",
    description:
      "The control case. Watch neighbourhoods fill in without terrain resistance.",
    seed: 42,
    centre: [32, 32],
    relief: 1,
    config: { ...DEFAULT_CONFIG },
  },
  {
    id: "hillside",
    name: "02 · Hillside",
    description:
      "The land rises eastward. Compare downhill expansion with the uphill edge.",
    seed: 61,
    centre: [32, 32],
    relief: 1.3,
    config: { ...DEFAULT_CONFIG, slopePenalty: 12, uphillPenalty: 24 },
  },
  {
    id: "valley",
    name: "03 · River valley",
    description:
      "Water attracts development; the river itself remains an uncrossable boundary.",
    seed: 19,
    centre: [24, 32],
    relief: 1,
    config: {
      ...DEFAULT_CONFIG,
      waterBonus: 0.9,
      slopePenalty: 14,
      centreFalloff: 0.65,
    },
  },
  {
    id: "coast",
    name: "04 · Coastal basin",
    description: "A sheltered shoreline encourages a waterfront settlement.",
    seed: 86,
    centre: [32, 23],
    relief: 1,
    config: { ...DEFAULT_CONFIG, waterBonus: 0.85, densify: 0.7 },
  },
  {
    id: "pass",
    name: "05 · Mountain pass",
    description:
      "A low saddle through a steep ridge. Move the centre onto the ridge to compare.",
    seed: 12,
    centre: [27, 32],
    relief: 1,
    config: { ...DEFAULT_CONFIG, slopePenalty: 20, uphillPenalty: 24 },
  },
  {
    id: "rolling",
    name: "06 · Rolling hills",
    description:
      "Irregular terrain makes a different neighbourhood pattern for each seed.",
    seed: 73,
    centre: [32, 32],
    relief: 1,
    config: { ...DEFAULT_CONFIG, slopePenalty: 14, irregularity: 0.35 },
  },
];
export function createScenario(id: TerrainKind, seed?: number): Scenario {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error("Unknown terrain preset.");
  const chosenSeed = seed ?? preset.seed,
    terrain = makeTerrain(id, chosenSeed, preset.relief);
  const requested = preset.centre[1] * 64 + preset.centre[0];
  let centre = requested;
  if (terrain.water[centre]) centre = terrain.water.findIndex((x) => !x);
  return {
    preset: id,
    seed: chosenSeed,
    relief: preset.relief,
    centre: centre < 0 ? null : centre,
    config: { ...preset.config },
    terrain,
  };
}
