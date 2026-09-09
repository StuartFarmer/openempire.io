import {
  AGE_STYLES,
  ageAppearance,
  AgeStyle,
  blendColour,
  DEFAULT_AGE_LEVELS,
} from "./street-ages";
import { StreetLayout, SUBCELLS } from "./streets";

/** Sixteen flat sprite pixels per neighbourhood, with no subpixel decoration. */
export function drawStreetTile(
  ctx: CanvasRenderingContext2D,
  layout: StreetLayout,
  tile: number,
  cell: number,
  occupancy: number,
  ageLevels: readonly number[] = DEFAULT_AGE_LEVELS,
  ageStyles: readonly AgeStyle[] = AGE_STYLES,
): void {
  const d = layout.tiles.get(tile);
  if (!d) return;
  const width = layout.model.terrain.width;
  const x = (tile % width) * cell,
    y = Math.floor(tile / width) * cell;
  const pixel = cell / SUBCELLS;
  const { ground, road } = ageAppearance(d.level, 0, ageLevels, ageStyles);
  for (let p = 0; p < SUBCELLS * SUBCELLS; p++) {
    const building = d.buildings.get(p);
    const house = building
      ? ageAppearance(d.level, building.variant, ageLevels, ageStyles).house
      : ground;
    ctx.fillStyle = d.roads.has(p)
      ? road
      : building
        ? building.variant < occupancy
          ? house
          : blendColour(house, ground, 0.45)
        : ground;
    ctx.fillRect(
      x + (p % SUBCELLS) * pixel,
      y + Math.floor(p / SUBCELLS) * pixel,
      pixel,
      pixel,
    );
  }
}
