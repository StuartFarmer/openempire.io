# Field Dynamics — spec

A systems-dynamics layer on top of FieldKernel. **Everything per-tile is a
layer, and every layer has the same interface.** A system is a folder: a typed
TS manifest (params, scalars, brushes, views — pure data) plus one WESL file
per _dynamic_ layer. The compiler links everything into generated compute
passes and a per-tick dispatch program. Swap the folder, get a different game.

- Step 1 (done): `src/client/webgpu/FieldKernel.ts` — layers + pass runtime.
- Step 2 (done): `src/client/webgpu/FieldDynamics.ts` — system folder →
  compiled system (tests: `tests/FieldDynamics.test.ts`).
- Step 3 (done, v1): `src/client/FieldLabPage.ts` — the `#lab` page. Systems
  live in `src/client/lab/systems/<id>/`.

Decisions taken (2026-07-16): **TS-literal manifest** (JSON-safe shape for a
later graph editor); **WESL files, one per dynamic layer** — shader code lives
in real `.wesl` files linked with [wesl-js](https://wesl-lang.dev), and **the
import list is the dependency declaration** (no name-scanning of shader
bodies, no by-convention strings); **one unified layer concept** — map planes
and dynamic state expose the identical module API; **state preserved across
recompiles**; **grazing ecology** as the first proof system.

---

## 1. Mental model

Classic stocks-and-flows, lifted from scalars to per-tile layers:

| Concept           | Meaning                                        | GPU realization                                                                                  |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **layer**         | one f32 per tile, uniform read API             | storage buffer + a generated state module per pass                                               |
| — _dynamic_ layer | evolves each tick                              | its own `layers/<name>.wesl` file → ping-pong buffer + linked init/update passes                 |
| — _map_ layer     | read-only terrain input, no file               | `layers.bin` planes (`crop metal oil temperature humidity water`) + `land` from the terrain bits |
| **scalar**        | one global f32 (later: per-player)             | slot in a GPU-resident `Sim` struct, written by reduce passes                                    |
| **param**         | designer-tunable constant                      | uniform member → automatic slider, live (no recompile)                                           |
| **brush**         | pointer input stamped into a dynamic layer     | generated stamp pass driven by a small uniform                                                   |
| **reduce**        | any layer → scalar (sum/max/min)               | atomic reduction pass (fixed-point integers → order-independent, deterministic)                  |
| **view**          | any layer or a `.wesl` expression → color ramp | generated colorizer pass → FieldKernel's present path                                            |

**Update semantics (the one rule that matters):** by default every tick is
synchronous. `update` returns the layer's next value; every read — including
of the layer being updated — sees the _previous_ tick (Jacobi step, classic
CA semantics), so update order is meaningless and cross-layer feedback loops
are legal, simply delayed one tick. Mechanically: stock passes read `.read`
facets and write `.write`, carry no `advances`, and the tick program swaps
all dynamic layers at once in a commit phase.

**Staged ordering (opt-in):** when order should matter, declare `phases` in
the manifest — `phases: [["food"], ["population", "labor"]]`. Each phase
commits before the next runs, so later phases read earlier phases'
**current-tick** values (Gauss-Seidel staging); within a phase, updates stay
synchronous. Updated layers not listed run in a final implicit phase. A
layer's own reads always see its previous value (it commits after its own
update).

## 2. A complete system

```
src/client/lab/systems/grazing/
  system.ts             ← manifest (pure data)
  layers/grass.wesl     ← one file per dynamic layer
  layers/herd.wesl
  views/pressure.wesl   ← optional custom views
  lib/…                 ← optional shared WESL, importable as package::lib::…
```

A layer file defines the layer's **transition functions** — it is not the
layer's state. State lives in two registries imported whole — `params` and
`layers` — and every layer in the registry has the identical class-like API:

```wgsl
// layers/herd.wesl
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  var v = layers::herd::val(i);
  v += params::herdBirth() * v * layers::grass::val(i);
  v -= params::herdDeath() * v;
  v += params::herdSpread() * (layers::herd::avg8(x, y) - v);
  return select(0.0, clamp(v, 0.0, 1.0), layers::land::val(i) != 0.0);
}
```

Reading it: `layers::land` (a map plane) and `layers::grass` (another dynamic
layer) are accessed exactly the same way; the layer's own previous-tick state
is `layers::herd` like anywhere else (alias it if you prefer:
`import package::layers::herd as prev;` → `prev::val(i)`). `update` returns
the next value — no output buffers, no ping-pong knowledge, no binding
declarations. The layer's name is its filename.

The manifest wires the data-shaped parts. Note map layers are first-class
everywhere a layer is expected (the `fertility` view shows the raw crop
plane):

```ts
// system.ts
export const grazing = defineFieldSystem({
  id: "grazing",
  name: "Grazing",
  params: {
    grassGrowth: { value: 0.04, min: 0, max: 0.2 },
    // …
  },
  scalars: {
    totalHerd: { reduce: "sum", layer: "herd" },
    peakGrass: { reduce: "max", layer: "grass" },
  },
  brushes: {
    seedHerds: { target: "herd", mode: "set", value: 1, radius: 4 },
  },
  views: {
    herds: { layer: "herd", ramp: ["#0b1220", "#f0c86e"] },
    fertility: { layer: "crop", ramp: ["#141414", "#b9e08a"] },
    pressure: { source: "views/pressure.wesl", ramp: ["#101418", "#e05555"] },
  },
  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
```

A custom view is a `.wesl` file exporting `fn value(x, y, i) -> f32`, with the
same imports available as layer files.

## 3. The layer API (and the other imports)

Four registries, imported whole and used through qualified paths:

