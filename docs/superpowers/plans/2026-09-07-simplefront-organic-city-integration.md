# SimpleFront Organic City Integration Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for inline execution, or `superpowers:subagent-driven-development` if delegation is selected. Track execution with the checkboxes below. This document authorizes no implementation, deployment, commits, or changes to unresolved gameplay rules.

**Goal:** Bring the user-approved Demo 4 tile-local urban development, housing-led population growth, fertility gradient, connected streets, and adjustable visual ages into the actual SimpleFront game.

**Architecture:** Put authoritative development and population accounting in SimpleFront's core simulation. Adapt the demonstrated growth mechanism to game terrain, ownership, multiple cities, and the existing troop economy. Send development changes through the existing worker/render pipeline; roads, buildings, and age palettes remain presentation-only.

**Tech stack:** Existing TypeScript simulation, Web Workers, Lit UI, game rendering layers, and Vitest. No new dependencies are planned.

**Spec / reference behaviour:** [Local Development Lab documentation](../../../simplefront/docs/city-local-lab.md) and `simplefront/src/demos/city-local/`. Demo 3 remains the frozen historical reference for Stages 1–2. The user approved Demo 4's behaviour for game integration on September 8, 2026, and approved `simplefront/docs/city-local-palette.json` as the new default palette.

**Status:** Organic development is now the normal SimpleFront launch on September 8, 2026, following explicit user approval to remove the preview requirement. Select SimpleFront normally; `/simplefront/#shell` needs no special query. Includes tile-local development, connected 4×4 sprites, approved palettes, housing/growth HUD, single-click founding, level labels, tuning controls and adapted AI with emergency recovery. Final suite: 488 tests passed in 54 files; build and normal-selector browser checks passed. All 40 pre-recovery-fix screening windows remained unfinished at 20 minutes; the final corrected seed01 replay matched exactly. The 10–15-minute target is unmet. Human playtesting and cadence tuning remain open; default activation does not assert those gates passed. Earlier staged gating instructions below are historical and superseded by this approval. All demos stay independently available. Evidence is recorded in
[the integration verification report](../../../simplefront/docs/organic-city-integration-verification.md).

## Global constraints

- Modify SimpleFront only. Do not modify the original OpenFront live code or introduce imports from it.
- Preserve Demo 1, Demo 2, and Demo 3 as independently usable experiments.
- Keep the existing game-selection flow: select SimpleFront and play. No additional player-facing game selection is required.
- Integer tile levels are 1–100; wilderness is level 0 and can first develop only into level 1.
- An upgrade requires all four cardinal neighbours at the same level or higher. Retain the existing maturation preference, per-tile work curve, and one-level-per-development-step completion limit.
- Housing is `100 × level` initially. Level 100 is a per-tile level limit, not a fixed city footprint or total population ceiling.
- Population losses do not erase development, streets, buildings, or paid maturation progress.
- Physical development belongs to tiles, not to city membership. Founding tiles are historical only; capturing one never transfers its surrounding territory or disables other growth.
- All four supporting neighbours count regardless of ownership. Only owned, dry, buildable wilderness may be developed; farms and other structures remain excluded.
- Capture/relinquishment preserves tile levels and unfinished work. Current tile ownership determines housing; population never transfers or disappears merely because housing changes hands.
- One population recovery path and one construction budget per player, not per seed; disconnected neighbourhoods share both. Maximum one completed +1 level per player per 0.25-second construction step.
- All people are troops. Idle and deployed troops both count toward population and housing occupancy.
- Food remains a player-global action currency. No food consumption, workers, tile distribution, supply lines, or logistics.
- Preserve movement, battle calculations, and paid dispatch semantics unless a separate change is approved.
- Preserve the baseline food recovery that permits reconstruction after losing farms.
- Visual ages are development-level colour gradients, not a calendar and not fertility settings.
- Quarries, defensive resource chains, oil, and advanced weapons are excluded from this integration.
- Target 10–15-minute matches, but report measured results rather than assuming that target has been achieved.

## 1. Current implementation and integration points

