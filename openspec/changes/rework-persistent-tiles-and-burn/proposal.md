## Why

Today a tile that stops being productive visually **disappears**: a fallow field tile clears its maturity to zero and the renderer draws bare ground; a receding city tile zeroes its density and the house vanishes. The zoning (`_landUse`) already persists underneath, so the tile silently regrows — but the player never sees the land as "still ours, just idle," only as blank terrain that pops back later. Conquest does the opposite of persistence: `GameImpl.conquer` deletes the zone and tenure (scorched raw land) and `capturedPlotRazeChance` deletes the nucleus unit, so taking enemy land yields nothing to inherit. And the burn/fire effect only plays when a plot **unit** dies, so a captured field or city changes hands with no visible violence at all.

We want land to read as **permanent once worked**: a tile that declines drops to its _initial_ state (farmland → seed soil, settlement → empty lot) and regrows in place, and conquest **keeps each tile's type**, burns it, and regrows it for the new owner — a turnkey spoil, with fire raging across every conquered tile.

## What Changes

- **Tiles persist and regrow instead of disappearing.** A field tile whose crop senesces below the claim threshold drops to an **initial farmland** state (seed maturity) and stays a claimed field tile, regrowing in place — it never reverts to wild. A city tile that recedes drops to an **empty urban lot** (no house, zone retained) and regrows a house when population returns. Both persistent states are **rendered** (initial tilled soil / empty lot), so idle land still reads as developed.
- **BREAKING — conquest keeps the tile's type instead of scorching it.** `GameImpl.conquer` **retains `_landUse`** (Field/Urban) for the new owner rather than deleting it. Every conquered tile — not just the razed nucleus — enters a **burnt** state for ~100 ticks (the existing combat tile-damage, which already freezes growth and heals over ~100 ticks), then **regrows as the conqueror's own tile of the same type**. This reverses the deliberate `capturedPlotRazeChance` "invasion destroys everything; conquest yields scorched land, never a turnkey economy" design (`FoodConfig.ts:54`).
- **BREAKING — captured plots are no longer deleted.** The raze roll that deletes a fraction of captured `TribalStructure` nuclei is removed on layered maps; every plot is captured-and-burnt. `capturedPlotRazeChance` is retired from the conquest path.
- **Fire plays on every conquered tile.** A new per-tile burn channel drives the fire FX for each tile a conquest damages, in both renderers (today burn fires only on a plot **unit** death event).
- **The flame phase rages for 5 seconds** (was 1.5) in both the WebGPU shell (`CameraRenderer` `FIRE_DUR`) and WebGL (`PlotFirePass` / `render-settings.json plotFireDurationMs`) renderers.

## Capabilities

### New Capabilities

- (none — this change modifies existing tile-lifecycle and conquest capabilities)

### Modified Capabilities

- `farm-growth`: a senescing field tile drops to an **initial** persistent farmland state and regrows in place instead of reverting to wild; the "reversion is decisive / land becomes claimable by either automaton" requirement is replaced by "once a field, always a field."
- `urban-core-growth`: a receding city tile drops to a persistent **empty urban lot** (no house) that regrows, instead of the vacated tile reading as blank ground.
- `tile-damage`: conquest **retains the tile's land-use type** for the new owner (no scorch-to-raw); every conquered tile enters the burnt state; damage renders as a **burn/scorch** and drives the per-tile fire FX (a burnt tile regrows as the conqueror's own type once healed).
- `tribal-buildings`: captured `TribalStructure` plots are **always captured-and-burnt, never razed/deleted** on conquest; `capturedPlotRazeChance` is retired from the conquest path.

## Impact

- **Sim (`src/core`)** — `execution/utils/FarmGrowth.ts` (senescence floor to initial instead of 0), `execution/utils/UrbanGrowth.ts` (recession leaves empty-lot marker), `game/GameImpl.ts` (`conquer` keeps `_landUse`; per-tile burn delta channel), `execution/PlayerExecution.ts` (drop the raze roll; capture-and-burn all plots), `execution/AttackExecution.ts` (burn every conquered tile). All `src/core` changes require tests.
- **Renderer (both plot renderers)** — new per-tile burn upload path: WebGL `render/frame/PlotCache.ts` + `Upload.ts` + `types/FrameData.ts` + `gl/passes/PlotFirePass.ts`; WebGPU `webgpu/ShellSim.worker.ts` (`burnDelta`) + `ShellSimProtocol.ts` + `shell/CameraRenderer.ts`. New persistent visual states (initial farmland / empty urban lot) in `shaders/plot/plot.frag.glsl` and `lab/systems/openfront/views/openfront.wesl`. Fire duration constants: `CameraRenderer.ts` `FIRE_DUR`/`FIRE_TOTAL_MS`, `render-settings.json` `plotFireDurationMs`.
- **Config** — `capturedPlotRazeChance` becomes dormant on the conquest path (kept defined; not deleted).
- **Balance** — conquest is now strongly rewarded (turnkey spoils after a burn); re-sweep with `tests/perf/balance/BalanceRun.ts` and note the leader-share shift.
