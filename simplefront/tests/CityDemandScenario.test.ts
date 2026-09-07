import { levelCapacity } from "../src/demos/city-demand/config";
import { createScenario } from "../src/demos/city-demand/presets";
import {
  decodeScenario,
  encodeScenario,
} from "../src/demos/city-demand/scenario";
import { editTerrain } from "../src/demos/city-demand/terrain";
import { createScenario as originalScenario } from "../src/demos/urban-growth/presets";
import { encodeScenario as encodeOriginal } from "../src/demos/urban-growth/scenario";
it("roundtrips edited terrain, growth settings, seed and centre", () => {
  const s = createScenario("valley");
  editTerrain(s.terrain, 100, "raise", 2, 0.2);
  s.config.densify = 0.85;
  s.config.populationRate = 250;
  const copy = decodeScenario(encodeScenario(s));
  expect(copy.terrain.height).toEqual(s.terrain.height);
  expect(copy.terrain.water).toEqual(s.terrain.water);
  expect(copy.config).toEqual(s.config);
  expect(copy.centre).toBe(s.centre);
  expect(copy.seed).toBe(s.seed);
});
it("rejects malformed settings and incompatible scenarios", () => {
  const s = JSON.parse(encodeScenario(createScenario("plain")));
  s.config.populationRate = -1;
  expect(() => decodeScenario(JSON.stringify(s))).toThrow();
  expect(() =>
    decodeScenario(encodeOriginal(originalScenario("plain"))),
  ).toThrow();
});
it("accepts older exports but does not revive their nonlinear housing exponent", () => {
  const legacy = JSON.parse(encodeScenario(createScenario("plain")));
  legacy.config.densityExponent = 4;
  const imported = decodeScenario(JSON.stringify(legacy));
  expect(levelCapacity(5, imported.config)).toBe(500);
  expect(imported.config.urbanCapacity).toBe(2000);
});
