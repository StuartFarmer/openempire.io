import type { MapData } from "../../core/game/GameMapLoader";
import { layerPlaneOffset, type LayerName } from "../../core/game/MapLayers";
import type { FieldKernel } from "./FieldKernel";

// Upload a compiled system's referenced map layers into a kernel: the
// layers.bin planes (0..1 from bytes), plus `land` (terrain bit 7) and
// `elevation` (terrain magnitude bits — altitude on land, depth in water).

const TERRAIN_LAND_BIT = 0x80;
const TERRAIN_MAGNITUDE_MASK = 0x1f;

export async function uploadMapLayers(
  kernel: FieldKernel,
  mapLayers: readonly string[],
  mapData: MapData,
  width: number,
  height: number,
): Promise<void> {
  const area = width * height;
  for (const name of mapLayers) {
    const plane = new Float32Array(area);
    if (name === "land" || name === "elevation") {
      const terrain = await mapData.mapBin();
      if (name === "land") {
        for (let i = 0; i < area; i += 1) {
          plane[i] = (terrain[i] & TERRAIN_LAND_BIT) !== 0 ? 1 : 0;
        }
      } else {
        for (let i = 0; i < area; i += 1) {
          plane[i] = (terrain[i] & TERRAIN_MAGNITUDE_MASK) / 31;
        }
      }
    } else {
      if (!mapData.layersBin) {
        throw new Error("map has no layers.bin");
      }
      const layers = await mapData.layersBin();
      const offset = layerPlaneOffset(name as LayerName, width, height);
      for (let i = 0; i < area; i += 1) {
        plane[i] = layers[offset + i] / 255;
      }
    }
    kernel.writeBuffer(name, plane);
  }
}
