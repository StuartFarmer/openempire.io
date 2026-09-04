# #shell fronts, battle damage, and a richer tile info box

## Why

Three additions to OpenFront-live in the `#shell`, all reading the in-process
sim (no core rules change):

1. **Fronts.** Combat is a per-tick _grind_ (confirmed: an `attack` commits
   troops to a reservoir that is bled tile-by-tile each tick as the frontier
   advances — it is NOT instantly consumed). Nothing visualizes the contested
   border. Colour it by force balance — green (your side pushing) → white (even)
   → red (enemy pushing) — with a signed troop-imbalance label along each front.
2. **Battle damage ("erosion").** The sim already scars conquered-in-combat tiles
   (`game.tileDamage`, "battle-worn ground", `packedDamageUpdates`) and gates
   growth on them; WebGL draws a brown wash. The shell captures density and farm
   deltas but **ignores `packedDamageUpdates`**. Port it as a brown wash conduit.
3. **Richer tile info box.** The bottom-left readout should say more — elevation,
   climate, biome, fertility, structure, urban density, farm growth, and battle
   damage — combining the terrain derivation fields with the live sim.

## What Changes

- **Fronts (border colouring + labels).** A per-tile `front` conduit encodes the
  local force balance on active fronts involving the human (from
  `myPlayer.outgoingAttacks()`/`incomingAttacks()` — attacker vs defender
  troops, localized by front length). The overlay tints front tiles green→white→
  red. DOM labels at each attack's `clusteredPositions()` show the signed troop
  imbalance (`+N` / `-N`), coloured to match.
- **Battle damage.** A per-tile `damage` conduit (0..255) fed from
  `packedDamageUpdates` (parallel to `density`), rendered as a brown "battle-
  worn" wash, matching the WebGL damage overlay.
- **Info box.** OpenFront-live hover now shows owner + troops + structure/urban/
  farm + fertility + **damage**, then the terrain detail (elevation, surface,
  temp, humidity, biome) — reusing the terrain derivation fields.

## Capabilities

### New Capabilities

- `shell-fronts`: contested-border force-balance colouring + signed imbalance
  labels for the human's active fronts.
- `shell-battle-damage`: per-tile combat damage ("erosion") rendered as a brown
  wash, ported from the sim's ignored `packedDamageUpdates` stream.
- `shell-tile-info`: a rich per-tile hover readout combining sim + terrain state.

## Impact

- `src/client/GameShellPage.ts` — capture `packedDamageUpdates`; compute the
  `front` balance field + upload `damage`/`front` each tick; front labels in the
  DOM overlay; the richer hover readout (already refactored).
- `src/client/lab/systems/openfront/` — `damage` + `front` conduit layers +
  overlay compositing.
- `tests/FieldDynamics.test.ts` — openfront layer set (+damage, +front).
- No `src/core` changes.
