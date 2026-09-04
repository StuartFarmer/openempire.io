## Context

Tile state lives in sparse per-tile maps, not on the plot units:

- `PlayerImpl._farmMaturity` (crop milli 0..1000), `_density` (city people), and `_landUse` (`Field`/`Urban` zoning) — all per player.
- `GameImpl._tileDamage` (combat damage milli, freezes growth, heals ~100 ticks), `_tileTenure`, `_plotOccupancy` (tile → nucleus unit).

Today `_landUse` **already persists** through senescence (`FarmGrowth.ts:147`) and recession (`UrbanGrowth.ts:326`) — only the fill (maturity/density) is zeroed. But two things break "once occupied, always occupied":

1. **Rendering** — a zeroed field pushes a `field byte 0` delta and a receded city pushes `density 0`; the shell's `computePlot` (`ShellSim.worker.ts:101`) then emits plot type `0`, so the renderer draws wild ground. The land silently regrows later, but the idle state is invisible.
2. **Conquest** — `GameImpl.conquer` (`GameImpl.ts:845`) _deletes_ `_landUse` + `_tileTenure` (scorched raw land), and `PlayerExecution.ts:49` rolls `capturedPlotRazeChance` to _delete_ a fraction of captured nuclei. So conquest erases the type instead of keeping it, and the fire FX only plays on a plot **unit** death (`Renderer.applyDeadUnits` / worker `burnDelta`), never on the surrounding conquered tiles.

The primary in-game renderer is the WebGPU shell (`CameraRenderer` + `openfront.wesl`); the WebGL renderer (`PlotPass`/`PlotFirePass`) is the secondary path. Both must stay in parity (specs require it).

## Goals / Non-Goals

**Goals:**

- Worked land is permanent: a declining field drops to an **initial farmland** state and a receding city to an **empty urban lot**, both rendered and both regrowing in place — never reverting to wild while the owner lives.
- Conquest keeps each tile's type for the new owner, burns every conquered tile for the heal duration (~100 ticks), and regrows it as the conqueror's own tile of the same type.
- Fire plays on **every** conquered tile (not just a dying nucleus), and the flame rages for 5 s in both renderers.

**Non-Goals:**

