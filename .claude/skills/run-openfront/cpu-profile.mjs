// Aggregate a .cpuprofile: self time per function, and INCLUSIVE time for a
// set of named entry points (walk the call tree, credit each node's subtree).
//
//   node .claude/skills/run-openfront/cpu-profile.mjs <file.cpuprofile> [fn ...]
//
// Self time answers "where is the CPU"; inclusive answers "what does this stage
// cost end to end", which is what you want when deciding whether moving a stage
// off the CPU is worth anything. Note that inclusive times OVERLAP where one
// entry point calls another (foodTick calls the shed recompute), so they do not
// sum to 100% — subtract deliberately, do not add.
import fs from "fs";
const file = process.argv[2];
const p = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
// self time per node from the sample stream
const self = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const dt = p.timeDeltas[i] ?? 0;
  self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + dt);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);

// inclusive time: DFS from roots accumulating subtree self time
const inclusive = new Map();
function walk(id, seen = new Set()) {
  if (seen.has(id)) return 0;
  seen.add(id);
  const n = byId.get(id);
  let t = self.get(id) ?? 0;
  for (const c of n.children ?? []) t += walk(c, seen);
  inclusive.set(id, t);
  return t;
}
for (const n of p.nodes) if (!inclusive.has(n.id)) walk(n.id);

const name = (n) => {
  const f = n.callFrame;
  const u = (f.url ?? "").split("/").slice(-2).join("/");
  return `${f.functionName || "(anon)"}  [${u}]`;
};
// self-time leaderboard, merged by name
const merged = new Map();
for (const [id, t] of self) {
  const n = byId.get(id);
  if (!n) continue;
  const k = name(n);
  merged.set(k, (merged.get(k) ?? 0) + t);
}
console.log(`total sampled: ${(total / 1000).toFixed(0)} ms\n`);
console.log("── self time (top 22) ──");
for (const [k, t] of [...merged].sort((a, b) => b[1] - a[1]).slice(0, 22)) {
  console.log(`${(t / 1000).toFixed(0).padStart(6)} ms  ${((t / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
}
// inclusive for named entry points: sum over all nodes with that function name
const WANT = process.argv.slice(3);
if (WANT.length) {
  console.log("\n── inclusive time for entry points ──");
  for (const w of WANT) {
    let t = 0;
    for (const n of p.nodes) {
      if (n.callFrame.functionName !== w) continue;
      t += inclusive.get(n.id) ?? 0;
    }
    console.log(`${(t / 1000).toFixed(0).padStart(6)} ms  ${((t / total) * 100).toFixed(1).padStart(5)}%  ${w}`);
  }
}
