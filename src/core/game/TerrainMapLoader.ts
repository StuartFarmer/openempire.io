import { GameMapType, TeamGameSpawnAreas } from "./Game";
import { GameMap, GameMapImpl } from "./GameMap";
import { GameMapLoader } from "./GameMapLoader";
import { decodeLayers } from "./MapLayers";

export type TerrainMapData = {
  nations: Nation[];
  additionalNations: AdditionalNation[];
  gameMap: GameMap;
  miniGameMap: GameMap;
  teamGameSpawnAreas?: TeamGameSpawnAreas;
  terrainColorsPath: string;
};

const loadedMaps = new Map<string, TerrainMapData>();

export interface MapMetadata {
  width: number;
  height: number;
  num_land_tiles: number;
}

export interface MapManifest {
  name: string;
  map: MapMetadata;
  // The 4x-downscaled pathfinding minimap — not a playable size.
  map4x: MapMetadata;
  nations: Nation[];
  // Optional pool of fallback nation names used when a game requests more
  // nations than the manifest defines. Picked at random; if still not enough,
  // the remainder is generated procedurally.
  additionalNations?: AdditionalNation[];
  teamGameSpawnAreas?: TeamGameSpawnAreas;
  terrain_colors?: boolean;
  layers?: boolean;
}

export interface Nation {
  coordinates?: [number, number];
  flag?: string;
  name: string;
}

export interface AdditionalNation {
  coordinates?: [number, number];
  flag?: string;
  name: string;
}

export async function loadTerrainMap(
  map: GameMapType,
  terrainMapFileLoader: GameMapLoader,
): Promise<TerrainMapData> {
  const cached = loadedMaps.get(map);
  if (cached !== undefined) return cached;
  const mapFiles = terrainMapFileLoader.getMapData(map);
  const manifest = await mapFiles.manifest();

  // Both sidecars are mandatory: there is exactly one game mode (layered)
  // and one shading path (baked terrain colors). Fail loudly — a silent
  // fallback here is a hidden second game.
  if (manifest.layers !== true || mapFiles.layersBin === undefined) {
    throw new Error(
      `[TerrainMapLoader] map "${map}" has no layers.bin sidecar (required; retrofit with derive-layers.ts + gen-maps)`,
    );
  }
  if (manifest.terrain_colors !== true || !mapFiles.terrainColorsPath) {
    throw new Error(
      `[TerrainMapLoader] map "${map}" has no terrain-colors.png sidecar (required; retrofit with derive-layers.ts + gen-maps)`,
    );
  }
  let layersData: Uint8Array;
  try {
    layersData = decodeLayers(
      await mapFiles.layersBin(),
      manifest.map.width,
      manifest.map.height,
    );
  } catch (e) {
    // eslint-disable-next-line preserve-caught-error -- ES target lacks Error cause
    throw new Error(
      `[TerrainMapLoader] map "${map}" has an undecodable layers.bin: ${e}`,
    );
  }

  const gameMap = await genTerrainFromBin(
    manifest.map,
    await mapFiles.mapBin(),
    layersData,
  );
  // The 4x map is the pathfinding minimap; it carries no layers.
  const miniMap = await genTerrainFromBin(
    manifest.map4x,
    await mapFiles.map4xBin(),
  );

  const result = {
    nations: manifest.nations,
    additionalNations: manifest.additionalNations ?? [],
    gameMap: gameMap,
    miniGameMap: miniMap,
    teamGameSpawnAreas: manifest.teamGameSpawnAreas,
    terrainColorsPath: mapFiles.terrainColorsPath,
  };
  loadedMaps.set(map, result);
  return result;
}

export async function genTerrainFromBin(
  mapData: MapMetadata,
  data: Uint8Array,
  layersData: Uint8Array | null = null,
): Promise<GameMap> {
  if (data.length !== mapData.width * mapData.height) {
    throw new Error(
      `Invalid data: buffer size ${data.length} incorrect for ${mapData.width}x${mapData.height} terrain plus 4 bytes for dimensions.`,
    );
  }

  return new GameMapImpl(
    mapData.width,
    mapData.height,
    data,
    mapData.num_land_tiles,
    layersData,
  );
}
