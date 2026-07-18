# Games on a shared terrain base

## Why

Every sim system today re-derives its own crude world. `empire`/`settlement`
read the raw `layers.bin` planes and a naive latitude×tilt swing to fake
temperature, and the merged `layers.bin` water plane for moisture — none of the
rich terrain derivation that already exists (real continentality/seasons from
`season.bin`, drainage-accumulated `water`, irrigation-adjusted `humidity`,
depression-filled `elevation`, biome classification). So each "system" is a
whole separate world, and the good climate the terrain derivation produces is
thrown away and badly re-approximated per system.

We want the opposite: **one terrain, many games.** The terrain derivation is
the always-on world substrate; a *game* is just a ruleset — its own layers,
players, AI, input — that READS the established terrain fields. Recreating the
existing systems then means writing rules against `layers::temperature` /
`layers::water` / `layers::biome`, not re-deriving climate. Swap the ruleset,
keep the world.

## What Changes

- **Terrain becomes the always-on base.** The viewer always runs the terrain
  derivation; the picker lists *games* (rulesets), not standalone systems.
  Selecting a game composes it onto terrain in one kernel; "no game" is just
  the terrain world view.
- **The terrain-derived fields are readable by a game's per-tick layers.** The
  derivation's outputs — `temperature`, `precipitation`, `humidity`, `water`,
  filled `elevation`, and the biome/water `flags` — are exposed to the layer
  registry as read-only inputs, so a game layer reads `layers::temperature::val(i)`
  exactly like a `layers.bin` plane. (Today they are a separate `derivedNames`
  buffer namespace the per-tick loop can't see.)
- **The terrain derivation gets its own uniform.** It keeps the worldgen
  `Params` under a distinct name (`TP`), so a composed game keeps `P` for its
  own param sliders. The viewer writes `TP` (climate knobs/seasons, as the
  shell does now) and `P` (the game's params) independently.
- **A game is composed onto terrain by the viewer/registry, not per-manifest.**
  There is no `base:` field to declare — terrain is implicit for every game
  (the chosen "always-on" model). A game manifest declares only its ruleset
  (layers/views/params/brushes/players/ai/input); the compiler merges the
  shared terrain base.
- **Recreate the existing games on terrain.** `grazing`, `settlement`, and
  `empire` become rulesets reading the terrain fields; their crude climate
  re-derivation layers (`temp`, and the potential/gdd moisture math) are
  rewritten against the real terrain fields and the old versions removed.

## Capabilities

### New Capabilities

- `terrain-base-composition`: the terrain derivation is an always-on base whose
  derived fields are readable by a composed game's per-tick layers; the terrain
  derivation carries its own uniform so a game keeps `P` for its params; the
  viewer composes terrain + the selected game in one kernel.

### Modified Capabilities

<!-- game-system-contract (codify-game-systems): a "system" split into a shared
terrain base + a game ruleset; the shell picker lists games, terrain is implicit. -->

## Impact

- `src/client/webgpu/FieldDynamics.ts` — expose (marked) derive fields to the
  layer registry as read-only inputs; `derive.uniform` gains a `name` (terrain →
  `TP`); compose a shared terrain base into a game at compile.
- `src/client/lab/systems/terrain/system.ts` — the terrain derive block becomes
  the reusable base (its output fields marked exposed; uniform named `TP`).
- `src/client/GameShellPage.ts` — always derive terrain; the picker selects a
  game composed onto terrain; write `TP` (terrain) + `P` (game) uniforms; game
  overlays over the terrain views.
- `src/client/lab/systems/{grazing,settlement,empire}/` — recreated as terrain
  games; crude climate layers removed.
- No `src/core`, map/sidecar, or shipped-game-rule changes — lab/viewer
  substrate.
