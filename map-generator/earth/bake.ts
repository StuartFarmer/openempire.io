/**
 * bake.ts — stage 3: raw fields + tuning -> a map the Go baker can eat.
 *
 * The headless twin of the #earth page. Both call buildMap() from
 * src/games/alternative/earth/BuildLayers.ts, so a tuning approved on screen
 * bakes to identical bytes here. (Same relationship as GeneratorPage <-> gen-world.ts.)
 *
 * Writes into map-generator/assets/maps/<name>/:
 *   image.png      — terrain (blue channel + alpha), read by map_generator.go
 *   layers.bin     — the six Uint8 planes, via the sim's own encodeLayers()
 *   elevation.bin  — full-precision elevation in world-engine space: real
 *                    ETOPO bathymetry below seaLevel, the image's gamma ramp
 *                    (unquantized) above — the primary field runtime terrain
 *                    derivation replays (export-primary-fields)
 *   info.json      — map metadata + nations[] + the world_engine render config
 * then `npm run gen-maps` bakes it like any other map.
 *
 * Usage:
 *   npx tsx map-generator/earth/bake.ts --name earth
 *   npx tsx map-generator/earth/bake.ts --name earth-small --width 1024 --height 512
 *   npx tsx map-generator/earth/bake.ts --name earth --tuning path/to/tuning.json
 */
import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { encodeElevation } from "../../src/core/game/ElevationMap";
import { encodeHydro } from "../../src/core/game/HydroMap";
import { encodeLayers, LayerName } from "../../src/core/game/MapLayers";
import { simpleHash } from "../../src/core/Util";
import { buildMap } from "../../src/games/alternative/earth/BuildLayers";
import { buildEarthTerrainColors } from "../../src/games/alternative/earth/EarthColors";
import { Field, RawFields } from "../../src/games/alternative/earth/Normalize";
import {
  defaultTuning,
  Tuning,
} from "../../src/games/alternative/earth/Tuning";
import { normalizeFoundationWorldEngineMapConfig } from "../../src/games/alternative/world/WorldEngineElevation";
import { dataRoot } from "./datasets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const name = arg("name", "earth")!;
const fieldsName = arg("fields", "global-2048x1024")!;
const tuningPath = arg("tuning");
/** Display name. Folder names are lowercase slugs; "SPQR" is not "Spqr". */
const title = arg("title");
/**
 * Downsample the ingested fields by this integer factor. 1 = bake at the
 * ingest's native size. `earth-mini` is factor 2 off the same global ingest, so
 * the small map is literally the big one averaged — they cannot disagree.
 */
const scaleDiv = Number(arg("div", "1"));

// ─────────────────────────── load raw fields ───────────────────────────

interface FieldsMeta {
  name?: string;
  width: number;
  height: number;
  /** (lon_min, lat_min, lon_max, lat_max) — a crop is NOT the whole world. */
  bbox?: [number, number, number, number];
  kmPerTile?: [number, number];
  fields: { name: string; unit: string; description: string }[];
}

function loadFields(): { fields: RawFields; meta: FieldsMeta } {
  const dir = path.join(dataRoot(), "derived", fieldsName);
  const metaPath = path.join(dir, "fields.json");
  const binPath = path.join(dir, "fields.bin");
  if (!fs.existsSync(binPath)) {
    throw new Error(
      `no ingested fields at ${binPath}\n` +
        `run: map-generator/earth/.venv/bin/python map-generator/earth/ingest.py --name ...`,
    );
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as FieldsMeta;
  const buf = fs.readFileSync(binPath);
  const all = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );

  const planeSize = meta.width * meta.height;
  const expected = planeSize * meta.fields.length;
  if (all.length !== expected) {
    throw new Error(
      `fields.bin is ${all.length} floats, expected ${expected} ` +
        `(${meta.fields.length} planes x ${meta.width}x${meta.height})`,
    );
  }

  const fields: RawFields = {};
  meta.fields.forEach((f, i) => {
    fields[f.name] = {
      width: meta.width,
      height: meta.height,
      data: all.subarray(i * planeSize, (i + 1) * planeSize),
    };
  });
  return { fields, meta };
}

/**
 * Box-downsample a field by an integer factor.
 *
 * The 1024x512 map is derived from the same 2048x1024 ingest rather than
 * re-ingested, so the two maps are guaranteed consistent — the small one is
 * literally the big one, averaged.
 */
function downsample(f: Field, factor: number): Field {
  if (factor === 1) return f;
  const w = Math.floor(f.width / factor);
  const h = Math.floor(f.height / factor);
  const data = new Float32Array(w * h);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          sum += f.data[(y * factor + dy) * f.width + (x * factor + dx)];
        }
      }
      data[y * w + x] = sum / n;
    }
  }
  return { width: w, height: h, data };
}

