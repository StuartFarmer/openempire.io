import type { BoardMap, TileLayers } from "../../../core/game/BoardMap";
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
