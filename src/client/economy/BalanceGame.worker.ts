/**
 * The BROWSER host for the balance harness.
 *
 * Node has no WebGPU, so once the economy is GPU-resident the harness cannot run
 * there at all — `npm test` and `Sweep.ts` both need a host with a real adapter,
 * and headless Chromium is the one that exists (the injection harness already
 * runs full seeded games under it).
 *
 * This is deliberately thin. Every number — samples, metrics, the scaling fit,
 * the config overrides — comes from `RunGameCore.ts`, shared verbatim with the
 * Node host. All this file does is fetch the map sidecars instead of reading
 * them off disk. Two runners computing metrics separately would drift, and a
 * harness whose figures are not comparable across hosts is worse than no
 * harness, because it looks like it works.
 *
 * ONE GAME PER WORKER, for the reason the injection harness documents: the map
 * loader caches `GameMapImpl` and its `state` array is mutable game state, so a
 * second game in the same module context inherits the first one's board.
 */
import {
  runGameWith,
  type MapBytes,
  type RunResult,
  type RunSpec,
} from "../../../tests/perf/balance/RunGameCore";
import { assetUrl, type AssetManifest } from "../../core/AssetUrls";
import { FetchGameMapLoader } from "../../core/game/FetchGameMapLoader";
import type { GameMapType } from "../../core/game/Game";
import { decodeLayers } from "../../core/game/MapLayers";

const ctx = self as unknown as Worker;

export interface BalanceGameIn {
  spec: RunSpec;
  cdnBase: string;
  assetManifest: AssetManifest;
}

export interface BalanceGameOut {
  ok: boolean;
  error?: string;
  /** Present when the host has a WebGPU adapter — recorded so a run's figures
   *  can be attributed to the device that produced them. Once the sim is
   *  GPU-resident this is part of the provenance, not a curiosity. */
  adapter?: string;
  result?: RunResult;
}

/** Fetch a map's sidecars — the browser twin of RunGame.ts's `mapBytes`. */
async function mapBytes(map: GameMapType): Promise<MapBytes> {
  const loader = new FetchGameMapLoader((p) => assetUrl(`maps/${p}`));
  const data = loader.getMapData(map);
  const manifest = await data.manifest();
  const layers =
    manifest.layers === true && data.layersBin !== undefined
      ? decodeLayers(
          await data.layersBin(),
          manifest.map.width,
          manifest.map.height,
        )
      : null;
  return {
    manifest,
    terrain: await data.mapBin(),
    mini: await data.map4xBin(),
    layers,
  };
}

ctx.onmessage = async (e: MessageEvent<BalanceGameIn>) => {
  try {
    globalThis.__ASSET_MANIFEST__ = e.data.assetManifest;
    globalThis.__CDN_BASE__ = e.data.cdnBase;
    let adapter = "cpu";
    if (navigator.gpu !== undefined) {
      const a = await navigator.gpu.requestAdapter();
      const info = a?.info;
      if (info !== undefined) {
        adapter = `${info.vendor ?? "?"}/${info.architecture ?? "?"}`;
      }
    }
    const result = await runGameWith(
      e.data.spec,
      await mapBytes(e.data.spec.map),
    );
    ctx.postMessage({ ok: true, adapter, result } satisfies BalanceGameOut);
  } catch (err) {
    ctx.postMessage({
      ok: false,
      error: (err as Error).message,
    } satisfies BalanceGameOut);
  }
};
