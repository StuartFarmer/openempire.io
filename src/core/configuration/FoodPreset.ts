/**
 * Food presets: a named set of `FoodConfig` knob overrides, stored as JSON in
 * `resources/food-presets/`.
 *
 * Presets are the handoff between the balance sweep and play. The sweep
 * driver (`tests/perf/balance/Sweep.ts`) writes the configurations that hit a
 * target band; the in-game tuning panel loads one and applies it through the
 * existing `tune_food_config` intents, so a swept candidate can be played
 * without retyping thirty numbers.
 *
 * The schema lives in core because both ends must agree on it, and core is
 * the only place both the sim and the client are allowed to import from.
 */
import { z } from "zod";
import { FOOD_TUNABLE_KEYS, FoodConfig } from "./FoodConfig";

export const FoodPresetSchema = z.object({
  /** Filename-safe identifier; also what the tuning panel lists. */
  name: z.string().min(1),
  description: z.string().optional(),
  /** Free-form provenance, e.g. the sweep name and cell that produced it. */
  source: z.string().optional(),
  /**
   * Only knobs that differ from FOOD_DEFAULTS need to be listed. Keys are
   * checked against the tuning allowlist so a preset can never smuggle in a
   * field the tuning intent would reject.
   */
  overrides: z
    .record(z.string(), z.number().finite().nonnegative())
    .superRefine((value, ctx) => {
      for (const key of Object.keys(value)) {
        if (!(FOOD_TUNABLE_KEYS as readonly string[]).includes(key)) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `is not a FoodConfig knob`,
          });
        }
      }
    }),
  /** Aggregated sweep metrics for this cell, for display. Not applied. */
  metrics: z.record(z.string(), z.number()).optional(),
  /** The run axes the metrics were measured under, for display. */
  run: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export type FoodPreset = Omit<z.infer<typeof FoodPresetSchema>, "overrides"> & {
  overrides: Partial<FoodConfig>;
};

/** Parse and validate a preset, with the file name in any error. */
export function parseFoodPreset(raw: unknown, where: string): FoodPreset {
  const result = FoodPresetSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `invalid food preset ${where}: ${issue.path.join(".")} ${issue.message}`,
    );
  }
  return result.data;
}

/** Knob entries of a preset, ordered for stable display and diffing. */
export function presetEntries(
  preset: FoodPreset,
): [keyof FoodConfig, number][] {
  return (
    Object.entries(preset.overrides) as [keyof FoodConfig, number][]
  ).sort((a, b) => a[0].localeCompare(b[0]));
}
