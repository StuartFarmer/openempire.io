import type { GameMap } from "./GameMap";

export type TileLayerData =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Float32Array;
export type TileLayers = Record<string, TileLayerData>;

export interface BoardMap {
  width: number;
  height: number;
  terrain: Uint8Array;
  state: Uint16Array;
  layers?: TileLayers;
  colorizer?: TerrainColorizer;
}

export type TerrainColorizer = (map: BoardMap) => Uint8Array;

export function validateBoardMap(map: BoardMap): void {
  if (!Number.isInteger(map.width) || map.width <= 0) {
    throw new Error(`Invalid board map width: ${map.width}`);
  }
  if (!Number.isInteger(map.height) || map.height <= 0) {
    throw new Error(`Invalid board map height: ${map.height}`);
  }

  const expected = map.width * map.height;
  assertLayerLength("terrain", map.terrain, expected, map);
  assertLayerLength("state", map.state, expected, map);

  for (const [id, data] of Object.entries(map.layers ?? {})) {
    assertLayerLength(`layer ${id}`, data, expected, map);
  }
}

export function boardMapFromGameMap(gameMap: GameMap): BoardMap {
  const width = gameMap.width();
  const height = gameMap.height();
  const terrain = new Uint8Array(width * height);
  for (let ref = 0; ref < terrain.length; ref++) {
    terrain[ref] = gameMap.terrainByte(ref);
  }

  return {
    width,
    height,
    terrain,
    state: gameMap.tileStateBuffer(),
  };
}

function assertLayerLength(
  name: string,
  data: { length: number },
  expected: number,
  map: Pick<BoardMap, "width" | "height">,
): void {
  if (data.length !== expected) {
    throw new Error(
      `${name} length ${data.length} does not match ${map.width}x${map.height}`,
    );
  }
}