// ─────────────────────────── nations ───────────────────────────

interface Nation {
  coordinates: [number, number];
  name: string;
  flag: string;
}

/**
 * Real capitals -> nations[]. This is the role-play hook: spawning as France on
 * Paris is the whole point of an Earth map.
 *
 * Reads the Natural Earth populated-places DBF directly (a tiny fixed-width
 * format) rather than pulling in a shapefile dependency for one table.
 */
function loadNations(
  w: number,
  h: number,
  land: Field,
  bbox: [number, number, number, number],
): Nation[] {
  const dbf = path.join(
    dataRoot(),
    "naturalearth/ne_10m_populated_places/ne_10m_populated_places.dbf",
  );
  if (!fs.existsSync(dbf)) {
    console.warn("  ! no populated-places DBF; nations[] will be empty");
    return [];
  }
  const buf = fs.readFileSync(dbf);
  const numRecords = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);

  const cols: { name: string; len: number; offset: number }[] = [];
  let offset = 1; // record starts with a deletion flag byte
  for (let p = 32; p < headerLen - 1; p += 32) {
    if (buf[p] === 0x0d) break;
    const nm = buf.toString("ascii", p, p + 11).replace(/\0.*$/, "");
    const len = buf[p + 16];
    cols.push({ name: nm, len, offset });
    offset += len;
  }
  const col = (n: string) => cols.find((c) => c.name === n);
  const cLat = col("LATITUDE");
  const cLon = col("LONGITUDE");
  const cName = col("SOV0NAME") ?? col("ADM0NAME");
  const cISO = col("ISO_A2") ?? col("ADM0_A3");
  const cFeat = col("FEATURECLA");
  if (!cLat || !cLon || !cName || !cISO || !cFeat) {
    console.warn("  ! populated-places DBF is missing expected columns");
    return [];
  }

  const read = (rec: number, c: { len: number; offset: number }) =>
    buf
      .toString(
        "latin1",
        headerLen + rec * recordLen + c.offset,
        headerLen + rec * recordLen + c.offset + c.len,
      )
      .trim();

  const seen = new Set<string>();
  const nations: Nation[] = [];
  for (let r = 0; r < numRecords; r++) {
    const feat = read(r, cFeat);
    if (!feat.startsWith("Admin-0 capital")) continue;
    const iso = read(r, cISO).toLowerCase();
    const nm = read(r, cName);
    if (!iso || iso === "-99" || seen.has(iso)) continue;

    const lat = Number(read(r, cLat));
    const lon = Number(read(r, cLon));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    // Project through the map's OWN bbox, not the whole world: a regional crop
    // like SPQR covers lon -21..56, and using the global formula would scatter
    // every capital to the wrong tile. Capitals outside the crop are dropped —
    // Beijing has no business on a map of the Roman Empire.
    const [lonMin, latMin, lonMax, latMax] = bbox;
    if (lon < lonMin || lon > lonMax || lat < latMin || lat > latMax) continue;

    let x = Math.round(((lon - lonMin) / (lonMax - lonMin)) * w);
    let y = Math.round(((latMax - lat) / (latMax - latMin)) * h);
    x = Math.min(w - 1, Math.max(0, x));
    y = Math.min(h - 1, Math.max(0, y));

    // A spawn on a water tile is unplayable. Nudge to the nearest land tile —
    // island capitals routinely land in the sea at 20 km/tile.
    const found = nearestLand(land, x, y, 6);
    if (!found) continue;

    seen.add(iso);
    nations.push({
      coordinates: found,
      name: shortenNationName(nm),
      flag: iso,
    });
  }
  return nations;
}

/**
 * Nation names must fit the HUD: <= 27 printable characters (tests/NationName).
 * Natural Earth ships full sovereign names, two of which bust that budget —
 * "Federated States of Micronesia" (30) and "Saint Vincent and the Grenadines"
 * (32). Strip the diplomatic boilerplate first, and only truncate (on a word
 * boundary) if that still isn't enough.
 */
const MAX_NATION_NAME = 27;

export function shortenNationName(name: string): string {
  let s = name
    .replace(
      /^(Federated States of|Republic of|Kingdom of|State of|Union of)\s+/i,
      "",
    )
    .replace(/^(The)\s+/i, "")
    .replace(/\bSaint\b/g, "St.")
    .trim();
  if (s.length <= MAX_NATION_NAME) return s;

  const cut = s.slice(0, MAX_NATION_NAME);
  const space = cut.lastIndexOf(" ");
  s = (space > 8 ? cut.slice(0, space) : cut).trim();
  return s.replace(/[\s,]+$/, "");
}

