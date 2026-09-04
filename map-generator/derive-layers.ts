/**
 * derive-layers.ts — retrofit the layers.bin, terrain-colors.png, and
 * elevation.bin sidecars (plus the world_engine render config in info.json)
 * onto a generated map whose engine state is gone (only the baked image.png
 * survives, e.g. maps exported from the #generator page before layers
 * existed).
 *
 * The baked image preserves land/water and the 0–30 elevation magnitude per
 * land tile (gray = 140 + 2·magnitude; see buildGeneratorSourceImage). We
 * invert that to an elevation field (water gets a synthetic shelf that deepens
 * with distance from shore), then run the world engine's REAL climate/resource
 * pipeline — temperature → precipitation → watermap → irrigation → humidity →
 * permeability → resources — with a seed derived from the map name. The
 * result is the same formulas as a fresh generation; only the elevation input
 * is quantized. Deterministic: same image + same seed ⇒ identical layers.bin.
 *
 * Usage:
 *   npx tsx map-generator/derive-layers.ts --map majormenor [--seed 123]
 *   # then: npm run gen-maps
 *
 * --elevation-only skips layers.bin and terrain-colors.png — for maps whose
 * shipped sidecars come from a DIFFERENT pipeline (the earth/bake.ts real-data
 * maps) that must not be clobbered by this reconstruction.
 */
import { createCanvas, ImageData, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { encodeElevation } from "../src/core/game/ElevationMap";
import { encodeLayers, LAYER_NAMES } from "../src/core/game/MapLayers";
import { simpleHash } from "../src/core/Util";
import {
  buildFreshwaterPlane,
  buildGeneratorHydroBlob,
} from "../src/games/alternative/world/GeneratorMapExport";
import {
  buildWorldEngineTerrainColors,
  deriveFoundationWorldEngineResourceConfig,
  deriveWorldEngineOcean,
  deriveWorldEngineSeaDepth,
  generateWorldEngineBiome,
  generateWorldEngineHumidity,
  generateWorldEngineIrrigation,
  generateWorldEnginePermeability,
  generateWorldEnginePrecipitation,
  generateWorldEngineResourceMaps,
  generateWorldEngineTemperature,
  generateWorldEngineWatermap,
  normalizeFoundationWorldEngineMapConfig,
  normalizeWorldEngineLand,
} from "../src/games/alternative/world/WorldEngineElevation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const mapName = arg("map");
if (!mapName) {
  console.error("usage: npx tsx map-generator/derive-layers.ts --map <name>");
  process.exit(1);
}
const mapDir = path.join(__dirname, "assets", "maps", mapName);
const imagePath = path.join(mapDir, "image.png");
if (!fs.existsSync(imagePath)) {
  console.error(`no image.png at ${imagePath}`);
  process.exit(1);
}
const seed =
  arg("seed") !== undefined
    ? Number(arg("seed"))
    : simpleHash(`layers:${mapName}`) % 1_000_000;
const elevationOnly = process.argv.includes("--elevation-only");

const img = await loadImage(imagePath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);
const { data } = ctx.getImageData(0, 0, img.width, img.height);
const width = img.width;
const height = img.height;
const total = width * height;

// The normalizer clamps dimensions to the interactive generator's 1024 cap,
// but we must run the pipeline at the baked image's true size.
const cfg = {
  ...normalizeFoundationWorldEngineMapConfig({ seed, width, height }),
  width,
  height,
};

// ── Invert the bake: land elevation from magnitude; water from shore dist ──
const elevation = new Float32Array(total);
const isWater = new Uint8Array(total);
for (let i = 0; i < total; i++) {
  const off = i * 4;
  // Water pixels are written with alpha 0 (rgb 0,0,106); land is opaque gray.
  if (data[off + 3] === 0) {
    isWater[i] = 1;
  } else {
    const magnitude = Math.max(0, Math.min(30, (data[off] - 140) / 2));
    elevation[i] = magnitude / 30;
  }
}

// Break the 31-level quantization: flat plateaus give the drainage solver
// zero gradient, which shows up as diagonal flow artifacts downstream. A
// small land-only blur restores gradients between steps; a deterministic
// sub-step dither breaks what ties remain. Same seed ⇒ same field.
{
  const src = elevation.slice();
  const hash01 = (i: number): number => {
    let h = (i ^ seed) >>> 0;
    h = Math.imul(h, 2654435761) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h >>> 8) / 16777216;
  };
  const radius = 2;
  const step = 1 / 30;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (isWater[i] === 1) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const ni = ny * width + nx;
          if (isWater[ni] === 1) continue;
          sum += src[ni];
          count++;
        }
      }
      const dither = (hash01(i) - 0.5) * step * 0.6;
      elevation[i] = Math.min(1, Math.max(0, sum / count + dither));
    }
  }
}

