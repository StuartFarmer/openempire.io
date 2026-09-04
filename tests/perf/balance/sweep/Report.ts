/**
 * Sweep reporting: markdown for `balance-notes.md`, and a single-file HTML
 * report for exploring the parameter → metric mapping.
 *
 * The HTML has no external dependencies (no CDN, no fonts, no fetch) so it
 * opens straight off disk: brushable parallel coordinates over the swept
 * axes and chosen metrics, a scatter row of every axis against one metric,
 * sensitivity bars, and the solution table with the presets that were
 * written for it.
 */
import {
  AxisRange,
  CellResult,
  objectiveValue,
  Sensitivity,
  targetScore,
} from "./Analyze";
import { Band, Objective, RunAxes, SweepDefinition } from "./Config";

export interface SolutionRef {
  cellId: string;
  preset: string | null;
}

export interface ReportInput {
  def: SweepDefinition;
  results: CellResult[];
  ranked: CellResult[];
  /** Every cell satisfying all targets and constraints. */
  inBand: CellResult[];
  /** The diverse subset of `inBand` that was exported as presets. */
  solutions: CellResult[];
  solutionRefs: SolutionRef[];
  sensitivity: Sensitivity[];
  ranges: AxisRange[];
  headlineMetrics: string[];
  wallMs: number;
  jobCount: number;
  /** Cells reused from a previous invocation via --resume. */
  resumedCells: number;
  /** Games actually simulated this invocation (the rest came from cache). */
  freshGames: number;
  /** nsga2 only: which generation first evaluated each cell. */
  generationOf?: Map<string, number>;
  generatedAt: string;
}

/** "120 games in 150s", or an honest note when most of it came from cache. */
export function runCostLabel(input: ReportInput): string {
  const games = `${input.jobCount} games`;
  const seconds = (input.wallMs / 1000).toFixed(0);
  if (input.freshGames >= input.jobCount) return `${games} in ${seconds}s`;
  if (input.freshGames === 0) {
    return `${games}, all resumed from a previous run`;
  }
  return `${games} (${input.freshGames} fresh in ${seconds}s, ${input.jobCount - input.freshGames} resumed)`;
}

// ── formatting ──

export function fmt(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (v === Math.round(v) && a < 1e6) return String(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.001) return v.toFixed(3);
  return v.toExponential(1);
}

