import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";

// Regenerate the small comparison report from the full, retained traces.
const { values, positionals } = parseArgs({
  options: { out: { type: "string" } },
  allowPositionals: true,
});
if (!values.out || positionals.length === 0)
  throw new Error("Usage: --out NEW_FILE RUN.json.gz ...");
const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b),
    i = Math.floor(sorted.length / 2);
  return sorted.length
    ? sorted.length % 2
      ? sorted[i]
      : (sorted[i - 1] + sorted[i]) / 2
    : null;
};
const summary: Record<string, unknown> = {};
for (const file of positionals) {
  const raw = readFileSync(file);
  const runs = JSON.parse(
    (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString(),
  );
  const perRun = runs.map((r: any) => {
    const last = r.samples[r.samples.length - 1],
      alive = last.players.filter((p: any) => p.alive);
    const first = (event: string) =>
      r.events.find((e: any) => e.event === event)?.tick / 10 || null;
    const actions = r.events.filter(
      (e: any) => e.event === "action" && e.data.outcome === "committed",
    );
    return {
      seed: r.seed,
      completed: r.completed,
      victorySeconds: r.victorySeconds,
      finalHash: r.finalHash,
      wallMs: r.wallMs,
      firstContactSeconds: first("first-enemy-capture"),
      firstEliminationSeconds: first("eliminated"),
      firstActionSeconds: actions.length ? actions[0].tick / 10 : null,
      survivors: alive.length,
      leaderShare: Math.max(...last.players.map((p: any) => p.landShare)),
      medianSurvivorTroops: median(alive.map((p: any) => p.totalTroops)),
      foodBlockedSeconds: last.players.reduce(
        (s: number, p: any) => s + p.foodBlockedTicks / 10,
        0,
      ),
      purchases: actions.filter(
        (e: any) => e.data.kind === "farm" || e.data.kind === "city",
      ).length,
      spend: Object.fromEntries(
        ["farm", "city", "land", "transport"].map((kind) => [
          kind,
          actions
            .filter((e: any) => e.data.kind === kind)
            .reduce((s: bigint, e: any) => s + BigInt(e.data.spentMilli), 0n)
            .toString(),
        ]),
      ),
      rejected: r.events.filter(
        (e: any) => e.event === "action" && e.data.outcome === "rejected",
      ).length,
    };
  });
  const policies: Record<string, unknown> = {};
  for (const tick of [1200, 3000, 6000]) {
    const seats = runs.flatMap(
      (r: any) =>
        (
          r.samples.find((s: any) => s.tick === tick) ??
          r.samples[r.samples.length - 1]
        ).players,
    );
    policies[String(tick / 10)] = Object.fromEntries(
      ["balanced", "farm-first", "expansion-first", "military-first"].map(
        (policy) => {
          const ps = seats.filter((p: any) => p.policy === policy);
          return [
            policy,
            {
              seats: ps.length,
              survival: ps.length
                ? ps.filter((p: any) => p.alive).length / ps.length
                : null,
              meanLandShare: ps.length
                ? ps.reduce((s: number, p: any) => s + p.landShare, 0) /
                  ps.length
                : null,
              medianTroops: median(ps.map((p: any) => p.totalTroops)),
            },
          ];
        },
      ),
    );
  }
  summary[file] = {
    runs: runs.length,
    completed: perRun.filter((r: any) => r.completed).length,
    medianVictorySeconds: median(
      perRun.filter((r: any) => r.completed).map((r: any) => r.victorySeconds),
    ),
    medianLeaderShare: median(perRun.map((r: any) => r.leaderShare)),
    medianSurvivors: median(perRun.map((r: any) => r.survivors)),
    medianFirstEliminationSeconds: median(
      perRun
        .map((r: any) => r.firstEliminationSeconds)
        .filter((n: unknown) => n !== null),
    ),
    medianFirstContactSeconds: median(
      perRun
        .map((r: any) => r.firstContactSeconds)
        .filter((n: unknown) => n !== null),
    ),
    perRun,
    policies,
  };
}
writeFileSync(values.out, JSON.stringify(summary, null, 2), { flag: "wx" });