| Area                     | Current location                                                                                                         | Integration responsibility                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Demonstrated growth      | `simplefront/src/demos/city-population/model.ts`, `config.ts`, `terrain.ts`                                              | Reference calculations, candidate selection, terrain effects, maturation, and housing pressure    |
| Demonstrated visuals     | `simplefront/src/demos/city-population/streets.ts`, `street-render.ts`, `street-ages.ts`                                 | Reference street connectivity, 4×4 sprite rules, colour gradients, and age validation             |
| Selected rules           | `simplefront/src/core/game/Rulesets.ts`                                                                                  | Enable the new economy only for SimpleFront                                                       |
| Resource economy         | `simplefront/src/core/execution/utils/PaintedEconomy.ts`, `simplefront/src/core/configuration/PaintedEconomyConfig.ts`   | Replace city-count capacity and population replenishment; preserve food and deployment accounting |
| Ownership and state      | `simplefront/src/core/game/GameImpl.ts`, `PlayerImpl.ts`, `UnitImpl.ts`                                                  | Persistent development, capture, relinquishment, defeat, and state hashes                         |
| Purchases and spawning   | `simplefront/src/core/execution/PaintTilesExecution.ts`, `SpawnExecution.ts`                                             | City-centre founding and opening kit                                                              |
| AI                       | `simplefront/src/core/execution/utils/PaintedAI.ts`, `simplefront/src/core/execution/PaintedAIExecution.ts`              | Housing-aware investment and centre-aware campaigns                                               |
| Worker transport         | `simplefront/src/core/game/GameUpdates.ts`, `simplefront/src/client/webgpu/ShellSimProtocol.ts`, `ShellSim.worker.ts`    | Authoritative development snapshots, deltas, and summaries                                        |
| Actual game presentation | `simplefront/src/client/games/simplefront/system.ts`, `runtime.ts`, `layers/`, `simplefront/src/client/GameShellPage.ts` | Urban rendering, ownership readability, HUD, and visual settings                                  |
| Balance measurement      | `simplefront/tests/perf/balance/PaintedBalance.ts`, `simplefront/scripts/painted-balance.ts`                             | Extend the real-game benchmark for the new economy                                                |

The demo is a single-city simulation without food, conquest, or AI. Its model cannot simply be instantiated once per city: doing that would duplicate population growth, baseline recovery, and development budgets.

The current actual-game defaults also differ substantially from the demo: a painted city contributes 10,000 troop capacity and the player starts with 2,000 troops. A level-one demo city provides 100 housing. Replacing one formula without changing the opening preset would produce an immediately over-capacity start.

## 2. Decisions required before implementation

Recommendations below remain proposals except where explicitly approved.

**Approved September 8, 2026:** cities grow only on already-owned land; farms
remain manually placed; automatic city growth uses development work without an
additional food charge. The user subsequently approved the provisional opening:
80 troops, one level-one city with 100 housing, and one manually placed farm.
Food prices remain unchanged initially for measurement. Final balance calibration
remains to be measured.

**Superseding approval, September 8:** Demo 4 resolves the former centre-capture,
overlap, support and contested-housing questions. There is no governing city
membership and no origin-distance growth or density bias. Housing follows each
physical tile's current owner. Developed enemy and unclaimed neighbours count
toward support. All unfinished work survives ownership changes. Additional seeds
do not add a construction engine or free troops. The old proposals in the table
below are historical context only where they conflict with these approved rules.

| Decision                                     | Recommended starting point                                                                                                     | Gate                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Urban expansion versus territorial expansion | Grow only onto the player's already-owned, buildable land; military expansion continues to acquire territory                   | Before game terrain/ownership integration                                            |
| Farms during city integration                | Keep existing manually placed farms and their global food economy                                                              | Before economy integration                                                           |
| Automatic development cost                   | Charge food for founding centres, but let organic maturation use housing pressure and work without an additional food charge   | Before economy integration                                                           |
| Starting population and costs                | Retain one level-one city and one farm; calibrate a smaller starting army and associated action costs around 100 housing       | Before enabling playable matches; final numbers require explicit approval            |
| Capture of a centre                          | Preserve the agreed transfer of the development and its maturity; separately decide whether associated territory transfers too | Before capture integration; whole-footprint territory transfer would change conquest |
| Overlapping cities                           | One development membership per tile, deterministic ownership of competing expansion candidates, no double-counted housing      | Before multiple-city integration                                                     |
| Cross-city upgrade support                   | Recommend counting adjacent same-player urban tiles regardless of their development membership                                 | Before multiple-city integration                                                     |
| Housing in contested developments            | Define which player receives housing from each associated tile when centre control and territory ownership differ              | Must be resolved together with centre capture                                        |

