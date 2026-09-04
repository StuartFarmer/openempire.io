/**
 * Map-shape comparison: land area, layer distributions (crop/water/temperature)
 * and nation counts for each baked map — the inputs the food economy reads, so
 * "why does Verdantia play nothing like SPQR" is answered with numbers.
 *
 *   npx tsx tests/perf/balance/MapStats.ts verdantia spqr earth
 */
import path from "path";
import { fileURLToPath } from "url";
import { FOOD_DEFAULTS } from "../../../src/core/configuration/FoodConfig";
import { climateSuitability } from "../../../src/core/execution/utils/FarmGrowth";
import { GameMapType } from "../../../src/core/game/Game";
import { decodeLayers } from "../../../src/core/game/MapLayers";
import { NodeGameMapLoader } from "../fullgame/NodeGameMapLoader";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const stat = (values: number[]) => {
  if (values.length === 0) return { mean: 0, p50: 0, p90: 0 };
  const s = values.slice().sort((a, b) => a - b);
  return {
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p50: s[(s.length / 2) | 0],
    p90: s[(s.length * 0.9) | 0],
  };
};

async function main(): Promise<void> {
  const names = process.argv.slice(2);
  const loader = new NodeGameMapLoader(
    path.join(PROJECT_ROOT, "resources/maps"),
  );
  for (const name of names) {
    const key = Object.keys(GameMapType).find(
      (k) => k.toLowerCase() === name.toLowerCase(),
    );
    if (key === undefined) throw new Error(`unknown map: ${name}`);
    const data = loader.getMapData(
      GameMapType[key as keyof typeof GameMapType],
    );
    const manifest = await data.manifest();
    const { width, height } = manifest.map;
    // map.bin is exactly width×height bytes, no header (genTerrainFromBin);
    // bit 7 is land. layers.bin is 6 stacked planes in LAYER_NAMES order.
    const tiles = await data.mapBin();
    const layers = decodeLayers(await data.layersBin!(), width, height);
    const plane = width * height;
    const cropPlane = layers.subarray(0, plane);
    const tempPlane = layers.subarray(3 * plane, 4 * plane);
    const waterPlane = layers.subarray(5 * plane, 6 * plane);
    // The sim's own Liebig suitability per land tile, evaluated with the
    // default food config — this, not the raw planes, is what a farm's ceiling
    // and a settlement's growth read. `binding` records WHICH term is the
    // minimum, since that is what makes two maps play differently.
    const humPlane = layers.subarray(4 * plane, 5 * plane);
    const shim = {
      layer: (n: string, t: number) =>
        n === "crop"
          ? cropPlane[t]
          : n === "temperature"
            ? tempPlane[t]
            : n === "humidity"
              ? humPlane[t]
              : waterPlane[t],
      config: () => ({ food: () => FOOD_DEFAULTS }),
    } as unknown as Parameters<typeof climateSuitability>[0];

    let land = 0;
    const crop: number[] = [];
    const water: number[] = [];
    const temp: number[] = [];
    const suit: number[] = [];
    let cropBinds = 0;
    for (let i = 0; i < plane; i += 1) {
      if ((tiles[i] & 0b10000000) === 0) continue;
      land += 1;
      crop.push(cropPlane[i]);
      water.push(waterPlane[i]);
      temp.push(tempPlane[i]);
      const s = climateSuitability(shim, i as never);
      suit.push(s);
      // Liebig min: when suitability EQUALS cropN the land's own fertility is
      // the binding constraint (identical float, straight out of Math.min).
      if (s === cropPlane[i] / 255) cropBinds += 1;
    }
    const f = (v: number) => v.toFixed(1);
    const c = stat(crop);
    const w = stat(water);
    const t = stat(temp);
    const s = stat(suit);
    const pct = (n: number) => `${((n / land) * 100).toFixed(0)}%`;
    console.log(
      `${name.padEnd(12)} ${width}x${height} tiles=${width * height} land=${land} (${((land / (width * height)) * 100).toFixed(0)}%)\n` +
        `  crop  mean=${f(c.mean)} p50=${c.p50} p90=${c.p90}\n` +
        `  water mean=${f(w.mean)} p50=${w.p50} p90=${w.p90}\n` +
        `  temp  mean=${f(t.mean)} p50=${t.p50} p90=${t.p90}\n` +
        `  SUITABILITY mean=${s.mean.toFixed(3)} p50=${s.p50.toFixed(3)} p90=${s.p90.toFixed(3)} cropIsBinding=${pct(cropBinds)}\n` +
        `  nations=${manifest.nations?.length ?? 0} additional=${manifest.additionalNations?.length ?? 0}`,
    );
  }
}

void main();
