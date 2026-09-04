## 1. Sim — persistent field & city tiles (D1)

- [x] 1.1 Make land-use the authority for field membership: update `PlayerImpl.isFieldTile` (`src/core/game/PlayerImpl.ts:1374`) so a tile counts as a field tile when `_landUse === Field` (or it hosts the owner's Farmland nucleus), independent of the maturity ≥ `fieldClaimMilli` test.
- [x] 1.2 Floor field senescence instead of clearing: in `FarmGrowth.ts:147-154`, a fallow tile that would fall below `fieldClaimMilli` is set to `farmSeedMilli` (initial floor) and its `_landUse` stays `Field` — never `setFarmMaturity(t, 0)` and never dropped from the field. Ensure the claim (`_landUse = Field`) is set when a spreading tile first crosses `fieldClaimMilli`.
- [x] 1.3 Verify urban precedence still skips `Field`-zoned tiles at the seed floor (`UrbanGrowth.ts` field-precedence check) — a floored field tile must not be paved by the city CA.
- [x] 1.4 Urban recession leaves an empty lot: in `UrbanGrowth.recedeToTarget` (`UrbanGrowth.ts:287-329`), a dropped tile keeps `_landUse = Urban` (already retained) and is marked as an empty lot for the render path (density 0, zone retained) rather than reading as wild; keep the nucleus-protection guard.
- [x] 1.5 Confirm whole-nation death still relinquishes all tiles to neutral (`FoodEconomy.ts:366`) — persistence must NOT keep a dead nation's zones.
- [x] 1.6 Tests (`src/core`): a labor-starved field floors at `farmSeedMilli`, stays the owner's `Field` tile, is not city-claimable, and re-ripens when labor returns; a receded city tile keeps `_landUse = Urban` and regrows density in place; an eliminated nation's tiles revert to neutral.

## 2. Sim — conquest keeps type & burns every tile (D2, D3, D4)

- [x] 2.1 `GameImpl.conquer` (`GameImpl.ts:845-880`): stop deleting `_landUse`/`_tileTenure`. Transfer the zone — read prior owner's `_landUse(tile)`, set the new owner's to the same value, clear the prior owner's entry; reset fill to initial (field → maturity `farmSeedMilli`; urban → density 0 empty lot); reset tenure to 0.
- [x] 2.2 Retire the raze roll: in `PlayerExecution.ts:49-82`, remove the `capturedPlotRazeChance` branch — every non-`DefensePost` `TribalStructure` on conquered ground is `captor.captureUnit(u)`, never `u.delete()`. Leave `DefensePost` deletion unchanged.
- [x] 2.3 Keep `combatTileDamageMilli` applied to every tile conquered from a real player (`AttackExecution.ts:378-387`) — this is the ~100-tick burn; confirm wilderness expansion still adds no damage.
- [x] 2.4 Add a deterministic per-tick **burns** tile-ref list to `GameUpdates` (`src/core/game/GameUpdates.ts`), populated wherever conquest damage is applied (every conquered-from-player tile), and drained by consumers like the existing packed-delta channels.
- [x] 2.5 Confirm `capturedPlotRazeChance` remains DEFINED in `FoodConfig` but is no longer read on the conquest path (dormant, not deleted).
- [x] 2.6 Tests (`src/core`): conquering an enemy field tile yields a `Field` tile of the captor at `farmSeedMilli` with combat damage set and a burns entry emitted; conquering a city tile yields an `Urban` empty lot of the captor; a captured Settlement/Farmland nucleus transfers (not deleted) while a DefensePost is destroyed; the burns list is identical across two seeded runs.

## 3. Renderer — per-tile burn channel to both renderers (D4)

- [x] 3.1 WebGPU shell: re-source `burnDelta()` (`ShellSim.worker.ts:240-259`) to emit the sim's conquest **burns** tile list (every burned tile), not only dead plot units; ship it in the existing `burns: Uint32Array` frame field (`ShellSimProtocol.ts:95`). `GameShellPage.onWorkerFrame` → `renderer.addBurns` already consumes it.
- [x] 3.2 WebGL: feed the same burns tile-ref list into `PlotFirePass.addBurn` (mirror `Renderer.applyDeadUnits`, `Renderer.ts:925-933`) via the frame-data upload path (`types/FrameData.ts`, `frame/Upload.ts`, `gl/MapRenderer.ts`), so razed/conquered tiles burn in the WebGL renderer too.
- [x] 3.3 Verify the 128-active-burn cap behavior on a large conquest (overflow dropped, no crash) in both renderers.

## 4. Renderer — persistent states + scorch look (D6)

- [x] 4.1 Empty urban lot: extend `computePlot` (`ShellSim.worker.ts:101-115`) to emit a plot value for a retained-vacant `Urban` tile, and render it in `openfront.wesl` (~:89-119) as cleared developed ground (no house), distinct from wild and from an occupied city; regrow a house/wash when density returns.
- [x] 4.2 Mirror the empty-lot state in the WebGL plot path (`PlotCache.ts` encoding + `shaders/plot/plot.frag.glsl`) so both renderers agree.
- [x] 4.3 Confirm the initial-farmland floor renders as "Initial (tilled tan)" (maturity < 48 in `openfront.wesl:107`; the WebGL Initial threshold) with no shader change beyond what D1 provides.
- [x] 4.4 Re-tune the damage tint toward a charred/scorched look (`openfront.wesl:120-125` and the WebGL damage overlay) so a burnt tile reads as burnt-over; keep it fading as damage heals.

## 5. Fire duration = 5 s (D5)

- [x] 5.1 WebGPU shell: `CameraRenderer.ts` — `FIRE_DUR 1.5 → 5.0` (`:218`), `FIRE_TOTAL_MS 5500 → 9000` (`:12`), update the "must match" comment (`:11`).
- [x] 5.2 WebGL: `render-settings.json` — `plotFireDurationMs 1500 → 5000` (`:252`); leave `plotFireAshDurationMs` at 4000. Confirm `PlotFirePass` picks up the new lifetime for expiry.
- [x] 5.3 Sanity-check both renderers: a burned tile flickers ~5 s then fades over ~4 s of ash, identically.

## 6. Balance, validation & docs

- [ ] 6.1 Run the balance harness (`tests/perf/balance/BalanceRun.ts`) before/after and record the leader-share shift from turnkey conquest in `balance-notes.md`.
- [x] 6.2 `npm test`, `npm run lint`, `npm run format`; update any tests that asserted senesced fields become wild / conquest scorches to neutral / plots are razed.
- [ ] 6.3 Verify in the running app (run-openfront skill / #shell): conquer an enemy district and confirm every tile burns ~5 s, keeps its type, and regrows for the captor; starve a nation and confirm fields drop to initial soil and cities to empty lots that regrow.
- [x] 6.4 `openspec validate rework-persistent-tiles-and-burn --strict` passes.