// Water depth was not baked — synthesize a shelf: just under sea level at the
// shore, deepening with (owned-grid) distance from land, floored well above 0
// so the profile stays smooth for the watermap flow.
{
  const dist = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  let tail = 0;
  for (let i = 0; i < total; i++) {
    if (isWater[i] === 0) continue;
    const x = i % width;
    const y = (i / width) | 0;
    const nearLand =
      (x > 0 && isWater[i - 1] === 0) ||
      (x < width - 1 && isWater[i + 1] === 0) ||
      (y > 0 && isWater[i - width] === 0) ||
      (y < height - 1 && isWater[i + width] === 0);
    if (nearLand) {
      dist[i] = 1;
      queue[tail++] = i;
    }
  }
  let head = 0;
  while (head < tail) {
    const cur = queue[head++];
    const d = dist[cur] + 1;
    const x = cur % width;
    const y = (cur / width) | 0;
    for (const n of [
      x > 0 ? cur - 1 : -1,
      x < width - 1 ? cur + 1 : -1,
      y > 0 ? cur - width : -1,
      y < height - 1 ? cur + width : -1,
    ]) {
      if (n < 0 || isWater[n] === 0 || dist[n] !== -1) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
  for (let i = 0; i < total; i++) {
    if (isWater[i] === 0) continue;
    const d = dist[i] === -1 ? 64 : Math.min(dist[i], 64);
    // Shore (d=1) ≈ 0.94·seaLevel down to abyss (d≥64) ≈ 0.05·seaLevel. The
    // sqrt profile front-loads the slope near shore and flattens toward the
    // deep, so the runtime depth ramp reads as shelf → slope → plain instead
    // of a constant-width glow ring around every coast.
    elevation[i] = cfg.seaLevel * (0.95 - 0.9 * Math.sqrt(d / 64));
  }
}

// ── elevation.bin + the render config runtime derivation replays ──
// Written before the climate pipeline so --elevation-only can stop here.
//
// The export uses a seaLevel-ANCHORED land mapping: the pipeline's raw
// magnitude/30 land field puts low-magnitude land below cfg.seaLevel, which
// the runtime derivation's ocean flood would read as submerged. Exported
// land maps into (seaLevel, 1] — coast just above sea level, magnitude 30 at
// 1.0 — while water keeps the synthetic shelf (already below seaLevel), so
// the field is self-consistent with the recorded config.
const elevationExport = new Float32Array(total);
for (let i = 0; i < total; i++) {
  elevationExport[i] =
    isWater[i] === 1
      ? elevation[i]
      : cfg.seaLevel + 0.01 + elevation[i] * (0.99 - cfg.seaLevel);
}
fs.writeFileSync(
  path.join(mapDir, "elevation.bin"),
  encodeElevation(elevationExport, width, height),
);
{
  const infoPath = path.join(mapDir, "info.json");
  const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
  info.world_engine = cfg;
  fs.writeFileSync(infoPath, `${JSON.stringify(info, null, 2)}\n`);
}
console.log(
  `wrote ${mapDir}/elevation.bin (u16 plane) + world_engine config in info.json`,
);
if (elevationOnly) {
  process.exit(0);
}

// ── The engine's real pipeline, from reconstructed elevation ──
const ocean = deriveWorldEngineOcean(elevation, cfg);
const { data: temperature, mountainThreshold } = generateWorldEngineTemperature(
  elevation,
  ocean,
  cfg,
);
const precipitation = generateWorldEnginePrecipitation(
  elevation,
  ocean,
  temperature,
  cfg,
);
const seaDepth = deriveWorldEngineSeaDepth(elevation, ocean, cfg);
const { watermap, lakes } = generateWorldEngineWatermap(
  elevation,
  ocean,
  precipitation,
  cfg,
);
const normalizedWatermap = normalizeWorldEngineLand(watermap, ocean);
const irrigation = generateWorldEngineIrrigation(watermap, ocean, cfg);
const humidity = generateWorldEngineHumidity(precipitation, irrigation, ocean);
const permeability = generateWorldEnginePermeability(ocean, cfg);
const resources = generateWorldEngineResourceMaps(
  {
    elevation,
    ocean,
    temperature,
    precipitation,
    seaDepth,
    normalizedWatermap,
    irrigation,
    humidity,
    permeability,
    mountainThreshold,
  },
  { ...cfg, ...deriveFoundationWorldEngineResourceConfig(cfg.seed) },
);

const blob = encodeLayers(
  {
    crop: resources.crop,
    metal: resources.metal,
    oil: resources.oil,
    temperature,
    humidity,
    water: buildFreshwaterPlane(
      { irrigation, normalizedWatermap, lakes },
      width,
      height,
    ),
  },
  width,
  height,
);
fs.writeFileSync(path.join(mapDir, "layers.bin"), blob);
fs.writeFileSync(
  path.join(mapDir, "hydro.bin"),
  buildGeneratorHydroBlob({ normalizedWatermap, lakes }, width, height),
);

// ── Terrain colors: the engine's real palette over the reconstructed fields ──
const biome = generateWorldEngineBiome(ocean, temperature, humidity);
const terrainColors = buildWorldEngineTerrainColors(
  elevation,
  ocean,
  temperature,
  precipitation,
  seaDepth,
  normalizedWatermap,
  humidity,
  biome,
  lakes,
  cfg,
);
{
  const colorCanvas = createCanvas(width, height);
  const colorCtx = colorCanvas.getContext("2d");
  colorCtx.putImageData(
    new ImageData(new Uint8ClampedArray(terrainColors), width, height),
    0,
    0,
  );
  fs.writeFileSync(
    path.join(mapDir, "terrain-colors.png"),
    colorCanvas.toBuffer("image/png"),
  );
}

// ── Report: crop distribution over land, vs any reference layers.bin ──
function cropStats(bytes: Uint8Array, water: (i: number) => boolean) {
  const values: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!water(i)) values.push(bytes[i]); // crop is plane 0
  }
  values.sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const pct = (p: number) => values[Math.floor(values.length * p)];
  const farmable = values.filter((v) => v >= 30).length / values.length;
  return { mean: mean.toFixed(1), p50: pct(0.5), p90: pct(0.9), farmable };
}
const stats = cropStats(blob, (i) => isWater[i] === 1);
console.log(
  `wrote ${mapDir}/layers.bin (${width}x${height}, seed ${seed}, planes: ${LAYER_NAMES.join(",")})`,
);
console.log(`wrote ${mapDir}/terrain-colors.png (${width}x${height})`);
console.log(
  `crop over land: mean ${stats.mean}, p50 ${stats.p50}, p90 ${stats.p90}, ≥30 (farmable): ${(stats.farmable * 100).toFixed(0)}%`,
);
