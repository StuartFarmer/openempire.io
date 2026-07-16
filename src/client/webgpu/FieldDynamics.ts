import { LAYER_NAMES } from "../../core/game/MapLayers";
import type {
  FieldBufferSpec,
  FieldFrame,
  FieldKernel,
  FieldKernelConfig,
  FieldPassSpec,
} from "./FieldKernel";
import { NOISE_WGSL } from "./WgslNoise";

// FieldDynamics: compiles a FieldSystem definition (stocks, params, reduces,
// brushes, views — with raw WGSL bodies) into a FieldKernel config plus the
// per-tick dispatch programs. See docs/FieldDynamics.md.
//
// There is no expression transpiler by design: WGSL is the expression
// language. The compiler's job is name scanning (bind inference), helper
// injection, struct/layout generation, and program assembly. WGSL compile
// errors surface through FieldKernel's getCompilationInfo path, tagged with
// the generated pass name.

export interface FieldParamSpec {
  value: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface FieldStockSpec {
  /** WGSL expression for the initial value; `x`, `y`, `i` are in scope. */
  init: string;
  /**
   * WGSL statements updating the stock; must assign `<name>_out[i]` on every
   * path. Reads (`*_in`) see the previous tick — including this stock's own.
   * Omit for a field that only changes via init/brushes.
   */
  update?: string;
}

export type FieldReduceOp = "sum" | "max" | "min";

export interface FieldReduceSpec {
  reduce: FieldReduceOp;
  /** WGSL f32 expression reduced over all tiles; `x`, `y`, `i` in scope. */
  of: string;
}

export interface FieldBrushSpec {
  target: string;
  mode: "set" | "add";
  value: number;
  radius: number;
}

export interface FieldViewSpec {
  /** WGSL f32 expression, clamped to 0..1 and mapped through the ramp. */
  expr: string;
  /** Hex color stops, evenly spaced. */
  ramp: readonly string[];
  /** Paint non-land tiles a fixed water color (default true). */
  oceanMask?: boolean;
}

export interface FieldSystem {
  id: string;
  name: string;
  /** Extra WGSL shared by every generated pass. */
  prelude?: string;
  params?: Record<string, FieldParamSpec>;
  fields: Record<string, FieldStockSpec>;
  scalars?: Record<string, FieldReduceSpec>;
  brushes?: Record<string, FieldBrushSpec>;
  views: Record<string, FieldViewSpec>;
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
  }[];
  viewNames: readonly string[];
  brushNames: readonly string[];
  scalarNames: readonly string[];
  fieldNames: readonly string[];
  /** Map planes referenced by any pass — the page uploads exactly these. */
  mapFields: readonly string[];
  writeParams(
    values: Readonly<Record<string, number>>,
    seed: number,
  ): ArrayBuffer;
  encodeBrush(name: string, x: number, y: number, radius?: number): ArrayBuffer;
  decodeScalars(data: ArrayBuffer): {
    tick: number;
    values: Record<string, number>;
  };
  runInit(frame: FieldFrame): void;
  runTick(kernel: FieldKernel, frame: FieldFrame): void;
  runView(frame: FieldFrame, view: string): void;
  brushPass(name: string): string;
}

export class FieldDynamicsError extends Error {
  constructor(readonly diagnostics: readonly string[]) {
    super(diagnostics.join("\n"));
    this.name = "FieldDynamicsError";
  }
}

/** Map planes every system can read; `land` derives from the terrain bits. */
export const MAP_FIELD_NAMES: readonly string[] = [...LAYER_NAMES, "land"];

// Fixed-point scale for sum reduces: ±8M range with 1/256 resolution keeps
// 1024²·value sums inside i32 while atomicAdd stays order-independent.
const SUM_FX = 256;
const IDENT = /^[A-Za-z_]\w*$/;
const NEIGHBOR_OPS = ["sum8", "avg8", "max8", "min8"] as const;

