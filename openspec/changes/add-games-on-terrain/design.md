# Design — Games on a shared terrain base

## Model

```
terrain (always-on base)          a game (ruleset)
  derive: elevation → climate  +    layers/*.wesl reading layers::temperature,
   → drainage → biome/water          layers::water, layers::biome, …
  exposes: temperature, water,       players / ai / input / views / params
   humidity, precipitation,
   elevation(filled), flags
```

One compiled kernel per game = the terrain derivation (runs at load, re-runs on
climate knob / season tick) + the game's per-tick layers (read the terrain
fields). "No game" = terrain alone (today's behavior).

## Compiler changes (`FieldDynamics`)

### 1. Exposed derive fields readable by layers

A derive field may be marked `exposed: true`. Exposed fields join the per-tick
**layer registry** as READ-ONLY inputs: `layers::<name>::val(i)` / `::at(x,y)` /
`avg8`… resolve to the derive buffer. A game layer that writes one is a compile
error ("read-only, terrain-derived"). Binding: a plain derive buffer binds as
`<name>`; a ping-pong derive field (fill/water/irrigation) binds its settled
`<name>.read`. The terrain base marks `temperature`, `precipitation`, `humidity`,
`water`, `fill` (as filled elevation), and `flags` (biome/water bits) exposed;
its raw inputs (`elevation`, `tempBase`, …) are exposed too.

### 2. The derive uniform gets a name

`FieldDeriveSpec.uniform` gains `name` (default `"P"` for back-compat). The
terrain base uses `name: "TP"`. The kernel then carries `P` (the game's
generated `Params`), `TP` (the worldgen `Params`), and `B` (brush). Derive
passes bind `TP`; the game's layers/views bind `P`. The viewer writes each
independently (`writeUniform("TP", buildWorldgenParams(...))`,
`writeUniform("P", writeParams(...))`).

### 3. Compose terrain into a game

`composeTerrain(game): FieldSystem` merges the shared `TERRAIN_DERIVE` block
into a game manifest: the game gains the terrain derive stage (fields, steps,
inputs, prepare, modules, `TP` uniform), and the terrain's exposed fields become
readable by the game's layers. Name collisions (a game layer named
`temperature`) are a compile error. The viewer/registry applies `composeTerrain`
to every game — terrain is implicit, never declared per-manifest.

`TERRAIN_DERIVE` is extracted from the current `terrain` system (the derive
block verbatim, uniform renamed `TP`, outputs marked exposed). The terrain-only
view is `composeTerrain({}))` — the base with no ruleset.

## Viewer changes (`GameShellPage`)

- Always compose + mount `composeTerrain(selectedGame)`. The picker lists games
  (`world`/none, grazing, settlement, empire, …); terrain always derives.
- Run the terrain derivation tiers (full / recolor / season) on `TP` as today,
  and tick the game's layers on `P`. Terrain views (`terrain`, `temperature`)
  stay; a game adds its own views (population, ownership…) as overlays on the
  same camera.
- Climate knobs write `TP`; the game's param sliders write `P`.

## Recreating the games

Each game drops its crude climate layers and reads the terrain fields:

| Game         | Was                                    | Now (reads terrain)                                                                                                                        |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `grazing`    | grass from `crop`, herd                | grass from `layers::crop` × `layers::temperature` growth; herd unchanged                                                                   |
| `settlement` | `temp`/`gdd`/`crops` re-derived        | crops from `layers::temperature` + `layers::water` + `layers::humidity`; pop unchanged                                                     |
| `empire`     | `temp` swing + `potential` from planes | `potential` from `layers::temperature` (real seasons) + `layers::water` (drainage) + `layers::humidity`; pop/troops/owner/combat unchanged |

The seasonal swing that games faked (`temp.wesl`) is deleted — the terrain
`temperature` already carries real continentality + seasons, advanced by the
viewer's season tier.

## Non-goals

- No change to the terrain derivation's math, the sidecar formats, or core.
- Territory (pure combat, no climate) may compose terrain harmlessly but is not
  rewritten in this pass.
- GPU-resident AI, win conditions — unchanged from the game-system contract.
