import { GameMapType } from "./Game";
import { MapManifest } from "./TerrainMapLoader";

export interface GameMapLoader {
  getMapData(map: GameMapType): MapData;
}

export interface MapData {
  mapBin: () => Promise<Uint8Array>;
  map4xBin: () => Promise<Uint8Array>;
  map16xBin: () => Promise<Uint8Array>;
  manifest: () => Promise<MapManifest>;
  webpPath: string;
  terrainColorsPath?: string;
  // layers.bin sidecar (see MapLayers.ts). Only fetched when the manifest
  // sets layers: true — callers must not call this unconditionally.
  layersBin?: () => Promise<Uint8Array>;
}
