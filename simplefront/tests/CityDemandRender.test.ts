import { colord } from "colord";
import { DEFAULT_CONFIG } from "../src/demos/city-demand/config";
import { CityModel } from "../src/demos/city-demand/model";
import { drawMap, levelColour, Overlay } from "../src/demos/city-demand/render";
import { flatTerrain } from "../src/demos/city-demand/terrain";

function fixture(grown = true) {
  const terrain = flatTerrain(5);
  const model = new CityModel(
    terrain,
    { ...DEFAULT_CONFIG, rate: 2000, densify: 1 },
    42,
    12,
  );
  if (grown)
    for (let i = 0; i < 1000; i++) {
      model.changePopulation(1e9);
      model.step();
    }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 100;
  return { terrain, model, canvas, ctx: canvas.getContext("2d")! };
}
it("gives adjacent levels clearly separated colours instead of almost identical low-density shades", () => {
  const colours = Array.from({ length: 100 }, (_, i) =>
    colord(levelColour(i + 1)).toRgb(),
  );
  expect(new Set(colours.map((c) => `${c.r},${c.g},${c.b}`)).size).toBe(100);
  for (let i = 1; i < colours.length; i++) {
    const a = colours[i - 1],
      b = colours[i];
    expect(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)).toBeGreaterThan(100);
  }
});

it.each<Overlay>([
  "combined",
  "density",
  "elevation",
  "suitability",
  "candidates",
])(
  "draws the exact level on every developed cell in %s, including the centre",
  (overlay) => {
    const { terrain, model, canvas, ctx } = fixture();
    const text = vi.spyOn(ctx, "fillText");
    drawMap(canvas, terrain, model, overlay, null, null);
    expect(text).toHaveBeenCalledTimes(25);
    expect(text).toHaveBeenCalledWith("1", 10, 10, 16);
    expect(text).toHaveBeenCalledWith("2", 50, 30, 16);
    expect(text).toHaveBeenCalledWith("3", 50, 50, 16);
    expect(
      text.mock.calls.some(([label]) => label === "+" || label === "0"),
    ).toBe(false);
  },
);

it("leaves wilderness unlabelled", () => {
  const { terrain, model, canvas, ctx } = fixture(false);
  const text = vi.spyOn(ctx, "fillText");
  drawMap(canvas, terrain, model, "combined", null, null);
  expect(text).toHaveBeenCalledTimes(1);
  expect(text).toHaveBeenCalledWith("1", 50, 50, 16);
});

it("does not draw development numbers on a terrain-only draft", () => {
  const { terrain, canvas, ctx } = fixture(false);
  const text = vi.spyOn(ctx, "fillText");
  drawMap(canvas, terrain, null, "combined", null, 3);
  expect(text).not.toHaveBeenCalled();
});