For capture, resolve one complete rule covering centre ownership, tile ownership, housing beneficiary, and growth permission. Do not implement these independently and leave contradictory ownership behind.

Development on farms, other structures, water, or impassable terrain is excluded in the proposed first version. Near coasts and obstacles, the four-sided support requirement will intentionally constrain density; changing that rule would be a separate design decision.

## 3. Delivery sequence

### Stage 1 — Preserve the demonstrated growth mechanism

**Deliverable:** A SimpleFront-only, deterministic development module that reproduces Demo 3 in a one-city fixture without changing the demo.

**Files:** Create `simplefront/src/core/development/CityDevelopment.ts`, `CityDevelopmentConfig.ts`, and `simplefront/tests/CityDevelopmentParity.test.ts`. Read the demo's model, configuration, terrain helpers, and model tests as the reference.

- [x] Record the existing dirty worktree and establish a fresh SimpleFront test/build baseline. Do not overwrite unrelated work.
- [x] Add parity fixtures for all six demo landscapes with identical seeds, settings, and 0.25-second development steps.
- [x] Compare levels, housing, incomplete work, selected actions, and population trajectories against the frozen demo implementation. Add literal invariants as well, so comparing two implementations does not conceal shared mistakes.
- [x] Extract/adapt the calculation and selection logic into the new module. Production code must not depend on demo UI modules.
- [x] Keep the game simulation's tick rate separate from the development step. Accumulate elapsed simulation time; never use browser frame rate or wall-clock time to advance development.
- [x] Run parity and existing demo tests before proceeding.

Core invariants for the new fixtures:

```ts
expect(nextLevel - previousLevel).toBeLessThanOrEqual(1);
if (previousLevel === 0 && nextLevel > 0) expect(nextLevel).toBe(1);
if (previousLevel > 0 && nextLevel > previousLevel) {
  expect(previousCardinalLevels).toHaveLength(4);
  expect(previousCardinalLevels.every((level) => level >= previousLevel)).toBe(
    true,
  );
}
expect(housing).toBe(levels.reduce((sum, level) => sum + 100 * level, 0));
```

The variables above are observations from the parity fixtures, not a proposed production API. Include paused, zero-population, full-housing, blocked-expansion, and level-100 cases.

### Stage 2 — Integrate one city with actual territory and troop accounting

**Deliverable:** A one-city actual-game fixture in which housing and population drive organic development, using existing farms and combat.

**Files:** Create `simplefront/src/core/development/CityDevelopmentExecution.ts` and `simplefront/tests/CityDevelopmentEconomy.test.ts`. Modify the selected rules, painted economy, spawning, and purchase paths listed in section 1.

- [x] Resolve the terrain, food-cost, farm, and opening-scale decisions in section 2.
- [x] Replace the urban brush's repeated tile purchases with deliberate centre founding. Duplicate requests on the same centre must not charge twice.
- [x] Start a founded centre at level 1; use existing placement validation and authoritative food payment boundaries.
- [x] Adapt actual terrain elevation and buildability into the development module. Preserve the demo's suitability weighting; document units/normalization instead of treating differently scaled terrain values as equivalent.
- [x] Replace city-count troop capacity with the sum of usable urban housing.
- [x] Replace the existing troop refill path rather than running two population-growth systems.
- [x] Continue counting troops in outgoing attacks, ships, and pending landing handoffs exactly once.
- [x] Verify that casualties preserve development and that housing loss never deletes excess troops; over-capacity population receives no positive recruitment.
- [x] Preserve baseline food generation and verify rebuilding from zero farms and low food.

Stage 2 evidence: 15 new integration tests; 395 total tests pass, build and scoped
lint pass, independent review resolved. `SimpleFrontCityConfig` is opt-in and
unregistered. It permits one active founder per player and rejects repeated
spawn commands; it is not a public gameplay rollout or a capture implementation.
The existing game selector continues to use the unchanged painted defaults.

Population/housing contract:

```text
P = idle troops + deployed troops, including pending landing handoffs
H = sum of housing credited to the player under the approved ownership rule
vacancy = H > 0 ? clamp(1 - P/H, 0, 1) : 0
births/recovery = populationSpeed * (P * meanFertility / 3 + recoveryAllowance) * vacancy
```

