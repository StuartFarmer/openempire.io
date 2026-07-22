/**
 * Author nation spawn points for a generated map and write them into the map's
 * source `info.json`, so `npm run gen-maps` bakes them into the manifest.
 *
 * Why: `GameConfig.nations: "default"` resolves to `manifestNations.map(...)`
 * (NationCreation.ts), so a map whose manifest carries no nations spawns NONE.
 * Generated maps (verdantia, estuaria) shipped with `"nations": []`, so any
 * caller using the default — notably the WebGPU shell (ShellSim.worker.ts) —
 * got a world of plain bots. Bots do not run the tribal economy, so nothing
 * ever urbanized. The balance harness sidesteps this by passing an explicit
 * count; the shell cannot.
 *
 * Placement: greedy best-first over land tiles scored by spawn quality
 * (crop + freshwater + a landmass-interior bonus), subject to a minimum
 * separation so nations do not stack on one coastline. Deterministic — the
 * same map always yields the same nations.
 *
 *   npx tsx map-generator/gen-nations.ts --map verdantia [--count 25]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GameMapType } from "../src/core/game/Game";
import { decodeLayers } from "../src/core/game/MapLayers";
import { genTerrainFromBin } from "../src/core/game/TerrainMapLoader";
import { NodeGameMapLoader } from "../tests/perf/fullgame/NodeGameMapLoader";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Names for generated worlds — evocative, no real-world flags. */
const NAMES = [
  "Aldermoor",
  "Bramblehold",
  "Cindermarch",
  "Dunravel",
  "Elderwyn",
  "Fenwater",
  "Greenhollow",
  "Hearthvale",
  "Ironbark",
  "Junipergarde",
  "Kelnmere",
  "Larkspur",
  "Mosswend",
  "Northreach",
  "Oakenfast",
  "Pinehaven",
  "Quillbrook",
  "Rushmere",
  "Stonecreek",
  "Thornfield",
  "Umbervale",
  "Verdance",
  "Willowmarch",
  "Yarrowden",
  "Zephyrhold",
  "Ashenford",
  "Briarcliff",
  "Cloudfen",
  "Deepfurrow",
  "Emberwilde",
  "Foxglove",
  "Glimmerdale",
  "Hollowmere",
  "Ivywatch",
  "Jadewater",
  "Kestrelmoor",
  "Loamgate",
  "Marshlight",
  "Nettlebourne",
  "Orchardkeep",
];

async function main(): Promise<void> {
  const mapName = arg("map", "verdantia");
  const count = Number(arg("count", "25"));
  const srcDir = path.join(PROJECT_ROOT, "map-generator/assets/maps", mapName);
  const infoPath = path.join(srcDir, "info.json");
  if (!fs.existsSync(infoPath)) throw new Error(`no info.json at ${infoPath}`);
  if (count > NAMES.length)
    throw new Error(`only ${NAMES.length} names available, asked for ${count}`);

  // The loader keys off the GameMapType VALUE (e.g. "Verdantia"); the source
  // and baked directories are the lowercased key.
  const mapType = Object.values(GameMapType).find(
    (v) => String(v).toLowerCase() === mapName.toLowerCase(),
  );
  if (mapType === undefined) throw new Error(`unknown map id: ${mapName}`);
  const loader = new NodeGameMapLoader(
    path.join(PROJECT_ROOT, "resources/maps"),
  );
  const data = loader.getMapData(mapType);
  const manifest = await data.manifest();
  const { width, height } = manifest.map;
  const layers =
    manifest.layers === true && data.layersBin !== undefined
      ? decodeLayers(await data.layersBin(), width, height)
      : null;
  if (layers === null) throw new Error(`${mapName} has no layers.bin`);
  const gm = await genTerrainFromBin(manifest.map, await data.mapBin(), layers);

  // Score every land tile: food + freshwater, penalised for being hemmed in by
  // water (tiny islands and thin spits make miserable capitals).
  type Cand = { x: number; y: number; score: number };
  const cands: Cand[] = [];
  const R = 6;
  for (let y = R; y < height - R; y++) {
    for (let x = R; x < width - R; x++) {
      const t = gm.ref(x, y);
      if (!gm.isLand(t) || gm.isImpassable(t)) continue;
      let land = 0,
        total = 0,
        crop = 0,
        water = 0;
      for (let dy = -R; dy <= R; dy += 2) {
        for (let dx = -R; dx <= R; dx += 2) {
          const n = gm.ref(x + dx, y + dy);
          total++;
          if (gm.isLand(n) && !gm.isImpassable(n)) {
            land++;
            crop += gm.layer("crop", n);
            water += gm.layer("water", n);
          }
        }
      }
      const interior = land / total;
      if (interior < 0.55) continue; // skip islets / thin coastal spits
      const score = (crop / land) * 1.0 + (water / land) * 0.5 + interior * 120;
      cands.push({ x, y, score });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  console.log(`${mapName}: ${cands.length} viable capital sites`);

  // Greedy best-first with a separation floor, relaxed until `count` fit.
  let sep = Math.floor(Math.sqrt((width * height) / count) * 0.85);
  let picked: Cand[] = [];
  for (; sep >= 4; sep = Math.floor(sep * 0.8)) {
    picked = [];
    for (const c of cands) {
      if (picked.length >= count) break;
      if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= sep))
        picked.push(c);
    }
    if (picked.length >= count) break;
  }
  if (picked.length < count)
    throw new Error(`only placed ${picked.length}/${count} nations`);
  console.log(`placed ${picked.length} nations at min separation ${sep} tiles`);

  const nations = picked.map((p, i) => ({
    coordinates: [p.x, p.y] as [number, number],
    name: NAMES[i],
  }));

  const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
  info.nations = nations;
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + "\n");
  console.log(
    `wrote ${nations.length} nations to ${path.relative(PROJECT_ROOT, infoPath)}`,
  );
  console.log(
    `run "npm run gen-maps" to bake them into resources/maps/${mapName}/manifest.json`,
  );
}

void main();
