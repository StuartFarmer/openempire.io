import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { GameImpl } from "../src/core/game/GameImpl";
import {
  MAX_HISTORY_BYTES,
  type TickChainRecord,
} from "../src/core/sync/TickChainProtocol";
import { replayTickChain } from "../src/core/sync/TickChainReplay";
import { paintedMapLoader } from "./painted-map-loader";
import { computeSimulationBuildID } from "./simulation-build-id";

const { values } = parseArgs({
  options: {
    record: { type: "string" },
    through: { type: "string" },
    "state-every": { type: "string", default: "300" },
    out: { type: "string" },
  },
  strict: true,
});
if (!values.record)
  throw new Error(
    "Usage: replay:chain --record match.json [--through tick] [--state-every 300] [--out report.json]",
  );
if ((await stat(values.record)).size > MAX_HISTORY_BYTES)
  throw new Error("Record exceeds size limit");
const record = JSON.parse(
  await readFile(values.record, "utf8"),
) as TickChainRecord;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = await computeSimulationBuildID(root);
const started = performance.now();
const result = await replayTickChain(
  record,
  values.through === undefined
    ? record.appliedThrough.tick
    : Number(values.through),
  paintedMapLoader(),
  build,
  {
    stateHashEveryTicks: Number(values["state-every"]),
  },
);
const report = {
  format: "simplefront-chain-replay-report-v1",
  simulationBuild: build,
  appliedThrough: result.appliedThrough,
  wallMs: performance.now() - started,
  comparedStateCheckpoints: record.stateCheckpoints.filter(
    (c) => c.tick <= result.appliedThrough.tick,
  ).length,
  stateCheckpoints: result.stateCheckpoints,
  finalStateHash: (result.runner.game as GameImpl).hash(),
  finalStatePhase: "after-complete-tick",
};
const json = JSON.stringify(report, null, 2);
if (values.out) await writeFile(values.out, json + "\n", { flag: "wx" });
console.log(json);