Use one player-global population update with fractional credit carried into integer troop additions. Preserve actual population when `P > H`; do not port the demo's final population clamp blindly into conquest scenarios. If `H = 0`, recruitment pauses and the baseline food economy permits founding a replacement city.

Uniform housing-weighted population allocation remains an accounting approximation, not a movement or logistics simulation. Deployed troops remain included to prevent dispatch from creating artificial vacancies.

**Milestone A acceptance:** One city grows naturally in the actual runtime, troops fit the approved opening scale, food and dispatch still work, and no legacy starvation/logistics path has been reactivated.

### Task 3: Tile-local development and persistent capture (Stage 3)

**Deliverable:** The actual-game organic-economy fixture follows Demo 4's tile-local rules with arbitrary players and disconnected neighbourhoods. Existing normal-match defaults stay gated until presentation and AI stages pass.

**Files:** Create `simplefront/src/core/development/CityDevelopmentState.ts` and `simplefront/tests/CityDevelopmentOwnership.test.ts`; adapt `CityDevelopmentExecution.ts`, `PaintedEconomy.ts`, `PaintTilesExecution.ts`, `PlayerImpl.ts`, and ownership hooks in `GameImpl.ts` / `UnitImpl.ts` as required. Update `CityDevelopmentEconomy.test.ts` assertions that intentionally encoded the superseded one-centre restriction. Keep `CityDevelopment.ts` and its Demo 3 parity fixtures as the historical kernel unless a small reusable extension avoids duplication.

**Interfaces:** Keep `foundCityDevelopment`, `organicHousingCapacity`, `tickCityDevelopment`, `isOrganicUrbanTile` and `cityDevelopmentHash` callable by the existing game. Expose authoritative tile level/work and deterministic state from a shared game-owned store for the later renderer/worker stage. Production core must not import demo modules. Per-player state holds budget/RNG/step remainder, not a full map allocation per city. Use actual territory ownership as authority, with immediate housing effects after conquest/relinquishment.

**Scope:** Port the local suitability, neighbour selection, per-tile maturation work and maturation-preference ramp from Demo 4. Retain the already approved 80-troop opening, manual farms, paid seed founding, baseline food recovery and paid military dispatch. Do not add food consumption, calendar simulation, worker UI, visuals, AI bonuses or change normal `SimpleFrontConfig` rollout in this task. Preserve unrelated dirty files and all demo behaviour; do not commit, stage, switch branches or create worktrees.

- [x] Resolve centre capture, contested housing, overlap, and neighbour-support rules before writing their implementation tests: Demo 4 approved, see global constraints.
- [x] Write failing tests for tile-local capture, cross-owner support, no-origin-control, disconnected seed budget fairness, and unfinished work persistence before changing production code.
- [x] Store shared physical tile levels and incomplete work separately from troop counts, with deterministic per-player random/cursor state. No city membership or governing centre.
- [x] Maintain one player-global development budget. Allocate opportunities across eligible cities deterministically; founding extra centres must not grant extra recovery allowances or work budgets.
- [x] Preserve Demo 4's local candidate selection and completion cadence; compare identical fixed terrain/seed/settings when practical and include literal invariants. Establishing wilderness completes only level 1; upgrades require four prior equal-or-higher physical neighbours. No origin reach or density falloff.
- [x] Handle competing expansion requests without overlapping membership or double-counting housing. Do not convert an existing developed tile into a new free centre through an ordinary founding request.
- [x] Transfer housing and construction permission tile by tile only, including historical seed tiles. Never transfer or clamp existing population, and never reset physical development or work on capture.
- [x] Cover ordinary tile capture, centre recapture, disconnection, relinquishment, player defeat, and city removal separately. Existing density-reset and plot-deletion hooks must not silently destroy the new persistent state.
- [x] Include all gameplay-relevant state in deterministic hashes and any supported restore/replay path. Version incompatible data rather than implying old runs remain compatible.

**Acceptance:** Same seed and actions produce the same state; every tile's housing has at most one beneficiary; ten centres do not create ten population or construction engines; capture does not reset maturity.

Literal regression expectations include:

