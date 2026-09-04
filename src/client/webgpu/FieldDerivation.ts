import { link } from "wesl";
import { SHARED_WESL } from "../lab/shared";
import type { FieldPassSpec } from "./FieldKernel";
import { gridMainWesl, KERNEL_WESL, singleMainWesl } from "./WeslKernel";

// Shared derivation machinery (unify-field-viewer, phase 1). A "derivation" is
// a one-shot GPU pipeline — the opposite of a per-tick cellular sim: an ordered
// list of passes with iterate-to-convergence, atomic global reductions, and
// single-dispatch scans, producing derived fields from map inputs. Each pass is
// a `.wesl` file importing `package::bindings` (generated here from its bind
// list); the pipeline's dispatch program is the caller's concern.
//
// This generalizes the worldgen's proven pass-linking (WebGpuWorldEngine) so
// both the raw worldgen kernel AND a FieldDynamics `derive` stage share one
// implementation. The bind grammar matches FieldKernel's:
//   "name"          storage buffer, read       (element type from bufferTypes)
//   "name!"         storage buffer, read_write
//   "name.read"     ping-pong read facet  -> var <name>_in
//   "name.write"    ping-pong write facet -> var <name>_out (read_write)
//   "name:Type"     explicit WGSL type (e.g. "G:GlobalsAtomic!", "hist:array<atomic<u32>,256>!")
//   "P"             uniform Params
//   "out"           output storage texture (rgba8unorm)
//   "out.read"      the output texture as a sampled texture

export interface DerivationPass {
  /** Dispatch-program name (referenced by frame.pass / frame.iterate). */
  name: string;
  /** Pass body module, resolved as `package::passes::<module>`. */
  module: string;
  /** Ordered bind list (drives the generated package::bindings module). */
  binds: readonly string[];
  /** "grid" (per-tile, default) or "single" (one dispatch — serial scans). */
  kind?: "grid" | "single";
  /** Ping-pong buffers this pass advances (swapped after it runs). */
  advances?: readonly string[];
}

/** Generate the `package::bindings` module a derivation pass imports from its
 * bind list. `bufferTypes` maps a storage buffer name to its element type;
 * `typeImports` is the WESL import line for the shared struct types the passes
 * reference (e.g. Params/Globals). */
export function bindingsModule(
  binds: readonly string[],
  bufferTypes: Record<string, "f32" | "u32">,
  typeImports: string,
  uniform: { name: string; wgslType: string } = {
    name: "P",
    wgslType: "Params",
  },
): string {
  const decls = binds.map((ref, index) => {
    const binding = index + 1; // 0 is GRID (package::kernel)
    if (ref === "out.read") {
      return `@group(0) @binding(${binding}) var out_tex_in: texture_2d<f32>;`;
    }
    if (ref === "out") {
      return `@group(0) @binding(${binding}) var out_tex: texture_storage_2d<rgba8unorm, write>;`;
    }
    // The uniform bind resolves to the WGSL var `P` regardless of its kernel
    // name (pass bodies read `P`); the kernel binds by index, so a distinct
    // kernel name (e.g. `TP`) lets a composed game keep `P` for its own params.
    if (ref === uniform.name) {
      return `@group(0) @binding(${binding}) var<uniform> P: ${uniform.wgslType};`;
    }
    let rest = ref;
    let readWrite = false;
    if (rest.endsWith("!")) {
      readWrite = true;
      rest = rest.slice(0, -1);
    }
    let typeOverride: string | null = null;
    const colon = rest.indexOf(":");
    if (colon >= 0) {
      typeOverride = rest.slice(colon + 1);
      rest = rest.slice(0, colon);
    }
    let varName = rest;
    if (rest.endsWith(".read")) {
      varName = `${rest.slice(0, -".read".length)}_in`;
      rest = rest.slice(0, -".read".length);
    } else if (rest.endsWith(".write")) {
      varName = `${rest.slice(0, -".write".length)}_out`;
      rest = rest.slice(0, -".write".length);
      readWrite = true;
    }
    const type = typeOverride ?? `array<${bufferTypes[rest]}>`;
    const access = readWrite ? "read_write" : "read";
    return `@group(0) @binding(${binding}) var<storage, ${access}> ${varName}: ${type};`;
  });
  return `${typeImports}\n\n${decls.join("\n")}\n`;
}

/**
 * Link a derivation pass table into FieldKernel passes. Each pass gets a grid
 * or single dispatch wrapper, the generated bindings module, the shared kernel
 * module, and the caller's WESL source modules (pass bodies + shared types).
 * Throws with every failing pass's diagnostics collected (WESL tree-shakes
 * unused imports, so only referenced items must resolve).
 */
export async function linkDerivation(opts: {
  passTable: readonly DerivationPass[];
  modules: Record<string, string>;
  bufferTypes: Record<string, "f32" | "u32">;
  typeImports: string;
  /** The uniform bind name + WGSL struct type (default `P`/`Params`). A
   * distinct name lets a composed game keep `P` for its own params. */
  uniform?: { name: string; wgslType: string };
  /** For error messages: how to name a pass's source file. */
  sourceLabel?: (pass: DerivationPass) => string;
}): Promise<FieldPassSpec[]> {
  const { passTable, modules, bufferTypes, typeImports } = opts;
  const uniform = opts.uniform ?? { name: "P", wgslType: "Params" };
  const label =
    opts.sourceLabel ??
    ((pass: DerivationPass) => `passes/${pass.module}.wesl`);
  const errors: string[] = [];
  const passes = await Promise.all(
    passTable.map(async (pass) => {
      const passModule = `package::passes::${pass.module}`;
      const root =
        (pass.kind ?? "grid") === "grid"
          ? gridMainWesl(passModule)
          : singleMainWesl(passModule);
      try {
        const linked = await link({
          weslSrc: {
            "main.wesl": root,
            "kernel.wesl": KERNEL_WESL,
            "bindings.wesl": bindingsModule(
              pass.binds,
              bufferTypes,
              typeImports,
              uniform,
            ),
            ...modules,
          },
          rootModuleName: "main",
          libs: [SHARED_WESL],
        });
        return {
          name: pass.name,
          binds: pass.binds,
          kind: pass.kind,
          advances: pass.advances,
          raw: true,
          code: linked.dest,
        } satisfies FieldPassSpec;
      } catch (error) {
        errors.push(
          `${pass.name} (${label(pass)}): ${(error as Error).message}`,
        );
        return null;
      }
    }),
  );
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return passes as FieldPassSpec[];
}
