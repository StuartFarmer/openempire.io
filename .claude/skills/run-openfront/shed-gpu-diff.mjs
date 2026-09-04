// Food-shed GPU spike, part 2: run the WESL flood on the real inputs dumped by
// tests/perf/balance/ShedReference.ts and diff it against the CPU's own output.
//
// Answers three things:
//   1. does the parallel relaxation reproduce the CPU's step distances exactly?
//   2. where do the two disagree on cell assignment (the Voronoi tie-break the
//      CPU resolves by queue order and the GPU by lowest source ref)?
//   3. what does a full 54-pass refresh cost on the GPU?
//
//   node .claude/skills/run-openfront/shed-gpu-diff.mjs --ref <dir>
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const REF = arg("ref", "");
if (!REF) throw new Error("--ref <dir> is required");

const manifest = JSON.parse(
  fs.readFileSync(path.join(REF, "manifest.json"), "utf8"),
);
const read = (f) => fs.readFileSync(path.join(REF, f));
const ownerRaw = new Uint32Array(read("owner.bin").buffer.slice(0));
const maturityRaw = new Float32Array(read("farmMaturity.bin").buffer.slice(0));
const cpuCell = new Int32Array(read("cell.bin").buffer.slice(0));
const nodeRaw = new Uint32Array(read("supplyNode.bin").buffer.slice(0));
const cpuSupply = new Int32Array(read("supplyDist.bin").buffer.slice(0));
const { width, height, cutoff } = manifest;
const n = width * height;

const b64 = (view) =>
  Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");

// --scale WxH also times the same pipeline at another resolution on a synthetic
// territory, because the flood's cost is set by MAP AREA (every pass dispatches
// over the whole grid), not by how much land the player owns.
const SCALE = arg("scale", "");

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE:", m.text());
});
await page.goto("http://localhost:9000/", { waitUntil: "load" });
await page.waitForTimeout(3000);

const result = await page.evaluate(
  async ({ ownerB64, maturityB64, nodeB64, width, height }) => {
    const decode = (s) => {
      const bin = atob(s);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    };
    const { compileFieldSystem } =
      await import("/src/client/webgpu/FieldDynamics.ts");
    const { FieldKernel } = await import("/src/client/webgpu/FieldKernel.ts");
    const { economyFields, CUTOFF_RADII } =
      await import("/src/client/economy/fields/system.ts");
    const { FOOD_DEFAULTS } =
      await import("/src/core/configuration/FoodConfig.ts");
    const d = FOOD_DEFAULTS;
    const knobs = {
      wFood: d.wFood,
      wWater: d.wWater,
      wShore: d.wShore,
      wLogi: d.wLogi,
      wCong: d.wCong,
      supplyRadius: d.supplyRadius,
      supplyDecayPower: d.supplyDecayPower,
      popPerDensity: d.popPerDensity,
      fieldClaimMilli: d.fieldClaimMilli,
      farmSeedMilli: d.farmSeedMilli,
      farmGrowthRate: d.farmGrowthRate,
      farmSenesceRate: d.farmSenesceRate,
      humidityWeight: d.humidityWeight,
      tempBaseN: d.tempBaseN,
      tempOptLoN: d.tempOptLoN,
      tempOptHiN: d.tempOptHiN,
      tempMaxN: d.tempMaxN,
      waterWiltN: d.waterWiltN,
      waterFullN: d.waterFullN,
      fieldTileStorageMilli: d.fieldTileStorageMilli,
      fieldTileYieldMilli: d.fieldTileYieldMilli,
      tenureHalfTicks: d.tenureHalfTicks,
      tickSeed: 0,
    };
    const compiled = await compileFieldSystem(
      economyFields(
        {
          shed: Math.ceil(d.foodShedRadius * CUTOFF_RADII),
          supply: Math.ceil(d.supplyRadius * CUTOFF_RADII),
        },
        knobs,
      ),
    );
    const kernel = await FieldKernel.create(null, compiled.kernelConfig);
    kernel.resize(width, height);
    kernel.writeBuffer("owner", new Uint32Array(decode(ownerB64)));
    kernel.writeBuffer("farmMaturity", new Float32Array(decode(maturityB64)));
    kernel.writeBuffer("supplyNode", new Uint32Array(decode(nodeB64)));

    // One untimed run to warm pipelines, then a timed one.
    for (let pass = 0; pass < 2; pass++) {
      const t0 = performance.now();
      const frame = kernel.beginFrame();
      compiled.runDerive(frame);
      await frame.finish();
      var wallMs = performance.now() - t0;
    }
    const dist = new Uint32Array(await kernel.readBuffer("shedDist"));
    const cell = new Uint32Array(await kernel.readBuffer("shedCell"));
    const supply = new Uint32Array(await kernel.readBuffer("supplyDist"));
    return {
      adapter: kernel.adapterInfo,
      wallMs,
      dist: Array.from(dist.slice(0, 0)), // placeholder, transferred below
      distB64: btoa(
        String.fromCharCode(...new Uint8Array(dist.buffer.slice(0, 0))),
      ),
      // Send back only what the diff needs: reached count + per-tile arrays via
      // a compact string is too big, so summarise here and return samples.
      reached: dist.reduce((a, d) => a + (d !== 0xffffffff ? 1 : 0), 0),
      cellArr: Array.from(cell),
      supplyArr: Array.from(supply),
      distArr: Array.from(dist),
    };
  },
  {
    ownerB64: b64(ownerRaw),
    nodeB64: b64(nodeRaw),
    maturityB64: b64(maturityRaw),
    width,
    height,
  },
);