```ts
expect(levelAfterCapture).toBe(levelBeforeCapture);
expect(workAfterCapture).toBe(workBeforeCapture);
expect(populationAfterCapture).toBe(populationBeforeCapture);
expect(housingTransferred).toBe(100 * capturedLevel);
expect(completedLevelsForOnePlayerInOneStep).toBeLessThanOrEqual(1);
expect(foundingAdditionalSeedPopulationGain).toBe(0);
```

Run focused tests with `rtk npm test -- tests/CityDevelopmentOwnership.test.ts tests/CityDevelopmentEconomy.test.ts tests/CityDevelopmentParity.test.ts` from `simplefront/`. Observe RED before implementation, then GREEN, then run full tests/typecheck/build/scoped lint and a task review. Include neutral urban state in the global game hash so unowned development cannot diverge silently. Supported state export must cover unfinished-work order, RNG and partial-step timing; reject unsupported versions rather than pretending older recordings have matching rules.

### Task 4: Integrate worker updates, streets, buildings, and ages (Stage 4)

**Deliverable:** Actual SimpleFront renders the new urban development with the demo's 4×4 visual language and clear territorial control.

**Files:** Modify `GameUpdates.ts`, `ShellSimProtocol.ts`, `ShellSim.worker.ts`, and SimpleFront's rendering registration/layers. Create `simplefront/src/client/games/simplefront/visuals/CityStreets.ts`, `CityAges.ts`, `simplefront/tests/CityDevelopmentWorker.test.ts`, and `CityDevelopmentVisuals.test.ts`.

**Interfaces and execution scope:** Consume `GameImpl.cityDevelopment` and its
`level(tile)`, `developedTiles()`, `deterministicState()` APIs from Stage 3;
ownership comes from the actual game. No new simulation model in the client.
Add a typed, optional development payload to the existing worker protocol, with
an explicit full-reset marker and incremental updates. Keep the existing
non-organic protocols compatible. Wire the payload through `GameShellPage.ts`
and the actual `simplefront/src/client/shell/CameraRenderer.ts` path, not a demo
canvas. Additional small helpers may live beside the planned visuals files.

For end-to-end testing before rollout, permit an internal SimpleFront-only
worker init setting containing validated development configuration; use the
existing `SimpleFrontCityConfig`, and reject its use for other rulesets. The
setting is an internal integration seam, not a new game-selection entry. Its
absence must retain current normal-match defaults until the later AI/release
gate. The next task will connect next-match tuning to this seam. This task does
not add the HUD/tuning panel or change AI policy.

Expose renderer-side age/palette updates for Task 5 without sending them into the
worker. Reuse the Demo 4 street algorithm as a frozen reference, porting only
needed visual code into production with no imports from demo modules. Avoid
allocating a full 4× enlarged colour texture of the entire map: use compact tile
sprite codes/palettes or similarly bounded storage and dirty updates. Verify
actual shader compilation/drawing where WebGPU is available, not just strings.

Execution discipline: follow RED/GREEN tests, preserve exact pre-task dirty file
snapshots for review, and do not stage, commit, switch branches or create worktrees.
Validate snapshot reset, capture and losses preserving topology, palette-only
repaint, exactly 4×4 sprite pixels, deterministic simulation hashes with/without
visual readers, and the normal worker path remaining unchanged.

- [x] Define a typed initial development snapshot and incremental tile updates carrying physical tile level and the ownership information required by the renderer. There is no governing city membership.
- [x] Send a complete state on start/reset and changes after authoritative simulation steps. Test reset after a large city so stale urban pixels cannot survive into the next match.
- [x] Port connected streets and building placement as read-only visuals. Keep exactly 4×4 sprite pixels per developed tile; do not embed the demo canvas as the game renderer.
- [x] Preserve visual continuity when a city is captured or population falls. Palette settings must not regenerate street topology.
- [x] Use the approved colours and age anchors from `simplefront/docs/city-local-palette.json` as the initial actual-game palette; preserve Demo 4's live editor and reset behaviour. Production rendering must not import the demo UI.
- [x] Keep territory borders, troop fronts, historical seed markers, and player identity legible over colourful age palettes. Test neighbouring opponents with the same visual era; never imply a seed controls its surrounding tiles.
- [x] Use zoom-dependent detail and dirty-neighbourhood updates. Level changes and new connections should invalidate only affected visual regions.
- [x] Prove that camera position, render frequency, palette edits, and headless execution do not alter authoritative game state.

