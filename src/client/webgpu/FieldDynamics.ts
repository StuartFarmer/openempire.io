import { link } from "wesl";
import { LAYER_NAMES } from "../../core/game/MapLayers";
import { SHARED_WESL } from "../lab/shared";
import { linkDerivation, type DerivationPass } from "./FieldDerivation";
import type {
  FieldBufferSpec,
  FieldFrame,
  FieldKernel,
  FieldKernelConfig,
  FieldPassSpec,
} from "./FieldKernel";
import type { FieldPrepareHook, MapInputSpec } from "./MapInputs";
import { KERNEL_WESL } from "./WeslKernel";

// FieldDynamics: everything per-tile is a LAYER, and every layer has the same
// interface. See docs/FieldDynamics.md.
//
// A system is a folder: a TS manifest (params, scalars, brushes, views,
// players — pure data) plus one WESL file per DYNAMIC layer under `layers/`.
// Map planes (crop, metal, oil, temperature, humidity, water, land) are
// read-only f32 layers that exist without a file. A module imports the
// registries it uses —
//
//   import package::params;
//   import package::layers;
//   import package::players;
//   import package::sim;
//
// — and reads through qualified paths with one uniform, class-like API:
//
//   params::herdBirth()                      tunable param (live slider)
//   layers::grass::val(i)                    value at a tile index
//   layers::grass::at(x, y)                  clamped read by coordinates
//   layers::grass::sum8/avg8/max8/min8(x, y) neighbor reductions (f32 layers)
//   layers::owner::count8_eq(x, y, id)       id-layer neighbor helpers
//   layers::owner::any8_ne(x, y, id)         (u32/i32 layers)
//   players::val(p).targetX / players::count()  per-player CPU-written inputs
//   sim::tick() / sim::rand(x, y) / sim::noise(x, y, f, o)
//   sim::scalar_<name>() / sim::scalar_<name>(p)  reduce values (p = grouped)
//
// A dynamic layer's TYPE is the return type of its `fn init` (f32, u32, or
// i32) — an `owner` layer is `fn init(...) -> u32`. All layer reads are
// previous-tick; `update` returns the next value. The imports + qualified
// references are the dependency declaration: the compiler scans them (nothing
// else) to derive bindings, generates the registry modules with the assigned
// binding indices, wraps the transition in a dispatch root, and links with
// wesl.
//
// Update semantics are synchronous (Jacobi) by default; the manifest's
// `phases` opts into staged (Gauss-Seidel) commits.

export interface FieldParamSpec {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Driven by the page, not the user: kept out of the generated slider UI.
   *  Use for animated/derived uniforms (fades, transitions) that would be
   *  fought over if a slider also wrote them. */
  hidden?: boolean;
}

export type FieldLayerType = "f32" | "u32" | "i32";

export type FieldReduceOp = "sum" | "max" | "min" | "count";

export interface FieldReduceSpec {
  reduce: FieldReduceOp;
  /** Layer whose values reduce. Required for sum/max/min; absent for count. */
  layer?: string;
  /**
   * Group the reduce per player: the named u32/i32 dynamic layer holds the
   * group id per tile (e.g. "owner"), and the scalar becomes an array of
   * `players.count` values. Requires the `players` block.
   */
  groupBy?: string;
}

export interface FieldBrushSpec {
  /** Must be a dynamic layer (map layers are read-only). */
  target: string;
  mode: "set" | "add";
  value: number;
  radius: number;
}

export interface FieldViewSpec {
  /** Show any layer directly… */
  layer?: string;
  /**
   * …or a `.wesl` module path or raw source. Export `fn value(x, y, i) -> f32`
   * (mapped through the ramp) or `fn color(x, y, i) -> vec4f` (full-color view
   * — you own the pixels; ramp/oceanMask don't apply; alpha is yours to carry
   * flags in).
   */
  source?: string;
  /** Hex color stops, evenly spaced. Required unless the source exports fn color. */
  ramp?: readonly string[];
  /** Paint non-land tiles a fixed water color (default true). */
  oceanMask?: boolean;
}

export interface FieldPlayersSpec {
  /** Number of player slots (group ids run 0..count-1). */
  count: number;
  /** Per-player input fields, CPU-written via writePlayers(). */
  fields: Record<string, "f32" | "u32">;
}

/** Context handed to a system's `input` hook for one gesture. Pointer
 * gestures are already resolved to map-tile coordinates by the viewer's camera
 * transform. (codify-game-systems) */
export interface InputContext {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly running: boolean;
  /** The human's player slot (0 by convention). */
  readonly localPlayer: number;
  /** Stamp a declared brush at a tile — runs the existing brush pass. */
  stamp(brush: string, x: number, y: number): void;
  /** Merge fields into a player's next intent (flushed via writePlayers). */
  setPlayer(p: number, fields: Record<string, number>): void;
}

/** A system's input mapping — pointer/key gestures → brush stamps or player
 * intents. A handler returns `true` when it consumes the gesture, so the viewer
 * can fall back to its default handling (camera pan/zoom/hover, brush paint)
 * when the system does not. */
export interface SystemInput {
  onTile?(
    ctx: InputContext,
    x: number,
    y: number,
    ev: PointerEvent,
  ): boolean | void;
  onKey?(ctx: InputContext, ev: KeyboardEvent): boolean | void;
  /** CSS cursor hint over the map. */
  cursor?: string;
}

/** Context handed to a system's `ai.decide` on its cadence. */
export interface AIContext {
  readonly playerCount: number;
  readonly tick: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  /** The human slot to skip. */
  readonly localPlayer: number;
  /** Last scalar readback (per-player arrays for groupBy scalars). */
  readonly scalars: Record<string, number | number[]>;
  /** Deterministic-ish rng for AI jitter (seeded by tick). */
  rand(): number;
  /** Write player p's next intent (flushed via writePlayers). */
  setPlayer(p: number, fields: Record<string, number>): void;
}

/** A system's bot driver — writes non-human players' intents on a schedule. */
export interface SystemAI {
  /** Re-decide every N ticks (default 40 — ~4s at 10/s). */
  cadenceTicks?: number;
  decide(ctx: AIContext): void;
}