function table(header: string[], rows: (string | number)[][]): string {
  const head = `| ${header.join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

function axisLabel(axes: RunAxes): string {
  return `${axes.map} · ${axes.ticks} ticks · ${axes.nations} nations + ${axes.bots} bots · ${axes.difficulty} · ${axes.seeds} seed${axes.seeds === 1 ? "" : "s"}`;
}

function objectiveLabel(o: Objective): string {
  const arrow = o.goal === "maximize" ? "↑ max" : "↓ min";
  return `${arrow} ${o.metric}${o.tolerance > 0 ? ` (±${fmt(o.tolerance)})` : ""}`;
}

function bandLabel(b: Band): string {
  if (b.center !== null) {
    return `${b.metric} = ${fmt(b.center)} ± ${fmt((b.max - b.min) / 2)}`;
  }
  if (!Number.isFinite(b.min)) return `${b.metric} ≤ ${fmt(b.max)}`;
  if (!Number.isFinite(b.max)) return `${b.metric} ≥ ${fmt(b.min)}`;
  return `${b.metric} ∈ [${fmt(b.min)}, ${fmt(b.max)}]`;
}

// ── markdown ──

const MAX_MD_ROWS = 40;

export function markdownReport(input: ReportInput): string {
  const { def, ranked, results, inBand, solutionRefs, sensitivity, ranges } =
    input;
  const axes = Object.keys(results[0]?.cell.swept ?? {});
  const failed = results.filter((r) => r.errors.length > 0);
  const inBandIds = new Set(inBand.map((r) => r.cell.id));
  const pickedIds = new Set(input.solutions.map((r) => r.cell.id));
  const out: string[] = [];

  out.push(`## Sweep: ${def.name}`);
  out.push("");
  out.push(
    `${def.method} · ${results.length} cells × ${def.run.seeds} seeds = ` +
      `${runCostLabel(input)} · ${axisLabel(def.run)}`,
  );
  const multi = def.objectives.length > 0;
  if (multi) {
    out.push("");
    out.push(`Objectives: ${def.objectives.map(objectiveLabel).join(" · ")}`);
  }
  if (def.targets.length > 0) {
    out.push("");
    out.push(`Target: ${def.targets.map(bandLabel).join("; ")}`);
  }
  if (def.constraints.length > 0) {
    out.push(`Constraints: ${def.constraints.map(bandLabel).join("; ")}`);
  }
  out.push("");

  // Multi-objective: lead with the front, since that IS the result.
  if (multi) {
    out.push(`### Pareto front (${inBand.length} of ${results.length} cells)`);
    out.push("");
    out.push(
      "_Nothing else beats these on every objective at once. There is no " +
        "single winner — pick by feel from the trade-off._",
    );
    out.push("");
    const objCols = def.objectives.map((o) => o.metric);
    out.push(
      table(
        [
          "preset",
          ...axes,
          ...objCols.map((m) => shortMetric(m)),
          ...objCols.map((m) => `σ ${shortMetric(m)}`),
        ],
        inBand.map((r) => {
          const ref = solutionRefs.find((s) => s.cellId === r.cell.id);
          return [
            pickedIds.has(r.cell.id) ? (ref?.preset ?? "★") : "",
            ...axes.map((a) => fmt(r.cell.swept[a])),
            ...objCols.map((m) => fmt(r.metrics[m])),
            ...objCols.map((m) => fmt(r.metrics[m.replace(/^mean_/, "std_")])),
          ];
        }),
      ),
    );
    out.push("");
    out.push(
      "_σ columns are the across-seed spread. Where σ is comparable to the " +
        "gap between front members, that member may be a lucky seed rather " +
        "than a real trade-off — raise `run.seeds` or the objective's " +
        "`tolerance`._",
    );
    out.push("");
  }

  // Results, best first.
  const shown = ranked.slice(0, MAX_MD_ROWS);
  out.push(
    multi
      ? "### All cells searched (front first)"
      : "### Results (best target match first)",
  );
  out.push("");
  out.push(
    table(
      [...axes, ...input.headlineMetrics.map(shortMetric), "band"],
      shown.map((r) => [
        ...axes.map((a) => fmt(r.cell.swept[a])),
        ...input.headlineMetrics.map((m) => fmt(r.metrics[m])),
        r.errors.length > 0
          ? "err"
          : pickedIds.has(r.cell.id)
            ? "★"
            : inBandIds.has(r.cell.id)
              ? "✓"
              : "",
      ]),
    ),
  );
  out.push("");
  out.push(
    multi
      ? "_✓ on the Pareto front · ★ also exported as a preset_"
      : "_✓ inside every target and constraint · ★ also exported as a preset_",
  );
  if (ranked.length > shown.length) {
    out.push("");
    out.push(
      `_${ranked.length - shown.length} further cells omitted — full table in the HTML report and results.jsonl._`,
    );
  }
  out.push("");

  // Sensitivity.
  if (sensitivity.length > 0) {
    out.push("### Sensitivity (metric change per 1σ of the knob)");
    out.push("");
    const metrics = input.headlineMetrics;
    out.push(
      table(
        ["knob", ...metrics.map(shortMetric)],
        axes.map((param) => [
          param,
          ...metrics.map((m) => {
            const s = sensitivity.find(
              (x) => x.param === param && x.metric === m,
            );
            if (s === undefined) return "—";
            const sign = s.perSigma >= 0 ? "+" : "−";
            return `${sign}${fmt(Math.abs(s.perSigma))} (r ${s.r.toFixed(2)})`;
          }),
        ]),
      ),
    );
    out.push("");
  }

  // Solutions.
  out.push(
    multi
      ? `### Exported for play (${input.solutions.length} of ${inBand.length} front points)`
      : `### Solutions (${inBand.length} of ${results.length} cells in band, ${input.solutions.length} selected for play)`,
  );
  out.push("");
  if (input.solutions.length === 0) {
    out.push(
      multi
        ? "_No cell satisfied the constraints, so there is no front. Relax a " +
            "constraint or widen the parameter ranges._"
        : "_No cell satisfied every target and constraint. Widen the tolerance, " +
            "relax a constraint, or extend the ranges._",
    );
  } else {
    out.push(
      table(
        ["preset", ...axes, ...input.headlineMetrics.map(shortMetric)],
        input.solutions.map((r) => {
          const ref = solutionRefs.find((s) => s.cellId === r.cell.id);
          return [
            ref?.preset ?? "—",
            ...axes.map((a) => fmt(r.cell.swept[a])),
            ...input.headlineMetrics.map((m) => fmt(r.metrics[m])),
          ];
        }),
      ),
    );
    out.push("");
    if (ranges.length > 0) {
      out.push(
        multi
          ? "Knob spans along the front (narrow = the objectives pin this knob down):"
          : "In-band ranges (narrow = the target pins this knob down):",
      );
      out.push("");
      out.push(
        table(
          ["knob", multi ? "front span" : "in-band span", "swept span"],
          ranges.map((r) => {
            const swept = def.params.find((p) => p.name === r.param);
            const full =
              swept?.kind === "range"
                ? `${fmt(swept.min!)} … ${fmt(swept.max!)}`
                : (swept?.values ?? []).map((v) => fmt(v)).join(", ");
            return [
              r.param,
              r.lo === r.hi ? fmt(r.lo) : `${fmt(r.lo)} … ${fmt(r.hi)}`,
              full,
            ];
          }),
        ),
      );
    }
  }
  if (failed.length > 0) {
    out.push("");
    out.push(`### Failed cells (${failed.length})`);
    out.push("");
    for (const f of failed.slice(0, 10)) {
      out.push(`- \`${f.cell.id}\` — ${f.errors[0].split("\n")[0]}`);
    }
  }
  out.push("");
  return out.join("\n");
}

