# Field Dynamics — spec

A systems-dynamics layer on top of FieldKernel. A **system definition** (a
typed TS literal: stocks, params, reduces, brushes, views — with raw WGSL
bodies) compiles to generated compute passes and a per-tick dispatch program.
Swap the definition, get a different game.

- Step 1 (done): `src/client/webgpu/FieldKernel.ts` — layers + pass runtime.
- Step 2 (done): `src/client/webgpu/FieldDynamics.ts` — `FieldSystem` → compiled
  system (tests: `tests/FieldDynamics.test.ts`).
- Step 3 (done, v1): `src/client/FieldLabPage.ts` — the `#lab` page. Systems
  live in `src/client/lab/systems/`.

Decisions taken (2026-07-16): **TS-literal authoring** (JSON-safe shape for a
later graph editor), **raw WGSL expressions everywhere** (no transpiler — the
compiler's job is name scanning, code assembly, and struct/bind generation;
WGSL itself is the expression language), **state preserved across recompiles**
(always-reset is the free degenerate case behind a toggle), **grazing ecology**
as the first proof system.

---

## 1. Mental model

Classic stocks-and-flows, lifted from scalars to per-tile fields:

| Concept          | Meaning                                 | GPU realization                                                                                        |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **field stock**  | one f32 per tile, evolves each tick     | ping-pong layer + one generated compute pass                                                           |
| **scalar stock** | one global f32 (later: per-player)      | slot in a GPU-resident `Sim` struct, written by reduce passes                                          |
| **param**        | designer-tunable constant               | uniform member → automatic slider on the lab page, live (no recompile)                                 |
| **map field**    | read-only terrain input                 | `layers.bin` planes (`crop metal oil temperature humidity water`, 0..1) + `land` from the terrain bits |
| **brush**        | pointer input stamped into a field      | generated stamp pass driven by a small uniform                                                         |
| **reduce**       | field expression → scalar (sum/max/min) | atomic reduction pass (fixed-point integers → order-independent, deterministic)                        |
| **view**         | expression → color ramp                 | generated colorizer pass → FieldKernel's present path                                                  |

**Update semantics (the one rule that matters):** every tick is synchronous.
All stock update bodies read the _previous_ tick's values — including their
own — then all stocks commit at once (Jacobi step, classic CA semantics).
Mechanically: stock passes read `.read` facets and write `.write`, carry **no
`advances`**, and the tick program swaps every stock afterward in a commit
phase. No evaluation-order dependence between stocks, ever; cross-stock
feedback loops are legal and simply delayed one tick.

## 2. A complete system definition

```ts
// src/client/lab/systems/grazing.ts
import type { FieldSystem } from "../../webgpu/FieldDynamics";

export const grazing: FieldSystem = {
  id: "grazing",
  name: "Grazing",

  params: {
    grassGrowth: { value: 0.04, min: 0, max: 0.2 },
    grazeRate: { value: 0.3, min: 0, max: 1 },
    herdBirth: { value: 0.12, min: 0, max: 0.5 },
    herdDeath: { value: 0.05, min: 0, max: 0.5 },
    herdSpread: { value: 0.15, min: 0, max: 0.5 },
  },

  fields: {
    grass: {
      init: "crop[i]", // seeded from the map's crop plane
      update: /* wgsl */ `
        let regrow = P.grassGrowth * crop[i] * (1.0 - grass_in[i]);
        let grazed = P.grazeRate * herd_in[i] * grass_in[i];
        grass_out[i] = clamp(grass_in[i] + regrow - grazed, 0.0, 1.0);
      `,
    },
    herd: {
      init: "0.0",
      update: /* wgsl */ `
        var v = herd_in[i];
        v += P.herdBirth * v * grass_in[i];
        v -= P.herdDeath * v;
        v += P.herdSpread * (avg8_herd(x, y) - v);
        herd_out[i] = select(0.0, clamp(v, 0.0, 1.0), land[i] != 0.0);
      `,
    },
  },

  scalars: {
    totalHerd: { reduce: "sum", of: "herd_in[i]" },
  },

  brushes: {
    seedHerds: { target: "herd", mode: "set", value: 1, radius: 4 },
  },

  views: {
    grass: { expr: "grass_in[i]", ramp: ["#1a140b", "#6fae4e"] },
    herds: { expr: "herd_in[i]", ramp: ["#0b1220", "#f0c86e"] },
    pressure: {
      expr: "P.grazeRate * herd_in[i] * grass_in[i]",
      ramp: ["#101418", "#e05555"],
    },
  },
};
```

