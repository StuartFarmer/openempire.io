import fs from "fs";
import path from "path";
import {
  Difficulty,
  Game,
  GameMapType,
  GameMode,
  GameType,
  PlayerInfo,
  PlayerType,
} from "../../src/core/game/Game";
import { createGame } from "../../src/core/game/GameImpl";
import {
  expectedLayersByteLength,
  LAYER_NAMES,
  layerPlaneOffset,
  type LayerName,
} from "../../src/core/game/MapLayers";
import {
  genTerrainFromBin,
  MapManifest,
} from "../../src/core/game/TerrainMapLoader";
import { UserSettings } from "../../src/core/game/UserSettings";
import { GameConfig } from "../../src/core/Schemas";
import { TestConfig } from "./TestConfig";

/**
 * Per-tile byte source for synthetic test layers (0..255). Games created
 * with a layersFill run with the food economy active (hasLayers() true).
 */
export type LayersFill = (name: LayerName, x: number, y: number) => number;

export async function setup(
  mapName: string,
  _gameConfig: Partial<GameConfig> = {},
  humans: PlayerInfo[] = [],
  currentDir: string = __dirname,
  ConfigClass: typeof TestConfig = TestConfig,
  autoEndSpawnPhase: boolean = true,
  layersFill?: LayersFill,
): Promise<Game> {
  // Suppress console.debug for tests.
  console.debug = () => {};

  // Simple binary file loading using fs.readFileSync()
  const mapBinPath = path.join(
    currentDir,
    `../testdata/maps/${mapName}/map.bin`,
  );
  const miniMapBinPath = path.join(
    currentDir,
    `../testdata/maps/${mapName}/map4x.bin`,
  );
  const manifestPath = path.join(
    currentDir,
    `../testdata/maps/${mapName}/manifest.json`,
  );

  const mapBinBuffer = fs.readFileSync(mapBinPath);
  const miniMapBinBuffer = fs.readFileSync(miniMapBinPath);
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) satisfies MapManifest;

  let layersData: Uint8Array | null = null;
  // Every game is layered (unify-layered-path). Baked fixture maps carry a
  // real layers.bin (manifest.layers); synthetic layers via layersFill take
  // precedence when both are given; otherwise planes default to all-zero
  // (no crop → no production; startingFood covers short tests).
  if (layersFill === undefined && manifest.layers === true) {
    const layersPath = path.join(
      currentDir,
      `../testdata/maps/${mapName}/layers.bin`,
    );
    layersData = new Uint8Array(fs.readFileSync(layersPath));
  }
  // Legacy (non-economy) tests get zero layers AND an inert food config so
  // troop counts stay under test control; economy tests opt into the real
  // knobs by passing layersFill or using a baked layered fixture.
  const inertFood = layersFill === undefined && layersData === null;
  layersFill ??= layersData === null ? () => 0 : undefined;
  if (layersFill !== undefined) {
    const { width, height } = manifest.map;
    layersData = new Uint8Array(expectedLayersByteLength(width, height));
    for (const name of LAYER_NAMES) {
      const offset = layerPlaneOffset(name, width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          layersData[offset + y * width + x] = layersFill(name, x, y);
        }
      }
    }
  }

  const gameMap = await genTerrainFromBin(
    manifest.map,
    mapBinBuffer,
    layersData,
  );
  const miniGameMap = await genTerrainFromBin(manifest.map4x, miniMapBinBuffer);

  const gameConfig: GameConfig = {
    gameMap: GameMapType.Verdantia,
    gameMode: GameMode.FFA,
    gameType: GameType.Singleplayer,
    difficulty: Difficulty.Medium,
    nations: "default",
    donateGold: false,
    donateTroops: false,
    bots: 0,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
    ..._gameConfig,
  };
  const config = new ConfigClass(gameConfig, new UserSettings(), false);
  config.setInertFood(inertFood);

  const game = createGame(humans, [], gameMap, miniGameMap, config);
  if (autoEndSpawnPhase) game.endSpawnPhase();
  return game;
}

export function playerInfo(name: string, type: PlayerType): PlayerInfo {
  return new PlayerInfo(name, type, null, name);
}
