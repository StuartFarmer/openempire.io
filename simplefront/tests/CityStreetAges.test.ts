import { DEFAULT_CONFIG } from "../src/demos/city-population/config";
import { CityModel } from "../src/demos/city-population/model";
import {
  AGE_STYLES,
  ageAppearance,
  ageLabel,
  validateAgeLevels,
} from "../src/demos/city-population/street-ages";
import { StreetLayout } from "../src/demos/city-population/streets";
import { flatTerrain } from "../src/demos/city-population/terrain";

it("uses custom anchors for interpolation, labels and endpoint clamping", () => {
  const levels = [2, 6, 10, 20, 40, 80];
  expect(ageAppearance(4, 0, levels).progress).toBe(0.5);
  expect(ageAppearance(4, 0, levels).house).toBe("#9f6448");
  expect(ageAppearance(1, 0, levels).house).toBe("#9e7852");
  expect(ageAppearance(100, 0, levels).house).toBe("#00f5db");
  expect(ageLabel(6, levels)).toBe("Middle Ages town");
  expect(ageLabel(4, levels)).toContain("50%");
  expect(ageLabel(0, levels)).toBe("Wilderness");
});
it("accepts six increasing whole-number anchors within the tile level limits", () => {
  expect(validateAgeLevels([1, 2, 3, 4, 5, 100])).toBe("");
  for (const levels of [
    [1, 3, 5],
    [0, 3, 5, 8, 12, 16],
    [1, 3, 5, 8, 12, 101],
    [1, 3, 5, 5, 12, 16],
    [1, 3, 5, 4, 12, 16],
    [1, 3.5, 5, 8, 12, 16],
    [1, NaN, 5, 8, 12, 16],
    [1, 3, 5, 8, 12, Infinity],
  ])
    expect(validateAgeLevels(levels)).not.toBe("");
});

it.each([
  [1, "Village"],
  [3, "Middle Ages town"],
  [5, "Classical town"],
  [8, "Industrial / Victorian town"],
  [12, "Modern town"],
  [16, "Post-modern town"],
])("uses %s as the anchor for %s", (level, name) => {
  expect(ageAppearance(Number(level), 0.1).from.name).toBe(name);
});
it("blends neighbouring age palettes and clamps beyond the last age", () => {
  const a = ageAppearance(1, 0.1),
    b = ageAppearance(3, 0.1),
    midpoint = ageAppearance(2, 0.1);
  expect(midpoint.progress).toBe(0.5);
  expect(midpoint.house).not.toBe(a.house);
  expect(midpoint.house).not.toBe(b.house);
  expect(ageAppearance(100, 0.1).house).toBe(ageAppearance(16, 0.1).house);
});
it("keeps four stable house-colour variants in every era", () => {
  for (const style of AGE_STYLES) {
    const appearances = [0.1, 0.35, 0.6, 0.85].map((v) =>
      ageAppearance(style.level, v),
    );
    expect(new Set(appearances.map((a) => a.house)).size).toBe(4);
  }
});
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const brightness = (hex: string) => rgb(hex).reduce((a, b) => a + b) / 3;
const saturation = (hex: string) => {
  const c = rgb(hex);
  return (Math.max(...c) - Math.min(...c)) / Math.max(1, ...c);
};
it("keeps warm dirt roads through the Middle Ages, then switches to light cobblestone", () => {
  const village = ageAppearance(1),
    medieval = ageAppearance(3),
    classical = ageAppearance(5);
  const [r, g, b] = rgb(village.road);
  expect(r).toBeGreaterThan(g);
  expect(g).toBeGreaterThan(b);
  expect(medieval.road).toBe(village.road);
  expect(brightness(classical.road)).toBeGreaterThan(170);
  expect(brightness(classical.road)).toBeGreaterThan(brightness(village.road));
});
it("pairs classical red and blue roofs with darker, less saturated industrial roofs", () => {
  const red = rgb(ageAppearance(5, 0.1).house),
    blue = rgb(ageAppearance(5, 0.6).house);
  expect(red[0]).toBeGreaterThan(red[1] * 1.3);
  expect(blue[2]).toBeGreaterThan(blue[0] * 1.3);
  const variants = [0.1, 0.35, 0.6, 0.85];
  const mean = (level: number, measure: (c: string) => number) =>
    variants.reduce((s, v) => s + measure(ageAppearance(level, v).house), 0) /
    4;
  expect(mean(8, brightness)).toBeLessThan(mean(5, brightness));
  expect(mean(8, saturation)).toBeLessThan(mean(5, saturation));
  expect(brightness(ageAppearance(8).road)).toBeLessThan(
    brightness(ageAppearance(5).road),
  );
});
it("uses bright metal and deco colours over asphalt, then neon over very dark cyberpunk streets", () => {
  expect(brightness(ageAppearance(12, 0.1).house)).toBeGreaterThan(170);
  expect(brightness(ageAppearance(12).road)).toBeLessThan(90);
  expect(brightness(ageAppearance(16).road)).toBeLessThan(35);
  for (const variant of [0.1, 0.35, 0.6, 0.85]) {
    const house = ageAppearance(16, variant).house;
    expect(Math.max(...rgb(house))).toBeGreaterThan(230);
    expect(saturation(house)).toBeGreaterThan(0.5);
  }
});
it("fills at least half of a supported neighbourhood with buildings while keeping its streets", () => {
  const m = new CityModel(
    flatTerrain(7),
    { ...DEFAULT_CONFIG, rate: 2000 },
    42,
    24,
  );
  const streets = new StreetLayout(m, 42);
  for (let i = 0; i < 800; i++) {
    m.changePopulation(1e9);
    m.step();
    streets.sync();
  }
  const centre = streets.tiles.get(24)!;
  expect(m.level(24)).toBe(4);
  expect(centre.buildings.size).toBeGreaterThanOrEqual(8);
  expect(centre.roads.size).toBeLessThan(centre.buildings.size);
});