export interface FieldSystem {
  id: string;
  name: string;
  /** Human-readable one-liner for the viewer. */
  description?: string;
  /** "study" (a field/CA experiment) or "game" (players + ai + win state).
   * Informs default viewer chrome; default "study". */
  kind?: "study" | "game";
  /** Initial map (GameMapType key) and view when the system is selected. */
  defaultMap?: string;
  defaultView?: string;
  /** Pointer/key → brush/intent mapping (TS hook, out of the JSON-safe core). */
  input?: SystemInput;
  /** Non-human player driver (TS hook, out of the JSON-safe core). */
  ai?: SystemAI;
  params?: Record<string, FieldParamSpec>;
  scalars?: Record<string, FieldReduceSpec>;
  brushes?: Record<string, FieldBrushSpec>;
  views: Record<string, FieldViewSpec>;
  players?: FieldPlayersSpec;
  /**
   * Optional staged update ordering. Default (omitted): every layer updates
   * in one synchronous step — all reads see the previous tick, order is
   * meaningless (Jacobi). With phases, each group commits before the next
   * runs, so later phases read earlier phases' CURRENT-tick values
   * (Gauss-Seidel staging): `phases: [["food"], ["population", "labor"]]`.
   * Within a phase, updates stay synchronous. Updated layers not listed run
   * in a final implicit phase.
   */
  phases?: readonly (readonly string[])[];
  /**
   * Optional ON-DEMAND derivation pipeline (unify-field-viewer): an algorithm
   * — not a per-tick sim — run at load (and re-run on parameter change) that
   * produces derived fields from map inputs. Expresses the worldgen and any
   * one-shot GPU pipeline via `iterate`, single-dispatch passes, atomic global
   * reductions, and scratch buffers. Absent = a pure per-tick system (the lab
   * default). See `runDerive` on the compiled system.
   */
  derive?: FieldDeriveSpec;
  /**
   * WESL sources keyed by system-relative path. Dynamic layers are discovered
   * from `layers/<name>.wesl`; `lib/**` and `views/**` are importable as
   * `package::lib::…` / `package::views::…`. Derivation pass bodies live under
   * `passes/<name>.wesl` (imported as `package::passes::<name>`).
   */
  modules: Record<string, string>;
}

/** A field produced or consumed by the derivation: a scratch/derived buffer
 * (default grid-sized f32) or a fixed-size accumulator (e.g. a 256-bin
 * histogram, a Globals struct). Cleared before each derivation run so the
 * pipeline is reproducible. */
export interface FieldDerivedSpec {
  type: FieldLayerType;
  /** Element count. Default: the grid (width×height). Set for fixed-size
   * accumulators/globals (e.g. 256 histogram bins, 4-word globals). */
  count?: number;
  /** Ping-pong for iterated passes; inferred true when a step advances it. */
  pingPong?: boolean;
  /** Expose this derived field to the per-tick layer registry as a READ-ONLY
   * input (add-games-on-terrain): a composed game's `layers/*.wesl` read it via
   * `layers::<name>`, exactly like a `layers.bin` plane. Shadows a same-named
   * map plane (the rich derived value wins). Writing it from a game is an
   * error. */
  exposed?: boolean;
  /** Allow `kernel.readBuffer(name)` to copy this field back to the CPU.
   * Derivation output is normally consumed on the GPU (a view samples it, or a
   * game layer reads it via `exposed`), so this is off by default — it costs
   * the buffer a COPY_SRC usage. Turn it on to verify a derivation against a
   * CPU reference, or where the simulation genuinely needs the per-tile values
   * back rather than an aggregate. */
  readable?: boolean;
}

/** One step of the derivation pipeline — a linked WESL pass (grid or single),
 * optionally iterated to convergence. Binds use FieldDerivation's grammar
 * (`name`, `name!`, `name.read`/`.write`, `x:Type!`, `P`, `out`). */
export interface FieldDeriveStep {
  /** Pass body module: `package::passes::<pass>`. */
  pass: string;
  /** Dispatch name (defaults to `pass`); referenced by the derivation program. */
  name?: string;
  binds: readonly string[];
  kind?: "grid" | "single";
  /** Repeat this pass N times (ping-pong) — flood/fill/flow convergence. */
  iterate?: number;
  /** Ping-pong buffers advanced after the pass runs. */
  advances?: readonly string[];
  /** Two-tier reactivity (unify-field-viewer 1.6/2.3): the named partial runs
   * this step belongs to, for cheap re-derivation that reuses settled buffers.
   * The full run (`runDerive(frame)` with no tier) always includes every step;
   * `runDerive(frame, "recolor")` runs only steps whose `tiers` include
   * "recolor" (skipping the expensive iterated fill/flow). A step in no tier is
   * full-run-only (e.g. the depression fill). Order is the declared step order. */
  tiers?: readonly string[];
}

export interface FieldDeriveSpec {
  /** All derivation buffers — map inputs (uploaded), scratch, and derived. */
  fields: Record<string, FieldDerivedSpec>;
  /** The ordered pipeline. */
  steps: readonly FieldDeriveStep[];
  /** WESL import line for the shared struct types the passes reference
   * (e.g. `import package::types::{Params, Globals, GlobalsAtomic};`). */
  typeImports: string;
  /** Custom uniform layout, when the derivation passes own their own Params
   * struct (via typeImports) instead of the manifest-generated one — e.g.
   * reusing the worldgen's Params. `bytes` sizes the buffer, `wgslType` names
   * the struct. `name` is the KERNEL uniform name (default "P"); set it to a
   * distinct name (e.g. "TP") so a composed game keeps "P" for its own params —
   * the derivation passes still read the uniform as `P` (bound by index). The
   * system encodes it externally (`kernel.writeUniform(name, …)`). Omit the
   * whole block to use the generated Params from the manifest `params`. */
  uniform?: { wgslType: string; bytes: number; name?: string };
  /** Declared map inputs (unify-field-viewer phase 3): for each input field,
   * which sidecar plane fills it and how it decodes. `loadMapInputs` reads this
   * to reproduce the hand-written decode generically. Fields not listed here
   * are scratch/derived (written by the passes, not uploaded). */
  inputs?: Record<string, MapInputSpec>;
  /** CPU hook producing inputs a sidecar can't give directly (the
   * connected-components water mask). Runs after sidecar decode; see
   * `FieldPrepareHook`. */
  prepare?: FieldPrepareHook;
}