function shortMetric(m: string): string {
  return m
    .replace(/^mean_/, "")
    .replace(/^max_/, "max ")
    .replace(/^std_/, "σ ");
}

// ── HTML ──

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function htmlReport(input: ReportInput): string {
  const { def, results } = input;
  const axes = Object.keys(results[0]?.cell.swept ?? {});
  const solutionIds = new Set(input.solutions.map((s) => s.cell.id));
  const inBandIds = new Set(input.inBand.map((s) => s.cell.id));

  const data = {
    name: def.name,
    method: def.method,
    generatedAt: input.generatedAt,
    run: {
      map: String(def.run.map),
      ticks: def.run.ticks,
      nations: def.run.nations,
      bots: def.run.bots,
      difficulty: String(def.run.difficulty),
      seeds: def.run.seeds,
    },
    wallMs: input.wallMs,
    jobCount: input.jobCount,
    costLabel: runCostLabel(input),
    axes,
    metrics: input.headlineMetrics,
    allMetrics: Object.keys(results[0]?.metrics ?? {}).filter((k) =>
      k.startsWith("mean_"),
    ),
    targets: def.targets.map((t) => ({ ...t, label: bandLabel(t) })),
    constraints: def.constraints.map((t) => ({ ...t, label: bandLabel(t) })),
    objectives: def.objectives.map((o) => ({ ...o, label: objectiveLabel(o) })),
    sensitivity: input.sensitivity,
    solutions: input.solutions.map((s) => ({
      id: s.cell.id,
      preset:
        input.solutionRefs.find((r) => r.cellId === s.cell.id)?.preset ?? null,
      overrides: s.cell.params,
    })),
    rows: results.map((r) => ({
      id: r.cell.id,
      params: r.cell.swept,
      metrics: r.metrics,
      score: targetScore(r, def.targets),
      // Objective values oriented bigger-is-better, for the trade-off plots.
      obj: def.objectives.map((o) => objectiveValue(r, o)),
      generation: input.generationOf?.get(r.cell.id) ?? 0,
      solution: solutionIds.has(r.cell.id),
      band: inBandIds.has(r.cell.id),
      failed: r.errors.length > 0,
      error: r.errors[0]?.split("\n")[0] ?? null,
      hashes: r.hashes,
      seeds: r.seeds,
    })),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sweep · ${escapeHtml(def.name)}</title>
<style>
  :root {
    color-scheme: dark light;
    --bg: #0d1117; --panel: #161b22; --line: #30363d; --fg: #e6edf3;
    --muted: #8b949e; --accent: #f0b429; --good: #3fb950; --bad: #f85149;
    --dim: #21262d;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#fbfbfa; --panel:#fff; --line:#d8dee4; --fg:#1f2328;
            --muted:#59636e; --dim:#eef1f4; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font: 13px/1.5
    ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { padding: 20px 24px 12px; border-bottom: 1px solid var(--line); }
  h1 { margin:0 0 4px; font-size: 18px; letter-spacing:-0.01em; }
  h2 { margin:0 0 10px; font-size:13px; text-transform:uppercase;
       letter-spacing:0.08em; color:var(--muted); font-weight:600; }
  .sub { color: var(--muted); font-size:12px; }
  .tag { display:inline-block; padding:1px 7px; border:1px solid var(--line);
         border-radius:999px; margin-right:6px; font-size:11px; }
  main { padding: 16px 24px 60px; display:flex; flex-direction:column; gap:16px; }
  section { background: var(--panel); border:1px solid var(--line);
            border-radius:10px; padding:14px 16px; }
  .controls { display:flex; gap:14px; align-items:center; flex-wrap:wrap;
              margin-bottom:10px; font-size:12px; color:var(--muted); }
  select, button { background:var(--dim); color:var(--fg);
    border:1px solid var(--line); border-radius:6px; padding:3px 7px;
    font: inherit; font-size:12px; }
  button { cursor:pointer; }
  button:hover { border-color: var(--accent); }
  .scrollx { overflow-x:auto; }
  svg { display:block; }
  .axis line, .axis path { stroke: var(--line); }
  text { fill: var(--muted); font-size: 10px; }
  text.axis-title { fill: var(--fg); font-size: 11px; font-weight:600; }
  table { border-collapse: collapse; width:100%; font-size:12px;
          font-variant-numeric: tabular-nums; }
  th, td { text-align:right; padding:4px 8px; border-bottom:1px solid var(--line);
           white-space:nowrap; }
  th:first-child, td:first-child { text-align:left; }
  th { color:var(--muted); font-weight:600; cursor:pointer; user-select:none; }
  th:hover { color: var(--fg); }
  tr.band td { background: color-mix(in srgb, var(--good) 7%, transparent); }
  tr.solution td { background: color-mix(in srgb, var(--good) 18%, transparent);
                   font-weight: 600; }
  tr.failed td { color: var(--bad); }
  code { font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
         background:var(--dim); padding:1px 5px; border-radius:4px; }
  .pill { font-size:11px; color:var(--muted); }
  .bar { height:9px; border-radius:3px; display:inline-block; vertical-align:middle; }
  .empty { color:var(--muted); font-style:italic; }
</style>
</head>
<body>
<header>
  <h1>Sweep · ${escapeHtml(def.name)}</h1>
  <div class="sub" id="subtitle"></div>
</header>
<main>
  <section id="paretoSection" hidden>
    <h2>Trade-off — the Pareto front</h2>
    <div class="controls">
      <span id="paretoLegend" class="pill"></span>
      <label><input type="checkbox" id="colorByGen"> colour by generation</label>
    </div>
    <div class="scrollx"><svg id="pareto"></svg></div>
  </section>

  <section>
    <h2>Parameters → metrics</h2>
    <div class="controls">
      <span>Drag on an axis to brush · click an axis label to clear</span>
      <label>colour <select id="colorBy"></select></label>
      <button id="clearBrush">clear all brushes</button>
      <span id="selCount" class="pill"></span>
    </div>
    <div class="scrollx"><svg id="pcp"></svg></div>
  </section>

  <section>
    <h2>Each knob against one metric</h2>
    <div class="controls">
      <label>metric <select id="scatterMetric"></select></label>
      <span class="pill">brushed cells are highlighted</span>
    </div>
    <div class="scrollx"><svg id="scatter"></svg></div>
  </section>

  <section>
    <h2>Sensitivity — metric change per 1σ of the knob</h2>
    <div class="controls">
      <label>metric <select id="sensMetric"></select></label>
      <span class="pill">amber = raising the knob raises the metric · blue = lowers it</span>
    </div>
    <div id="sens"></div>
  </section>

  <section>
    <h2>Solutions</h2>
    <div id="solutions"></div>
  </section>

  <section>
    <h2>All cells</h2>
    <div class="controls">
      <label><input type="checkbox" id="onlyBrushed"> only brushed</label>
    </div>
    <div class="scrollx" style="max-height:60vh; overflow-y:auto"><div id="tableWrap"></div></div>
  </section>
</main>

<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script>
const D = JSON.parse(document.getElementById("data").textContent);
const $ = (id) => document.getElementById(id);
const SVG = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const short = (m) => m.replace(/^mean_/, "").replace(/^max_/, "max ").replace(/^std_/, "σ ");
const fmt = (v) => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (v === Math.round(v) && a < 1e6) return String(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.001) return v.toFixed(3);
  return v.toExponential(1);
};

const rows = D.rows.filter((r) => !r.failed);
const dims = [
  ...D.axes.map((a) => ({ key: a, kind: "param", label: a })),
  ...D.metrics.map((m) => ({ key: m, kind: "metric", label: short(m) })),
];
const valueOf = (row, dim) =>
  dim.kind === "param" ? row.params[dim.key] : row.metrics[dim.key];

// Categorical axes (map, difficulty) get an ordinal scale.
for (const d of dims) {
  const vals = rows.map((r) => valueOf(r, d));
  d.categorical = vals.some((v) => typeof v !== "number");
  if (d.categorical) {
    d.categories = [...new Set(vals.map(String))].sort();
    d.lo = 0; d.hi = Math.max(1, d.categories.length - 1);
  } else {
    d.lo = Math.min(...vals); d.hi = Math.max(...vals);
    if (d.lo === d.hi) { d.lo -= 0.5; d.hi += 0.5; }
  }
  d.num = (row) => d.categorical
    ? d.categories.indexOf(String(valueOf(row, d)))
    : valueOf(row, d);
}

$("subtitle").textContent =
  D.method + " · " + D.rows.length + " cells × " + D.run.seeds + " seeds = " +
  D.costLabel + " · " +
  D.run.map + " · " + D.run.ticks + " ticks · " + D.run.nations + " nations + " +
  D.run.bots + " bots · " + D.run.difficulty + " · " + D.generatedAt;

const colorSelect = $("colorBy");
for (const m of D.metrics) colorSelect.add(new Option(short(m), m));
if (D.targets.length) colorSelect.add(new Option("target score", "__score"), 0);
colorSelect.selectedIndex = 0;
for (const s of [$("scatterMetric"), $("sensMetric")]) {
  for (const m of D.metrics) s.add(new Option(short(m), m));
}

const brushes = new Map();   // dim key -> [lo, hi] in data units
const brushed = () => rows.filter((r) =>
  [...brushes.entries()].every(([k, [lo, hi]]) => {
    const d = dims.find((x) => x.key === k);
    const v = d.num(r);
    return v >= lo && v <= hi;
  }));

const ramp = (t) => {
  // muted blue → amber → red, readable on both themes
  const stops = [[70,130,200],[240,180,40],[230,70,60]];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, j) => Math.round(v + (stops[i+1][j] - v) * f));
  return "rgb(" + c.join(",") + ")";
};
const colorValue = (r) => {
  const key = colorSelect.value;
  if (key === "__score") {
    const max = Math.max(...rows.map((x) => x.score)) || 1;
    return 1 - Math.min(1, r.score / max);
  }
  const vals = rows.map((x) => x.metrics[key]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return hi === lo ? 0.5 : (r.metrics[key] - lo) / (hi - lo);
};

// ── parallel coordinates ──
const PCP_H = 320, PAD_T = 26, PAD_B = 34;
function drawPcp() {
  const svg = $("pcp");
  svg.innerHTML = "";
  const gap = Math.max(110, Math.min(190, 1100 / Math.max(1, dims.length)));
  const W = 40 + gap * (dims.length - 1) + 60;
  svg.setAttribute("width", W);
  svg.setAttribute("height", PCP_H);
  const x = (i) => 40 + gap * i;
  const y = (d, v) => PCP_H - PAD_B - ((v - d.lo) / (d.hi - d.lo)) * (PCP_H - PAD_T - PAD_B);
  const sel = new Set(brushed().map((r) => r.id));

  for (const r of rows) {
    const pts = dims.map((d, i) => x(i) + "," + y(d, d.num(r))).join(" ");
    const on = sel.has(r.id);
    el("polyline", {
      points: pts, fill: "none",
      stroke: on ? ramp(colorValue(r)) : "currentColor",
      "stroke-width": r.solution ? 2.4 : r.band ? 1.5 : 1,
      "stroke-opacity": on ? (r.solution ? 0.95 : r.band ? 0.7 : 0.4) : 0.06,
    }, svg);
  }

  dims.forEach((d, i) => {
    const gx = x(i);
    el("line", { x1: gx, y1: PAD_T, x2: gx, y2: PCP_H - PAD_B,
      stroke: "currentColor", "stroke-opacity": 0.35 }, svg);
    const title = el("text", { x: gx, y: 14, "text-anchor": "middle",
      class: "axis-title", style: "cursor:pointer" }, svg);
    title.textContent = d.label.length > 16 ? d.label.slice(0, 15) + "…" : d.label;
    title.onclick = () => { brushes.delete(d.key); redraw(); };
    if (brushes.has(d.key)) title.setAttribute("fill", "var(--accent)");
    const ticks = d.categorical
      ? d.categories.map((c, ci) => [ci, c])
      : [[d.lo, fmt(d.lo)], [(d.lo + d.hi) / 2, fmt((d.lo + d.hi) / 2)], [d.hi, fmt(d.hi)]];
    for (const [v, label] of ticks) {
      const ty = y(d, v);
      const t = el("text", { x: gx - 6, y: ty + 3, "text-anchor": "end" }, svg);
      t.textContent = label;
    }
    // brush target
    const band = el("rect", { x: gx - 9, y: PAD_T, width: 18,
      height: PCP_H - PAD_T - PAD_B, fill: "transparent",
      style: "cursor:ns-resize" }, svg);
    if (brushes.has(d.key)) {
      const [lo, hi] = brushes.get(d.key);
      el("rect", { x: gx - 9, y: y(d, hi), width: 18,
        height: Math.max(2, y(d, lo) - y(d, hi)), fill: "var(--accent)",
        "fill-opacity": 0.18, stroke: "var(--accent)", "stroke-opacity": 0.6 }, svg);
    }
    let startY = null;
    band.addEventListener("pointerdown", (e) => {
      startY = e.offsetY; band.setPointerCapture(e.pointerId);
    });
    band.addEventListener("pointermove", (e) => {
      if (startY === null) return;
      const inv = (py) => d.lo + ((PCP_H - PAD_B - py) / (PCP_H - PAD_T - PAD_B)) * (d.hi - d.lo);
      const a = inv(startY), b = inv(e.offsetY);
      brushes.set(d.key, [Math.min(a, b), Math.max(a, b)]);
      redraw();
    });
    band.addEventListener("pointerup", () => { startY = null; });
  });
}

// ── scatter row ──
function drawScatter() {
  const svg = $("scatter");
  svg.innerHTML = "";
  const metric = $("scatterMetric").value;
  const cellW = 190, cellH = 170, padL = 44, padB = 34, padT = 12;
  const W = Math.max(1, D.axes.length) * cellW;
  svg.setAttribute("width", W);
  svg.setAttribute("height", cellH);
  const sel = new Set(brushed().map((r) => r.id));
  const mv = rows.map((r) => r.metrics[metric]);
  const mlo = Math.min(...mv), mhi = Math.max(...mv);
  const ys = (v) => cellH - padB - ((v - mlo) / ((mhi - mlo) || 1)) * (cellH - padT - padB);

  D.axes.forEach((axis, i) => {
    const d = dims.find((x) => x.key === axis);
    const ox = i * cellW + padL;
    const w = cellW - padL - 14;
    const xs = (v) => ox + ((v - d.lo) / ((d.hi - d.lo) || 1)) * w;
    el("line", { x1: ox, y1: cellH - padB, x2: ox + w, y2: cellH - padB,
      stroke: "currentColor", "stroke-opacity": 0.3 }, svg);
    el("line", { x1: ox, y1: padT, x2: ox, y2: cellH - padB,
      stroke: "currentColor", "stroke-opacity": 0.3 }, svg);
    for (const r of rows) {
      const on = sel.has(r.id);
      el("circle", { cx: xs(d.num(r)), cy: ys(r.metrics[metric]),
        r: r.solution ? 4 : 2.6,
        fill: on ? ramp(colorValue(r)) : "currentColor",
        "fill-opacity": on ? 0.9 : 0.10,
        stroke: r.solution ? "var(--good)" : "none", "stroke-width": 1.4 }, svg);
    }
    const t = el("text", { x: ox + w / 2, y: cellH - 8, "text-anchor": "middle",
      class: "axis-title" }, svg);
    t.textContent = axis;
    const lo = el("text", { x: ox, y: cellH - padB + 12 }, svg);
    lo.textContent = fmt(d.lo);
    const hi = el("text", { x: ox + w, y: cellH - padB + 12, "text-anchor": "end" }, svg);
    hi.textContent = fmt(d.hi);
    if (i === 0) {
      const yl = el("text", { x: 4, y: padT + 8 }, svg); yl.textContent = fmt(mhi);
      const yl2 = el("text", { x: 4, y: cellH - padB }, svg); yl2.textContent = fmt(mlo);
    }
  });
  // Target band shading — only worth drawing when the band actually cuts
  // through the data; a full-height wash says nothing.
  const target = D.targets.find((t) => t.metric === metric);
  if (target && (target.min > mlo || target.max < mhi)) {
    const y1 = ys(Math.min(target.max, mhi)), y2 = ys(Math.max(target.min, mlo));
    el("rect", { x: 0, y: Math.min(y1, y2), width: W, height: Math.abs(y2 - y1),
      fill: "var(--good)", "fill-opacity": 0.10 }, svg);
  }
}

// ── Pareto trade-off matrix ──
// One panel per objective pair. Dominated cells fade into the background;
// the front is drawn on top and joined, so the shape of the trade-off (and
// whether it is a real curve or three lucky points) is visible at a glance.
function drawPareto() {
  if (!D.objectives.length) return;
  $("paretoSection").hidden = false;
  const svg = $("pareto");
  svg.innerHTML = "";
  const objs = D.objectives;
  const pairs = [];
  for (let i = 0; i < objs.length; i++)
    for (let j = i + 1; j < objs.length; j++) pairs.push([i, j]);
  if (!pairs.length) pairs.push([0, 0]);

  const size = 260, pad = 46, padT = 14, padR = 16;
  svg.setAttribute("width", pairs.length * size);
  svg.setAttribute("height", size);
  const byGen = $("colorByGen").checked;
  const maxGen = Math.max(0, ...rows.map((r) => r.generation));

  pairs.forEach(([ai, bi], panel) => {
    const ox = panel * size + pad;
    const w = size - pad - padR;
    const h = size - pad - padT;
    // Plot RAW metric values (not the sign-flipped objective) so the axis
    // numbers match every other table in this report.
    const rawA = (r) => r.metrics[objs[ai].metric];
    const rawB = (r) => r.metrics[objs[bi].metric];
    const xs_ = rows.map(rawA), ys_ = rows.map(rawB);
    const xlo = Math.min(...xs_), xhi = Math.max(...xs_);
    const ylo = Math.min(...ys_), yhi = Math.max(...ys_);
    const X = (v) => ox + ((v - xlo) / ((xhi - xlo) || 1)) * w;
    // Baseline is the x-axis at (size - pad); full range spans h upward to padT.
    const Y = (v) => size - pad - ((v - ylo) / ((yhi - ylo) || 1)) * h;

    el("line", { x1: ox, y1: size - pad, x2: ox + w, y2: size - pad,
      stroke: "currentColor", "stroke-opacity": 0.3 }, svg);
    el("line", { x1: ox, y1: padT, x2: ox, y2: size - pad,
      stroke: "currentColor", "stroke-opacity": 0.3 }, svg);

    for (const r of rows) {
      if (r.band) continue;
      el("circle", { cx: X(rawA(r)), cy: Y(rawB(r)), r: 2.6,
        fill: byGen ? ramp(maxGen ? r.generation / maxGen : 0) : "currentColor",
        "fill-opacity": byGen ? 0.5 : 0.16 }, svg);
    }
    const front = rows.filter((r) => r.band)
      .sort((p, q) => rawA(p) - rawA(q));
    if (front.length > 1) {
      el("polyline", {
        points: front.map((r) => X(rawA(r)) + "," + Y(rawB(r))).join(" "),
        fill: "none", stroke: "var(--good)", "stroke-width": 1.6,
        "stroke-opacity": 0.65, "stroke-dasharray": "4 3" }, svg);
    }
    for (const r of front) {
      el("circle", { cx: X(rawA(r)), cy: Y(rawB(r)),
        r: r.solution ? 5.5 : 4, fill: "var(--good)",
        stroke: r.solution ? "var(--accent)" : "none", "stroke-width": 2 }, svg);
    }

    const lab = (text, x, y, anchor) => {
      const t = el("text", { x, y, "text-anchor": anchor || "start" }, svg);
      t.textContent = text;
      return t;
    };
    lab(fmt(xlo), ox, size - pad + 13);
    lab(fmt(xhi), ox + w, size - pad + 13, "end");
    lab(fmt(ylo), ox - 5, size - pad, "end");
    lab(fmt(yhi), ox - 5, padT + 8, "end");
    const xt = lab(
      (objs[ai].goal === "maximize" ? "↑ " : "↓ ") + short(objs[ai].metric),
      ox + w / 2, size - pad + 26, "middle");
    xt.setAttribute("class", "axis-title");
    const yt = lab(
      (objs[bi].goal === "maximize" ? "↑ " : "↓ ") + short(objs[bi].metric),
      0, 0, "middle");
    yt.setAttribute("class", "axis-title");
    yt.setAttribute("transform",
      "translate(" + (ox - 32) + "," + (padT + h / 2) + ") rotate(-90)");
  });

  const nFront = rows.filter((r) => r.band).length;
  $("paretoLegend").textContent =
    nFront + " of " + rows.length + " cells on the front · " +
    "green = front, ringed = exported as a preset";
}

// ── sensitivity ──
function drawSens() {
  const metric = $("sensMetric").value;
  const rowsS = D.sensitivity.filter((s) => s.metric === metric)
    .sort((a, b) => Math.abs(b.perSigma) - Math.abs(a.perSigma));
  const host = $("sens");
  if (!rowsS.length) { host.innerHTML = '<div class="empty">Not enough cells to fit.</div>'; return; }
  const max = Math.max(...rowsS.map((s) => Math.abs(s.perSigma))) || 1;
  host.innerHTML = "<table><tbody>" + rowsS.map((s) => {
    const w = (Math.abs(s.perSigma) / max) * 100;
    // Direction, not judgement: whether raising this knob raises or lowers
    // the metric is the fact; whether that is good is the reader's call.
    const color = s.perSigma >= 0 ? "#d99b1e" : "#3d7fb8";
    return "<tr><td>" + s.param + "</td>" +
      '<td style="width:60%"><span class="bar" style="width:' + w.toFixed(1) +
      '%;background:' + color + '"></span></td>' +
      "<td>" + (s.perSigma >= 0 ? "+" : "−") + fmt(Math.abs(s.perSigma)) + "</td>" +
      '<td class="pill">r ' + s.r.toFixed(2) + "</td></tr>";
  }).join("") + "</tbody></table>";
}

// ── solutions ──
function drawSolutions() {
  const host = $("solutions");
  if (!D.solutions.length) {
    host.innerHTML = '<div class="empty">No cell satisfied every target and constraint.</div>';
    return;
  }
  host.innerHTML = "<table><thead><tr><th>preset</th>" +
    D.axes.map((a) => "<th>" + a + "</th>").join("") +
    D.metrics.map((m) => "<th>" + short(m) + "</th>").join("") +
    "<th>overrides</th></tr></thead><tbody>" +
    D.solutions.map((s) => {
      const row = D.rows.find((r) => r.id === s.id);
      const flags = Object.entries(s.overrides)
        .map(([k, v]) => "--override " + k + "=" + v).join(" ");
      return "<tr class='solution'><td>" + (s.preset ?? "—") + "</td>" +
        D.axes.map((a) => "<td>" + fmt(row.params[a]) + "</td>").join("") +
        D.metrics.map((m) => "<td>" + fmt(row.metrics[m]) + "</td>").join("") +
        '<td><button data-copy="' + flags.replace(/"/g, "&quot;") + '">copy flags</button></td></tr>';
    }).join("") + "</tbody></table>";
  host.querySelectorAll("button[data-copy]").forEach((b) => {
    b.onclick = () => {
      navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = "copied";
      setTimeout(() => (b.textContent = "copy flags"), 1200);
    };
  });
}

// ── table ──
let sortKey = "score", sortDir = 1;
function drawTable() {
  const only = $("onlyBrushed").checked;
  const sel = new Set(brushed().map((r) => r.id));
  let list = D.rows.filter((r) => !only || sel.has(r.id));
  const get = (r, k) =>
    k === "score" ? r.score : (k in r.params ? r.params[k] : r.metrics[k]);
  list = [...list].sort((a, b) => {
    const va = get(a, sortKey), vb = get(b, sortKey);
    if (typeof va === "string" || typeof vb === "string")
      return String(va).localeCompare(String(vb)) * sortDir;
    return ((va ?? 0) - (vb ?? 0)) * sortDir;
  });
  const cols = [...D.axes, ...D.allMetrics];
  $("tableWrap").innerHTML =
    "<table><thead><tr>" +
    (D.targets.length ? "<th data-k='score'>score</th>" : "") +
    cols.map((c) => "<th data-k='" + c + "'>" + short(c) + "</th>").join("") +
    "</tr></thead><tbody>" +
    list.map((r) => "<tr class='" + (r.failed ? "failed" : r.solution ? "solution" : r.band ? "band" : "") + "'>" +
      (D.targets.length ? "<td>" + fmt(r.score) + "</td>" : "") +
      cols.map((c) => "<td>" + fmt(get(r, c)) + "</td>").join("") + "</tr>").join("") +
    "</tbody></table>";
  $("tableWrap").querySelectorAll("th[data-k]").forEach((th) => {
    th.onclick = () => {
      const k = th.dataset.k;
      sortDir = sortKey === k ? -sortDir : 1;
      sortKey = k;
      drawTable();
    };
  });
}

function redraw() {
  drawPcp();
  drawScatter();
  drawTable();
  const n = brushed().length;
  $("selCount").textContent = brushes.size
    ? n + " of " + rows.length + " cells brushed"
    : rows.length + " cells";
}

colorSelect.onchange = redraw;
$("scatterMetric").onchange = drawScatter;
$("sensMetric").onchange = drawSens;
$("clearBrush").onclick = () => { brushes.clear(); redraw(); };
$("onlyBrushed").onchange = drawTable;

$("colorByGen").onchange = drawPareto;

drawPareto();
drawSens();
drawSolutions();
redraw();
</script>
</body>
</html>
`;
}
