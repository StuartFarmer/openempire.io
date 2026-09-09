import { mkdir, open } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import { runPaintedBalance } from "../tests/perf/balance/PaintedBalance";
import { paintedMapLoader } from "./painted-map-loader";

const { values } = parseArgs({
  options: {
    seed: { type: "string" },
    organic: { type: "boolean", default: false },
    ticks: { type: "string", default: "12000" },
    "compare-policies": { type: "boolean", default: false },
    rotation: { type: "string", default: "0" },
    out: { type: "string" },
  },
  strict: true,
});
const ticks = Number(values.ticks),
  rotation = Number(values.rotation);
if (!Number.isSafeInteger(ticks) || ticks < 1 || ![0, 1, 2].includes(rotation))
  throw new Error(
    "ticks must be a positive integer; rotation must be 0, 1 or 2",
  );
const seeds = values.seed
  ? [values.seed]
  : Array.from(
      { length: 10 },
      (_, i) => `simplefront-pace-${String(i + 1).padStart(2, "0")}`,
    );
const path = values.out ? resolve(values.out) : null;
if (values.organic && path && !basename(path).includes("organic"))
  throw new Error(
    "Organic result filenames must contain 'organic' to keep retained painted results separate.",
  );
if (path) await mkdir(dirname(path), { recursive: true });
const file = path ? await open(path, "wx") : null;
const results = [];
try {
  for (const seed of seeds) {
    const result = await runPaintedBalance(
      {
        seed,
        maxTicks: ticks,
        sampleEvery: 10,
        comparePolicies: values["compare-policies"],
        policyRotation: rotation as 0 | 1 | 2,
        cityDevelopment: values.organic ? { ...DEFAULT_CONFIG } : undefined,
      },
      paintedMapLoader(),
    );
    results.push(result);
    console.log(
      JSON.stringify({
        seed,
        spawned: result.spawned,
        completed: result.completed,
        victorySeconds: result.victorySeconds,
        wallMs: Math.round(result.wallMs),
        finalHash: result.finalHash,
        elapsedSimulationSeconds: result.elapsedSimulationSeconds,
        tickMs: result.performance.tickMs,
        observerMs: result.performance.observerMs,
        developmentPayloadBytes: result.performance.developmentPayloadBytes,
      }),
    );
  }
  if (file) {
    const json = JSON.stringify(results, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    await file.writeFile(path!.endsWith(".gz") ? gzipSync(json) : json);
  }
} finally {
  await file?.close();
}
