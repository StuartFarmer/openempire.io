/**
 * The Chromium-backed twin of `Pool.ts`.
 *
 * Node has no WebGPU, so once the sim is GPU-resident a forked-child pool cannot
 * run a game at all. This keeps `runPool`'s exact contract — same `Job`, same
 * `JobOutcome`, same callbacks — and swaps the execution host for headless
 * Chromium, where a real adapter exists.
 *
 * Two differences from the Node pool, both deliberate:
 *
 * ONE WORKER PER JOB, not per slot. The Node pool keeps workers alive so map
 * bytes stay cached across jobs. Here it cannot: `TerrainMapLoader` caches
 * `GameMapImpl` and its `state` array is mutable game state, so a second game in
 * the same module context inherits the first one's board — a control run
 * diverged at the first hash until the games were separated. The sidecars are
 * refetched per job, but the browser's HTTP cache makes that a decode cost, not
 * a network one.
 *
 * PLAYWRIGHT IS IMPORTED LAZILY. It is an unsaved dev dependency, so the Node
 * path must not require it to be installed.
 *
 * Requires the dev server (`npm run dev`, port 9000) — the worker is served as a
 * module, not bundled ahead of time.
 */
import { metricsOf, type RunResult } from "../RunGameCore";
import type { Job, JobOutcome, PoolOptions } from "./Pool";

const ORIGIN = "http://localhost:9000/";

async function assertDevServer(): Promise<void> {
  try {
    const res = await fetch(ORIGIN, { method: "GET" });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (e) {
    // `cause` set after construction: the tsconfig lib predates the
    // two-argument Error constructor.
    const err = new Error(
      `the GPU sweep needs the dev server on ${ORIGIN} (npm run dev)`,
    );
    (err as Error & { cause?: unknown }).cause = e;
    throw err;
  }
}

export async function runBrowserPool(
  jobs: Job[],
  opts: PoolOptions,
): Promise<void> {
  if (jobs.length === 0) return;
  await assertDevServer();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    channel: "chromium",
    args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
  });

  const queue = jobs.slice();
  let done = 0;
  let running = 0;
  const total = jobs.length;

  /** One page = one concurrency slot; pages are reused, workers are not. */
  const slot = async (): Promise<void> => {
    const page = await browser.newPage();
    page.on("pageerror", () => {});
    await page.goto(ORIGIN, { waitUntil: "load" });
    await page.waitForTimeout(2000);

    for (;;) {
      const job = queue.shift();
      if (job === undefined) break;
      running += 1;
      const startedAt = Date.now();
      let outcome: JobOutcome;
      try {
        const out = (await page.evaluate(
          async (spec) => {
            // Resolved by the DEV SERVER, not by tsc — the paths are kept
            // non-literal so the compiler does not try to follow them.
            const assetsUrl = "/src/core/AssetUrls.ts";
            const workerUrl =
              "/src/client/economy/BalanceGame.worker.ts?worker&inline";
            const { getCdnBase, getAssetManifest } = (await import(
              /* @vite-ignore */ assetsUrl
            )) as { getCdnBase: () => string; getAssetManifest: () => unknown };
            const W = (
              (await import(/* @vite-ignore */ workerUrl)) as {
                default: new () => Worker;
              }
            ).default;
            const worker = new W();
            const r = await new Promise((res, rej) => {
              const t = setTimeout(
                () => rej(new Error("job timed out")),
                1_800_000,
              );
              worker.onmessage = (e: MessageEvent) => {
                clearTimeout(t);
                res(e.data);
              };
              worker.onerror = (e: ErrorEvent) => {
                clearTimeout(t);
                rej(new Error(e.message ?? "worker error"));
              };
              worker.postMessage({
                spec,
                cdnBase: getCdnBase(),
                assetManifest: getAssetManifest(),
              });
            });
            worker.terminate();
            return r;
          },
          job.spec as unknown as Record<string, unknown>,
        )) as {
          ok: boolean;
          error?: string;
          result?: RunResult;
        };
        if (!out.ok || out.result === undefined) {
          throw new Error(out.error ?? "worker returned no result");
        }
        outcome = {
          job,
          metrics: metricsOf(out.result, job.spec.ticks) as unknown as Record<
            string,
            number
          >,
          hash: out.result.stateHash,
          error: null,
          wallMs: Date.now() - startedAt,
        };
      } catch (e) {
        // One bad corner of the space must not cost the other 200 runs — the
        // same failure policy the Node pool has.
        outcome = {
          job,
          metrics: null,
          hash: null,
          error: (e as Error).message,
          wallMs: Date.now() - startedAt,
        };
      }
      running -= 1;
      done += 1;
      opts.onResult(outcome);
      opts.onProgress(done, total, running);
    }
    await page.close();
  };

  const slots = Math.max(1, Math.min(opts.concurrency, jobs.length));
  await Promise.all(Array.from({ length: slots }, () => slot()));
  await browser.close();
}
