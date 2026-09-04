/**
 * Food presets: the schema shared by the sweep driver (which writes them) and
 * the tuning panel (which applies them), plus the rule that applying a preset
 * lands on exactly the configuration the sweep measured.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { foodPresets, presetKnobChanges } from "../src/client/FoodPresets";
import {
  FOOD_DEFAULTS,
  FOOD_TUNABLE_KEYS,
  FoodConfig,
} from "../src/core/configuration/FoodConfig";
import {
  parseFoodPreset,
  presetEntries,
} from "../src/core/configuration/FoodPreset";

const valid = {
  name: "flat-a",
  description: "urban-flatten solution 1/6",
  source: "sweep urban-flatten",
  // Deliberately off the shipped defaults (wCong 1.8, popPerDensity 10000),
  // so "applies the preset's knobs" is actually testing something.
  overrides: { wCong: 2.4, popPerDensity: 8000 },
};

describe("parseFoodPreset", () => {
  it("accepts a minimal preset", () => {
    expect(parseFoodPreset({ name: "x", overrides: {} }, "x.json")).toEqual({
      name: "x",
      overrides: {},
    });
  });

  it("keeps provenance fields", () => {
    const p = parseFoodPreset(
      {
        ...valid,
        metrics: { mean_finalGini: 0.42 },
        run: { map: "Verdantia", ticks: 3000 },
      },
      "flat-a.json",
    );
    expect(p.metrics?.mean_finalGini).toBe(0.42);
    expect(p.run?.map).toBe("Verdantia");
  });

  it("rejects a key that is not a FoodConfig knob", () => {
    expect(() =>
      parseFoodPreset({ name: "x", overrides: { notAKnob: 1 } }, "bad.json"),
    ).toThrow(/bad\.json.*notAKnob.*not a FoodConfig knob/s);
  });

  it("rejects non-numeric, negative and missing values", () => {
    expect(() =>
      parseFoodPreset({ name: "x", overrides: { wCong: "1.8" } }, "b.json"),
    ).toThrow(/b\.json/);
    expect(() =>
      parseFoodPreset({ name: "x", overrides: { wCong: -1 } }, "b.json"),
    ).toThrow(/b\.json/);
    expect(() => parseFoodPreset({ overrides: {} }, "b.json")).toThrow(
      /b\.json/,
    );
  });

  it("orders entries stably for display and diffing", () => {
    const p = parseFoodPreset(
      { name: "x", overrides: { wCong: 1, popPerDensity: 2, baseStorage: 3 } },
      "x.json",
    );
    expect(presetEntries(p).map(([k]) => k)).toEqual([
      "baseStorage",
      "popPerDensity",
      "wCong",
    ]);
  });
});

describe("presetKnobChanges", () => {
  const preset = parseFoodPreset(valid, "flat-a.json");

  it("applies the preset's knobs when starting from defaults", () => {
    const changes = presetKnobChanges(preset, (k) => FOOD_DEFAULTS[k]);
    expect(Object.fromEntries(changes)).toEqual({
      wCong: 2.4,
      popPerDensity: 8000,
    });
  });

  it("resets knobs the preset does not mention", () => {
    // A knob left over from hand-tuning must not ride along into the game:
    // what you play has to be what the sweep measured.
    const current = (k: keyof FoodConfig) =>
      k === "baseStorage" ? 999_999 : FOOD_DEFAULTS[k];
    const changes = Object.fromEntries(presetKnobChanges(preset, current));
    expect(changes.baseStorage).toBe(FOOD_DEFAULTS.baseStorage);
    expect(changes.wCong).toBe(2.4);
  });

  it("is a no-op when the preset is already loaded", () => {
    const target = { ...FOOD_DEFAULTS, ...preset.overrides } as FoodConfig;
    expect(presetKnobChanges(preset, (k) => target[k])).toEqual([]);
  });

  it("only ever emits tunable knobs", () => {
    const changes = presetKnobChanges(preset, () => -1);
    expect(changes).toHaveLength(FOOD_TUNABLE_KEYS.length);
    for (const [key] of changes) {
      expect(FOOD_TUNABLE_KEYS).toContain(key);
    }
  });
});

describe("shipped presets", () => {
  const dir = path.join(__dirname, "../resources/food-presets");

  it("every checked-in preset parses and is named after its file", () => {
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
      : [];
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const preset = parseFoodPreset(raw, file);
      expect(`${preset.name}.json`).toBe(file);
    }
  });

  it("is what the client's bundler glob actually picks up", () => {
    // Guards the import.meta.glob path in FoodPresets.ts: a typo there fails
    // silently as an empty dropdown rather than a build error.
    const onDisk = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""))
          .sort()
      : [];
    expect(foodPresets().map((p) => p.name)).toEqual(onDisk);
  });
});