function nearestLand(
  land: Field,
  x0: number,
  y0: number,
  maxR: number,
): [number, number] | null {
  const { width: w, height: h } = land;
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = (((x0 + dx) % w) + w) % w;
        const y = y0 + dy;
        if (y < 0 || y >= h) continue;
        if (land.data[y * w + x] > 0) return [x, y];
      }
    }
  }
  return null;
}

// ─────────────────────────── main ───────────────────────────

const { fields, meta } = loadFields();
console.log(
  `\nloaded ${meta.fields.length} raw fields at ${meta.width}x${meta.height}`,
);

// The map is the ingest, optionally averaged down. Deriving earth-mini from the
// same global ingest (rather than re-ingesting at half size) means the small map
// is literally the big one averaged — they cannot drift apart.
const factor = Math.max(1, Math.floor(scaleDiv));
if (meta.width % factor !== 0 || meta.height % factor !== 0) {
  throw new Error(
    `--div ${factor} does not divide the ${meta.width}x${meta.height} ingest evenly`,
  );
}
const outW = meta.width / factor;
const outH = meta.height / factor;

// The Go baker normalizes dimensions to multiples of 4 for its 4x/16x mipmaps.
if (outW % 4 !== 0 || outH % 4 !== 0) {
  throw new Error(
    `target ${outW}x${outH} must be a multiple of 4 in both axes`,
  );
}

const bbox: [number, number, number, number] = meta.bbox ?? [
  -180, -90, 180, 90,
];

const scaled: RawFields = {};
for (const [k, v] of Object.entries(fields)) scaled[k] = downsample(v, factor);
if (factor !== 1) console.log(`downsampled ${factor}x -> ${outW}x${outH}`);
console.log(
  `bbox ${bbox.join(", ")}` +
    (meta.kmPerTile
      ? `  (~${meta.kmPerTile[0]} x ${meta.kmPerTile[1]} km/tile)`
      : ""),
);

const tuning: Tuning = tuningPath
  ? (JSON.parse(fs.readFileSync(tuningPath, "utf8")) as Tuning)
  : defaultTuning();
console.log(tuningPath ? `tuning: ${tuningPath}` : "tuning: defaults");

const built = buildMap(scaled, tuning);

// ── image.png ──
const outDir = path.join(__dirname, "..", "assets", "maps", name);
fs.mkdirSync(outDir, { recursive: true });

const canvas = createCanvas(outW, outH);
const ctx = canvas.getContext("2d");
const img = ctx.createImageData(outW, outH);
img.data.set(built.terrain);
ctx.putImageData(img, 0, 0);
fs.writeFileSync(path.join(outDir, "image.png"), canvas.toBuffer("image/png"));

// ── terrain-colors.png ──
// Without this sidecar the map silently renders with VANILLA OpenFront shading:
// flat blue sea, no bathymetry, no biomes. `manifest.terrain_colors: true` (set
// by the Go baker when this file exists) routes it through the fork's own
// TerrainPass instead. Full-res only — the baker rejects it at 4x/16x.
const colors = buildEarthTerrainColors(scaled, tuning, built.land);
const colorCanvas = createCanvas(outW, outH);
const colorCtx = colorCanvas.getContext("2d");
const colorImg = colorCtx.createImageData(outW, outH);
colorImg.data.set(colors);
colorCtx.putImageData(colorImg, 0, 0);
fs.writeFileSync(
  path.join(outDir, "terrain-colors.png"),
  colorCanvas.toBuffer("image/png"),
);

// ── layers.bin (through the sim's own encoder, so it cannot drift) ──
const planes = {} as Record<LayerName, Float32Array>;
for (const [k, bytes] of Object.entries(built.planes)) {
  const f = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) f[i] = bytes[i] / 255;
  planes[k as LayerName] = f;
}
fs.writeFileSync(
  path.join(outDir, "layers.bin"),
  encodeLayers(planes, outW, outH),
);