### Task 5: Add game HUD and tuning controls (Stage 5)

**Deliverable:** Players can understand urban growth and adjust its visual presentation without using a demo page.

**Files:** Modify `simplefront/src/client/GameShellPage.ts` and relevant SimpleFront view components. Create `simplefront/tests/CityDevelopmentUI.test.ts`.

**Implementation contract:** Consume the Task 4 worker's organic-mode indicator,
development frame cache and visual setters. Keep the main page readable by putting
the organic controls in one focused Lit component/helper beside the SimpleFront
visuals. Do not copy the entire demo page into the game. Use native number/range
and colour inputs; no new UI dependencies.

In organic mode the city tool founds one paid level-one seed per deliberate click;
it must not queue the existing multi-tile city paint stroke (which the core rejects).
Farm painting remains unchanged. Existing developed tiles are not legal new city
or farm targets. Show player population as idle + deployed, housing, occupancy,
births per second and housing pressure from authoritative worker summaries. Distinguish
vacancy-filling, active construction and lack of legal expansion/upgrade space.
No-housing survivors display "No housing", not misleading 0% occupancy.
At close zoom, display explicit integer level labels for visible developed tiles,
using the authoritative frame cache and the existing camera/overlay path. Bound
label work to the viewport and hide unreadable labels at distant zoom; this must
not create a full-map DOM grid or change the compact sprite layer.

Provide next-match numeric settings for population speed, housing threshold,
maturation preference, construction speed, housing per level and the configurable
fertility gradient. Validate complete settings with the existing core validator;
do not expose the obsolete reach/centreFalloff controls. Applying economic drafts
must require an explicit restart/apply-next-match action, and cannot silently alter
an active worker. Visual edits (six strictly increasing age anchors, four building
colours plus ground/road per age) take effect immediately without restarting or
changing simulation state. Restore-default palettes use the user's saved selection.

Keep ordinary matches gated as required by Task 4 until AI/release verification.
Use the internal organic init seam for UI integration tests; do not introduce a
new game-selection entry. Existing start/restart/return/result flows and mobile
layout must remain usable. Preserve dirty baseline snapshots and provide a focused
review patch plus RED/GREEN and final test/build evidence. No commits or branches.
Pending SimpleFront tuning must never be passed into another selected ruleset;
switching games clears active urban presentation and leaves that game's defaults intact.

- [x] Show total population with idle/deployed breakdown, housing, occupancy, population gain, and development pressure.
- [x] Explain why a city is paused: vacancies, no legal space, insufficient support for upgrades, or another approved constraint.
- [x] Replace city-painting instructions with centre-founding instructions; retain farm placement.
- [x] Expose maturation preference and approved gameplay settings through next-match configuration. Validate and pass them into the authoritative simulation; do not apply client-only economic changes to a running game.
- [x] Add six live visual age anchors and restore-defaults behaviour. Require strictly increasing integer levels from 1 to 100; invalid drafts retain the last valid palette.
- [x] Keep the fertility gradient separate from the visual age controls. Explain that visual ages follow development levels, not elapsed years.
- [x] Check game selection, start, restart, result, return navigation, desktop, and mobile. Keep demo navigation separate from ordinary gameplay.

### Task 6: Adapt AI to developments (Stage 6)

**Deliverable:** AI uses the same organic-city economy and continues to expand and attack.

**Files:** Modify `PaintedAI.ts`, `PaintedAIExecution.ts`, and AI configuration only where required. Extend `PaintedAIEconomy.test.ts`, `PaintedAICombat.test.ts`, and add `simplefront/tests/CityDevelopmentAI.test.ts`.

**Implementation contract:** Keep the painted-mode branch and its tests intact.
For organic mode, legal purchase sites must exclude all physical urban tiles,
not merely settlement units. Housing availability replaces settlement-count
capacity. The current `cityWanted = totalTroops >= troopCapacity * cityFill`
alone must not trigger endless purchases while free organic construction has
room to work. Found a new seed when housing is absent or development is blocked
and a legal disconnected site can provide space; preserve paid purchase paths.
Prefer farm sites that do not unnecessarily occupy a young seed's four-sided
upgrade ring, while still allowing baseline-food recovery on cramped territory.

