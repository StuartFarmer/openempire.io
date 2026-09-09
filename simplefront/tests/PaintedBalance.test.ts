import path from "node:path";
import { expect, test } from "vitest";
import { paintedMapLoader } from "../scripts/painted-map-loader";
import { runPaintedBalance } from "./perf/balance/PaintedBalance";

test("real Verdantia runner replays deterministic paid AI traces and reports unfinished", async () => {
  const options = {
    seed: "simplefront-pace-01",
    maxTicks: 100,
    sampleEvery: 10,
    policyRotation: 0 as const,
    comparePolicies: false,
  };
  const a = await runPaintedBalance(
    options,
    paintedMapLoader(path.join(__dirname, "../resources/maps")),
  );
  const b = await runPaintedBalance(
    options,
    paintedMapLoader(path.join(__dirname, "../resources/maps")),
  );
  expect(a.spawned).toBe(76);
  expect(a.config.ruleset).toBe("simplefront");
  expect(a.finalHash).toBe(b.finalHash);
  expect(a.samples).toEqual(b.samples);
  expect(a.events).toEqual(b.events);
  expect(a.completed).toBe(false);
  expect(a.victorySeconds).toBeNull();
  expect(
    a.events.some(
      (e) => e.event === "action" && e.data.outcome === "committed",
    ),
  ).toBe(true);
}, 30000);

test("retained painted final hash includes eliminated members of the initial cohort", async () => {
  const result = await runPaintedBalance(
    {
      seed: "simplefront-pace-01",
      maxTicks: 1000,
      sampleEvery: 10,
      policyRotation: 0,
      comparePolicies: false,
    },
    paintedMapLoader(path.join(__dirname, "../resources/maps")),
  );
  expect(result.events.some((event) => event.event === "eliminated")).toBe(
    true,
  );
  // Independently retained pre-Stage7 result for this exact seed/setup.
  expect(result.finalHash).toBe(1241618257);
}, 30000);