export function compileFieldSystem(system: FieldSystem): CompiledFieldSystem {
  const diagnostics: string[] = [];
  const params = Object.entries(system.params ?? {});
  const fields = Object.entries(system.fields);
  const scalars = Object.entries(system.scalars ?? {});
  const brushes = Object.entries(system.brushes ?? {});
  const views = Object.entries(system.views);
  const fieldNames = new Set(fields.map(([name]) => name));

  validateNames(system, diagnostics);

  // --- generated structs -------------------------------------------------
  const paramMembers = [
    ...params.map(([name]) => `  ${name}: f32,`),
    "  seed: i32,",
  ];
  while ((paramMembers.length * 4) % 16 !== 0) {
    paramMembers.push(`  pad${paramMembers.length}: u32,`);
  }
  const paramsBytes = paramMembers.length * 4;

  const scalarSlot = (name: string, op: FieldReduceOp): string =>
    op === "sum" ? `${name}_fx` : `${name}_bits`;
  const simMembers = scalars.map(([name, spec]) =>
    spec.reduce === "sum"
      ? `  ${scalarSlot(name, "sum")}: i32,`
      : `  ${scalarSlot(name, spec.reduce)}: u32,`,
  );
  const simAtomicMembers = scalars.map(([name, spec]) =>
    spec.reduce === "sum"
      ? `  ${scalarSlot(name, "sum")}: atomic<i32>,`
      : `  ${scalarSlot(name, spec.reduce)}: atomic<u32>,`,
  );

  const structsWgsl = `
struct Params {
${paramMembers.join("\n")}
}

struct Sim {
  tick: u32,
${simMembers.join("\n")}
}

struct SimAtomic {
  tick: u32,
${simAtomicMembers.join("\n")}
}

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

  const prelude = [structsWgsl, NOISE_WGSL, system.prelude ?? ""].join("\n");

  // --- bind inference ----------------------------------------------------
  // Scan a WGSL body for the names in scope and return the bind list plus
  // any generated helper functions it needs.
  interface Scan {
    binds: string[];
    helpers: string;
  }
  const scan = (code: string, node: string): Scan => {
    const binds = new Set<string>();
    const helpers: string[] = [];

    const usesWord = (word: string): boolean =>
      new RegExp(`\\b${word}\\b`).test(code);

    let usesP = /\bP\./.test(code);
    let usesS = /\bS\./.test(code);

    // Stock reads/writes.
    for (const match of code.matchAll(/\b([A-Za-z_]\w*)_(in|out)\b/g)) {
      const [, base, facet] = match;
      if (NEIGHBOR_OPS.some((op) => base.startsWith(`${op}_`))) continue;
      if (!fieldNames.has(base)) {
        diagnostics.push(
          `${node}: references "${base}_${facet}" but "${base}" is not a declared field`,
        );
        continue;
      }
      binds.add(facet === "in" ? `${base}.read` : `${base}.write`);
    }

    // Neighbor helpers: sum8_<field>(x, y) etc.
    const seenHelpers = new Set<string>();
    for (const match of code.matchAll(
      /\b(sum8|avg8|max8|min8)_([A-Za-z_]\w*)\s*\(/g,
    )) {
      const [, op, field] = match;
      const key = `${op}_${field}`;
      if (seenHelpers.has(key)) continue;
      seenHelpers.add(key);
      if (!fieldNames.has(field)) {
        diagnostics.push(
          `${node}: neighbor helper "${key}" — "${field}" is not a declared field`,
        );
        continue;
      }
      binds.add(`${field}.read`);
      helpers.push(neighborHelper(op as (typeof NEIGHBOR_OPS)[number], field));
    }

    // Scalar getters.
    for (const match of code.matchAll(/\bscalar_([A-Za-z_]\w*)\s*\(/g)) {
      const name = match[1];
      const spec = system.scalars?.[name];
      if (!spec) {
        diagnostics.push(
          `${node}: scalar getter "scalar_${name}()" — "${name}" is not a declared scalar`,
        );
        continue;
      }
      usesS = true;
      helpers.push(scalarGetter(name, spec.reduce, scalarSlot));
    }

    // rand()/noise() builtins.
    if (/\brand\s*\(/.test(code)) {
      usesP = true;
      usesS = true;
      helpers.push(`
fn rand(px: i32, py: i32) -> f32 {
  return hash01(P.seed + i32(S.tick), px, py);
}`);
    }
    if (/\bnoise\s*\(/.test(code)) {
      usesP = true;
      helpers.push(`
fn noise(px: i32, py: i32, freq: f32, octaves: i32) -> f32 {
  return fbm(P.seed, f32(px) / f32(GRID.size.x), f32(py) / f32(GRID.size.y), freq, octaves, 0.5);
}`);
    }

    // Map fields.
    const mapUsed = MAP_FIELD_NAMES.filter((name) => usesWord(name));

    const ordered: string[] = [];
    if (usesP) ordered.push("P");
    if (usesS) ordered.push("S:Sim");
    ordered.push(...mapUsed.sort());
    ordered.push(
      ...[...binds].filter((b) => b.endsWith(".read")).sort(),
      ...[...binds].filter((b) => b.endsWith(".write")).sort(),
    );
    return { binds: ordered, helpers: helpers.join("\n") };
  };

  // --- generated passes ---------------------------------------------------
  const passes: FieldPassSpec[] = [];

  for (const [name, spec] of fields) {
    const initCode = `fn tile(x: i32, y: i32, i: u32) {\n  ${name}_out[i] = (${spec.init});\n}`;
    const initScan = scan(initCode, `fields.${name}.init`);
    passes.push({
      name: `init/${name}`,
      binds: initScan.binds,
      advances: [name],
      code: `${initScan.helpers}\n${initCode}`,
    });

    if (spec.update === undefined) continue;
    if (!new RegExp(`\\b${name}_out\\b`).test(spec.update)) {
      diagnostics.push(
        `fields.${name}.update: never assigns "${name}_out[i]" — the stock would not change`,
      );
    }
    const updateCode = `fn tile(x: i32, y: i32, i: u32) {\n${spec.update}\n}`;
    const updateScan = scan(updateCode, `fields.${name}.update`);
    passes.push({
      name: `stock/${name}`,
      binds: updateScan.binds,
      // No advances: the tick program swaps all stocks together (synchronous
      // Jacobi commit — every update reads the previous tick).
      code: `${updateScan.helpers}\n${updateCode}`,
    });
  }

  const zeroBody = scalars
    .map(([name, spec]) =>
      spec.reduce === "sum"
        ? `  atomicStore(&S.${scalarSlot(name, "sum")}, 0);`
        : spec.reduce === "max"
          ? `  atomicStore(&S.${scalarSlot(name, "max")}, 0u);`
          : `  atomicStore(&S.${scalarSlot(name, "min")}, 0x7f7fffffu);`,
    )
    .join("\n");
  passes.push({
    name: "sim/zero",
    binds: ["S:SimAtomic!"],
    kind: "single",
    code: `fn once() {\n  S.tick = S.tick + 1u;\n${zeroBody}\n}`,
  });

  for (const [name, spec] of scalars) {
    const reduceExpr =
      spec.reduce === "sum"
        ? `atomicAdd(&S.${scalarSlot(name, "sum")}, i32(clamp((${spec.of}), -32768.0, 32767.0) * ${SUM_FX}.0));`
        : spec.reduce === "max"
          ? `atomicMax(&S.${scalarSlot(name, "max")}, bitcast<u32>(max((${spec.of}), 0.0)));`
          : `atomicMin(&S.${scalarSlot(name, "min")}, bitcast<u32>(max((${spec.of}), 0.0)));`;
    const code = `fn tile(x: i32, y: i32, i: u32) {\n  ${reduceExpr}\n}`;
    const reduceScan = scan(code, `scalars.${name}.of`);
    passes.push({
      name: `reduce/${name}`,
      binds: dedupe([
        ...reduceScan.binds.filter((b) => b !== "S:Sim"),
        "S:SimAtomic!",
      ]),
      code: `${reduceScan.helpers}\n${code}`,
    });
  }

  for (const [name, spec] of brushes) {
    if (!fieldNames.has(spec.target)) {
      diagnostics.push(
        `brushes.${name}: target "${spec.target}" is not a declared field`,
      );
      continue;
    }
    const t = spec.target;
    passes.push({
      name: `brush/${name}`,
      binds: ["B", `${t}.read`, `${t}.write`],
      advances: [t],
      code: `
fn tile(x: i32, y: i32, i: u32) {
  var v = ${t}_in[i];
  let d = vec2f(f32(x) - B.x, f32(y) - B.y);
  if (dot(d, d) <= B.radius * B.radius) {
    v = select(B.value, v + B.value, B.mode == 1u);
  }
  ${t}_out[i] = v;
}`,
    });
  }

  for (const [name, spec] of views) {
    const stops = spec.ramp.map((hex) => {
      const rgb = parseHex(hex);
      if (!rgb) {
        diagnostics.push(`views.${name}: invalid ramp color "${hex}"`);
        return "vec3f(1.0, 0.0, 1.0)";
      }
      return `vec3f(${rgb.map((c) => (c / 255).toFixed(5)).join(", ")})`;
    });
    if (stops.length < 2) {
      diagnostics.push(`views.${name}: ramp needs at least 2 colors`);
      stops.push("vec3f(0.0)", "vec3f(1.0)");
    }
    const oceanMask = spec.oceanMask !== false;
    const code = `
var<private> RAMP: array<vec3f, ${stops.length}> = array<vec3f, ${stops.length}>(
  ${stops.join(",\n  ")},
);

fn tile(x: i32, y: i32, i: u32) {
  let v = clamp01((${spec.expr}));
  let t = v * ${stops.length - 1}.0;
  let s = min(u32(t), ${stops.length - 2}u);
  var color = mix(RAMP[s], RAMP[s + 1u], t - f32(s));
${oceanMask ? `  if (land[i] == 0.0) { color = vec3f(0.055, 0.13, 0.20); }` : ""}
  textureStore(out_tex, vec2i(x, y), vec4f(color, 1.0));
}`;
    const viewScan = scan(code, `views.${name}.expr`);
    passes.push({
      name: `view/${name}`,
      binds: [...viewScan.binds, "out"],
      code: `${viewScan.helpers}\n${code}`,
    });
  }

  if (diagnostics.length > 0) {
    throw new FieldDynamicsError(diagnostics);
  }

  // --- buffers -------------------------------------------------------------
  const mapFields = dedupe(
    passes.flatMap((pass) =>
      pass.binds.filter((bind) => MAP_FIELD_NAMES.includes(bind)),
    ),
  ).sort();
  const buffers: FieldBufferSpec[] = [
    ...fields.map(
      ([name]): FieldBufferSpec => ({
        name,
        type: "f32",
        pingPong: true,
        clearable: true, // state restore across recompiles
        readable: true, // state capture across recompiles
      }),
    ),
    ...mapFields.map(
      (name): FieldBufferSpec => ({ name, type: "f32", clearable: true }),
    ),
    {
      name: "S",
      type: "u32",
      count: 1 + scalars.length,
      clearable: true,
      readable: true,
    },
  ];

  const kernelConfig: FieldKernelConfig = {
    prelude,
    uniforms: [
      { name: "P", bytes: paramsBytes, wgslType: "Params" },
      { name: "B", bytes: 32, wgslType: "Brush" },
    ],
    buffers,
    passes,
  };

  // --- programs & codecs ---------------------------------------------------
  const updatedFields = fields
    .filter(([, spec]) => spec.update !== undefined)
    .map(([name]) => name);

  return {
    system,
    kernelConfig,
    paramList: params.map(([name, spec]) => ({
      name,
      value: spec.value,
      min: spec.min ?? 0,
      max: spec.max ?? Math.max(1, spec.value * 2),
      step: spec.step ?? 0.001,
    })),
    viewNames: views.map(([name]) => name),
    brushNames: brushes.map(([name]) => name),
    scalarNames: scalars.map(([name]) => name),
    fieldNames: fields.map(([name]) => name),
    mapFields,

    writeParams(values, seed) {
      const data = new ArrayBuffer(paramsBytes);
      const view = new DataView(data);
      params.forEach(([name, spec], index) => {
        view.setFloat32(index * 4, values[name] ?? spec.value, true);
      });
      view.setInt32(params.length * 4, seed | 0, true);
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
      const values: Record<string, number> = {};
      scalars.forEach(([name, spec], index) => {
        const offset = 4 + index * 4;
        if (spec.reduce === "sum") {
          values[name] = view.getInt32(offset, true) / SUM_FX;
        } else {
          const raw = view.getFloat32(offset, true);
          values[name] =
            spec.reduce === "min" && view.getUint32(offset, true) === 0x7f7fffff
              ? 0
              : raw;
        }
      });
      return { tick: view.getUint32(0, true), values };
    },

    runInit(frame) {
      for (const [name] of fields) {
        frame.pass(`init/${name}`);
      }
    },

    runTick(kernel, frame) {
      frame.pass("sim/zero");
      for (const name of updatedFields) {
        frame.pass(`stock/${name}`);
      }
      for (const name of updatedFields) {
        kernel.swap(name); // synchronous commit
      }
      for (const [name] of scalars) {
        frame.pass(`reduce/${name}`);
      }
    },

    runView(frame, view) {
      frame.pass(`view/${view}`);
    },

    brushPass(name) {
      return `brush/${name}`;
    },
  };
}

function validateNames(system: FieldSystem, diagnostics: string[]): void {
  const reserved = new Set([
    ...MAP_FIELD_NAMES,
    "P",
    "S",
    "B",
    "GRID",
    "out",
    "seed",
    "tick",
  ]);
  for (const name of Object.keys(system.fields)) {
    if (!IDENT.test(name)) {
      diagnostics.push(`fields.${name}: not a valid WGSL identifier`);
    }
    if (reserved.has(name)) {
      diagnostics.push(`fields.${name}: name is reserved`);
    }
  }
  for (const name of Object.keys(system.params ?? {})) {
    if (!IDENT.test(name) || name === "seed") {
      diagnostics.push(`params.${name}: invalid or reserved name`);
    }
  }
  for (const name of Object.keys(system.scalars ?? {})) {
    if (!IDENT.test(name) || name === "tick") {
      diagnostics.push(`scalars.${name}: invalid or reserved name`);
    }
  }
}

function neighborHelper(
  op: (typeof NEIGHBOR_OPS)[number],
  field: string,
): string {
  const acc =
    op === "max8"
      ? `best = max(best, ${field}_in[refOf(q.x, q.y)]);`
      : op === "min8"
        ? `best = min(best, ${field}_in[refOf(q.x, q.y)]);`
        : `total += ${field}_in[refOf(q.x, q.y)];`;
  const init =
    op === "max8" ? "-3.40282e38" : op === "min8" ? "3.40282e38" : "0.0";
  const result =
    op === "sum8"
      ? "total"
      : op === "avg8"
        ? "select(0.0, total / n, n > 0.0)"
        : "select(0.0, best, n > 0.0)";
  return `
fn ${op}_${field}(px: i32, py: i32) -> f32 {
  var total = 0.0;
  var best = ${init};
  var n = 0.0;
  for (var k = 0; k < 8; k += 1) {
    let q = vec2i(px, py) + OFF[k];
    if (!inBounds(q.x, q.y)) { continue; }
    ${acc}
    n += 1.0;
  }
  return ${result};
}`;
}

function scalarGetter(
  name: string,
  op: FieldReduceOp,
  slot: (name: string, op: FieldReduceOp) => string,
): string {
  const body =
    op === "sum"
      ? `return f32(S.${slot(name, op)}) / ${SUM_FX}.0;`
      : `return bitcast<f32>(S.${slot(name, op)});`;
  return `\nfn scalar_${name}() -> f32 { ${body} }`;
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function dedupe(items: readonly string[]): string[] {
  return [...new Set(items)];
}
