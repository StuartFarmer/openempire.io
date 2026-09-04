/**
 * Food presets bundled from `resources/food-presets/*.json`.
 *
 * These are written by the balance sweep driver
 * (`npx tsx tests/perf/balance/Sweep.ts <config.yaml>`): each one is a
 * configuration that hit the sweep's target band. Loading a preset in the
 * tuning panel replays that configuration into a live game, which is how a
 * swept candidate gets play-tested for feel rather than only for metrics.
 */
import { FOOD_DEFAULTS, FoodConfig } from "../core/configuration/FoodConfig";
import { FoodPreset, parseFoodPreset } from "../core/configuration/FoodPreset";

const modules = import.meta.glob("../../resources/food-presets/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

let cache: FoodPreset[] | null = null;

/** All valid presets, by name. A malformed file is skipped, not fatal. */
export function foodPresets(): FoodPreset[] {
  if (cache !== null) return cache;
  const out: FoodPreset[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    try {
      out.push(parseFoodPreset(raw, path));
    } catch (e) {
      console.warn(`skipping food preset ${path}:`, e);
    }
  }
  cache = out.sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

export function findFoodPreset(name: string): FoodPreset | undefined {
  return foodPresets().find((p) => p.name === name);
}

/**
 * The full knob set a preset implies: its overrides, plus a reset to default
 * for every knob it does not mention.
 *
 * Applying a preset must land on exactly the configuration the sweep
 * measured — if it only pushed its own keys, whatever you had been fiddling
 * with beforehand would silently ride along and you would be playing a
 * config nobody measured.
 */
export function presetKnobChanges(
  preset: FoodPreset,
  current: (key: keyof FoodConfig) => number,
): [keyof FoodConfig, number][] {
  const target = { ...FOOD_DEFAULTS, ...preset.overrides } as FoodConfig;
  const changes: [keyof FoodConfig, number][] = [];
  for (const key of Object.keys(target) as (keyof FoodConfig)[]) {
    if (current(key) !== target[key]) changes.push([key, target[key]]);
  }
  return changes;
}
