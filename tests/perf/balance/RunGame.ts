/**
 * The NODE half of the balance run core: read a map's sidecars off disk, then
 * hand them to the portable runner in `RunGameCore.ts`.
 *
 * Everything that computes a NUMBER — samples, metrics, the scaling fit, the
 * config overrides — lives in the core so the browser host (which is where a
 * GPU-resident sim has to run, since Node has no WebGPU) produces figures that
 * are comparable rather than merely similar. This file owns only disk access
 * and the `src/core` fingerprint, neither of which a browser can do.
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GameMapType } from "../../../src/core/game/Game";
import { decodeLayers } from "../../../src/core/game/MapLayers";
import { NodeGameMapLoader } from "../fullgame/NodeGameMapLoader";
import {
  runGameWith,
  type MapBytes,
  type RunResult,
  type RunSpec,
} from "./RunGameCore";

export * from "./RunGameCore";

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const mapCache = new Map<GameMapType, MapBytes>();

/**
 * Read a map's sidecars once per process and hand out fresh GameMapImpls.
 *
 * The bytes are cached; the *terrain* array is copied per run because
 * GameMapImpl mutates it in place (water nukes, terrain modification), and a
 * shared array would leak run N's craters into run N+1 and silently break
 * same-seed reproducibility. Layers are never written, so they are shared.
 */
async function mapBytes(map: GameMapType): Promise<MapBytes> {
  const cached = mapCache.get(map);
  if (cached !== undefined) return cached;
  const loader = new NodeGameMapLoader(
    path.join(PROJECT_ROOT, "resources/maps"),
  );
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
  const bytes: MapBytes = {
    manifest,
    terrain: await data.mapBin(),
    mini: await data.map4xBin(),
    layers,
  };
  mapCache.set(map, bytes);
  return bytes;
}

/** Node entry point: load the map, then run it. Signature unchanged, so
 *  BalanceRun.ts and the sweep worker are untouched. */
export async function runGame(spec: RunSpec): Promise<RunResult> {
  return runGameWith(spec, await mapBytes(spec.map));
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

// ── sim fingerprint ──

let fingerprint: string | null = null;

/**
 * A content hash of the deterministic simulation (`src/core`).
 *
 * Sweep results are cached by cell parameters, which say nothing about the
 * code that produced them. Change the AI or the economy and a `--resume`
 * would happily serve numbers measured against the OLD sim alongside fresh
 * ones — a silent, very convincing lie, since the file format is identical.
 * Stamping each stored row with this hash lets the loader drop rows that
 * predate a sim change instead of mixing them in.
 *
 * Deliberately scoped to `src/core`: the renderer and UI cannot affect a
 * headless run, so touching them should not throw away hours of results.
 */
export function simFingerprint(): string {
  if (fingerprint !== null) return fingerprint;
  const root = path.join(PROJECT_ROOT, "src/core");
  const files = fs
    .readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(root, file)));
  }
  fingerprint = hash.digest("hex").slice(0, 12);
  return fingerprint;
}