/** Normalize an import.meta.glob record (keys like "./layers/x.wesl") into a system's modules. */
export function defineFieldSystem(
  system: Omit<FieldSystem, "modules"> & {
    modules: Record<string, string>;
  },
): FieldSystem {
  return {
    ...system,
    modules: Object.fromEntries(
      Object.entries(system.modules).map(([path, source]) => [
        path.replace(/^\.\//, ""),
        source,
      ]),
    ),
  };
}

export interface CompiledFieldSystem {
  system: FieldSystem;
  kernelConfig: FieldKernelConfig;
  paramList: readonly {
    name: string;
    value: number;
    min: number;
    max: number;
    step: number;
    hidden: boolean;
  }[];
  viewNames: readonly string[];
  brushNames: readonly string[];
  scalarNames: readonly string[];
  /** Dynamic layers (state migrates across recompiles). */
  layerNames: readonly string[];
  /** Map-plane layers referenced by any pass — the page uploads exactly these. */
  mapLayers: readonly string[];
  /** Player slots (0 when the system has no players block). */
  playerCount: number;
  writeParams(
    values: Readonly<Record<string, number>>,
    seed: number,
  ): ArrayBuffer;
  /** Encode per-player inputs; upload with kernel.writeBuffer("PL", …). */
  writePlayers(
    players: ReadonlyArray<Readonly<Record<string, number>>>,
  ): ArrayBuffer;
  encodeBrush(name: string, x: number, y: number, radius?: number): ArrayBuffer;
  decodeScalars(data: ArrayBuffer): {
    tick: number;
    values: Record<string, number | number[]>;
  };
  /** Derivation buffer fields (empty when the system has no `derive`). */
  derivedNames: readonly string[];
  runInit(frame: FieldFrame): void;
  runTick(kernel: FieldKernel, frame: FieldFrame): void;
  runView(frame: FieldFrame, view: string): void;
  /** Run the on-demand derivation pipeline (no-op without `derive`). With a
   * `tier` name, runs only the steps whose `tiers` include it (cheap
   * re-derivation reusing settled buffers); with no tier, the full pipeline. */
  runDerive(frame: FieldFrame, tier?: string): void;
  brushPass(name: string): string;
}

export class FieldDynamicsError extends Error {
  constructor(readonly diagnostics: readonly string[]) {
    super(diagnostics.join("\n"));
    this.name = "FieldDynamicsError";
  }
}

/** Read-only layers provided by the map; `land` derives from the terrain bits. */
// `land` derives from the terrain bit; `elevation` from the terrain
// magnitude bits (altitude on land, depth in water, both 0..1).
export const MAP_LAYER_NAMES: readonly string[] = [
  ...LAYER_NAMES,
  "land",
  "elevation",
];

// Fixed-point scale for sum reduces: ±8M range with 1/256 resolution keeps
// 1024²·value sums inside i32 while atomicAdd stays order-independent.
const SUM_FX = 256;
const IDENT = /^[A-Za-z_]\w*$/;
const SIM_ITEMS = ["tick", "rand", "noise"];
const RESERVED_LAYER_NAMES = new Set([
  ...MAP_LAYER_NAMES, // a dynamic layer may not shadow a map layer
  "P",
  "S",
  "B",
  "PL",
  "GRID",
  "PARAMS",
  "PLAYERS",
  "out",
  "out_field",
  "main",
  "init",
  "update",
  "value",
  "seed",
]);

// The user's transition files live in `layers/` on disk, but the generated
// per-layer STATE modules own the pretty `package::layers::<name>` path — so
// transitions are remapped to `dyn/` inside the link and error messages are
// mapped back.
const DYN_PREFIX = "dyn/";

// The uniform layer interface. Every layer gets a module differing only in
// element type and which buffer binding `data` points at: numeric (f32)
// layers get neighbor reductions; id (u32/i32) layers get equality helpers.
// Unused accessors are tree-shaken per pass.
function layerStateModule(binding: number, type: FieldLayerType): string {
  const decl = `
import package::kernel::{GRID, OFF, inBounds, refOf};

@group(0) @binding(${binding}) var<storage, read> data: array<${type}>;

fn val(i: u32) -> ${type} { return data[i]; }

fn at(px: i32, py: i32) -> ${type} {
  return data[refOf(clamp(px, 0, i32(GRID.size.x) - 1), clamp(py, 0, i32(GRID.size.y) - 1))];
}
`;
  if (type !== "f32") {
    return `${decl}
fn count8_eq(px: i32, py: i32, v: ${type}) -> u32 {
  var n = 0u;
  for (var k = 0; k < 8; k += 1) {
    let q = vec2i(px, py) + OFF[k];
    if (!inBounds(q.x, q.y)) { continue; }
    if (data[refOf(q.x, q.y)] == v) { n += 1u; }
  }
  return n;
}

fn any8_ne(px: i32, py: i32, v: ${type}) -> bool {
  for (var k = 0; k < 8; k += 1) {
    let q = vec2i(px, py) + OFF[k];
    if (!inBounds(q.x, q.y)) { continue; }
    if (data[refOf(q.x, q.y)] != v) { return true; }
  }
  return false;
}
`;
  }
  const neighbor = (
    name: string,
    init: string,
    accumulate: string,
    result: string,
  ): string => `
fn ${name}(px: i32, py: i32) -> f32 {
  var total = 0.0;
  var best = ${init};
  var n = 0.0;
  for (var k = 0; k < 8; k += 1) {
    let q = vec2i(px, py) + OFF[k];
    if (!inBounds(q.x, q.y)) { continue; }
    ${accumulate}
    n += 1.0;
  }
  return ${result};
}`;
  return `${decl}
${neighbor("sum8", "0.0", "total += data[refOf(q.x, q.y)];", "total")}
${neighbor("avg8", "0.0", "total += data[refOf(q.x, q.y)];", "select(0.0, total / n, n > 0.0)")}
${neighbor("max8", "-3.40282e38", "best = max(best, data[refOf(q.x, q.y)]);", "select(0.0, best, n > 0.0)")}
${neighbor("min8", "3.40282e38", "best = min(best, data[refOf(q.x, q.y)]);", "select(0.0, best, n > 0.0)")}
`;
}

/** One Sim buffer slot group: an ungrouped scalar (1 word) or a per-player array. */
interface ScalarSlot {
  name: string;
  spec: FieldReduceSpec;
  member: string;
  base: "i32" | "u32";
  offsetWords: number;
  words: number;
}

/** What a wesl module uses, from its imports and qualified references. */
interface ImportsUse {
  params: boolean;
  players: boolean;
  simItems: Set<string>; // tick | rand | noise | scalar_<name>
  layers: Set<string>;
}

export async function compileFieldSystem(
  system: FieldSystem,
): Promise<CompiledFieldSystem> {
  const diagnostics: string[] = [];
  const params = Object.entries(system.params ?? {});
  const scalars = Object.entries(system.scalars ?? {});
  const brushes = Object.entries(system.brushes ?? {});
  const views = Object.entries(system.views);
  const sourceModules = {
    ...system.modules,
    ...Object.fromEntries(
      views.flatMap(([name, spec]) =>
        spec.source !== undefined && !(spec.source in system.modules)
          ? [[`views/${name}.wesl`, spec.source]]
          : [],
      ),
    ),
  };
  const playersSpec = system.players ?? null;
  const playerCount = playersSpec?.count ?? 0;
  const playerFields = Object.entries(playersSpec?.fields ?? {});

  // --- discover dynamic layers (type = fn init return type) -----------------
  const layerFiles = Object.keys(sourceModules)
    .map((path) => /^layers\/([^/]+)\.wesl$/.exec(path))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => {
      const path = match[0];
      const source = sourceModules[path];
      const initType = /fn\s+init\s*\([^)]*\)\s*->\s*(\w+)/.exec(source)?.[1];
      const updateType = /fn\s+update\s*\([^)]*\)\s*->\s*(\w+)/.exec(
        source,
      )?.[1];
      return {
        path,
        name: match[1],
        type: (initType ?? "f32") as FieldLayerType,
        initType,
        updateType,
        hasUpdate: /\bfn\s+update\b/.test(source),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const dynamicLayers = new Map(layerFiles.map((f) => [f.name, f.type]));
  // Terrain-base fields exposed to the layer registry as read-only inputs
  // (add-games-on-terrain). They SHADOW a same-named map plane. Ping-pong is
  // inferred from the derive steps' `advances` (settled `.read` on read).
  const deriveAdvancedEarly = new Set<string>(
    system.derive?.steps.flatMap((s) => s.advances ?? []) ?? [],
  );
  const exposedDerive = new Map<
    string,
    { type: FieldLayerType; ping: boolean }
  >();
  for (const [name, spec] of Object.entries(system.derive?.fields ?? {})) {
    if (spec.exposed) {
      exposedDerive.set(name, {
        type: spec.type,
        ping: spec.pingPong ?? deriveAdvancedEarly.has(name),
      });
    }
  }
  const isLayer = (name: string): boolean =>
    dynamicLayers.has(name) ||
    exposedDerive.has(name) ||
    MAP_LAYER_NAMES.includes(name);
  // Exposed terrain fields take precedence over a same-named map plane.
  const typeOf = (name: string): FieldLayerType =>
    dynamicLayers.get(name) ?? exposedDerive.get(name)?.type ?? "f32";
  /** Bind ref for reading a layer: ping-pong facet for dynamic + advanced
   * terrain fields, static for map planes and single terrain fields. */
  const readBind = (name: string): string => {
    if (dynamicLayers.has(name)) return `${name}.read`;
    const ex = exposedDerive.get(name);
    if (ex) return ex.ping ? `${name}.read` : name;
    return name;
  };
  const updatedSet = new Set(
    layerFiles.filter((f) => f.hasUpdate).map((f) => f.name),
  );

  // --- validation -------------------------------------------------------------
  for (const file of layerFiles) {
    if (!IDENT.test(file.name) || RESERVED_LAYER_NAMES.has(file.name)) {
      diagnostics.push(
        `${file.path}: layer name "${file.name}" is invalid or reserved`,
      );
    }
    if (exposedDerive.has(file.name)) {
      diagnostics.push(
        `${file.path}: layer "${file.name}" shadows a read-only terrain field — rename it`,
      );
    }
    if (file.initType === undefined) {
      diagnostics.push(
        `${file.path}: must define "fn init(x: i32, y: i32, i: u32) -> <f32|u32|i32>" — the return type is the layer's type`,
      );
    } else if (!["f32", "u32", "i32"].includes(file.initType)) {
      diagnostics.push(
        `${file.path}: init returns "${file.initType}" — layers are f32, u32, or i32`,
      );
    }
    if (
      file.hasUpdate &&
      file.updateType !== undefined &&
      file.initType !== undefined &&
      file.updateType !== file.initType
    ) {
      diagnostics.push(
        `${file.path}: update returns "${file.updateType}" but init returns "${file.initType}" — a layer has one type`,
      );
    }
  }
  if (layerFiles.length === 0 && system.derive === undefined) {
    diagnostics.push(
      'system has no layers or derivation — add "layers/<name>.wesl" files or a "derive" block',
    );
  }
  for (const name of Object.keys(system.params ?? {})) {
    if (!IDENT.test(name) || ["seed", "PARAMS", "Params"].includes(name)) {
      diagnostics.push(`params.${name}: invalid or reserved name`);
    }
  }
  if (playersSpec) {
    if (playerCount < 1 || playerCount > 256) {
      diagnostics.push("players.count must be 1..256");
    }
    if (playerFields.length === 0) {
      diagnostics.push("players.fields must declare at least one field");
    }
    for (const [name] of playerFields) {
      if (!IDENT.test(name) || ["val", "count"].includes(name)) {
        diagnostics.push(`players.fields.${name}: invalid or reserved name`);
      }
    }
  }
  for (const [name, spec] of scalars) {
    if (!IDENT.test(name) || name === "tick") {
      diagnostics.push(`scalars.${name}: invalid or reserved name`);
    }
    if (spec.reduce === "count") {
      if (spec.layer !== undefined) {
        diagnostics.push(
          `scalars.${name}: "count" reduces tiles, not a layer — drop "layer"`,
        );
      }
    } else if (spec.layer === undefined || !isLayer(spec.layer)) {
      diagnostics.push(
        `scalars.${name}: "${spec.layer ?? ""}" is not a layer (sum/max/min need one)`,
      );
    }
    if (spec.groupBy !== undefined) {
      if (!playersSpec) {
        diagnostics.push(
          `scalars.${name}: groupBy requires the "players" block (it sizes the per-player array)`,
        );
      }
      const groupType = dynamicLayers.get(spec.groupBy);
      if (groupType === undefined || groupType === "f32") {
        diagnostics.push(
          `scalars.${name}: groupBy "${spec.groupBy}" must be a u32/i32 dynamic layer (group ids)`,
        );
      }
    }
  }
  for (const [name, spec] of brushes) {
    if (!dynamicLayers.has(spec.target)) {
      diagnostics.push(
        MAP_LAYER_NAMES.includes(spec.target)
          ? `brushes.${name}: "${spec.target}" is a map layer (read-only)`
          : `brushes.${name}: target "${spec.target}" is not a dynamic layer`,
      );
    }
  }

  // --- staged update ordering -------------------------------------------------
  const declaredPhases = system.phases ?? [];
  const phased = new Set<string>();
  declaredPhases.forEach((phase, index) => {
    for (const name of phase) {
      if (!updatedSet.has(name)) {
        diagnostics.push(
          dynamicLayers.has(name)
            ? `phases[${index}]: "${name}" has no update function`
            : `phases[${index}]: "${name}" is not a dynamic layer`,
        );
        continue;
      }
      if (phased.has(name)) {
        diagnostics.push(`phases[${index}]: "${name}" appears more than once`);
        continue;
      }
      phased.add(name);
    }
  });
  // Updated layers not listed run together in a final implicit phase.
  const updatePhases: string[][] = [
    ...declaredPhases.map((phase) => phase.filter((name) => phased.has(name))),
    [...updatedSet].filter((name) => !phased.has(name)).sort(),
  ].filter((phase) => phase.length > 0);
  // Inits run in phase order (static layers first) so later phases' inits can
  // read earlier layers' initialized values.
  const phaseIndex = new Map(
    updatePhases.flatMap((phase, index) =>
      phase.map((name) => [name, index] as const),
    ),
  );
  const initOrder = [...layerFiles].sort((a, b) => {
    const pa = phaseIndex.get(a.name) ?? -1;
    const pb = phaseIndex.get(b.name) ?? -1;
    return pa - pb || a.name.localeCompare(b.name);
  });

  // --- generated structs --------------------------------------------------------
  const paramMembers = [
    ...params.map(([name]) => `  ${name}: f32,`),
    "  seed: i32,",
  ];
  while ((paramMembers.length * 4) % 16 !== 0) {
    paramMembers.push(`  pad${paramMembers.length}: u32,`);
  }
  const paramsBytes = paramMembers.length * 4;
  const paramsStruct = `struct Params {\n${paramMembers.join("\n")}\n}`;

  // Sim slots: ungrouped scalars take one word; grouped take playerCount.
  let offsetWords = 1; // word 0 = tick
  const scalarSlots: ScalarSlot[] = scalars.map(([name, spec]) => {
    const grouped = spec.groupBy !== undefined;
    const base =
      spec.reduce === "sum" || spec.reduce === "count" ? "i32" : "u32";
    const member = base === "i32" ? `${name}_fx` : (`${name}_bits` as string);
    const slot: ScalarSlot = {
      name,
      spec,
      member,
      base,
      offsetWords,
      words: grouped ? Math.max(1, playerCount) : 1,
    };
    offsetWords += slot.words;
    return slot;
  });
  const simWords = offsetWords;

  const simStruct = (atomic: boolean): string =>
    `struct ${atomic ? "SimAtomic" : "Sim"} {\n  tick: u32,\n${scalarSlots
      .map((slot) => {
        const element = atomic ? `atomic<${slot.base}>` : slot.base;
        const type =
          slot.spec.groupBy !== undefined
            ? `array<${element}, ${slot.words}>`
            : element;
        return `  ${slot.member}: ${type},`;
      })
      .join("\n")}\n}`;

  const playerStruct = playersSpec
    ? `struct Player {\n${playerFields
        .map(([name, type]) => `  ${name}: ${type},`)
        .join("\n")}\n}`
    : "";

  // Prelude for the generated (non-WESL) passes: zero/reduce/brush/view.
  const generatedPrelude = `
${paramsStruct}

${simStruct(false)}

${simStruct(true)}

struct Brush {
  x: f32,
  y: f32,
  radius: f32,
  value: f32,
  mode: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
}
`;

  // --- import + reference scanning -----------------------------------------------
  const parseImports = (path: string): ImportsUse => {
    const use: ImportsUse = {
      params: false,
      players: false,
      simItems: new Set(),
      layers: new Set(),
    };
    const stripped = sourceModules[path]
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const namespaceAliases = new Map<
      string,
      "layers" | "params" | "sim" | "players"
    >();

    const registerItem = (
      registry: "layers" | "params" | "sim" | "players",
      item: string,
    ): void => {
      switch (registry) {
        case "layers": {
          if (!isLayer(item)) {
            diagnostics.push(
              `${path}: "${item}" is not a layer (dynamic: ${[...dynamicLayers.keys()].join(", ") || "none"}; map: ${MAP_LAYER_NAMES.join(", ")})`,
            );
            return;
          }
          use.layers.add(item);
          return;
        }
        case "params": {
          if (item !== "seed" && !params.some(([name]) => name === item)) {
            diagnostics.push(
              `${path}: "params::${item}" is not a declared param (${[...params.map(([n]) => n), "seed"].join(", ")})`,
            );
            return;
          }
          use.params = true;
          return;
        }
        case "players": {
          if (!playersSpec) {
            diagnostics.push(
              `${path}: package::players requires the "players" block in the manifest`,
            );
            return;
          }
          if (!["val", "count"].includes(item)) {
            diagnostics.push(
              `${path}: players has no item "${item}" (val, count)`,
            );
            return;
          }
          use.players = true;
          return;
        }
        case "sim": {
          const scalarMatch = /^scalar_(\w+)$/.exec(item);
          if (scalarMatch && !system.scalars?.[scalarMatch[1]]) {
            diagnostics.push(
              `${path}: "sim::${item}" — "${scalarMatch[1]}" is not a declared scalar`,
            );
            return;
          }
          if (!scalarMatch && !SIM_ITEMS.includes(item)) {
            diagnostics.push(
              `${path}: sim has no item "${item}" (${SIM_ITEMS.join(", ")}, scalar_<name>)`,
            );
            return;
          }
          use.simItems.add(item);
          if (item === "rand" || item === "noise") use.params = true;
          return;
        }
      }
    };

    let body = stripped;
    for (const statement of stripped.matchAll(/\bimport\s+([^;]+);/g)) {
      body = body.replace(statement[0], "");
      const text = statement[1].replace(/\s+/g, " ").trim();
      const namespaced =
        /^package::(layers|params|sim|players|layer|param|api)(?:::(.+))?(?:\s+as\s+\w+)?$/.exec(
          text,
        );
      if (!namespaced) continue; // kernel/lib/views/super: wesl handles it
      const [, registryRaw, rest] = namespaced;
      if (["layer", "param", "api"].includes(registryRaw)) {
        diagnostics.push(
          `${path}: package::${registryRaw} is gone — import package::layers / package::params / package::sim / package::players and use qualified paths`,
        );
        continue;
      }
      const registry = registryRaw as "layers" | "params" | "sim" | "players";
      if (rest === undefined || /^as \w+$/.test(rest.trim())) {
        const aliasMatch = /\bas\s+(\w+)\s*$/.exec(text);
        namespaceAliases.set(aliasMatch?.[1] ?? registry, registry);
        continue;
      }
      const itemsText = rest.replace(/\s+as\s+\w+\s*$/, "");
      const items = itemsText.startsWith("{")
        ? itemsText.replace(/[{}]/g, "").split(",")
        : [itemsText];
      for (const rawItem of items) {
        const item = rawItem
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
          .split("::")[0];
        if (item === "") continue;
        if (item === "*") {
          diagnostics.push(
            `${path}: wildcard imports from package::${registry} are not supported`,
          );
          continue;
        }
        registerItem(registry, item);
      }
    }

    const scanQualified = (
      alias: string,
      registry: "layers" | "params" | "sim" | "players",
    ): void => {
      const pattern =
        registry === "layers"
          ? new RegExp(`\\b${alias}::(\\w+)::`, "g")
          : new RegExp(`\\b${alias}::(\\w+)`, "g");
      for (const match of body.matchAll(pattern)) {
        registerItem(registry, match[1]);
      }
    };
    for (const [alias, registry] of namespaceAliases) {
      scanQualified(alias, registry);
    }
    scanQualified("package::layers", "layers");
    scanQualified("package::params", "params");
    scanQualified("package::sim", "sim");
    scanQualified("package::players", "players");

    return use;
  };

  // --- generated registry modules per linked pass -----------------------------------
  const needsSimBinding = (use: ImportsUse): boolean =>
    [...use.simItems].some((item) => item !== "noise");

  // Canonical binding order: GRID(0), P, S, PL, layers sorted by name, then
  // the pass-specific write/out targets appended by the root builder.
  const bindsFor = (use: ImportsUse): string[] => [
    ...(use.params ? ["P"] : []),
    ...(needsSimBinding(use) ? ["S:Sim"] : []),
    ...(use.players ? ["PL"] : []),
    ...[...use.layers].sort().map(readBind),
  ];

  const generatedModulesFor = (use: ImportsUse): Record<string, string> => {
    const binds = bindsFor(use);
    const indexOf = (ref: string): number => binds.indexOf(ref) + 1;
    const modules: Record<string, string> = {};

    if (use.params) {
      modules["params.wesl"] = [
        paramsStruct,
        `@group(0) @binding(${indexOf("P")}) var<uniform> PARAMS: Params;`,
        `fn seed() -> i32 { return PARAMS.seed; }`,
        ...params.map(
          ([name]) => `fn ${name}() -> f32 { return PARAMS.${name}; }`,
        ),
      ].join("\n");
    }

    if (use.players && playersSpec) {
      modules["players.wesl"] = [
        playerStruct,
        `@group(0) @binding(${indexOf("PL")}) var<storage, read> PLAYERS: array<Player, ${playerCount}>;`,
        `fn val(p: u32) -> Player { return PLAYERS[min(p, ${playerCount - 1}u)]; }`,
        `fn count() -> u32 { return ${playerCount}u; }`,
      ].join("\n");
    }

    if (use.simItems.size > 0) {
      const parts: string[] = ["import package::kernel::{GRID, hash01, fbm};"];
      if (use.params) parts.push("import package::params::seed;");
      if (needsSimBinding(use)) {
        parts.push(
          simStruct(false),
          `@group(0) @binding(${indexOf("S:Sim")}) var<storage, read> S: Sim;`,
        );
      }
      for (const item of use.simItems) {
        if (item === "tick") {
          parts.push("fn tick() -> u32 { return S.tick; }");
        } else if (item === "rand") {
          parts.push(
            "fn rand(px: i32, py: i32) -> f32 { return hash01(seed() + i32(S.tick), px, py); }",
          );
        } else if (item === "noise") {
          parts.push(
            "fn noise(px: i32, py: i32, freq: f32, octaves: i32) -> f32 { return fbm(seed(), f32(px) / f32(GRID.size.x), f32(py) / f32(GRID.size.y), freq, octaves, 0.5); }",
          );
        } else {
          const name = item.slice("scalar_".length);
          const slot = scalarSlots.find((s) => s.name === name)!;
          const decode =
            slot.base === "i32"
              ? (expr: string) => `f32(${expr}) / ${SUM_FX}.0`
              : (expr: string) => `bitcast<f32>(${expr})`;
          parts.push(
            slot.spec.groupBy !== undefined
              ? `fn ${item}(p: u32) -> f32 { return ${decode(`S.${slot.member}[min(p, ${slot.words - 1}u)]`)}; }`
              : `fn ${item}() -> f32 { return ${decode(`S.${slot.member}`)}; }`,
          );
        }
      }
      modules["sim.wesl"] = parts.join("\n");
    }

    for (const layer of use.layers) {
      modules[`layers/${layer}.wesl`] = layerStateModule(
        indexOf(readBind(layer)),
        typeOf(layer),
      );
    }

    return modules;
  };

  // User modules enter the link with transition files remapped out of the
  // layers/ path (the generated state modules own it).
  const userModules = Object.fromEntries(
    Object.entries(sourceModules).map(([path, source]) => [
      path.replace(/^layers\//, DYN_PREFIX),
      source,
    ]),
  );
  const undynPath = (message: string): string =>
    message.replace(/(\.\/)?dyn\//g, "$1layers/");

  // --- linked (WESL) passes -----------------------------------------------------
  interface PendingLink {
    pass: Omit<FieldPassSpec, "code">;
    root: string;
    generated: Record<string, string>;
    sourcePath: string;
  }
  const pendingLinks: PendingLink[] = [];

  for (const file of layerFiles) {
    const use = parseImports(file.path);
    const binds = bindsFor(use);
    const generated = generatedModulesFor(use);
    const writeBinding = binds.length + 1;
    const rootFor = (entry: "init" | "update"): string => `
import package::dyn::${file.name}::${entry};
import package::kernel::{GRID, refOf};

@group(0) @binding(${writeBinding}) var<storage, read_write> out_field: array<${file.type}>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GRID.size.x || gid.y >= GRID.size.y) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  out_field[refOf(x, y)] = ${entry}(x, y, refOf(x, y));
}
`;
    pendingLinks.push({
      pass: {
        name: `init/${file.name}`,
        binds: [...binds, `${file.name}.write`],
        advances: [file.name],
        raw: true,
      },
      root: rootFor("init"),
      generated,
      sourcePath: file.path,
    });
    if (file.hasUpdate) {
      pendingLinks.push({
        pass: {
          name: `stock/${file.name}`,
          binds: [...binds, `${file.name}.write`],
          // No advances: phases commit via the tick program (synchronous
          // Jacobi within a phase — every update reads the previous tick).
          raw: true,
        },
        root: rootFor("update"),
        generated,
        sourcePath: file.path,
      });
    }
  }

  for (const [name, spec] of views) {
    if (spec.source === undefined) continue;
    const sourcePath =
      spec.source in system.modules ? spec.source : `views/${name}.wesl`;
    // A source view exports either `fn value` (ramped) or `fn color`
    // (full-color; the author owns the pixels).
    const isColorView = /\bfn\s+color\b/.test(sourceModules[sourcePath]);
    const use = parseImports(sourcePath);
    const wantsOceanMask = !isColorView && spec.oceanMask !== false;
    if (wantsOceanMask) use.layers.add("land");
    const binds = bindsFor(use);
    const generated = generatedModulesFor(use);
    const modulePath = `package::${sourcePath
      .replace(/\.wesl$/, "")
      .replace(/\//g, "::")}`;
    let root: string;
    if (isColorView) {
      root = `
import ${modulePath}::color;
import package::kernel::{GRID, refOf};

@group(0) @binding(${binds.length + 1}) var out_tex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GRID.size.x || gid.y >= GRID.size.y) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  textureStore(out_tex, vec2i(x, y), color(x, y, refOf(x, y)));
}
`;
    } else {
      const stops = rampStops(spec.ramp ?? [], `views.${name}`, diagnostics);
      root = `
import ${modulePath}::value;
import package::kernel::{GRID, refOf, clamp01};
${wantsOceanMask ? "import package::layers::land;" : ""}

@group(0) @binding(${binds.length + 1}) var out_tex: texture_storage_2d<rgba8unorm, write>;

var<private> RAMP: array<vec3f, ${stops.length}> = array<vec3f, ${stops.length}>(
  ${stops.join(",\n  ")},
);

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GRID.size.x || gid.y >= GRID.size.y) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let i = refOf(x, y);
  let v = clamp01(value(x, y, i));
  let t = v * ${stops.length - 1}.0;
  let s = min(u32(t), ${stops.length - 2}u);
  var color = mix(RAMP[s], RAMP[s + 1u], t - f32(s));
${wantsOceanMask ? "  if (land::val(i) == 0.0) { color = vec3f(0.055, 0.13, 0.20); }" : ""}
  textureStore(out_tex, vec2i(x, y), vec4f(color, 1.0));
}
`;
    }
    pendingLinks.push({
      pass: { name: `view/${name}`, binds: [...binds, "out"], raw: true },
      root,
      generated,
      sourcePath,
    });
  }

  // --- generated (non-WESL) passes -------------------------------------------------
  const passes: FieldPassSpec[] = [];

  passes.push({
    name: "sim/zero",
    binds: ["S:SimAtomic!"],
    kind: "single",
    code: `fn once() {\n  S.tick = S.tick + 1u;\n${scalarSlots
      .map((slot) => {
        const reset =
          slot.spec.reduce === "min"
            ? "0x7f7fffffu"
            : slot.base === "i32"
              ? "0"
              : "0u";
        return slot.spec.groupBy !== undefined
          ? `  for (var g = 0u; g < ${slot.words}u; g += 1u) { atomicStore(&S.${slot.member}[g], ${reset}); }`
          : `  atomicStore(&S.${slot.member}, ${reset});`;
      })
      .join("\n")}\n}`,
  });

  for (const slot of scalarSlots) {
    const { name, spec } = slot;
    if (
      spec.reduce !== "count" &&
      (spec.layer === undefined || !isLayer(spec.layer))
    ) {
      continue;
    }
    const readOf = (layer: string): string => {
      const raw = dynamicLayers.has(layer) ? `${layer}_in[i]` : `${layer}[i]`;
      return typeOf(layer) === "f32" ? raw : `f32(${raw})`;
    };
    const of = spec.reduce === "count" ? "1.0" : readOf(spec.layer!);
    const target =
      spec.groupBy !== undefined ? `S.${slot.member}[g]` : `S.${slot.member}`;
    const accumulate =
      spec.reduce === "sum" || spec.reduce === "count"
        ? `atomicAdd(&${target}, i32(clamp(${of}, -32768.0, 32767.0) * ${SUM_FX}.0));`
        : spec.reduce === "max"
          ? `atomicMax(&${target}, bitcast<u32>(max(${of}, 0.0)));`
          : `atomicMin(&${target}, bitcast<u32>(max(${of}, 0.0)));`;
    const grouped =
      spec.groupBy !== undefined
        ? `  let g = u32(${spec.groupBy}_in[i]);\n  if (g >= ${slot.words}u) { return; }\n`
        : "";
    const binds = [
      ...(spec.reduce !== "count" ? [readBind(spec.layer!)] : []),
      ...(spec.groupBy !== undefined && spec.groupBy !== spec.layer
        ? [readBind(spec.groupBy)]
        : []),
      "S:SimAtomic!",
    ];
    passes.push({
      name: `reduce/${name}`,
      binds,
      code: `fn tile(x: i32, y: i32, i: u32) {\n${grouped}  ${accumulate}\n}`,
    });
  }

  for (const [name, spec] of brushes) {
    if (!dynamicLayers.has(spec.target)) continue;
    const t = spec.target;
    const type = typeOf(t);
    const value = type === "f32" ? "B.value" : `${type}(B.value)`;
    passes.push({
      name: `brush/${name}`,
      binds: ["B", `${t}.read`, `${t}.write`],
      advances: [t],
      code: `
fn tile(x: i32, y: i32, i: u32) {
  var v = ${t}_in[i];
  let d = vec2f(f32(x) - B.x, f32(y) - B.y);
  if (dot(d, d) <= B.radius * B.radius) {
    v = select(${value}, v + ${value}, B.mode == 1u);
  }
  ${t}_out[i] = v;
}`,
    });
  }

  for (const [name, spec] of views) {
    if (spec.source !== undefined) continue;
    if (spec.layer === undefined || !isLayer(spec.layer)) {
      diagnostics.push(
        `views.${name}: needs "layer" (any layer) or "source" (a .wesl module)`,
      );
      continue;
    }
    const stops = rampStops(spec.ramp ?? [], `views.${name}`, diagnostics);
    const oceanMask = spec.oceanMask !== false;
    const raw = dynamicLayers.has(spec.layer)
      ? `${spec.layer}_in[i]`
      : `${spec.layer}[i]`;
    const read = typeOf(spec.layer) === "f32" ? raw : `f32(${raw})`;
    passes.push({
      name: `view/${name}`,
      binds: [
        readBind(spec.layer),
        ...(oceanMask && spec.layer !== "land" ? ["land"] : []),
        "out",
      ],
      code: `
var<private> RAMP: array<vec3f, ${stops.length}> = array<vec3f, ${stops.length}>(
  ${stops.join(",\n  ")},
);

fn tile(x: i32, y: i32, i: u32) {
  let v = clamp01(${read});
  let t = v * ${stops.length - 1}.0;
  let s = min(u32(t), ${stops.length - 2}u);
  var color = mix(RAMP[s], RAMP[s + 1u], t - f32(s));
${oceanMask ? "  if (land[i] == 0.0) { color = vec3f(0.055, 0.13, 0.20); }" : ""}
  textureStore(out_tex, vec2i(x, y), vec4f(color, 1.0));
}`,
    });
  }

  if (diagnostics.length > 0) {
    throw new FieldDynamicsError(diagnostics);
  }

  // --- link the WESL passes --------------------------------------------------------
  const linkErrors: string[] = [];
  const linkedPasses = await Promise.all(
    pendingLinks.map(async ({ pass, root, generated, sourcePath }) => {
      try {
        const linked = await link({
          weslSrc: {
            "main.wesl": root,
            "kernel.wesl": KERNEL_WESL,
            ...generated,
            ...userModules,
          },
          rootModuleName: "main",
          libs: [SHARED_WESL],
        });
        return { ...pass, code: linked.dest } as FieldPassSpec;
      } catch (error) {
        linkErrors.push(
          `${pass.name} (${sourcePath}): ${undynPath((error as Error).message)}`,
        );
        return null;
      }
    }),
  );
  if (linkErrors.length > 0) {
    throw new FieldDynamicsError(linkErrors);
  }
  passes.push(...(linkedPasses as FieldPassSpec[]));

  // --- derivation stage (on-demand pipeline) ---------------------------------------
  // A system's `derive` block is an algorithm, not a per-tick sim: its passes
  // link through the shared FieldDerivation machinery (grid/single, iterate,
  // atomic globals) and its fields are plain buffers (inputs/scratch/derived),
  // separate from the layer namespace. Absent = a pure per-tick system.
  const derive = system.derive;
  const derivedFields = derive ? Object.entries(derive.fields) : [];
  const deriveAdvanced = new Set<string>(
    derive?.steps.flatMap((step) => step.advances ?? []) ?? [],
  );
  if (derive) {
    const bufferTypes: Record<string, "f32" | "u32"> = {};
    for (const [name, spec] of derivedFields) {
      // The array<> element type in generated bindings; explicit-type binds
      // (structs, atomic arrays) bypass this via the bind grammar.
      bufferTypes[name] = spec.type === "u32" ? "u32" : "f32";
    }
    const passTable: DerivationPass[] = derive.steps.map((step) => ({
      name: step.name ?? step.pass,
      module: step.pass,
      binds: step.binds,
      kind: step.kind,
      advances: step.advances,
    }));
    let derivePasses: FieldPassSpec[];
    try {
      derivePasses = await linkDerivation({
        passTable,
        modules: system.modules,
        bufferTypes,
        typeImports: derive.typeImports,
        uniform: derive.uniform
          ? {
              name: derive.uniform.name ?? "P",
              wgslType: derive.uniform.wgslType,
            }
          : undefined,
      });
    } catch (error) {
      throw new FieldDynamicsError([`derive: ${(error as Error).message}`]);
    }
    passes.push(...derivePasses);
  }

  // --- buffers ------------------------------------------------------------------------
  // Map-layer inputs the layer/view passes reference — but NOT names a
  // derivation owns (a `derive` field may legitimately be called "elevation";
  // it is its own buffer, not the map-plane upload).
  const derivedNameSet = new Set(derivedFields.map(([name]) => name));
  const mapLayers = [
    ...new Set(
      passes.flatMap((pass) =>
        pass.binds.filter(
          (bind) => MAP_LAYER_NAMES.includes(bind) && !derivedNameSet.has(bind),
        ),
      ),
    ),
  ].sort();
  const buffers: FieldBufferSpec[] = [
    ...layerFiles.map(
      (file): FieldBufferSpec => ({
        name: file.name,
        type: file.type,
        pingPong: true,
        clearable: true, // state restore across recompiles
        readable: true, // state capture across recompiles
      }),
    ),
    ...mapLayers.map(
      (name): FieldBufferSpec => ({ name, type: "f32", clearable: true }),
    ),
    {
      name: "S",
      type: "u32",
      count: simWords,
      clearable: true,
      readable: true,
    },
    // Derivation buffers: inputs (uploaded), scratch, and derived fields.
    ...derivedFields.map(
      ([name, spec]): FieldBufferSpec => ({
        name,
        type: spec.type,
        ...(spec.count !== undefined ? { count: spec.count } : {}),
        pingPong: spec.pingPong ?? deriveAdvanced.has(name),
        clearable: true, // uploaded inputs + cleared each derivation run
        ...(spec.readable === true ? { readable: true } : {}),
      }),
    ),
    ...(playersSpec
      ? [
          {
            name: "PL",
            type: "u32",
            count: playerCount * Math.max(1, playerFields.length),
            clearable: true,
          } satisfies FieldBufferSpec,
        ]
      : []),
  ];

  // Uniforms. A game composed onto terrain has BOTH the generated game `Params`
  // ("P") and the terrain derivation's own uniform (a distinct name, e.g.
  // "TP"). When the derivation reuses "P" (terrain-only, back-compat), size "P"
  // from it. Otherwise "P" is the generated game Params.
  const du = derive?.uniform;
  const derivedUniformName = du?.name ?? "P";
  const separateTerrainUniform = du !== undefined && derivedUniformName !== "P";
  const pUniform = separateTerrainUniform
    ? { bytes: paramsBytes, wgslType: "Params" }
    : (du ?? { bytes: paramsBytes, wgslType: "Params" });
  const kernelConfig: FieldKernelConfig = {
    prelude: generatedPrelude,
    uniforms: [
      { name: "P", bytes: pUniform.bytes, wgslType: pUniform.wgslType },
      ...(separateTerrainUniform && du
        ? [{ name: derivedUniformName, bytes: du.bytes, wgslType: du.wgslType }]
        : []),
      { name: "B", bytes: 32, wgslType: "Brush" },
    ],
    buffers,
    passes,
  };

  // --- programs & codecs -------------------------------------------------------------
  return {
    system,
    kernelConfig,
    paramList: params.map(([name, spec]) => ({
      name,
      value: spec.value,
      min: spec.min ?? 0,
      max: spec.max ?? Math.max(1, spec.value * 2),
      step: spec.step ?? 0.001,
      hidden: spec.hidden === true,
    })),
    viewNames: views.map(([name]) => name),
    brushNames: brushes.map(([name]) => name),
    scalarNames: scalars.map(([name]) => name),
    layerNames: layerFiles.map(({ name }) => name),
    derivedNames: derivedFields.map(([name]) => name),
    mapLayers,
    playerCount,

    writeParams(values, seed) {
      const data = new ArrayBuffer(paramsBytes);
      const view = new DataView(data);
      params.forEach(([name, spec], index) => {
        view.setFloat32(index * 4, values[name] ?? spec.value, true);
      });
      view.setInt32(params.length * 4, seed | 0, true);
      return data;
    },

    writePlayers(playerValues) {
      const stride = Math.max(1, playerFields.length) * 4;
      const data = new ArrayBuffer(Math.max(1, playerCount) * stride);
      const view = new DataView(data);
      for (let p = 0; p < playerCount; p += 1) {
        const values = playerValues[p] ?? {};
        playerFields.forEach(([name, type], index) => {
          const offset = p * stride + index * 4;
          if (type === "f32") {
            view.setFloat32(offset, values[name] ?? 0, true);
          } else {
            view.setUint32(offset, (values[name] ?? 0) >>> 0, true);
          }
        });
      }
      return data;
    },

    encodeBrush(name, x, y, radius) {
      const spec = system.brushes?.[name];
      if (!spec) throw new Error(`Unknown brush "${name}"`);
      const data = new ArrayBuffer(32);
      const view = new DataView(data);
      view.setFloat32(0, x, true);
      view.setFloat32(4, y, true);
      view.setFloat32(8, radius ?? spec.radius, true);
      view.setFloat32(12, spec.value, true);
      view.setUint32(16, spec.mode === "add" ? 1 : 0, true);
      return data;
    },

    decodeScalars(data) {
      const view = new DataView(data);
      const values: Record<string, number | number[]> = {};
      for (const slot of scalarSlots) {
        const decode = (word: number): number => {
          const offset = (slot.offsetWords + word) * 4;
          if (slot.base === "i32") {
            return view.getInt32(offset, true) / SUM_FX;
          }
          if (
            slot.spec.reduce === "min" &&
            view.getUint32(offset, true) === 0x7f7fffff
          ) {
            return 0;
          }
          return view.getFloat32(offset, true);
        };
        values[slot.name] =
          slot.spec.groupBy !== undefined
            ? Array.from({ length: slot.words }, (_, g) => decode(g))
            : decode(0);
      }
      return { tick: view.getUint32(0, true), values };
    },

    runInit(frame) {
      for (const { name } of initOrder) {
        frame.pass(`init/${name}`);
      }
    },

    runTick(kernel, frame) {
      frame.pass("sim/zero");
      // Each phase commits before the next runs (Gauss-Seidel staging); the
      // default is one phase — the fully synchronous Jacobi step.
      for (const phase of updatePhases) {
        for (const name of phase) {
          frame.pass(`stock/${name}`);
        }
        for (const name of phase) {
          kernel.swap(name);
        }
      }
      for (const [name] of scalars) {
        frame.pass(`reduce/${name}`);
      }
    },

    runView(frame, view) {
      frame.pass(`view/${view}`);
    },

    runDerive(frame, tier) {
      for (const step of derive?.steps ?? []) {
        // Full run (no tier) includes every step; a named tier runs only the
        // steps that opted into it.
        if (tier !== undefined && !step.tiers?.includes(tier)) continue;
        const name = step.name ?? step.pass;
        if (step.iterate !== undefined) {
          frame.iterate(name, step.iterate);
        } else {
          frame.pass(name);
        }
      }
    },

    brushPass(name) {
      return `brush/${name}`;
    },
  };
}

function rampStops(
  ramp: readonly string[],
  node: string,
  diagnostics: string[],
): string[] {
  const stops = ramp.map((hex) => {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!match) {
      diagnostics.push(`${node}: invalid ramp color "${hex}"`);
      return "vec3f(1.0, 0.0, 1.0)";
    }
    const value = Number.parseInt(match[1], 16);
    const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return `vec3f(${rgb.map((c) => (c / 255).toFixed(5)).join(", ")})`;
  });
  if (stops.length < 2) {
    diagnostics.push(`${node}: ramp needs at least 2 colors`);
    stops.push("vec3f(0.0)", "vec3f(1.0)");
  }
  return stops;
}