await browser.close();

const gpuCell = Int32Array.from(
  result.cellArr.map((c) => (c === 0xffffffff ? -1 : c)),
);
const gpuDist = result.distArr;

let cpuReached = 0;
let gpuReached = 0;
let bothReached = 0;
let cellSame = 0;
let cellDiff = 0;
let onlyCpu = 0;
let onlyGpu = 0;
for (let i = 0; i < n; i++) {
  const c = cpuCell[i] >= 0;
  const g = gpuCell[i] >= 0;
  if (c) cpuReached++;
  if (g) gpuReached++;
  if (c && g) {
    bothReached++;
    if (cpuCell[i] === gpuCell[i]) cellSame++;
    else cellDiff++;
  } else if (c) onlyCpu++;
  else if (g) onlyGpu++;
}

console.log(`adapter: ${result.adapter}`);
console.log(
  `map ${width}x${height}  players=${manifest.players}  farms=${manifest.farms}  largest=${manifest.largest}(${manifest.largestTiles})  cutoff=${cutoff}`,
);
console.log(
  `GPU full refresh (${cutoff} passes): ${result.wallMs.toFixed(2)} ms`,
);
console.log(
  `reached  cpu=${cpuReached}  gpu=${gpuReached}  both=${bothReached}`,
);
console.log(`  only-cpu=${onlyCpu}  only-gpu=${onlyGpu}`);
console.log(
  `cell agreement: ${cellSame}/${bothReached} (${((cellSame / Math.max(1, bothReached)) * 100).toFixed(2)}%)  differing=${cellDiff}`,
);

// Are the disagreements ONLY tie-breaks? The CPU stores potential, not
// distance, but potential = srcMaturity · 1/(1 + (d/R)^P) is invertible: the
// CPU's step distance falls out of its own output. If every differing tile sits
// at the SAME distance in both, then the two floods found equally-short paths
// to different farms and the only semantic difference is which one wins — not
// the shortest-path result itself.
const cpuPotential = new Float32Array(read("potential.bin").buffer.slice(0));
const R = manifest.foodShedRadius;
const P = manifest.foodShedPower;
let tieOnly = 0;
let realDiff = 0;
let undecidable = 0;
for (let i = 0; i < n; i++) {
  if (cpuCell[i] < 0 || gpuCell[i] < 0 || cpuCell[i] === gpuCell[i]) continue;
  const srcMaturity = maturityRaw[cpuCell[i]];
  const pot = cpuPotential[i];
  if (srcMaturity <= 0 || pot <= 0) {
    undecidable++;
    continue;
  }
  const cpuDist = Math.round(R * Math.pow(srcMaturity / pot - 1, 1 / P));
  if (cpuDist === gpuDist[i]) tieOnly++;
  else realDiff++;
}
console.log(
  `  of those: equal-distance ties=${tieOnly}  genuinely different distance=${realDiff}  undecidable(zero maturity)=${undecidable}`,
);

// Military supply: the same flood with no carried source, so its fixpoint is
// unique and the GPU result must match the CPU EXACTLY — no tie-break, no
// tolerance. Any mismatch here is a real bug, not a semantic choice.
const gpuSupply = Int32Array.from(
  result.supplyArr.map((d) => (d === 0xffffffff ? -1 : d)),
);
let sCpu = 0;
let sGpu = 0;
let sBoth = 0;
let sSame = 0;
let sDiff = 0;
let sOnlyCpu = 0;
let sOnlyGpu = 0;
const sSamples = [];
for (let i = 0; i < n; i++) {
  const c = cpuSupply[i] >= 0;
  const g = gpuSupply[i] >= 0;
  if (c) sCpu++;
  if (g) sGpu++;
  if (c && g) {
    sBoth++;
    if (cpuSupply[i] === gpuSupply[i]) sSame++;
    else {
      sDiff++;
      if (sSamples.length < 5) {
        sSamples.push(
          `tile ${i} (${i % width},${Math.floor(i / width)}) cpu=${cpuSupply[i]} gpu=${gpuSupply[i]}`,
        );
      }
    }
  } else if (c) sOnlyCpu++;
  else if (g) sOnlyGpu++;
}
console.log(
  `\nmilitary supply (${manifest.supplyNodes} nodes, cutoff ${manifest.supplyCutoff}):`,
);
console.log(`  reached  cpu=${sCpu}  gpu=${sGpu}  both=${sBoth}`);
console.log(`  only-cpu=${sOnlyCpu}  only-gpu=${sOnlyGpu}`);
console.log(
  `  distance agreement: ${sSame}/${sBoth} (${((sSame / Math.max(1, sBoth)) * 100).toFixed(2)}%)  differing=${sDiff}`,
);
if (sSamples.length > 0)
  console.log("  samples:\n    " + sSamples.join("\n    "));