Military policy must value existing developed housing, not just original seed
units, and must continue legal neutral expansion and hostile dispatch at the
approved opening scale. Do not modify battle formulas, troop losses, victory
thresholds, food prices, population curves or grant the AI extra resources to
make tests pass. Retain current difficulty/policy rotation and bounded searches.
If a core query needs a bounded early-exit option, add it at the shared query
boundary with a focused test rather than scanning every map tile in the policy.

Test real executions for organic opening farm investment, organic growth without
city-paint spam, paid neutral/hostile attacks, zero-farm recovery, captured seed
with surviving housing, and disconnected reconstruction without extra growth
budgets. Run existing painted AI regressions and full tests/build/scoped lint;
record actual action timestamps, not only proposed policy decisions. Preserve
pre-task dirty snapshots for review; no commits or branch operations.

- [x] Replace repeated city-tile purchasing with decisions about founding centres, housing pressure, and usable expansion room.
- [x] Avoid unnecessary centre purchases when existing cities can satisfy housing demand. Detect cities blocked by terrain, borders, farms, or other structures.
- [x] Preserve farm investment and reserve food for military dispatch; automatic development must not cause the AI to stop issuing attacks.
- [x] Rank developed territory by housing/strategic value; historical seeds have no control bonus. Retain legal attack, retreat, and transport validation.
- [x] Test zero-farm recovery, centre loss, constrained coast/valley starts, contested cities, and multiple-centre budget fairness.
- [x] Keep searches bounded and deterministic. Give AI no separate growth multipliers, free food, or hidden population bonuses.

AI support is a requirement of the integration, not an optional follow-up after enabling the economy for normal play.

### Task 7: Performance, cadence, and release gate (Stage 7)

**Deliverable:** Evidence that the integrated system behaves correctly at actual game scale, plus measured progress toward the target match length.

**Files:** Extend `simplefront/tests/perf/balance/PaintedBalance.ts` and `simplefront/scripts/painted-balance.ts`. Create `simplefront/docs/organic-city-integration-verification.md` and retain new balance results separately from previous runs.

**Implementation contract:** Extend the existing benchmark rather than creating
a second game simulator. Add an explicit organic option that passes the complete
validated development config to the real runner, records it in result provenance,
and leaves old painted invocations unchanged. Preserve the retained seed names,
map, player setup and policy rotations. Use exclusive output creation and separate
organic result filenames. Record development events by observing authoritative
state; distinguish paid founding from organic expansion. Include physical state
in organic final hashes, including neutral tiles and unfinished work.

Collect per-tick timing distributions and actual development-observer payload
bytes with clearly stated instrumentation overhead. Record developed area, summed
levels/housing, historical seed counts and process-memory observations alongside
player counts. A controller rendering probe already compares the pre-Stage4 camera
to the integrated renderer on a 512×256 surface; retain its methodology/results,
but do not describe that synthetic render fixture as a running-match benchmark.
Begin with a short timing probe before scheduling the full retained seed set and
rotations. Report incomplete games as incomplete. Do not silently retune approved
prices, growth, combat or victory rules to turn an unfinished run into a success.

After technical checks, provide a narrow opt-in preview URL for the required human
playtest: `?city-development=1#shell` on the existing SimpleFront page. It selects
the existing SimpleFront internal configuration only for non-ambient gameplay;
no additional game-selector item, demo embedding or OpenFront changes. Pending
next-match settings override preview defaults. Ordinary URLs remain on their
current defaults until the human gameplay gate is satisfied. This makes the
integrated game accessible for review without claiming a human playtest occurred.
Do not check off the human playtest or default rollout based on AI-only runs.

Preserve dirty snapshots and provide focused tests, scoped lint/build evidence,
report and review diff. Main handles the retained multi-run execution and browser
checks; coordinate before launching a large benchmark batch. No new dependencies,
commits, branch changes or deployment.

