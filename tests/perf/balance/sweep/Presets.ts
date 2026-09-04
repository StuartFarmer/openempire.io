/**
 * Writing sweep solutions out as playable presets, and reading one back into
 * the harness (`BalanceRun.ts --preset`).
 *
 * Preset files land in `resources/food-presets/` because the client bundles
 * that directory — the in-game tuning panel's preset list is literally these
 * files.
 */
import fs from "fs";
import path from "path";
import { FoodConfig } from "../../../../src/core/configuration/FoodConfig";
import {
  FoodPreset,
  parseFoodPreset,
} from "../../../../src/core/configuration/FoodPreset";
import { PROJECT_ROOT } from "../RunGame";

export const PRESET_DIR = path.join(PROJECT_ROOT, "resources/food-presets");

/** Filename-safe, stable, and readable in a dropdown. */
export function presetSlug(prefix: string, index: number): string {
  const base = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const letter = String.fromCharCode(97 + (index % 26));
  const suffix = index < 26 ? letter : `${letter}${Math.floor(index / 26) + 1}`;
  return `${base || "preset"}-${suffix}`;
}

export function writePreset(preset: FoodPreset, dir = PRESET_DIR): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${preset.name}.json`);
  // Validate on the way out too: a preset the client cannot load is a bug we
  // want to see at sweep time, not three days later in the tuning panel.
  parseFoodPreset(preset, file);
  fs.writeFileSync(file, `${JSON.stringify(preset, null, 2)}\n`);
  return file;
}

/** Remove presets previously written under a prefix, so re-runs don't pile up. */
export function clearPresets(prefix: string, dir = PRESET_DIR): void {
  if (!fs.existsSync(dir)) return;
  const base = presetSlug(prefix, 0).replace(/-a$/, "");
  for (const f of fs.readdirSync(dir)) {
    if (
      f.endsWith(".json") &&
      new RegExp(`^${base}-[a-z]\\d*\\.json$`).test(f)
    ) {
      fs.unlinkSync(path.join(dir, f));
    }
  }
}

/** Resolve `--preset` as a path, a bare name, or a name with .json. */
export function loadPresetOverrides(ref: string): Partial<FoodConfig> {
  const candidates = [
    ref,
    `${ref}.json`,
    path.join(PRESET_DIR, ref),
    path.join(PRESET_DIR, `${ref}.json`),
  ];
  const file = candidates.find(
    (c) => fs.existsSync(c) && fs.statSync(c).isFile(),
  );
  if (file === undefined) {
    const known = fs.existsSync(PRESET_DIR)
      ? fs
          .readdirSync(PRESET_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""))
      : [];
    throw new Error(
      `preset "${ref}" not found. Known presets: ${known.join(", ") || "(none)"}`,
    );
  }
  const preset = parseFoodPreset(
    JSON.parse(fs.readFileSync(file, "utf8")),
    file,
  );
  return preset.overrides;
}