if (SCALE) {
  const [sw, sh] = SCALE.split("x").map(Number);
  const b2 = await chromium.launch({
    headless: true,
    channel: "chromium",
    args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
  });
  const p2 = await b2.newPage();
  p2.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await p2.goto("http://localhost:9000/", { waitUntil: "load" });
  await p2.waitForTimeout(3000);
  const t = await p2.evaluate(
    async ({ w, h }) => {
      const { compileFieldSystem } =
        await import("/src/client/webgpu/FieldDynamics.ts");
      const { FieldKernel } = await import("/src/client/webgpu/FieldKernel.ts");
      const { economyFields, CUTOFF_RADII } =
        await import("/src/client/economy/fields/system.ts");
      const { FOOD_DEFAULTS: d } =
        await import("/src/core/configuration/FoodConfig.ts");
      const compiled = await compileFieldSystem(
        economyFields(
          {
            shed: Math.ceil(d.foodShedRadius * CUTOFF_RADII),
            supply: Math.ceil(d.supplyRadius * CUTOFF_RADII),
          },
          {
            wFood: d.wFood,
            wWater: d.wWater,
            wShore: d.wShore,
            wLogi: d.wLogi,
            wCong: d.wCong,
            supplyRadius: d.supplyRadius,
            supplyDecayPower: d.supplyDecayPower,
            popPerDensity: d.popPerDensity,
            fieldClaimMilli: d.fieldClaimMilli,
            farmSeedMilli: d.farmSeedMilli,
            farmGrowthRate: d.farmGrowthRate,
            farmSenesceRate: d.farmSenesceRate,
            humidityWeight: d.humidityWeight,
            tempBaseN: d.tempBaseN,
            tempOptLoN: d.tempOptLoN,
            tempOptHiN: d.tempOptHiN,
            tempMaxN: d.tempMaxN,
            waterWiltN: d.waterWiltN,
            waterFullN: d.waterFullN,
            fieldTileStorageMilli: d.fieldTileStorageMilli,
            fieldTileYieldMilli: d.fieldTileYieldMilli,
            tenureHalfTicks: d.tenureHalfTicks,
            tickSeed: 0,
          },
        ),
      );
      const kernel = await FieldKernel.create(null, compiled.kernelConfig);
      kernel.resize(w, h);
      const n = w * h;
      // Whole map under ONE owner, farms on a coarse lattice — the worst case
      // for the flood: nothing blocks it and every pass has work everywhere.
      const owner = new Uint32Array(n).fill(1);
      const mat = new Float32Array(n);
      for (let y = 20; y < h; y += 40)
        for (let x = 20; x < w; x += 40) mat[y * w + x] = 0.8;
      kernel.writeBuffer("owner", owner);
      kernel.writeBuffer("farmMaturity", mat);
      const runs = [];
      for (let i = 0; i < 4; i++) {
        const t0 = performance.now();
        const frame = kernel.beginFrame();
        compiled.runDerive(frame);
        await frame.finish();
        runs.push(performance.now() - t0);
      }
      return { runs, adapter: kernel.adapterInfo };
    },
    { w: sw, h: sh },
  );
  await b2.close();
  const warm = t.runs.slice(1);
  console.log(
    `\nsynthetic ${sw}x${sh} (whole map owned, ${Math.floor(sw / 40) * Math.floor(sh / 40)} farms):` +
      ` full ${cutoff}-pass refresh = ${(warm.reduce((a, b) => a + b, 0) / warm.length).toFixed(2)} ms` +
      `  [runs ${t.runs.map((r) => r.toFixed(1)).join(", ")}]`,
  );
}

if (cellDiff > 0) {
  const shown = [];
  for (let i = 0; i < n && shown.length < 5; i++) {
    if (cpuCell[i] >= 0 && gpuCell[i] >= 0 && cpuCell[i] !== gpuCell[i]) {
      shown.push(
        `tile ${i} (${i % width},${Math.floor(i / width)}) cpuCell=${cpuCell[i]} gpuCell=${gpuCell[i]} gpuDist=${gpuDist[i]}`,
      );
    }
  }
  console.log("samples:\n  " + shown.join("\n  "));
}
