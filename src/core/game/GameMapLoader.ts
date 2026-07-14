import { GameMapType } from "./Game";
import { MapManifest } from "./TerrainMapLoader";

export interface GameMapLoader {
  getMapData(map: GameMapType): MapData;
}

export interface MapData {
  mapBin: () => Promise<Uint8Array>;
  // The 4x-downscaled pathfinding minimap — not a playable size.
  map4xBin: () => Promise<Uint8Array>;
  manifest: () => Promise<MapManifest>;
  webpPath: string;
  terrainColorsPath?: string;
  // layers.bin sidecar (see MapLayers.ts). Required for every map;
  // loadTerrainMap throws when it is missing.
  layersBin?: () => Promise<Uint8Array>;
}