| Registry                   | Usage                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import package::layers;`  | `layers::<name>::val(i)` — value at a tile index (previous tick); `layers::<name>::at(x, y)` — clamped read by coordinates. **f32 layers** add `sum8/avg8/max8/min8(x, y)` neighbor reductions; **id (u32/i32) layers** add `count8_eq(x, y, id)` and `any8_ne(x, y, id)` (front detection). Identical for dynamic and map layers. |
| `import package::params;`  | `params::<name>() -> f32` — tunable param (live slider, no recompile); `params::seed() -> i32`. Unknown names are compile diagnostics.                                                                                                                                                                                             |
| `import package::players;` | `players::val(p)` — the per-player input struct (fields from the manifest's `players` block, CPU-written each frame via `writePlayers`); `players::count() -> u32`.                                                                                                                                                                |
| `import package::sim;`     | `sim::tick() -> u32`; deterministic per-tile/per-tick `sim::rand(x, y)`; seeded fbm `sim::noise(x, y, freq, octaves)`; reduce values `sim::scalar_<name>()` — or `sim::scalar_<name>(p)` for `groupBy` scalars.                                                                                                                    |

**Layer types:** a dynamic layer's type is the return type of its `fn init` —
`fn init(x, y, i) -> u32` makes a u32 layer (e.g. `owner` holding player
ids). Map layers are f32.

**Per-player scalars:** `scalars: { food: { reduce: "sum", layer: "food",
groupBy: "owner" } }` turns the scalar into an array of `players.count`
values, accumulated by the group id read from the (u32/i32) `groupBy` layer;
`decodeScalars` returns it as a `number[]`. The `count` reduce op tallies
tiles (`{ reduce: "count", groupBy: "owner" }` = tiles owned per player).

Registries alias (`import package::layers as L;`) and specific modules import
directly (`import package::layers::herd as prev;` → `prev::val(i)`) — both
standard WESL. Also available:

| Import                                                                        | Provides                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `import package::kernel::{GRID, OFF, inBounds, refOf, clamp01, hash01, fbm};` | grid helpers + the worldgen's noise stack         |
| `package::lib::…`, `super::…`                                                 | your own shared WESL modules in the system folder |

The only dynamic/map layer difference is writability: `update`, brushes, and
init apply to dynamic layers; targeting a map layer is a compile diagnostic
("read-only").

**How it works:** the compiler scans each file's `import` statements and
qualified registry references (nothing else), derives the pass's bindings
from them, generates the registry modules with the assigned binding indices,
wraps the transition in a dispatch root, and links with wesl —
identically-named members across layer modules are mangled correctly by the
linker, and item-level tree-shaking keeps each pass minimal. Two error
surfaces, both precise:

- unknown layers/params/scalars → compiler diagnostics before linking, e.g.
  `layers/herd.wesl: "gras" is not a layer (dynamic: grass, herd; map: crop, …)`;
- WESL/WGSL errors → link errors with file/line/caret, and any surviving WGSL
  issue is reported by FieldKernel against the numbered assembled source,
  tagged with the pass name.

## 4. What the compiler emits

For grazing: per dynamic layer an `init/<name>` and `stock/<name>` pass (fully
linked WGSL, `raw: true` to FieldKernel — binds derived from the imports, e.g.
`["P", "grass.read", "herd.read", "land", "herd.write"]`); plus generated
`sim/zero` (tick++, zero reduce slots, in-stream so multi-tick batching
works), `reduce/*` (fixed-point/bitcast atomics), `brush/*` (stamp), and
`view/*` passes. Structs (`Params`, `Sim`/`SimAtomic`, `Brush`) are generated
from the manifest.

The tick program (synchronous commit):

```ts
compiled.runTick(kernel, frame);
// = frame.pass("sim/zero")
//   frame.pass("stock/grass")   reads *.read → writes grass.write
//   frame.pass("stock/herd")    reads *.read → writes herd.write
//   kernel.swap("grass"); kernel.swap("herd")   // commit
//   frame.pass("reduce/totalHerd"); frame.pass("reduce/peakGrass")
```

Budget: ~6 dispatches/tick; measured ~1.5 ms/frame at 240 ticks/sec on
Verdantia (512×256, Apple Metal).

The compiled object the lab page consumes: `kernelConfig` (hand to
`FieldKernel.create`), `paramList` → sliders, `viewNames`/`brushNames` →
dropdowns, `layerNames` (dynamic, for state migration) / `mapLayers` (planes
to upload), `writeParams`/`encodeBrush`/`decodeScalars` codecs, and
`runInit`/`runTick`/`runView` programs.

## 5. The developer experience loop

1. Copy a system folder, register it in `src/client/lab/systems/index.ts`.
2. Open `#lab`: pick a map and the system. Params become sliders, views the
   dropdown, brushes the palette; play / pause / step / reset from the
   harness. **Play runs a fixed game clock** (default 10 ticks/s — matching
   OpenFront's 100 ms tick — adjustable, with a catch-up clamp so an
   overloaded GPU dilates sim time instead of freezing). **Turbo** is
   GPU-bound fast-forward: command buffers submit back to back with the
   batch size adapting toward ~25 ms of GPU time each, so throughput is
   whatever the hardware gives (~20k ticks/s on Verdantia, ~60/s on the
   4096×2048 EarthXL) while pause/brush latency stays ~one batch.
3. Paint, watch, flip views to debug — the view dropdown is the pass-graph
   debugger.
4. Edit a `.wesl` file → Vite HMR → recompile in milliseconds → **state is
   preserved** for dynamic layers whose names survive (read back and
   re-uploaded across the kernel swap); new layers run `init`; Reset reruns
   all inits.
5. `.wesl` files are real files: WESL editor tooling (syntax highlighting,
   the WESL VS Code extension) applies. The generated `package::layer`/
   `params`/`sim` modules exist only at compile time, so a vanilla LSP shows
   their imports as unresolved — a generated stub package can fix that later.

Determinism: same folder + map + seed + brush log ⇒ same run on a given
device. Cross-device bit-parity is explicitly not a goal.

## 6. A system is a self-contained game (codify-game-systems)

A `FieldSystem` is a plain object conforming to one interface — **there are no
per-system classes.** `compileFieldSystem` is the single compiler and
`FieldViewerBase` (the `#lab` blit preset, the `#shell` camera preset) is the
single host; a system is data + WESL + at most two closures. Beyond the
mechanics/layers/views/params above, a system self-describes and owns its
inputs and AI:

```ts
export const raiders = defineFieldSystem({
  id: "raiders", name: "Raiders",
  description: "Click a tile to send troops.",
  kind: "game",                 // "study" | "game" — viewer chrome hint (JSON-safe)
  renderer: "camera",           // "camera" | "blit" preference (hint)
  defaultMap: "EarthXL",
  defaultView: "territory",

  players: playerIntent(5),     // shared standard intent fields (alive/attacking/target…)

  // ── the only non-JSON-safe parts: two TS closures ────────────────────
  input: {                      // pointer/key → brush stamp or player intent
    cursor: "crosshair",
    onTile(ctx, x, y) {
      ctx.setPlayer(ctx.localPlayer, { attacking: 1, targetX: x, targetY: y });
      return true;              // consumed → the camera does not pan
    },
  },
  ai: {                         // non-human players (writeBots is gone)
    cadenceTicks: 40,
    decide: (ctx) => nearestEnemyAI(ctx, { commit: 0.6 }),
  },

  params: { /* … */ }, views: { /* … */ }, brushes: { /* … */ },
  modules: import.meta.glob("./**/*.wesl", { query: "?raw", import: "default", eager: true }),
});
```

**Inputs and AI both write the `players` intent channel.** `ctx.setPlayer(p,
fields)` accumulates a per-player intent; the viewer flushes it via
`writePlayers`, and WESL layers read it with `players::val(p)`. `input.onTile`
receives tile coordinates already resolved through the camera; returning `true`
tells the viewer the gesture was consumed (so it pans only on an unconsumed
drag; shift-drag always pans). A system with **no** `input` keeps the viewer
default (camera pan/zoom/hover, or brush paint), and a system with no `ai` runs
without bots — so `study` systems need neither.

Both hooks are TS (not JSON-safe) by choice, for flexibility; every other field
stays serializable, so a hook is the explicit "this system needs custom code"
boundary (the node-graph aspiration survives for the data).

### The shared library (`shared::`)

**Game-agnostic** WESL primitives live in `src/client/lab/shared/**.wesl`,
linked into every system as the `shared::` package (a wesl-js `libs` bundle).
Import them anywhere a registry import is legal:

```wgsl
import shared::growth::logistic;        // logistic / decay / grow
import shared::diffusion::blend;        // one relax/spread step
import shared::palette::{lerp3, ramp3}; // color ramps
```

Shared modules follow the **lib convention** — pure functions taking all values
as arguments (no `layers::`/`params::` imports), so they are system-agnostic;
each caller passes its own params. (Noise/`fbm`/`hash01` remain in
`package::kernel`, already available everywhere.) Reusable **TS** fragments live
in `src/client/lab/shared/index.ts`: `PLAYER_INTENT_FIELDS` / `playerIntent(n)`
and AI helpers like `nearestEnemyAI`.

**What stays out of `shared::`:** a system's *specific* mechanics — its combat
resolution, defense/conquest rules, and the data encodings those use — live in
that system's own `lib/` (empire and territory each keep their `lib/combat.wesl`,
with different defense formulas and deterministic vs stochastic conquest). Two
systems having similar mechanics is not a reason to promote them; `shared::` is
for genuinely generic math, not shared *rules*.

## 7. Out of scope for v1 (named so we don't design into a corner)

- **Iterate blocks** — N-pass relaxations (the worldgen's fill/flow pattern)
  as a first-class construct.
- **Entities** — sparse units stamping into layers (CPU list + brush
  mechanism covers the near term).
- **Node-graph editor** — the manifest shape is already JSON-safe for it.

(Shipped since v1: typed `u32`/`i32` layers, per-player `groupBy` scalars,
and the `players` input registry — the substrate for territory/game
mechanics.)
