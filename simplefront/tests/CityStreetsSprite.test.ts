import { DEFAULT_CONFIG } from "../src/demos/city-population/config";
import { CityModel } from "../src/demos/city-population/model";
import { drawStreetTile } from "../src/demos/city-population/street-render";
import { StreetLayout } from "../src/demos/city-population/streets";
import { flatTerrain } from "../src/demos/city-population/terrain";

it("renders a tile as exactly 4×4 flat sprite pixels without subpixel ornament", () => {
  const m = new CityModel(flatTerrain(3), DEFAULT_CONFIG, 42, 4);
  const streets = new StreetLayout(m, 42);
  const ctx = document.createElement("canvas").getContext("2d")!;
  const rectangles = vi.spyOn(ctx, "fillRect");
  const arcs = vi.spyOn(ctx, "arc");
  const lines = vi.spyOn(ctx, "stroke");
  drawStreetTile(ctx, streets, 4, 16, 0.8);
  expect(rectangles).toHaveBeenCalledTimes(16);
  const positions = rectangles.mock.calls.map(([x, y, w, h]) => {
    expect(w).toBe(4);
    expect(h).toBe(4);
    return [x, y];
  });
  expect(positions).toEqual([
    [16, 16],
    [20, 16],
    [24, 16],
    [28, 16],
    [16, 20],
    [20, 20],
    [24, 20],
    [28, 20],
    [16, 24],
    [20, 24],
    [24, 24],
    [28, 24],
    [16, 28],
    [20, 28],
    [24, 28],
    [28, 28],
  ]);
  expect(arcs).not.toHaveBeenCalled();
  expect(lines).not.toHaveBeenCalled();
});
