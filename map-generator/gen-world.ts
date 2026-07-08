/**
 * Headless world authoring — the CLI twin of the #generator page.
 *
 * Runs the world engine for a seed/config and writes the four map source
 * files (image.png, terrain-colors.png, layers.bin, info.json) into
 * map-generator/assets/maps/<name>/ (or assets/test_maps/<name>/ with
 * --test, which gen-maps bakes into tests/testdata/maps/). Follow with
 * `npm run gen-maps` to bake.
 *
 * Usage:
 *   npx tsx map-generator/gen-world.ts --name verdantia --seed 42 \
 *       [--width 512] [--height 256] [--display "Verdantia"] [--test]
 */
import { createCanvas, ImageData } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createAlternativeWorldEngineMap } from "../src/games/alternative/world";
import {
  buildGeneratedMapInfo,
  buildGeneratorLayersBlob,
  buildGeneratorSourceImage,
  buildGeneratorTerrainColorImage,
  normalizeGeneratedMapIdentity,
  type GeneratedMapSourceImage,
} from "../src/games/alternative/world/GeneratorMapExport";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const name = arg("name");
if (!name) {
  console.error("--name is required");
  process.exit(1);
}
const seed = Number(arg("seed") ?? 1337);
const width = Number(arg("width") ?? 512);
const height = Number(arg("height") ?? 256);
const display = arg("display") ?? name;
const isTest = process.argv.includes("--test");

const identity = normalizeGeneratedMapIdentity(name);
const outDir = path.join(
  HERE,
  "assets",
  isTest ? "test_maps" : "maps",
  identity.folderName,
);

function encodePng(image: GeneratedMapSourceImage): Buffer {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas.toBuffer("image/png");
}

const generated = createAlternativeWorldEngineMap({ seed, width, height });
const { map, worldEngineLayers } = generated;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "image.png"),
  encodePng(buildGeneratorSourceImage(map)),
);
fs.writeFileSync(
  path.join(outDir, "terrain-colors.png"),
  encodePng(buildGeneratorTerrainColorImage(map)),
);
fs.writeFileSync(
  path.join(outDir, "layers.bin"),
  buildGeneratorLayersBlob(worldEngineLayers, map.width, map.height),
);
fs.writeFileSync(
  path.join(outDir, "info.json"),
  `${JSON.stringify(buildGeneratedMapInfo({ id: identity.id, name: display }), null, 2)}\n`,
);

console.log(
  `wrote ${outDir} (${map.width}x${map.height}, seed ${seed}) — now run: npm run gen-maps`,
);
