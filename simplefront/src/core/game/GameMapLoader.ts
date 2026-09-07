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
  // elevation.bin sidecar (see ElevationMap.ts) — the full-precision primary
  // field runtime terrain derivation starts from. Required for shipped maps
  // (enforced by the baker + MapConsistency); the sim itself never reads it.
  elevationBin?: () => Promise<Uint8Array>;
  // hydro.bin sidecar (see HydroMap.ts) — separate lake + river planes for
  // rendering. Required for shipped maps; the sim never reads it.
  hydroBin?: () => Promise<Uint8Array>;
  // season.bin sidecar (see SeasonMap.ts) — OPTIONAL seasonal amplitude +
  // phase from real monthly data. Present only on real-data maps; the shell
  // falls back to the latitude model when absent. The sim never reads it.
  seasonBin?: () => Promise<Uint8Array>;
}
