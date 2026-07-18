# Design — Codify a system as a self-contained game

## Goal

Make a "system" the complete unit of a playable experiment: mechanics (layers),
GPU program (passes/derive), presentation (views/renderer), tuning (params),
readouts (scalars), and — the parts missing today — **inputs**, **AI**, and a
**shared library** of common mechanics. Authoring a new game = a folder + a
registry line, pulling reusable pieces from `shared::` instead of copy-paste.

## The System contract

`FieldSystem` keeps its current data-shaped fields (`id`, `name`, `params`,
`scalars`, `brushes`, `views`, `players`, `phases`, `derive`, `modules`) and
gains:

### Metadata (JSON-safe)

```ts
description?: string;
kind?: "study" | "game";          // default "study"; "game" ⇒ players/ai/input chrome
renderer?: "camera" | "blit";     // preferred renderer (hint); default per kind
defaultMap?: string;              // e.g. "EarthXL"
defaultView?: string;             // initial view name
```

These stay pure data so the node-graph-editor aspiration survives for
everything except the two hooks below.

### `input` — the gesture→intent hook (TS)

Pointer and key gestures, already resolved to tile coordinates by the viewer's
camera, handed to system code that either stamps a declared brush or writes the
local player's intent fields.

```ts
input?: SystemInput;

interface SystemInput {
  /** Pointer press/drag over a map tile. */
  onTile?(ctx: InputContext, x: number, y: number, ev: PointerEvent): void;
  /** Key press while the viewer is focused. */
  onKey?(ctx: InputContext, ev: KeyboardEvent): void;
  /** CSS cursor hint over the map. */
  cursor?: string;
}

interface InputContext {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly running: boolean;
  /** The human's player slot (0 by convention). */
  readonly localPlayer: number;
  /** Stamp a declared brush at a tile (the existing brush pass). */
  stamp(brush: string, x: number, y: number): void;
  /** Merge fields into a player's next intent (flushed via writePlayers). */
  setPlayer(p: number, fields: Record<string, number>): void;
}
```

Systems with no `input` fall back to the viewer default: pan/zoom/hover under
the camera, or brush-paint in the lab (exactly today's behavior), so existing
systems are unaffected.

### `ai` — the bot driver (TS)

```ts
ai?: SystemAI;

interface SystemAI {
  /** Re-decide every N ticks (default e.g. 40 — ~4s at 10/s). */
  cadenceTicks?: number;
  decide(ctx: AIContext): void;
}

interface AIContext {
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
```

Both hooks write through the existing `players` registry — `setPlayer`
accumulates a per-player intent record that the viewer encodes with
`compiled.writePlayers` and uploads to the `PL` buffer each frame. WESL layers
read them via `players::val(p)` exactly as now. AI stays CPU/TS (strategic
per-player decisions); systems wanting GPU "AI" still use extra layers/passes.

### Why TS hooks

`input`/`ai` are arbitrary logic, chosen for flexibility over the JSON-safe
manifest goal (a node-graph editor could still author every data field and
treat a system with hooks as "has custom code"). They are the *only*
non-serializable parts; keeping them as two named, optional functions makes the
boundary explicit.

## The shared WESL library (`shared::`)

### Location & import

Shared modules live in `src/client/lab/shared/**.wesl`, authored once and
imported by any system:

```wgsl
import shared::combat::{defenseOf, conquers};
import shared::growth::logistic;
```

Shared modules follow the established **lib convention**: pure functions that
take all values as arguments (registry imports like `layers::`/`params::` are
scanned only in layer/view/pass files, never in libs). This keeps them
system-agnostic.

### Linking mechanism

The compiler already assembles a flat `weslSrc` map for `link()`
(`main.wesl` + `kernel.wesl` + generated registries + the system's
`userModules`), where `package::kernel` resolves to `kernel.wesl`. Two ways to
expose `shared::`:

1. **Preferred — a real linked package.** Register `shared` as a library
   package via wesl-js's library support (a named `{ name: "shared", weslSrc }`
   lib passed to `link`), so `import shared::combat` resolves cross-package. The
   shared tree is loaded once (an `import.meta.glob` index) and passed on every
   compile.
2. **Fallback — aliased into the package.** If the pinned wesl-js version does
   not cleanly support a named lib in `link()`, inject the shared files into
   each system's `weslSrc` under `shared/<name>.wesl` keys and expose them as
   `package::shared::<name>`. Same modules, slightly less clean spelling.

The implementation verifies the wesl-js `link` API and takes (1) if available;
this is the single open implementation detail (it does not affect the authored
`shared::` spelling in (1)).

### Seed modules (from real duplication + obvious reuse)

| Module | Provides | Replaces |
| --- | --- | --- |
| `shared::combat` | `defenseOf(troops, pop, elevation, isNeutral, …)`, `conquers(pressure, attacker, owner, defense, margin) -> bool` (deterministic, hysteresis margin) | the diverged `combat.wesl` in empire + territory |
| `shared::pack` | `packClaim(attacker, pressure) -> u32`, `unpackAttacker`, `unpackPressure` (bits 24..31 / 0..23) | the incursion/attack encoding copied in both |
| `shared::diffusion` | `blend(prev, neigh, rate)` spread/relax step (pairs with `avg8`) | grazing spread, supply diffusion |
| `shared::growth` | `logistic(v, rate, cap)`, `decay(v, rate)`, `grow(v, rate, food)` | settlement/grazing/empire pop math |
| `shared::palette` | ramp `lerp3`, biome color helpers | world `lib/palette.wesl`, ad-hoc ramps |
| `shared::noise` | `hash01`, `fbm` re-exported under a stable name | scattered `package::kernel` noise imports |

`shared::combat`/`pack` are the concrete de-duplication targets (empire and
territory converge on them, each passing its own params); the rest are factored
as systems adopt them — the library grows with demand, seeded from what already
exists.

### Shared TS fragments

A small `src/client/lab/shared/index.ts` surface for manifest reuse:

- `PLAYER_INTENT` — the standard per-player intent field set (`alive`,
  `attacking`, `commit`, `targetX`, `targetY`) so game systems declare
  `players: PLAYER_INTENT` instead of re-listing it.
- Common param presets (e.g. a `GROWTH_PARAMS` block) and reusable AI helpers
  (`nearestEnemyAI(ctx, …)`) that systems compose.

## Viewer integration

`FieldViewerBase`:

- Removes the hardcoded `writeBots`. Each frame batch (or on `ai.cadenceTicks`),
  if the mounted system has `ai`, build an `AIContext`, call `decide`, and
  `writePlayers` the accumulated intents.
- Routes pointer/key events to `system.input` when present (via an
  `InputContext` whose `onTile` receives camera-transformed tile coords, and
  whose `stamp`/`setPlayer` wrap the existing brush + players plumbing). With no
  `input`, keep today's defaults (camera pan/zoom/hover in the shell; brush
  paint in the lab).
- Reads `renderer`/`defaultMap`/`defaultView` when mounting a system.

The shell's current camera pan/zoom/hover becomes the *default* input for
systems without an `input` hook; a game system's `input` can still opt into pan
by calling nothing on plain drag (the viewer pans when the hook does not
consume the gesture) — the hook returns whether it handled the event.

## Non-goals

- No change to the sim/derive execution model, the sidecar formats, or any
  shipped tribal-economy game rule.
- No GPU-resident AI (AI is a CPU/TS hook writing the players struct).
- Win/lose conditions and multi-human input remain future work (a `kind:
  "game"` system can encode outcomes in scalars for now).