Reading it: grass regrows toward the map's crop fertility and is eaten by
herds; herds grow where they eat, die at a base rate, diffuse toward
neighboring tiles, and can't exist off land. Two coupled stocks, one spatial
helper, one reduction, one brush, three views. Everything inside the strings
is plain WGSL — there is no second language to learn, and the `/* wgsl */`
comment turns on editor highlighting.

## 3. What's in scope inside the WGSL

The compiler assembles each pass from: FieldKernel's prelude (`GRID`, `refOf`,
`inBounds`, `clamp01`, the `OFF` neighbor table) + generated structs +
generated binding declarations + generated helpers + your code. Names you can
use:

| Name                                                                                | Type            | Meaning                                                                           |
| ----------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| `x`, `y`, `i`                                                                       | `i32, i32, u32` | tile coords and row-major index (args of the generated `fn tile`)                 |
| `GRID.size`                                                                         | `vec2u`         | map dimensions                                                                    |
| `<field>_in[i]`                                                                     | `f32`           | any stock's **previous-tick** value (including the stock being updated)           |
| `<field>_out[i]`                                                                    | `f32`           | the updated stock's write target — every update body must assign it on every path |
| `crop[i] metal[i] oil[i] temperature[i] humidity[i] water[i] land[i]`               | `f32`           | map fields, 0..1 (`land` is 0/1)                                                  |
| `P.<param>`                                                                         | `f32`           | params; `P.seed: i32` is always present                                           |
| `S.tick`                                                                            | `u32`           | tick counter (lives in the Sim buffer so multi-tick batches stay correct)         |
| `scalar_<name>()`                                                                   | `f32`           | previous-tick value of a reduce (decodes fixed-point for you)                     |
| `rand(x, y)`                                                                        | `f32`           | deterministic per-tile per-tick white noise (`hash01(P.seed + tick, x, y)`)       |
| `noise(x, y, freq, octaves)`                                                        | `f32`           | the worldgen's seeded fbm value-noise                                             |
| `sum8_<field>(x, y)` `avg8_<field>(x, y)` `max8_<field>(x, y)` `min8_<field>(x, y)` | `f32`           | generated neighbor reductions over `<field>_in` (bounds-safe)                     |

**Bind inference:** you never write binding declarations. The compiler scans
each body for the identifiers above and binds exactly what it finds —
`herd_in` → `herd.read`, `herd_out` → `herd.write`, `crop` → the crop layer,
`P.` → the params uniform, `rand(`/`S.` → the Sim buffer, `avg8_herd(` →
injects that helper and binds `herd.read`. Referencing an unknown `*_in`/
`*_out` name is a compile-time diagnostic before WGSL ever sees it.

**Error surface:** since the expression language _is_ WGSL, the WGSL compiler
is the type checker. FieldKernel runs `getCompilationInfo()` on every module
and reports errors as `pass-name:line:col message` against the numbered,
assembled source — so a typo in `fields.herd.update` fails fast with the
generated code visible, not as a silent black map.

## 4. What the compiler emits

For the grazing system above:

**Generated structs** (sizes and layout are the compiler's problem):

```wgsl
struct Params {
  grassGrowth: f32,
  grazeRate: f32,
  herdBirth: f32,
  herdDeath: f32,
  herdSpread: f32,
  seed: i32,
  pad0: u32, pad1: u32,
}
struct Sim { tick: u32, totalHerd_fx: i32 }          // read view
struct SimAtomic { tick: u32, totalHerd_fx: atomic<i32> } // reduce-write view
```

**Generated passes** (FieldKernel specs — binds inferred, `fn tile` wrapping
and dispatch are FieldKernel's):

| Pass               | Binds                                         | Body                                                                               |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `init/grass`       | `P?, crop, grass.write`                       | `grass_out[i] = (crop[i]);`                                                        |
| `init/herd`        | `herd.write`                                  | `herd_out[i] = (0.0);`                                                             |
| `sim/zero`         | `S:SimAtomic!` _(single)_                     | `S.tick += 1; totalHerd_fx = 0;`                                                   |
| `stock/grass`      | `P, crop, grass.read, herd.read, grass.write` | your update body                                                                   |
| `stock/herd`       | `P, land, grass.read, herd.read, herd.write`  | helper `avg8_herd` + your update body                                              |
| `reduce/totalHerd` | `herd.read, S:SimAtomic!`                     | `atomicAdd(&S.totalHerd_fx, i32(clamp(herd_in[i], -32768.0, 32767.0) * 65536.0));` |
| `brush/seedHerds`  | `B, herd.read, herd.write` _(advances herd)_  | stamp-within-radius copy                                                           |
| `view/*`           | inferred + `out`                              | ramp interpolation + `textureStore`                                                |

Sums/counts accumulate in **fixed point** (×2^16 integer atomics), max/min via
the bitcast-u32 trick the worldgen already uses — reductions are
order-independent, so runs are deterministic on a given device.

**The tick program** — no `advances` on stock passes; the commit phase is the
synchronous semantics:

```ts
compiled.runTick(kernel, frame);
// = frame.pass("sim/zero")            tick += 1, zero reduce slots (in-stream → multi-tick batching works)
//   frame.pass("stock/grass")         reads *.read, writes grass.write
//   frame.pass("stock/herd")          reads *.read, writes herd.write
//   kernel.swap("grass"); kernel.swap("herd")   // commit
//   frame.pass("reduce/totalHerd")
```

Budget: ~5 dispatches/tick here; the worldgen runs ~800 dispatches in 13–20 ms
on this machine, so even hundreds of ticks per second is headroom, at 1024².

**The compiled object** the lab page consumes:

```ts
interface CompiledFieldSystem {
  kernelConfig: FieldKernelConfig; // hand to FieldKernel.create
  paramList: { name; value; min; max; step }[]; // → sliders
  viewNames: string[]; // → view dropdown
  brushNames: string[]; // → tool palette
  fieldNames: string[]; // → state preserve/migration
  mapFields: string[]; // which planes to upload
  writeParams(values, seed): ArrayBuffer;
  encodeBrush(name, x, y, radiusOverride?): ArrayBuffer;
  decodeScalars(bytes): { tick: number } & Record<string, number>;
  runInit(kernel, frame): void; // init passes + commit swaps
  runTick(kernel, frame): void;
  runView(kernel, frame, view): void; // view pass (page calls present)
}
```

## 5. The developer experience loop

1. Create `src/client/lab/systems/mygame.ts` exporting a `FieldSystem`;
   register it in the systems index.
2. Open `#lab`: pick a **map** (any baked map — its `layers.bin` planes are
   the map fields) and your **system**. Params become sliders (live, no
   recompile), views populate the dropdown, brushes the tool palette;
   play / pause / step / tick-rate / reset come from the harness.
3. Paint with a brush, watch stocks evolve, flip between views to debug —
   the view dropdown is the pass-graph debugger, same as the worldgen page.
4. Edit the file → Vite HMR hands the new definition to the page →
   recompile in milliseconds → **state is preserved**: surviving fields keep
   their values (read back + re-uploaded across the kernel swap), new fields
   run `init`, deleted ones drop. Reset reruns all inits (that's the
   "always reset" mode for free).
5. WGSL mistakes surface in a diagnostics panel with `pass:line:col` against
   the assembled source; the last good compile keeps ticking underneath.

Determinism: same definition + map + seed + brush log ⇒ same run on a given
device. Cross-device bit-parity is explicitly not a goal.

## 6. Out of scope for v1 (named so we don't design into a corner)

- **Integer/id fields** (`field<u32>`) — territory ownership, faction ids.
- **Per-player scalars** — reduces with `groupBy(owner)` → scalar arrays;
  the bridge to real win conditions.
- **Iterate blocks** — N-pass relaxations (the worldgen's fill/flow pattern)
  as a first-class construct.
- **Entities** — sparse units stamping into fields (CPU list + brush
  mechanism covers the near term).
- **Node-graph editor** — the definition shape is already JSON-safe for it.