// ── elevation.bin (world-engine space, full precision) ──
// Land: the image magnitude's gamma ramp, unquantized, anchored into
// (seaLevel, 1]. Water: real ETOPO bathymetry mapped below seaLevel, so the
// runtime derivation's depth ramp shows true ocean relief instead of a
// synthetic shore-distance shelf. The recorded world_engine config's seaLevel
// is the anchor the runtime flood compares against.
const worldEngine = {
  ...normalizeFoundationWorldEngineMapConfig({
    // Same name-derived seed rule as derive-layers.ts — it feeds the climate
    // noise fields at runtime, nothing else.
    seed: simpleHash(`layers:${name}`) % 1_000_000,
  }),
  width: outW,
  height: outH,
};
{
  const t = tuning.terrain;
  const elevM = scaled["elevation"];
  const gamma = t.elevationGamma > 0 ? t.elevationGamma : 1;
  const seaLevel = worldEngine.seaLevel;
  // Normalize land by the map's TRUE maximum, not the image ramp's
  // maxElevationM magnitude cap — clamping at 4000 m flattens the
  // Himalaya/Tibet into a saturated plateau with no relief.
  let maxLandM = t.maxElevationM;
  for (let i = 0; i < elevM.data.length; i++) {
    if (built.land.data[i] > 0 && elevM.data[i] > maxLandM) {
      maxLandM = elevM.data[i];
    }
  }
  const span = Math.max(1, maxLandM - t.seaLevelM);
  // Abyssal plains sit at 4–6 km; 6.5 km with a sub-linear curve spreads
  // shelf → slope → plain across the visible depth range.
  const maxDepthM = 6500;
  const out = new Float32Array(outW * outH);
  for (let i = 0; i < out.length; i++) {
    if (built.land.data[i] > 0) {
      const h = Math.max(0, elevM.data[i] - t.seaLevelM);
      const norm = Math.pow(Math.min(1, h / span), gamma);
      out[i] = seaLevel + 0.01 + norm * (0.99 - seaLevel);
    } else {
      const depth = Math.max(0, t.seaLevelM - elevM.data[i]);
      const norm = Math.pow(Math.min(1, depth / maxDepthM), 0.72);
      out[i] = seaLevel * (0.95 - 0.9 * norm);
    }
  }
  fs.writeFileSync(
    path.join(outDir, "elevation.bin"),
    encodeElevation(out, outW, outH),
  );
}

// ── hydro.bin (lakes + rivers, SEPARATE — see core HydroMap.ts) ──
// From the real HydroLAKES presence and HydroRIVERS discharge fields, kept
// distinct so the shell renders lakes as lakes and rivers as rivers. River
// discharge is wildly skewed (creek 25 m³/s … Amazon 205,000), so log-
// normalize against a fixed Amazon-scale reference; the shell's river
// thresholds then pick which show. Lakes are a hard presence mask.
{
  const riverM = scaled["river"];
  const lakeM = scaled["lake"];
  const n = outW * outH;
  const lake = new Float32Array(n);
  const river = new Float32Array(n);
  const refDischarge = Math.log1p(200000);
  for (let i = 0; i < n; i++) {
    if (built.land.data[i] <= 0) continue;
    lake[i] = lakeM.data[i] > 0 ? 1 : 0;
    river[i] = Math.min(
      1,
      Math.log1p(Math.max(0, riverM.data[i])) / refDischarge,
    );
  }
  fs.writeFileSync(
    path.join(outDir, "hydro.bin"),
    encodeHydro({ lake, river }, outW, outH),
  );
}

// ── info.json ──
const nations = loadNations(outW, outH, built.land, bbox);
const displayName = title ?? name.charAt(0).toUpperCase() + name.slice(1);
const info = {
  id: displayName.replace(/[^A-Za-z0-9]/g, ""),
  name: displayName,
  translation_key: `map.${name}`,
  // The Go baker validates against a fixed category enum (see map_generator.go);
  // "earth" is not in it. "world" is the one that means "the real planet".
  categories: ["new", "world"],
  multiplayer_frequency: 0,
  nations,
  world_engine: worldEngine,
};
fs.writeFileSync(
  path.join(outDir, "info.json"),
  JSON.stringify(info, null, 2) + "\n",
);

// ── report ──
const { stats } = built;
const total = outW * outH;
console.log(`\nwrote ${outDir}`);
console.log(
  `  land ${stats.landTiles.toLocaleString()} (${((100 * stats.landTiles) / total).toFixed(1)}%)  ` +
    `water ${stats.waterTiles.toLocaleString()}  impassable ${stats.impassableTiles.toLocaleString()}`,
);
console.log(`  nations: ${nations.length}`);
console.log(`\n  mean byte value on land (0 = dead layer, 255 = saturated):`);
for (const [k, v] of Object.entries(stats.meanOnLand)) {
  const bar = "█".repeat(Math.round((v / 255) * 40));
  console.log(`    ${k.padEnd(12)} ${v.toFixed(1).padStart(6)}  ${bar}`);
}
console.log(`\nnext: npm run gen-maps\n`);
