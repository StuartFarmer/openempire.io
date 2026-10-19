import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "../../src/core/development/CityDevelopmentConfig";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
} from "../../src/core/game/Game";
import type { GameMapLoader } from "../../src/core/game/GameMapLoader";
import { expectedLayersByteLength } from "../../src/core/game/MapLayers";
import type { GameStartInfo } from "../../src/core/Schemas";
import type { TickGenesis } from "../../src/core/sync/TickChainProtocol";

export function genesisFixture(): TickGenesis {
  return {
    protocol: "simplefront-tick-chain-v1",
    simulationBuild: "1".repeat(64),
    ruleset: "simplefront",
    gameStartInfo: chainStart(),
    cityDevelopment: { ...DEFAULT_CONFIG },
    cityDevelopmentOrder: Object.keys(DEFAULT_CONFIG),
    tickMilliseconds: 100,
    initialization: "normal",
    assets: {
      map: "2".repeat(64),
      minimap: "3".repeat(64),
      layers: "4".repeat(64),
      manifest: "5".repeat(64),
    },
  };
}

export function chainStart(): GameStartInfo {
  return {
    gameID: "chain123",
    lobbyCreatedAt: 0,
    players: [{ clientID: "human123", username: "Human", clanTag: null }],
    config: {
      gameMap: GameMapType.Verdantia,
      gameType: GameType.Singleplayer,
      gameMode: GameMode.FFA,
      difficulty: Difficulty.Medium,
      nations: "default",
      bots: 0,
      donateGold: false,
      donateTroops: false,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    },
  };
}

export function chainLoader(): GameMapLoader {
  const root = path.join(__dirname, "../testdata/maps/plains");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
  );
  return {
    getMapData: () => ({
      mapBin: async () =>
        new Uint8Array(fs.readFileSync(path.join(root, "map.bin"))),
      map4xBin: async () =>
        new Uint8Array(fs.readFileSync(path.join(root, "map4x.bin"))),
      layersBin: async () =>
        new Uint8Array(
          expectedLayersByteLength(manifest.map.width, manifest.map.height),
        ),
      manifest: async () => ({
        ...manifest,
        layers: true,
        terrain_colors: true,
        nations: [],
      }),
      webpPath: "fixture.webp",
      terrainColorsPath: "fixture-colors.png",
    }),
  };
}
