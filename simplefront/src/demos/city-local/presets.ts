import { DEFAULT_CONFIG, GrowthConfig } from "./config";
import { CityModel } from "./model";
import { makeTerrain, Terrain, TerrainKind } from "./terrain";

export interface Scenario {
  layout: "solo" | "border" | "districts";
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
    layout: "solo",
    preset: id,
    seed: chosenSeed,
    relief: preset.relief,
    centre: centre < 0 ? null : centre,
    config: { ...preset.config },
    terrain,
  };
}

/** Ready-to-run ownership arrangements on the same six Demo 3 landscapes. */
export function createModel(s: Scenario): CityModel | null {
  if (s.centre === null) return null;
  const w = s.terrain.width;
  const nearest = (x: number, y: number, allowed: (tile: number) => boolean) =>
    Array.from(s.terrain.water.keys())
      .filter((t) => !s.terrain.water[t] && allowed(t))
      .sort(
        (a, b) =>
          Math.hypot((a % w) - x, Math.floor(a / w) - y) -
            Math.hypot((b % w) - x, Math.floor(b / w) - y) || a - b,
      )[0];
  const cy = Math.floor(s.centre / w);
  const first = s.centre;
  const m = new CityModel(s.terrain, s.config, s.seed, first);
  if (s.layout === "border") {
    // Put the border beside the requested origin, never relocate the origin.
    // Near the east edge A occupies the right side so B still has land.
    const cx = first % w,
      aOnLeft = cx < w - 2;
    const split = aOnLeft ? cx + 2 : cx - 1;
    for (let t = 0; t < s.terrain.water.length; t++)
      if (!s.terrain.water[t] && t !== first)
        m.setOwner(t, (aOnLeft ? t % w < split : t % w >= split) ? 1 : 2);
    const other = nearest(
      aOnLeft ? split + 1 : split - 2,
      cy,
      (t) => m.owner(t) === 2,
    );
    if (other !== undefined) m.found(other, 2);
  } else if (s.layout === "districts") {
    const other = nearest(
      Math.min(w - 1, (first % w) + 8),
      cy,
      (t) => t !== first,
    );
    if (other !== undefined) m.found(other, 1);
  }
  m.finishSetup();
  return m;
}
