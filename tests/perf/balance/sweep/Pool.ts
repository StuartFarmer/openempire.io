/**
 * A small fixed-size pool of forked sim workers.
 *
 * Each job is one seeded game. Workers are persistent so map bytes stay
 * cached between jobs. A worker that dies mid-job (OOM, a sim throw that
 * escapes) has its job requeued once on a fresh worker; a second failure is
 * recorded against the job rather than killing the sweep, so one bad corner
 * of the space never costs you the other 200 runs.
 */
import { ChildProcess, fork } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { RunSpec } from "../RunGame";
import { FromWorker, ToWorker } from "./Worker";

const WORKER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "Worker.ts",
);

export interface Job {
  jobId: number;
  spec: RunSpec;
  /** Opaque payload handed back with the result. */
  cellId: string;
}

export interface JobOutcome {
  job: Job;
  metrics: Record<string, number> | null;
  hash: number | null;
  error: string | null;
  wallMs: number;
}

interface Slot {
  child: ChildProcess;
  current: Job | null;
  ready: boolean;
  startedAt: number;
}

export interface PoolOptions {
  concurrency: number;
  onResult: (outcome: JobOutcome) => void;
  onProgress: (done: number, total: number, running: number) => void;
}

export async function runPool(jobs: Job[], opts: PoolOptions): Promise<void> {
  if (jobs.length === 0) return;
  const concurrency = Math.max(1, Math.min(opts.concurrency, jobs.length));
  const queue = [...jobs];
  const attempts = new Map<number, number>();
  let done = 0;

  return new Promise<void>((resolve, reject) => {
    const slots: Slot[] = [];
    let finished = false;

    const settle = (): void => {
      if (finished) return;
      if (done < jobs.length) return;
      finished = true;
      for (const s of slots) {
        s.child.send({ type: "shutdown" } satisfies ToWorker);
        s.child.kill();
      }
      resolve();
    };

    const report = (outcome: JobOutcome): void => {
      done++;
      opts.onResult(outcome);
      opts.onProgress(
        done,
        jobs.length,
        slots.filter((s) => s.current !== null).length,
      );
      settle();
    };

    const pump = (slot: Slot): void => {
      if (finished || !slot.ready) return;
      const next = queue.shift();
      if (next === undefined) {
        slot.current = null;
        return;
      }
      slot.current = next;
      slot.startedAt = performance.now();
      slot.child.send({
        type: "job",
        jobId: next.jobId,
        spec: next.spec,
      } satisfies ToWorker);
    };

    const spawn = (index: number): Slot => {
      const child = fork(WORKER_PATH, [], {
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      const slot: Slot = { child, current: null, ready: false, startedAt: 0 };

      child.on("message", (msg: FromWorker) => {
        if (msg.type === "ready") {
          slot.ready = true;
          pump(slot);
          return;
        }
        const job = slot.current;
        if (job === null || job.jobId !== msg.jobId) return;
        slot.current = null;
        const wallMs = Math.round(performance.now() - slot.startedAt);
        if (msg.type === "done") {
          report({
            job,
            metrics: msg.metrics,
            hash: msg.hash,
            error: null,
            wallMs,
          });
        } else {
          report({ job, metrics: null, hash: null, error: msg.error, wallMs });
        }
        pump(slot);
      });

      child.on("error", (e) => {
        if (!slot.ready && slot.current === null) {
          finished = true;
          reject(new Error(`sweep worker failed to start: ${e.message}`));
        }
      });

      child.on("exit", (code, signal) => {
        if (finished) return;
        const job = slot.current;
        slot.ready = false;
        slot.current = null;
        if (job !== null) {
          const tries = (attempts.get(job.jobId) ?? 0) + 1;
          attempts.set(job.jobId, tries);
          if (tries < 2) {
            queue.unshift(job); // one retry on a fresh worker
          } else {
            report({
              job,
              metrics: null,
              hash: null,
              error: `worker exited (code ${code}, signal ${signal}) twice`,
              wallMs: Math.round(performance.now() - slot.startedAt),
            });
          }
        }
        if (queue.length > 0 && !finished) {
          slots[index] = spawn(index);
        }
      });

      return slot;
    };

    for (let i = 0; i < concurrency; i++) {
      slots.push(spawn(i));
    }
  });
}
