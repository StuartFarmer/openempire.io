import type { BoardMap, TileLayers } from "../../../core/game/BoardMap";
import { FOUNDATION_LAND_TERRAIN_BIT } from "./FoundationTerrain";
import {
  createWorldEngineFoundationMap,
  type FoundationWorldEngineLayers,
  type FoundationWorldEngineMapConfig,
} from "./WorldEngineElevation";

export interface AlternativeWorldEngineMap {
  map: BoardMap;
  terrainColors: Uint8Array;
  worldEngineLayers: FoundationWorldEngineLayers;
}

export function createAlternativeWorldEngineMap(
  config: Partial<FoundationWorldEngineMapConfig> = {},
): AlternativeWorldEngineMap {
  const generated = createWorldEngineFoundationMap(config);
  const terrain = generated.map.terrainBuffer();
  const state = generated.map.stateBuffer();
  const terrainColors = generated.terrainColors;
  const layers = boardMapLayersFromWorldEngine(generated.layers);

  const spawn = nearestLandToCenter(
    generated.map.width(),
    generated.map.height(),
    terrain,
  );
  if (spawn >= 0) state[spawn] = 1;

  return {
    map: {
      width: generated.map.width(),
      height: generated.map.height(),
      terrain,
      state,
      layers,
      colorizer: () => terrainColors,
    },
    terrainColors,
    worldEngineLayers: generated.layers,
  };
}

function boardMapLayersFromWorldEngine(
  layers: FoundationWorldEngineLayers,
): TileLayers {
  return {
    elevation: layers.elevation,
    ocean: layers.ocean,
    temperature: layers.temperature,
    precipitation: layers.precipitation,
    seaDepth: layers.seaDepth,
    watermap: layers.watermap,
    normalizedWatermap: layers.normalizedWatermap,
    lakes: layers.lakes,
    irrigation: layers.irrigation,
    humidity: layers.humidity,
    moisture: layers.humidity,
    permeability: layers.permeability,
    biome: layers.biome,
    "resource.crop": layers.resources.crop,
    "resource.basin": layers.resources.basin,
    "resource.oil": layers.resources.oil,
    "resource.metal": layers.resources.metal,
  };
}

function nearestLandToCenter(
  width: number,
  height: number,
  terrain: Uint8Array,
): number {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ref = y * width + x;
      if ((terrain[ref] & FOUNDATION_LAND_TERRAIN_BIT) === 0) continue;
      const dist = Math.abs(x - centerX) + Math.abs(y - centerY);
      if (dist < bestDist) {
        best = ref;
        bestDist = dist;
      }
    }
  }
  return best;
}