- No change to whole-nation elimination (a dead nation's land still reverts to neutral — `FoodEconomy.ts:366`).
- No new gold/age mechanics; no map-flag/predicate (activation is by the rules themselves, per repo Boundaries).
- Not adding per-tile houses to the whole city body — the shell keeps nucleus houses + density wash; we add only the persistent **empty-lot** signal.
- Not deleting `capturedPlotRazeChance` from `FoodConfig` (kept defined but dormant, per lean-fork "keep dormant units/knobs" rule).

## Decisions

### D1 — Land-use zone is the authority for tile membership; fill is the regrowable overlay

`_landUse` becomes the source of truth for "is this a field/city tile." Field membership (`PlayerImpl.isFieldTile`) and the urban precedence check key off `_landUse === Field/Urban`, not off maturity ≥ claim or density > 0. Maturity (fields) and density (cities) are the fill that grows and decays _within_ a permanent zone.

- **Field senescence** (`FarmGrowth.ts:147-154`): a fallow tile that would fall below `fieldClaimMilli` is **floored at `farmSeedMilli`** instead of cleared to 0, and its `_landUse = Field` is retained. It stays a claimed field tile at the initial-farmland floor and re-ripens when labor returns.
- **Urban recession** (`UrbanGrowth.ts:287-329`): a dropped tile keeps `_landUse = Urban` and becomes an **empty lot** (see D6) instead of blank ground.

_Alternative considered:_ keep membership on the maturity/density thresholds and rely only on the already-persistent `_landUse` for precedence. Rejected — it leaves `isFieldTile` false for a floored tile, so labor coverage wouldn't re-till it and the shell wouldn't know to draw it; unifying on the zone is simpler and matches the user's "occupied forever" model.

### D2 — Conquest transfers the zone instead of deleting it

`GameImpl.conquer` stops deleting `_landUse`/`_tileTenure`. Instead it **moves the zone to the new owner**: read the prior owner's `_landUse(tile)`, set the new owner's `_landUse(tile)` to the same value, clear the prior owner's entry, reset the fill to initial (field → maturity `farmSeedMilli`; urban → density 0 / empty lot), and reset tenure to 0 (young land). Combat damage (the burn) is applied on the conquest path as today. Net: the captor inherits a burnt, initial-state tile of the same type that regrows as theirs.

_Alternative considered:_ keep the prior owner's maturity/density so the captor inherits a _grown_ field/city instantly. Rejected — too strong, and it contradicts "changes to a burnt state for a number of ticks"; the burn + initial-fill delay is the intended cost.

### D3 — Capture-and-burn all plots; retire the raze roll

In `PlayerExecution.ts` the `capturedPlotRazeChance` branch is removed on the conquest path: every non-`DefensePost` `TribalStructure` on conquered ground is `captor.captureUnit(u)` (never `u.delete()`). `DefensePost` deletion is unchanged. The "burn" is the per-tile combat damage from D2/D4, not a unit death. `capturedPlotRazeChance` stays defined in `FoodConfig` but no longer governs conquest.

### D4 — One deterministic per-tile burn channel to both renderers

The sim already applies `combatTileDamageMilli` to every tile conquered from a real player (`AttackExecution.ts:378-387`). We add a **per-tick list of newly-burned tile refs** to the worker's shipped frame (the shell frame already carries `burns: Uint32Array | null`, today produced by `burnDelta()` scanning dead units). `burnDelta` is re-sourced to emit **every tile that received conquest damage this tick** (from the same `packedDamageUpdates`/conquest path that drives `_tileDamage`), so fire plays across the whole captured district. The WebGL path feeds the identical ref list into `PlotFirePass.addBurn` (mirroring `Renderer.applyDeadUnits`). The list is derived from deterministic conquest events, so it is identical on every client. Overflow past `FIRE_MAX_ACTIVE`/`plotFireMaxActive` (128) is dropped as today.

_Alternative considered:_ keep the dead-unit-only trigger and just raze more nuclei. Rejected — it can't show fire on captured non-nucleus tiles and it deletes plots, which D2/D3 forbid.

### D5 — Fire flame phase = 5 s, both renderers, ash unchanged

- WebGPU shell (`CameraRenderer.ts`): `FIRE_DUR 1.5 → 5.0` (WGSL const, `:218`); `FIRE_TOTAL_MS 5500 → 9000` (`:12`, = 5000 + `ASH_DUR` 4000); update the "must match" comment.
- WebGL (`render-settings.json`): `plotFireDurationMs 1500 → 5000` (`:252`); `plotFireAshDurationMs` stays 4000. `PlotFirePass` reads these, so the combined expiry follows automatically.

### D6 — Rendering the persistent states

- **Initial farmland** — already free: a `Field` tile emits plot type `2` (Farmland) with maturity at the seed floor, which `openfront.wesl:107` / `plot.frag.glsl` render as "Initial (tilled tan)." The only sim change is D1 (don't drop the type / floor the maturity).
- **Empty urban lot** — new. `computePlot` emits a plot value for a retained-vacant `Urban` tile (density 0, zone `Urban`) so the shader draws **cleared developed ground with no house**, distinct from both an occupied city (house + tan wash) and wild land. Implementation: extend the plot encoding with an urban-lot signal (e.g. reuse the Settlement type with density carried alongside, occupied vs empty chosen in-shader), applied in both `openfront.wesl` and `plot.frag.glsl`. When density returns the tile regrows its house/wash in place.
- **Burn/scorch** — the existing damage tint (`openfront.wesl:120-125` brown wash; WebGL damage overlay) is re-tuned toward a charred/scorched look so a burnt tile reads as burnt-over rather than muddy-brown, consistent across both renderers.

## Risks / Trade-offs

- **Turnkey conquest snowballs the leader** → the ~100-tick burn delay + initial-fill regrowth cost, plus existing `warSupplyAttrition` and `maxWarShare`, resist it; **re-sweep balance** (`tests/perf/balance/BalanceRun.ts`) and record the leader-share shift in `balance-notes.md`.
- **Zones never leave the field/city automata after first claim** (maps could "lock up" as fully-zoned) → mitigated: conquest re-types tiles to the captor's zone (D2), and whole-nation elimination still reverts land to wild; the two automata trading land was already rare late-game.
- **Fire spam on a big conquest** exceeds the 128 active-burn cap → overflow is dropped as today; acceptable (the district still burns, just not every tile simultaneously). Consider coalescing if it reads badly in playtest.
- **Two-renderer parity** → the WebGPU shell is primary; the WebGL path must still build and behave. Both get the same `burns` list, the same 5 s flame, and the same empty-lot/scorch encoding; verify both compile.
- **Determinism** → the burn list is derived from conquest damage events (already deterministic); no `Math.random`/wall-clock in the sim path.

## Migration Plan

1. Sim: D1 (FarmGrowth floor + zone-authoritative membership), D2 (conquer transfers zone), D3 (PlayerExecution capture-all), D4 (burns list in the worker frame + GameUpdates). Add `src/core` tests for each (repo rule).
2. Renderers: D5 (durations) and D6 (empty-lot + scorch encoding, per-tile burn wiring) in both the WebGPU shell and WebGL paths.
3. Balance re-sweep; update `balance-notes.md`.
4. **Rollback**: restore `conquer`'s `_landUse`/tenure delete + the `capturedPlotRazeChance` roll, revert `FIRE_DUR`/`plotFireDurationMs`, and drop the `burns`-from-damage source. `capturedPlotRazeChance` staying defined makes the config side a no-op to revert.

## Open Questions

- Exact empty-lot palette and whether it should carry a faint owner tint (defer to playtest).
- Should the ~100-tick burn be its own knob rather than piggy-backing on `combatTileDamageMilli`/`tileDamageHealMilli`? For now reuse the damage knobs (chosen: keep current heal rate ≈ 100 ticks); split later if balance wants an independent burn timer.
