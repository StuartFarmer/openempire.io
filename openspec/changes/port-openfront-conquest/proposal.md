# Port OpenFront conquest to a terrain game

## Why

The playable WebGL game is OpenFront's core sim: players own tiles, raise
troops from their population, and expand by attacking — where **the terrain
sets the cost** (attacking Plains is cheap, Mountains dear) and combat resolves
on the attacker-vs-defender troop ratio. The WebGPU lab has cellular prototypes
(empire/territory) that approximate expansion, but with an ad-hoc linear
elevation defense, not OpenFront's real terrain-typed cost or troop-ratio
losses. We want a `conquest` game that ports those actual formulas onto the
terrain base, so the WebGPU game feels like OpenFront: the same mountains that
render on the map are the same mountains that break an offensive.

The agent/discrete parts of OpenFront (nukes, warships/boats/trains, cities/
ports/SAM/defense-posts, alliances/teams, gold, the priority-queue expansion)
do not fit a per-tile field and are out of scope — a cellular game has no
entity layer.

## What Changes

- **A new `conquest` terrain game.** Owner (u32) / troops / population layers
  composed on the terrain base, reading its climate for carrying capacity and
  its elevation for the attack cost. Population grows toward the land's
  capacity; troops mobilize from population toward it; the frontier advances
  by the incursion → owner/troops flip the empire/territory prototypes already
  use — but with OpenFront's real combat.
- **OpenFront's terrain-typed conquest cost.** The tile's terrain type (from
  its elevation above sea — `magnitude < 10` Plains, `< 20` Highland, else
  Mountain in the core sim) sets the defense magnitude (Plains 80, Highland
  100, Mountain 120) and advance speed (16.5 / 20 / 25). A game layer derives
  the type from the terrain base's `elevation` and applies the same numbers.
- **OpenFront's troop-ratio combat.** Attacker/defender losses scale with the
  troop ratio (the `within(defender/attacker, 0.6, 2) · mag` shape from
  `Config.attackLogic`), and the advance rate with `attackTilesPerTick`. The
  per-player aggregates OpenFront uses (defender troops per owned tile) become
  the tile-local troop garrison in the cellular model.
- **The conquest combat lives in the game's own `lib/`** (system-specific, per
  the shared-library rule), not in `shared::`.
- **Registered in `#shell`** as a game composed on terrain, with a conquest
  overlay (ownership washed over the rendered world), the spawn brushes, and
  the standard bot AI.

## Capabilities

### New Capabilities

- `openfront-conquest-game`: a cellular `conquest` game on the terrain base that
  ports OpenFront's terrain-typed attack cost (Plains/Highland/Mountain
  magnitude + speed) and troop-ratio combat, with a population→troops economy
  bounded by the terrain's carrying capacity.

## Impact

- New `src/client/lab/systems/conquest/` — the game (layers, `lib/conquest.wesl`
  with the terrain-typed cost + troop-ratio formulas, an overlay view, manifest).
- `src/client/GameShellPage.ts` — register `composeTerrain(conquest)` in the
  game list.
- No `src/core`, map/sidecar, or shipped-game-rule changes — this reads the
  core `attackLogic`/`terrainType` formulas and re-expresses them in the lab.
