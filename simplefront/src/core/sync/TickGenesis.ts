import type { GrowthConfig } from "../development/CityDevelopmentConfig";
import type { GameMapLoader } from "../game/GameMapLoader";
import type { GameStartInfo } from "../Schemas";
import { canonicalJSON, jsonBytes, sha256 } from "./TickChain";
import {
  CHAIN_PROTOCOL,
  TickGenesisSchema,
  type ChainHash,
  type TickGenesis,
} from "./TickChainProtocol";

export async function loadTickGenesis(
  start: GameStartInfo,
  cityDevelopment: GrowthConfig | null,
  loader: GameMapLoader,
  simulationBuild: ChainHash,
  initialization: "normal" | "ambient",
): Promise<{ genesis: TickGenesis; freshLoader: () => GameMapLoader }> {
  const savedStart = JSON.parse(canonicalJSON(start)) as GameStartInfo;
  const savedDevelopment = JSON.parse(
    canonicalJSON(cityDevelopment),
  ) as GrowthConfig | null;
  const source = loader.getMapData(savedStart.config.gameMap);
  if (!source.layersBin) throw new Error("Chain genesis requires layers.bin");
  const [mapInput, minimapInput, layersInput, manifestInput] =
    await Promise.all([
      source.mapBin(),
      source.map4xBin(),
      source.layersBin(),
      source.manifest(),
    ]);
  const map = new Uint8Array(mapInput),
    minimap = new Uint8Array(minimapInput),
    layers = new Uint8Array(layersInput);
  const manifest = canonicalJSON(manifestInput);
  const [mapHash, minimapHash, layersHash, manifestHash] = await Promise.all([
    sha256(map),
    sha256(minimap),
    sha256(layers),
    sha256(jsonBytes(JSON.parse(manifest))),
  ]);
  const genesis: TickGenesis = {
    protocol: CHAIN_PROTOCOL,
    simulationBuild,
    ruleset: "simplefront",
    gameStartInfo: savedStart,
    cityDevelopment: savedDevelopment,
    cityDevelopmentOrder: Object.keys(cityDevelopment ?? {}),
    tickMilliseconds: 100,
    initialization,
    assets: {
      map: mapHash,
      minimap: minimapHash,
      layers: layersHash,
      manifest: manifestHash,
    },
  };
  TickGenesisSchema.parse(genesis);
  const mapType = savedStart.config.gameMap;
  return {
    genesis,
    freshLoader: () => ({
      getMapData: (requested) => {
        if (requested !== mapType) throw new Error("Genesis map mismatch");
        return {
          ...source,
          mapBin: async () => map.slice(),
          map4xBin: async () => minimap.slice(),
          layersBin: async () => layers.slice(),
          manifest: async () => JSON.parse(manifest),
        };
      },
    }),
  };
}

/** Preserve legacy diagnostic bytes without making canonical encoding order-dependent. */
export function orderedDevelopment(genesis: TickGenesis): GrowthConfig | null {
  if (genesis.cityDevelopment === null) return null;
  return Object.fromEntries(
    genesis.cityDevelopmentOrder.map((key) => [
      key,
      genesis.cityDevelopment![key as keyof GrowthConfig],
    ]),
  ) as unknown as GrowthConfig;
}
