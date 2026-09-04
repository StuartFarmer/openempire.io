/**
 * Sweep worker: a forked child that runs one game per job.
 *
 * Long-lived on purpose — the process caches map bytes (see RunGame's
 * `mapBytes`) so only the first job on each worker pays the sidecar read,
 * and tsx startup is amortised over the whole sweep.
 */
import { metricsOf, runGame, RunSpec } from "../RunGame";

export interface JobMessage {
  type: "job";
  jobId: number;
  spec: RunSpec;
}

export interface ShutdownMessage {
  type: "shutdown";
}

export type ToWorker = JobMessage | ShutdownMessage;

export type FromWorker =
  | { type: "ready" }
  | {
      type: "done";
      jobId: number;
      metrics: Record<string, number>;
      hash: number | null;
    }
  | { type: "failed"; jobId: number; error: string };

// The engine is chatty; a sweep's stdout belongs to the progress line.
console.log = () => {};
console.debug = () => {};

const send = (msg: FromWorker): void => {
  process.send?.(msg);
};

process.on("message", (msg: ToWorker) => {
  if (msg.type === "shutdown") {
    process.exit(0);
  }
  if (msg.type !== "job") return;
  void (async () => {
    try {
      const result = await runGame(msg.spec);
      send({
        type: "done",
        jobId: msg.jobId,
        metrics: metricsOf(result, msg.spec.ticks) as unknown as Record<
          string,
          number
        >,
        hash: result.stateHash,
      });
    } catch (e) {
      send({
        type: "failed",
        jobId: msg.jobId,
        error: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  })();
});

send({ type: "ready" });