- [x] Run the full SimpleFront test suite, typecheck/build, and scoped lint after the final production changes.
- [x] Test deterministic runs with visuals enabled and disabled, and equivalent elapsed simulation time delivered in different frame batches.
- [x] Measure tick time, worker payload size, render time, and memory on the same map and machine before and after integration. Report player count, developed area, city count, and zoom level with the measurements.
- [x] Avoid whole-map arrays per city and repeated whole-map searches per tick. Maintain shared tile state and bounded/cached candidate information; preserve deterministic ordering when optimizing. Shared developed-tile scans remain a measured scaling limit, not a claim of constant cost.
- [x] Extend the real-game benchmark to record first organic expansion, first upgrade, housing stalls, farm/centre purchases, first attack, centre captures, food-blocked actions, winner, and elapsed simulation seconds.
- [x] Run the retained ten-seed set and policy rotations with identical setup provenance. Record unfinished matches explicitly rather than assigning them a victory time. The 40-run matrix is pre-final-recovery-fix; the corrected version has focused regressions and a full seed01 replay, not a second full matrix.
- [ ] Perform normal-speed human playtests for the opening, midgame, recovery after losses, and the endgame. AI-only screening is not sufficient evidence of enjoyable cadence.
- [ ] Tune approved population, development, founding-cost, farm, and dispatch settings against the 10–15-minute target. Do not silently change victory conditions, movement, or combat to force the duration.
- [x] Verify OpenFront live isolation and unchanged demo behaviour.
- [x] Enable this as normal SimpleFront: explicitly approved by the user September 8, 2026, superseding the earlier preview-only gate. Normal-selector automatic expansion and restart verified; human playtesting and cadence tuning remain open above.

The existing [painted pacing report](../../../simplefront/docs/painted-pacing-and-ai-verification.md) does not establish 10–15-minute matches. Treat that as an existing shortfall, not a regression caused by this plan or a target already met.

## 4. Verification workflow

Use a red/green test cycle within each implementation stage: write the regression or acceptance test, observe the expected failure, implement the smallest corresponding change, then run the focused and affected existing suites. Preserve the user's unrelated dirty files throughout.

Run from `simplefront/`:

```sh
npm test -- tests/CityDevelopmentParity.test.ts tests/CityPopulationModel.test.ts
npm test -- tests/CityDevelopmentEconomy.test.ts tests/PaintedEconomyMilitary.test.ts
npm test -- tests/CityDevelopmentOwnership.test.ts
npm test -- tests/CityDevelopmentWorker.test.ts tests/CityDevelopmentVisuals.test.ts tests/CityDevelopmentUI.test.ts
npm test -- tests/CityDevelopmentAI.test.ts tests/PaintedAIEconomy.test.ts tests/PaintedAICombat.test.ts
npm test
npm run build
```

These new test paths are planned deliverables; they do not exist merely because this document lists them. Add exact lint and benchmark invocations to the verification report after the relevant integration files and benchmark options are implemented. Record actual command outputs and results, not presumed passes.

## 5. Recommended first implementation milestone

Complete Stages 1 and 2 first: **one organically growing city inside the actual SimpleFront simulation, connected to real housing/population accounting, existing farms, and existing combat**.

This gives a small, inspectable integration result before adding the complexity of multiple-city capture and full-map rendering. Keep the current playable path available until later stages pass; an internal integration switch must not add another ordinary game-selection choice.

Before beginning that milestone, confirm owned-land-only growth, unchanged farms, the proposed absence of an automatic maturation food charge, and the rescaled opening preset. Resolve multi-city ownership as a coherent design before Stage 3.

## 6. Completion checklist

- [x] The one-city simulation demonstrably preserves the tuned demo mechanism.
- [x] Housing, deployed troops, fertility, and recruitment have a single authoritative accounting path.
- [x] Multiple centres cannot multiply free growth or double-count housing.
- [x] Capture and population losses preserve development under the approved ownership rules.
- [x] Food remains global, recoverable, and free of consumption/logistics.
- [x] AI develops, expands, attacks, defends, and rebuilds using the same rules as the player.
- [x] Actual-game streets, building pixels, level labels, and age controls work without affecting simulation results.
- [x] Full-map performance and deterministic replay/state behaviour are verified at the recorded scale; shared-query costs and occasional over-budget ticks remain documented limits.
- [x] Match cadence is measured and the target is either demonstrated or explicitly reported as unmet.
- [x] OpenFront live and all four demos remain unaffected.
- [x] The user approved Demo 4 behaviour for actual-game integration and the saved palette as default (September 8, 2026).
- [x] The verification report records the completed integration, user-approved normal-default activation, and remaining gameplay limitations.
