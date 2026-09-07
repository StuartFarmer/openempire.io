import { CONTROLS, GrowthConfig, validateConfig } from "./config";
import { PRESETS, Scenario } from "./presets";
import { flatTerrain, prepareTerrain } from "./terrain";

export function encodeScenario(s: Scenario): string {
  return JSON.stringify(
    {
      version: 1,
      preset: s.preset,
      seed: s.seed,
      relief: s.relief,
      centre: s.centre,
      config: s.config,
      terrain: {
        width: s.terrain.width,
        height: Array.from(s.terrain.height),
        water: Array.from(s.terrain.water),
      },
    },
    null,
    2,
  );
}
export function decodeScenario(text: string): Scenario {
  if (text.length > 1000000)
    throw new Error("Scenario file is too large (maximum 1 MB).");
  const s = JSON.parse(text);
  if (!s || s.version !== 1 || !PRESETS.some((p) => p.id === s.preset))
    throw new Error("Unsupported growth scenario.");
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 4294967295)
    throw new Error("Seed must be an unsigned 32-bit integer.");
  if (
    typeof s.relief !== "number" ||
    !Number.isFinite(s.relief) ||
    s.relief < 0 ||
    s.relief > 2
  )
    throw new Error("Relief must be between 0 and 2.");
  validateConfig(s.config);
  if (
    s.terrain?.width !== 64 ||
    !Array.isArray(s.terrain.height) ||
    s.terrain.height.length !== 4096 ||
    !Array.isArray(s.terrain.water) ||
    s.terrain.water.length !== 4096
  )
    throw new Error("Terrain must be a complete 64×64 map.");
  if (
    s.terrain.height.some(
      (n: unknown) =>
        typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1,
    ) ||
    s.terrain.water.some((n: unknown) => n !== 0 && n !== 1)
  )
    throw new Error("Terrain contains invalid heights or water values.");
  if (
    s.centre !== null &&
    (!Number.isInteger(s.centre) ||
      s.centre < 0 ||
      s.centre >= 4096 ||
      s.terrain.water[s.centre])
  )
    throw new Error("City centre must be on dry land.");
  const terrain = flatTerrain();
  terrain.height.set(s.terrain.height);
  terrain.water.set(s.terrain.water);
  prepareTerrain(terrain);
  const config = Object.fromEntries(
    CONTROLS.map((c) => [c.key, s.config[c.key]]),
  ) as unknown as GrowthConfig;
  return {
    preset: s.preset,
    seed: s.seed,
    relief: s.relief,
    centre: s.centre,
    config,
    terrain,
  };
}
