# Organic city integration — implementation evidence

Plan: [SimpleFront Organic City Integration](../../docs/superpowers/plans/2026-09-07-simplefront-organic-city-integration.md).

## Current status — September 9, 2026: late-game CPU optimization and GPU probe

The user approved exact-tile structure queries, local neighbourhood recalculation
and a measured GPU feasibility probe. The earlier 3,102-tick run did not cover the
reported slowdown near tick 5,000.

The late-game CPU profile identified construction (~53% of sampled simulation
time) and periodic hashing (~18%) as the main paths. Both repeatedly called a
zero-radius unit query that searched an entire 100×100 spatial bucket. These
percentages include their child calls and must not be added to the separate
nearby-unit-query percentages.

`UnitGrid` now indexes actual tile membership for exact queries while retaining
coarse buckets for radius searches. It preserves type order, repeated requested
types, bucket insertion order, predicates and live active/construction state.
The existing zero-radius bucket-edge behaviour remains deliberately unchanged;
correcting that separately would change replay outcomes. Movement and removal
track the indexed position independently of `lastTile`, because client views can
receive several moves in a tick or move in an inactive update. `GameView` compares
the position before each update so a return to the tick's starting tile is indexed.

The physical city model caches suitability, support count and growth score.
Founding or maturation invalidates that tile and its cardinal neighbours;
restore clears the cache. Terrain/config are immutable inputs. Ownership,
structures, damage and unfinished-work eligibility are still checked live, so
this is **not** a cached complete candidate list or a simultaneous-growth rewrite.
Random selection, floating-point formulas, food, housing and combat are unchanged.

### Same-seed CPU evidence

The same SPQR loader/legacy Verdantia-labelled balance-harness setup described
below now runs to 6,102 total ticks. Instrumentation is unchanged; native sampling
starts at tick 4,500. Percentiles below cover each 500-tick window ending at the
listed tick, not all ticks since the start.

| Core tick p95 | Before this pass | Exact lookup only | Lookup + local geometry |
| --- | ---: | ---: | ---: |
| Tick 5,000 | 111.6 ms | 43.8 ms | 39.7 ms |
| Tick 6,000 | 156.4 ms | 60.7 ms | See longer-run evidence below |

The exact-lookup replay reduced total core time from 119.8 to 66.0 seconds and
matched final hash `1151405494506618800`, all recorded developed-tile counts and
surviving-player counts. The combined run also matched that hash at tick 6,102
when extended for the GPU data capture. These are local screening measurements,
not a hardware-independent FPS guarantee. Probe:
`/tmp/simplefront-late-cpu.gG4SoR/profile.mjs`.

The combined 10,102-tick capture run finished with hash `2388777405272386000`.
At tick 10,000 it had 65,879 developed tiles. The last 1,000-tick window had a
25.1 ms median, 116.0 ms p95 and 183.3 ms maximum: late-game spikes still exceed
the 100 ms budget at this larger scale. This run overlapped some verification
work, and its 1,000-tick windows differ from the table. It is evidence of remaining
scaling work, not a claim that every late match is now smooth.

After the client lifecycle review fix, a fresh 6,102-tick replay again matched
`1151405494506618800` and every recorded development/player checkpoint. This run
overlapped the full test suite and browser verification: its tick-5,000/6,000 p95
values were 51.8/64.0 ms and total core time was 95.7 seconds. It confirms final
state parity; its contended timing should not be mixed into an uncontended speed
ratio with the earlier screening runs.

### Throwaway WebGPU feasibility probe

Captured real SPQR snapshots at ticks 5,000 and 10,000 supply the developed cells
and adjacent wilderness (38,097 and 84,103 cells). A compute shader calculates
integer four-neighbour support and carries the current eligibility flag. Initial
results match the real city model. Subsequent synthetic batches change 50 cells'
levels/eligibility, affecting at most 250 neighbourhoods; full CPU, local CPU
invalidation and GPU results agree for all 80 batches per snapshot. Twenty warm-up
batches precede 60 measured batches.

| Snapshot | Full CPU rescan median | Local CPU updates p95 | GPU round trip median |
| --- | ---: | ---: | ---: |
| Tick 5,000 | 2.7 ms | 0.1 ms | 0.7 ms |
| Tick 10,000 | 6.1 ms | 0.1 ms | 0.8 ms |

Local CPU medians were below the browser timer resolution, **not zero work**.
GPU time includes changed-cell uploads, dispatch, copy, asynchronous mapping and
copying the results back to JavaScript. Initial uploads took 7.7/4.5 ms separately;
GPU buffers used 8,845,772/9,397,844 bytes. No GPU validation or page errors occurred.
The probe ran in local headless Chromium without the game's renderer competing
for GPU time. It does not include weighted selection, floating-point terrain
scores, construction budgets, AI, combat or the full tick synchronization path.

Decision: retain CPU-authoritative simulation and local geometry updates. WebGPU
beats a full rescan in this subset, but not local updates; this does not justify
shipping a GPU simulation backend. Existing WebGPU rendering is unchanged.
Temporary reproducible capture/probe scripts and binary inputs are under
`/tmp/simplefront-gpu-check.mlUvxo/` (`capture.mjs`, `compare.cjs`).

### Regression verification

Test-first failures exposed 1,000 unrelated farm inspections across two queries,
400 unnecessary geometry recalculations, stale client intermediate positions and
missed return-to-origin moves. New checks cover those cases plus ordering,
construction flags, predicates, local maturation and snapshot restore against a
fresh model. Full suite: **515 tests in 56 files passed**. TypeScript/build, scoped
ESLint, formatting and whitespace checks passed; the existing bundle-size warning
remains. Independent review cleared the focused production changes after the
client lifecycle fix. OpenFront live and the demos were not modified by this pass.

The actual SPQR browser rerun reached tick 6,000 with 37,138 developed tiles and
then advanced to tick 6,049 during the five-second normal-speed measurement.
Headless Chromium animation callback cadence was ~120 Hz (p95 8.8 ms, max 16.5 ms)
at 1,280×900 CSS pixels / DPR 2. Paused cadence was similar; there were no page
errors or reported worker errors. Home navigation kept the hidden backdrop at
tick 221. This is a local browser smoke/performance check, not guaranteed display
FPS. An initial browser attempt timed out after 300 seconds without progress
diagnostics; its cause was not established and it is not counted as a pass. The
instrumented rerun completed successfully. Reproduction:
`node /tmp/simplefront-stutter.We0b3m/spqr-browser.cjs 6000` (local port-9000 server).

## September 8, 2026: SPQR performance optimization

The user reported stuttering on SPQR and approved optimizing the measured city
calculation and background-rendering costs without changing gameplay.

The physical city model now indexes developed tiles and possible growth sites by
current owner. Housing and births scan that player's developed tiles, in their
original physical insertion order to preserve floating-point arithmetic exactly.
Growth queries examine owned development and owned wilderness beside development;
foreign and neutral buildings still support expansion and maturation. Capture,
relinquishment, development completion and snapshot restore maintain these indexes.
Terrain damage and structures remain live eligibility checks. Full-scan queries
remain available for parity checks; formulas, random draws, candidate sorting,
construction cadence, population scale, food and combat are unchanged.

The homepage backdrop is now hidden and paused when navigating elsewhere, with
its existing world resumed on return. Direct shell navigation skips its initial
load. An asynchronous mount that finishes after navigation cannot restart it.
Pending worker imports are cancelled, and a worker still initializing is terminated
on navigation so its 220-tick prewarm cannot continue behind the match. A ready
background world remains paused and can resume without rebuilding it.

Same-seed diagnostic: `simplefront-pace-01`, 50 bots plus SPQR's authored nations,
3,102 total ticks (3,000 requested plus setup), five simulated minutes. The existing
balance harness's map loader was directed to SPQR's terrain/layers/manifest; its
legacy configuration label remains Verdantia. Both runs use that identical setup.
Instrumentation times the same three model functions inside core ticks, excluding
benchmark observers. These are CPU simulation measurements, not browser FPS.

| Measurement | Before | After |
| --- | ---: | ---: |
| Total core tick time | 114.5 s | 22.6 s |
| Mean core tick | 36.9 ms | 7.3 ms |
| Core tick p95, entire run | 145.7 ms | 22.7 ms |
| Median tick, final 500 | 57.7 ms | 9.6 ms |
| Tick p95, final 500 | 193.2 ms | 44.6 ms |
| Developed tiles | 12,740 | 12,740 |
| Surviving players | 102 | 102 |

The final game hash is identical (`258088919971910750`) and development counts
match at every recorded 500-tick checkpoint. This is about an 80% reduction in
core tick time on one paired run, not a guarantee of a specific FPS on every
device. Temporary reproducible probe: `/tmp/simplefront-stutter.We0b3m/spqr.mjs`.

New regression tests first demonstrated 802 ownership reads for one local
housing/birth query and 2,090 for a local construction opportunity amid 400 remote
city tiles; they now require fewer than 10 and 100 respectively. Additional checks
compare indexed queries against full scans through growth, ownership changes,
damage, structure changes and snapshot restore, and cover backdrop pause/resume
and late asynchronous mounts. OpenFront live and demos are unchanged.

The real browser check selected SPQR (2,048 × 1,024), advanced beyond tick 3,000
with 13,209 developed tiles, and measured five seconds of normal-speed animation
at 1,280 × 900 CSS pixels / device-pixel ratio 2. Headless Chromium's animation
callback cadence was approximately 120 Hz, p95 8.9 ms, max 9.4 ms, with no page
errors. This measures that test environment, not the user's display FPS. Direct
shell loading created no backdrop worker; navigating home resumed its animation,
and leaving again held its tick at 221. Probe:
`/tmp/simplefront-stutter.We0b3m/spqr-browser.cjs`.

A separate browser regression delayed terrain initialization across navigation:
no hidden worker was created, returning home restored the worker and baked terrain
tint, and no page errors occurred. Probe:
`/tmp/simplefront-stutter.We0b3m/backdrop-cancel.cjs`.

Validation: 507 tests in 55 files passed; TypeScript and the production build
passed. The existing large-bundle warning remains. Independent review checked
ownership-index correctness and prompted the additional prewarm-cancellation and
terrain-restoration regressions.

## September 8, 2026: minimum housing and 2×2 city sprites

Following approval, a spawned organic SimpleFront player's housing is now
`max(10,000, owned developed housing)`. This is a permanent floor, not an extra
10,000 added to every city or to the opening. The initial kit remains one level-one
tile, one farm, 8,000 troops and 10,000 housing. Losing every developed tile while
retaining territory permits population recovery into that minimum; losing all
territory still eliminates the player. Physical development remains unchanged by
ownership or population loss.

Additional centre purchases are removed from the organic build bar and AI, and
both paint and build-unit commands reject them without charging food or creating
housing. Expansion and maturation provide additional housing. Existing farm
investment and expedition savings remain. Legacy painted fixtures still permit
city painting; OpenFront live and the four demos are unchanged.

Actual-game city sprites now contain four pixels (2×2), with the map grid and
simulation tile size unchanged. Shared street crossings remain connected and a
building pixel is retained even for north/west-only connections. Existing age
palettes, live recolouring and level labels remain available.

Verification covers minimum-housing recovery, non-additive capture/recapture,
rejected centre spam through both command paths, AI recovery and farm purchases,
all 100 sprite levels, deterministic street connectivity and retained legacy
behaviour. A real WebGPU readback matched all four palette pixels, live palette
edits/reset, dimming, overlays and map reset with no validation errors. The normal
selector/browser check confirmed no centre button, 10,000 opening housing,
automatic growth to 20,000 at tick 92 with one centre, restart behaviour and
OpenFront isolation; no page errors.

Final validation: `rtk npm test -- --maxWorkers=2` passed all 501 tests in 54
files. Typecheck/build, scoped ESLint, formatting and whitespace checks passed.
An earlier unrestricted run concurrent with build/lint timed out four tests;
the lower-concurrency rerun used their unchanged time limits. The existing
large-bundle build warning remains.

The measurements in earlier sections predate this rules change and do not prove
10–15-minute match pacing for it.

## September 8, 2026: AI protects farm investment

The approved organic AI update fixes spending farm savings on discretionary
attacks. Its existing 20-second food budget now includes recruitment into current
housing vacancies (a bounded current-rate estimate, not a second simulation).
When food is forecast to fall short and a farm site exists, economic decisions
save for and buy that farm. Expedition slots may spend the surplus only; hostile
targets are re-evaluated against the smaller affordable force. Tiny expeditions
wait for a useful force, with the minimum capped by treasury capacity and a
500-food budget at default prices so scarce sites do not create an impossible
requirement. Existing defender reserves and emergency housing recovery remain.

All changes to decisions are gated to organic SimpleFront. Food, city founding,
combat, OpenFront live and demos are unchanged. City founding still buys 10,000
empty housing immediately for 2,000 food; making it consume shared construction
work was discussed as a possible follow-up, not implemented.

Validation: five new farm-saving/recruitment cases failed before the fix; the
complete suite now passes 499 tests in 54 files. Further cases verify protected
savings on expedition slots and useful attacks without a farm site. Build,
typecheck, scoped lint, formatting and whitespace checks pass. The zero-food,
zero-farm fixture rebuilds its first farm at tick 250 and dispatches 11,699 troops
at tick 749; the regression now allows 90 seconds for this income-first recovery
instead of expecting an expedition within 60 seconds.

Same-seed actual-runner comparison: `simplefront-pace-01`, organic defaults,
balanced policies, 75 AI players plus the human stand-in, 3,000 ticks / 300.1
simulated seconds. Counts below exclude the human stand-in; survivor statistics
have different denominators because battles diverge.

| Metric | Before | After |
| --- | ---: | ---: |
| Surviving AI players | 71 | 64 |
| Paid AI farm purchases | 92 | 5,309 |
| Median farms per surviving AI | 2 | 84 |
| Survivors below the 1,500-food farm price | 71 | 1 |
| Median survivor food | 198.583 | 21,091.324 |
| Paid land dispatches | 10,201 | 4,223 |
| Neutral tile captures (including recaptures) | 60,029 | 59,627 |
| Enemy tile captures (including recaptures) | 16,725 | 29,720 |
| Simulation tick p95, milliseconds | 70.37 | 92.04 |

This shows substantially greater farm investment and fewer, better-funded
dispatches on one seed, not a completed balance sweep or a proven 10–15-minute
match. The busier game increases tick cost; p99 was 128.98 ms and max 185.65 ms.
Both runs remain unfinished at five minutes. Existing stale boat/attack-ID
warnings occurred in the runner. Raw diagnostic outputs are at
`/tmp/simplefront-ai-farms.68JmJa/organic-baseline.json.gz` and
`/tmp/simplefront-ai-farms.68JmJa/organic-final.json.gz` (temporary artifacts).

## September 8, 2026: troops and housing scaled ×100

Following user approval, normal organic SimpleFront starts humans and AI with
8,000 actual troops and 10,000 housing per tile level. Food stocks, refill,
building prices, per-troop dispatch prices, terrain losses and combat are unchanged.
A full opening dispatch costs 1,600 food out of the 4,000 starting food.

`GAME_POPULATION_SCALE = 100` converts between the development model's original
units and the game's actual population. Housing and births (including recovery
from zero) scale ×100; construction receives normalized population and housing.
This preserves the original work budgets, fertility gradient, occupancy threshold,
maturation preference and four-neighbour upgrade rules. Integer recruitment now
has finer resolution relative to capacity; the change does not promise identical
match replays or battle outcomes. Next-match housing controls display actual
people and convert back to model units on save. OpenFront live, all demos and
legacy painted fixtures retain their previous settings.

Verification:

- New spawn and scaled-birth assertions failed against the old implementation.
- Full `rtk npm test`: 492 tests passed in 54 files.
- A 1,000-tick comparison preserves the original model's physical state, work,
  random sequence, expansion and upgrades at equivalent population pressure.
- Real attack execution verifies 8,000 troops capture more terrain than 80,
  with unchanged per-troop food costs. Scaled dispatch, capture, recovery and
  idle/deployed accounting pass; the original small-passenger handoff case remains.
- Larger AI armies can invalidate a queued border selection before execution;
  tests require those rejections to spend zero food/troops and retain successful
  affordable attacks. Combat and AI tactics were not changed.
- Browser: ordinary selector, 10,000 opening housing, scaled housing controls,
  automatic expansion to 20,000 housing by tick 92 with one paid seed, restart,
  ambient exclusion and OpenFront isolation passed; no page errors.
- Typecheck/build, scoped ESLint, formatting and whitespace checks passed.
  The existing large-bundle warning remains.

Earlier pacing/replay measurements below predate this population scale and do not
establish its match duration. The 10–15-minute target still needs playtesting.

## September 8, 2026: normal SimpleFront launch enabled

The user explicitly approved removing the preview-only requirement. Choosing
SimpleFront through the normal game selector now launches organic development at
`/simplefront/#shell`; no special URL is needed. The shell supplies the existing
development defaults to non-ambient SimpleFront matches. Explicit next-match
overrides remain supported. Core painted benchmark defaults, the ambient backdrop,
OpenFront live and the demos are unchanged.

Verification for this launch-setting change:

- RED: the normal-URL UI assertion failed before changing the shell (1 failed,
  11 passed), because development configuration was absent.
- GREEN: UI and worker suites passed, 14 tests in 2 files.
- Full `rtk npm test`: 488 tests passed in 54 files.
- `rtk npm run build`: typecheck and production build passed; existing large-chunk
  warning remains.
- Local Chromium: selected SimpleFront from the root game selector without a
  preview flag; the human city's housing increased from 100 to 200 by tick 95
  with only one paid city seed. Restart retained organic development, the ambient
  backdrop remained excluded, and switching to OpenFront showed no city controls.
  No page errors were observed.

This is default activation, not a new balance result: the 10–15-minute match target
remains unmet, and human playtesting/cadence tuning remain open. The entries below
are chronological implementation evidence; references to preview-only access or
unchanged ordinary URLs describe the earlier stages, not the current launch.

## September 8, 2026 — Stage 1 baseline

Implementation begins with an isolated one-city core model. It is not yet wired
into playable SimpleFront. The opening economy and capture decisions in the plan
remain explicit gates before the relevant integration stages.

Before implementation, from `simplefront/`:

- `rtk npm test`: 348 tests passed in 44 files.
- `rtk npm run build`: typecheck and production build passed. Existing warning:
  some minified chunks exceed 500 kB.

The initial worktree already contained uncommitted Demo 3 code, tests, docs and
gallery registration, plus the integration plan. These are preserved; this work
does not imply that they have been committed or deployed.

For isolation verification, SHA-256 over sorted file paths and file contents:

| Directory                               | Baseline digest                                                    |
| --------------------------------------- | ------------------------------------------------------------------ |
| `simplefront/src/demos/city-population` | `b75adeb9c12785ddb35855a6047998e3b464f4eaefab716c7a48554420b12d32` |
| Original game's `src`                   | `e4d782f6039d508720f92a96ed20615708910b777340de694f22937989d07c42` |

## Next-stage integration cautions

- Current `PaintedEconomyConfig` starts with 2,000 troops and grants 10,000
  capacity per painted city. The demonstrated level-one city provides 100
  housing. This requires an approved opening preset, not an accidental clamp.
- Current spawning picks the two nearest legal tiles for city and farm. A farm
  immediately beside the centre would prevent that centre from satisfying all
  four urban-neighbour upgrade requirements. Preserve the kit but explicitly
  choose a compatible farm location during Stage 2 integration.
- Current ownership transfer clears old density and reconstructs plot density.
  Persistent urban levels need their own approved transfer path in Stage 3.
- A single-city parity model owns its own population for comparison with the
  demo. It must not be instantiated per city as independent troop economies;
  the actual integration needs one player-global population and work budget.

No 10–15-minute match-duration claim follows from the Stage 1 parity work.

## Stage 1 implementation and verification

Added `src/core/development/CityDevelopment.ts` and
`CityDevelopmentConfig.ts`, with a minimal terrain input contract and no
production imports from demo modules. Numeric defaults, selection order,
maturation, housing, fertility, population feedback, and seeded randomness
match the frozen demo. The numeric config validator does not carry demo UI
control metadata into core.

`advance(elapsedSeconds)` converts caller-supplied simulation time into fixed
0.25-second steps and retains fractional time. Negative, nonfinite, and
unrepresentable step counts are rejected before mutation. It does not use
browser animation or wall-clock time.

New tests in `tests/CityDevelopmentParity.test.ts` cover:

- All six demo landscapes for 1,200 steps (300 simulated seconds), including
  population-loss and vacancy-fill shocks. Every step compares statistics,
  population, pending work, chosen tile, and action. Sampled checkpoints compare
  every tile's level, housing, inspection, upgrade progress, and candidates.
- A separate unshocked plain fixture: 149 developed tiles, 36,800 housing,
  and approximately 35,410.968239479 population after 300 seconds.
- Non-default fertility and maturation preferences; discrete 0-to-1 expansion,
  +1 upgrades, four-sided support, and one completion per step.
- Retention of both establishment work and upgrade work after population loss.
- Zero growth rate, zero population/recovery, full housing, blocked expansion,
  and terminal maturation work. A full city grown to level 100 is not simulated
  by this test suite; the terminal work boundary is checked directly.
- Equal elapsed time delivered in different partitions, remainder retention,
  zero-time no-op, and invalid time rejection without state changes.

### Commands and results

Run from `simplefront/` after implementation:

| Command                                                                                                                                          | Result                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `rtk npm test -- tests/CityDevelopmentParity.test.ts tests/CityPopulationModel.test.ts`                                                          | 63 tests passed in 2 files                                                 |
| `rtk npm test`                                                                                                                                   | 380 tests passed in 45 files                                               |
| `rtk npm run build`                                                                                                                              | Typecheck and production build passed; existing chunk-size warning remains |
| `rtk proxy npx eslint src/core/development/CityDevelopment.ts src/core/development/CityDevelopmentConfig.ts tests/CityDevelopmentParity.test.ts` | Passed, no findings                                                        |

Initial RED: the new parity suite failed because the core module did not exist.
GREEN: the port passed. An additional finite-overflow regression reproduced a
nonterminating elapsed-step calculation under a three-second process timeout;
the safe-integer step-count guard fixes it and the regression now passes.

Recomputed source hashes match both baseline digests above. Built game, worker,
and demo asset hashes also match baseline: this unreferenced core module has not
changed the playable bundles.

### Current boundary

This is a verified one-city foundation, not completion of the game integration.
The module still allocates per-instance map arrays and owns a demo-style clamped
population. Explicit `ponytail:` comments identify both limits: replace these
with shared tile storage and player-global troop accounting before multi-city
gameplay. The terrain adapter must supply valid numeric terrain and cardinal
neighbour indices; constructor checks cover dimensions and array lengths, not
sanitization of external terrain data.

The user approved owned-land-only growth, manual farms, and no extra automatic
maturation food charge on September 8. Opening army scale and capture rules
remain unresolved. No economy, combat, AI, rendering, or spawning changes have
been enabled, and no commits or deployment were performed.

### Independent review checkpoint

Spec compliance passed. The reviewer confirmed the scoped behaviour and tests,
and raised plan-mandated duplication as a maintenance concern. Controller
decision: accept it for Stage 1 because the demo must remain an independent,
unchanged reference and core must not import demo modules. The cost is dual
maintenance until the reference-freeze policy is deliberately revisited; parity
tests protect against unintended drift. Do not silently consolidate or modify
the demo during later gameplay work.

A minor review finding remains for integration: public arrays/config and
observation fields are mutable, despite the class comment describing method-only
mutation. Treat observations as trusted, read-only-by-convention inputs at this
checkpoint; clarify/harden that boundary before exposing it to gameplay callers.

Stage 1 is complete. Stage 2 has not started: the opening troop-count proposal
(80 troops in 100 housing) still requires user confirmation. Later capture rules
remain a separate gate.

## Stage 2 — approved opening and integration baseline

The user subsequently confirmed **80 troops /100 housing**. Stage 2 is now in
progress, as an opt-in real-core integration path. Normal game selection and
normal SimpleFront matches remain on the existing rules until later capture,
rendering, and AI stages are ready.

Approved rules: grow only on owned land; keep manually placed farms and the
existing global food economy; charge food for founding but not for automatic
maturation. Initial food prices are unchanged for measurement. This is not
final balance.

Fresh pre-implementation baseline: `rtk npm test` passed 380 tests in 45 files;
`rtk npm run build` passed with the existing large-chunk warning.

Integration checks to preserve:

- At 80 total troops, 100 housing and default fertility 4.5, the initial
  population gain is `.2 × (80 × 4.5 /3 +10) × .2 =5.2 people/second`.
  The core's 100 ms tick therefore initially earns 0.52 fractional troop credit;
  it does not add a second copy of the demo's autonomous population gain.
- Dispatch must move people between idle/deployed totals rather than opening
  replacement-recruitment slots. Ships and pending landings remain counted once.
- Development steps remain 250 ms of simulation time even though game ticks are
  100 ms. The adapter retains the remainder rather than rounding each tick.
- The game map uses five-bit terrain magnitude; magnitude31 is impassable land.
  Ownership/building exclusions must not be represented as water, which would
  incorrectly grant a water-attraction bonus around farms or enemy borders.
- Candidate neighbour order must be stable: the demo uses W/E/N/S; the game's
  array-returning `neighbors()` uses a different order, while `forEachNeighbor`
  supplies W/E/N/S.

Results will be recorded after implementation and review; the above are
requirements and baseline evidence, not claims that Stage 2 has passed.

### Stage 2 implementation — verified internal milestone

The internal `SimpleFrontCityConfig` now enables one organically developing
city in the real simulation. It is deliberately not registered in the game
selector: normal SimpleFront still uses `SimpleFrontConfig`. The opening is
80 troops, 100 housing, and one farm, preferably outside the centre's cardinal
upgrade ring. Existing food prices and dispatch charges are unchanged.

The player owns one persistent development model. The existing painted economy
tick supplies total idle/deployed population and carries fractional recruitment
credit; it does not run the demo's independent population update. Construction
uses 250 ms simulation steps and currently usable, owned urban housing. Losing
housing pauses positive recruitment without deleting troops or development.
Paid replacement founding establishes level one on a new site and preserves
old levels/work; this does not define cross-owner centre transfer.

Terrain elevation is `magnitude /31`, normalized from the map's five-bit range;
magnitude-31 land remains impassable. Slope is the maximum dry cardinal height
difference in those normalized units. Water attraction uses cardinal tile
distance from actual water only. Static terrain arrays are cached once per map;
ownership, structures, and damage are checked dynamically. Capacity reads
iterate developed cells, not every map cell. Per-player model arrays remain a
prototype limit to replace before multiple-city rollout.

Fresh controller verification after implementation, from `simplefront/`:

- `rtk npm test`: **395 tests passed in 46 files** after review fixes (391
  passed before the four additional regression tests).
- `rtk npm run build`: typecheck and production build passed; the existing
  > 500 kB minified-chunk warning remains.
- Scoped `rtk proxy npx prettier --check` over all twelve changed/new Stage 2
  TypeScript files: passed.
- Focused Stage 2 suite: 15 tests passed. Combined parity, default runtime, and
  painted economy/painting/military/plot regressions: 75 tests passed.
- Scoped `rtk proxy npx eslint` and `rtk proxy git diff --check`: passed.
- Original `src` and frozen Demo 3 directory hashes still match the baseline.

New direct runtime checks include the unchanged normal opening (2,000 troops /
10,000 capacity), organic fractional recruitment, construction, paid founding,
temporary land loss, zero-farm rebuilding, actual attack dispatch, transport and
pending landing handoffs, and deterministic development-state hashing.

The first independent review identified three concrete defects and missing
boundary assertions. Regression tests reproduced the defects, then passed after
fixing all-structure exclusion, organic-only repeat-spawn protection, and slope
beside dry impassable land. Real-core tests now force a supported +1 upgrade,
apply casualties without losing levels/work, and check that legacy density,
birth-credit and supply state remains untouched. Organic repeat spawning is
rejected rather than allowing free retained city seeds; normal selected-spawn
behaviour is unchanged. Scoped re-review confirmed all four findings addressed
with no new defects or deferred observations.

Stage 2 is complete. This is not a public gameplay rollout,
capture implementation, AI integration, performance result, or a demonstrated
10–15-minute match cadence. No commits or deployment have been performed.

The next implementation gate is a complete capture/ownership rule: whether
capturing the centre transfers associated territory, who receives housing from
contested cells, and who may grow there. Multi-city membership and shared work
allocation follow that decision. Do not enable normal matches before those
rules, rendering, AI and release checks are ready.

## September 8, 2026 — Demo 4 approval and Stage 3

The user approved Demo 4's tile-local behaviour for the actual game and the saved
`city-local-palette.json` as Demo 4's new default. This supersedes the old capture
and multi-city decision gates above: there is no governing centre or city
membership. Physical tiles retain development and work through capture; each
tile's current owner receives its housing. All four equal-or-higher developed
neighbours count regardless of ownership.

Demo 4 now starts with the saved 36 colours and six age boundaries. Reset palettes
returns to those values. A regression compared the defaults against the saved
JSON (RED before the update, GREEN after); real browser checks verified all 36
initial input values, live edits while paused, exact-pixel reset, unchanged
simulation/street state, and no horizontal overflow at 390px.

### Tile-local actual-game engine

`GameImpl` now owns one `CityDevelopmentState` shared by all players. Physical
levels/work are separate from player accounts, which carry seeded random state
and construction-step timing. Founding additional paid seeds adds level-one
housing but no free troops or extra construction engine. The historical Demo 3
kernel and parity tests remain independently available.

Housing and fertility use current tile ownership, separate from permission to
construct. Combat damage or a blocking structure may pause construction, but do
not hide existing housing. Capture, relinquishment, seed removal, and player
defeat do not erase physical levels or paid progress. Global hashing includes
neutral development and relevant ownership/eligibility so abandoned tiles cannot
silently disappear from deterministic checks.

The versioned development-only snapshot is `tile-local-1`. It includes physical
levels/work, development and unfinished-work ordering, configuration, seed,
per-player RNG and partial-step timing. Ownership, troops and recruitment credit
remain part of the surrounding game, not this component snapshot. This is not a
claim of compatibility with historical recordings using different rules.

Controller verification and independent Stage 3 review:

- `rtk npm test`: **432 tests passed in 49 files**.
- `rtk npm run build`: typecheck and production build passed; the existing
  minified-chunk-size warning remains.
- Original OpenFront `src` and frozen Demo 3 fingerprints still match the recorded
  baselines.
- Scoped formatting, lint and `git diff --check` passed. The task review checked
  the exact pre-task dirty-baseline diff, snapshot continuation, global hashing
  and the existing ownership/accounting hooks: spec compliance passed, task
  quality approved, with no Critical, Important or Minor findings.

Stage 3 is complete. No commits, branch changes or deployments were performed.

Normal matches still use the painted defaults. Worker snapshots, 4×4 actual-game
rendering with the approved palette, HUD/founding controls, AI adaptation and
full-map cadence/performance checks remain separate integration stages. User
approval resolves the design gate; it does not substitute for those checks.
The 10–15-minute match target has not yet been demonstrated by this milestone.

## Stage 4 — actual worker and GPU city presentation

The internal organic match now sends typed full/reset snapshots and incremental
physical tile updates through the actual worker and GameShellPage. Its CameraRenderer
draws connected 4×4 street/building sprites using the saved six-age palette.
Packed GPU storage is 8 bytes per map tile plus a 2,424-byte palette lookup;
palette changes upload that lookup without rebuilding streets or touching game rules.

The internal `setNextCityDevelopment(config)` seam validates next-match settings;
the worker reports its active configuration separately. Ordinary matches retain
their previous defaults. HUD, founding gestures and AI integration remain next.

Verification after the street-bridge review fix:

- Full suite: **446 tests in 51 files passed**. Typecheck/build, scoped lint,
  formatting and diff checks passed; the existing large-chunk warning remains.
- Actual Chromium WebGPU compiled both the camera and composed terrain/city view.
  Texture readback checked all sixteen sprite pixels, live colours, mask dimming,
  palette reset and clearing previous-map development.
- Actual FieldKernel/CameraRenderer output for two same-era opposing owners
  preserved exact legacy border, front, targeting, damage and historical-seed
  pixels while rendering urban sprites in both district interiors.
- Normal shell and internal organic worker both started on Verdantia 512×256
  without browser page errors. OpenFront `src` and frozen Demo 3 hashes still
  match their recorded baselines; Demo 4 remains untouched by this stage.
- Independent review found one inherited demo edge case: joining two developed
  neighbourhoods did not always join their streets. A regression reproduced it;
  production now joins each distinct neighbouring street network, keeping random
  branching for optional loops. Scoped re-review confirmed the fix with no new
  issues. The demo itself and authoritative simulation are unchanged.

Presentation tradeoff: existing whole-tile borders and battle/seed overlays take
priority over sprites. Sparse or entirely border districts show less street detail
until they gain interior tiles. This is not a centre-control rule.

Camera rendering writes only presentation buffers and has no simulation reference
or worker-message path. In addition to the test-suite visual-reader comparisons,
an actual WebGPU fixture ran two identical two-player GameImpl simulations for
60 steps with capture/recapture. One stayed headless; the other panned, zoomed at
0.25/1/8/16, rendered one to five times per step and changed age anchors. Full
authoritative hashes matched at every step; no GPU validation errors occurred.

Stage 4 is complete; the default gameplay rollout, AI, performance and human
cadence checks remain gated. No commits, branch changes or deployments were made.

## Stage 5 — housing HUD, founding and tuning controls

The organic game now shows authoritative total/idle/deployed population, housing,
occupancy, births per second, housing pressure and construction status. Zero-housing
survivors retain their people; the HUD distinguishes genuinely blocked recovery
from possible construction beside retained neighbouring development. Before spawn,
it shows a waiting message instead of the old placeholder troop count.

City founding is one deliberate paid click; farms retain their brush. Close zoom
shows explicit integer levels, with viewport-bounded labels and an organic-only
zoom ceiling that supports high-DPI displays. Native controls separate next-match
economic settings from immediately applied visual ages/colours. Restart applies
saved economic settings; invalid age drafts preserve the last valid palette.

Verification: **457 tests in 52 files passed**, plus build/typecheck and scoped
lint. Independent review approved spec compliance and quality with no blocking
issues. Actual browser checks covered 390px mobile layout, 36 live colour inputs,
saved-palette reset, invalid-age rejection, pending settings remaining inactive
until restart, independent OpenFront selection, and Home navigation. A synthetic
result-screen check confirmed its Restart button remains usable; this was not
presented as a completed match.

In a real high-DPI game, the opening had one farm and one seed/100 housing. One
founding click spent 2,000 food, placed one level-one tile and raised housing to 200. Two readable level-one labels and the matching occupancy HUD were inspected.

One nonblocking review observation remains: farm-stroke interpolation may include
developed cells between valid pointer endpoints. The authoritative purchase path
skips them without charging, and the preview marks invalid targets. Filtering the
completed client stroke is a possible polish change, not a legality gap.

Stage 5 is complete. The native-controls approach reuses existing worker, camera
and validation boundaries without dependencies. AI adaptation and the release/
human-playtest gates remain; ordinary URLs still use the painted defaults.

## Stage 6 — AI development and recovery

AI now evaluates physical housing and usable construction room instead of buying
repeated city tiles. Its bounded, deterministic site search excludes developed
land and prefers farms outside urban support rings. It can found a disconnected
seed when genuinely blocked or homeless, while retained housing prevents seed-loss
purchase spam. Developed territory is valued by housing, without a historical
seed control bonus. Organic opening attacks can use one source tile; painted
front-size rules remain unchanged.

Verification: **474 tests in 53 files passed**, plus build/typecheck and scoped
lint. Independent review approved both spec and quality. Paid-action fixtures
recorded an additional farm at tick 10 (1,500 food), neutral expansion at tick 29
(13 troops, 2.6 food), and a hostile dispatch at tick 9 (24 troops, 4.8 food) with
actual enemy territory loss. Zero-farm/zero-food recovery bought a farm at tick
250 and resumed expansion at tick 269. Ticks are 100ms; these are focused fixtures,
not full-match timing results. Coast/valley, seed-loss, border/farm/structure blocks,
contested development and multiple-seed budget cases pass.

No AI bonuses, prices, population rates, combat formulas or victory rules changed.
The fixed single-source organic front and opening two-farm heuristic still need
full-match measurement. Stage 6 is complete; the 10–15-minute target and human
gameplay approval remain unproven release gates.

## Stage 7 — performance and release evidence (in progress)

Machine: Apple M2 Max, 12 logical CPUs, 96 GiB RAM, macOS arm64, Node 25.2.1.
The existing local port-9000 server and installed Chromium/Playwright were used;
no dependencies, server restart or deployment were required.

### Rendering comparison

The retained `render-perf.cjs` probe compares the exact pre-Stage-4 camera snapshot
with the integrated renderer. It uses a 512×256 surface, a 1280×720 canvas,
two owners, 5,000 developed tiles and 50 measured frames after 20 warm-ups.
This is a synthetic rendering scene, **not a running-match benchmark**.

| Renderer | Zoom | Median CPU-to-queue completion | p95 |
| --- | ---: | ---: | ---: |
| Pre-integration | 2.38 / 16 | 0.5 / 0.4 ms | 0.7 / 0.5 ms |
| Current painted | 2.38 / 16 | 0.5 / 0.4 ms | 0.7 / 0.5 ms |
| Current organic | 2.38 / 16 | 0.5 / 0.5 ms | 0.6 / 0.7 ms |

These are wall-clock queue-completion measurements, not GPU timestamps. CPU
submission medians were below timer resolution. Initial organic street layout and
upload took 90.7ms. Additional GPU city texture/palette storage was 1,051,000 bytes;
the approximate JS heap increase was 7,552,622 bytes (GC-sensitive). No GPU
validation errors occurred. Probe scripts and screenshots are retained locally
under `/tmp/simplefront-city-render.I5rAhm/`.

### Actual early-match worker

The normal-speed game-worker probe measured 70 frames, ticks 101–170, on Verdantia
512×256 with 76 players and zoom 20. The painted run had 76 seed structures; the
organic run had 76 seeds, 145 developed tiles and summed level 145. Median/p95
loop time was 1.7/2.4ms painted and 2.1/3.1ms organic, inferred from the worker's
100ms budget minus scheduled delay (therefore capped at 100ms; no sample hit the
cap). This includes simulation/frame-building/message submission and probe cost.

Mean typed-array payload was 2,878 bytes/frame painted and 2,133 organic. The
organic development portion averaged 12.3 bytes/frame and peaked at 96 bytes;
these exclude structured-clone object/string overhead. Browser heap observations
were 350.8MB painted and 353.5MB organic, including the page and animated backdrop,
and are GC-sensitive. The generated match IDs differed, so this is an illustrative
early-match comparison, not a paired deterministic performance experiment or
late-game scaling evidence. Neither run reported page errors.

An initial organic probe selected the backdrop's worker and failed its frame-count
assertion. The corrected fixture identifies the shell worker with a tagged message;
only the passing 70-frame game-worker run is reported above. No production fix was
needed.

### Real-game short and full-seed probes

The existing benchmark now accepts `--organic` and records the complete active
configuration, core hashes, deterministic development samples, cadence events,
tick/observer distributions and process memory. It still uses the real Verdantia
runner, 50 bots, authored nations and human-slot AI (76 spawned players). The
retained painted seed01/1,000-tick events and samples match the pre-integration
trace exactly. A survivor-only benchmark hash mistake was caught and fixed;
the original eliminated-player cohort is retained, restoring hash `1241618257`.

The initial organic 1,000-tick probe took 1.96s wall time for 100.1 simulated
seconds: core p50/p95 1.29/2.52ms, observer p95 0.26ms. The painted comparison
took 1.37s, core p50/p95 1.10/1.71ms. These short probes were development-time
screening, not uncontended laboratory measurements.

The first stable full seed01 run reached **1,200.1 simulated seconds with no
winner**. Six of 76 players survived; the largest held 26.73% of land. It had
12,163 developed tiles, summed level 22,135, physical housing 2,213,500 and 125
historical seeds. First organic expansion was 8.8s; first upgrade 111s; first
farm purchase 2.1s; first paid dispatch 0.2s. There were 49 paid additional seed
purchases and 236 farm purchases. These first-event times are match-wide, not
the median player's experience. The current preset does not demonstrate the
10–15-minute target.

The run took 157.3s wall time. Core p50/p95/p99 was 7.51/31.31/43.63ms, maximum
118.48ms; observer p95 2.29ms. Development payload averaged 51.7 bytes/tick,
p95 176 bytes, maximum 1,168 bytes. Peak sampled RSS was 394.9MB and heap 210.2MB,
including benchmark retention. The first seconds overlapped final tests/build,
so these are screening measurements, not a claim of an idle machine throughout.
The benchmark excludes rendering and structured clone; the separate actual worker
and renderer probes above cover those paths.

Retained full probe: `docs/balance-runs/organic-reviewed-probe-01.json.gz`, core
hash `1683044006751305`. Generated traces use exclusive output creation and are
kept separately from earlier painted runs. Existing outgoing-boat diagnostics
remain visible; they are not classified as victories or silently suppressed.

### Technical regression and preview checks

Fresh controller verification after the telemetry-test review fix: **486 tests
in 54 files passed**; `npm run build` passed, including TypeScript; scoped ESLint
over the integration core, worker, renderer, controls, AI and benchmark passed.
The build retains its existing large-chunk warning. The added observer tests use
real purchases, dispatches, AI food blocking, conquest/recapture and population
changes; the controlled-winner fixture verifies reporting, not a naturally won
organic match. No production changes were needed for those tests.

The full seed01 replay matched core hash `1683044006751305`, all 1,201 deterministic
samples, 19,966 existing action/capture events and 1,054 cadence events exactly.
Additional real-core tests cover equivalent fixed-tick simulation with observation
batches of 1, 7 and 253 ticks, including the same nonzero construction remainder.
Actual camera movement and cosmetic changes were separately verified above.

The opt-in URL is `/simplefront/?city-development=1#shell`. Actual-browser checks
passed for URL activation, unchanged ambient backdrop, next-match overrides,
explicit preview disable, 390px-wide controls, unchanged ordinary URLs and root
OpenFront isolation, with zero page errors. This is automated integration evidence,
not the required human opening/midgame/recovery/endgame playtest.

Isolation: root `src/` matches its pre-integration 646-file SHA-256 fingerprint
`e4d782f6039d508720f92a96ed20615708910b777340de694f22937989d07c42`.
Demo 3 matches `b75adeb9c12785ddb35855a6047998e3b464f4eaefab716c7a48554420b12d32`;
Demo 4 matches the approved-palette baseline
`23fc622ca71403ccb94ad91673ef82120992aa67d4a7f614924e24a3f32613ab`.
Tracked Demo 1 (`urban-growth`) and Demo 2 (`city-demand`) have no changes.
Fingerprints hash sorted path names plus file contents. No commits, staging,
branch changes or deployment were performed.

Full painted isolation replay also passed: retained hash `1074031429`, all 1,201
legacy player samples and 10,991 events match the earlier calibrated replay
exactly. The new sample envelope adds instrumentation fields, which are excluded
from this legacy comparison. Its full run took 18.8s under the concurrent
screening load, with core p95 3.91ms. Organic simulation has a material CPU cost
(full seed01 core p95 31.31ms); these differently loaded runs are not a precise
speed ratio. Shared developed-tile queries remain a known scaling limit, and
benchmark sample aggregation scans those tiles per player too. The latter is
included in wall time but not `observerMs`; optimize it if profiling warrants.

The standard ten organic seeds are complete as **test windows**, not games:
**0/10 victories by 1,200.1 seconds**, median 9.5 survivors, median leading land
share 23.76%, and 11,300–14,236 developed tiles. Median match-wide first expansion
was 8.5s and first upgrade 136.8s. No completed-game median exists. The three
policy-rotation cohorts are recorded below.

### Completed screening and final recovery correction

All 40 retained windows finished with **zero victories by 1,200.1 simulated
seconds**. Incomplete is not a 20-minute victory; median victory time is undefined.

| Cohort | Windows | Victories | Median survivors | Median leader share |
| --- | ---: | ---: | ---: | ---: |
| Balanced | 10 | 0 | 9.5 | 23.76% |
| Policy rotation 0 | 10 | 0 | 13 | 19.30% |
| Policy rotation 1 | 10 | 0 | 14 | 17.30% |
| Policy rotation 2 | 10 | 0 | 11.5 | 20.39% |

Rotations give each policy every stable seat: 760 observations per policy.
At 600 simulated seconds, survival was 33.95% farm-first, 34.61% expansion-first,
and 50.26% military-first. These dependent seats do not establish optimal human
strategy. Developed area across all windows ranged from 11,300 to 17,984 tiles.
No prices, growth parameters, combat or victory conditions were retuned to force
the target. AI front width, investment priorities and shared-tile query cost remain
investigation topics; these results do not isolate any one as the cause.

**Version boundary:** the 40 windows intentionally use pre-final-recovery-fix AI
SHA-256 `9c6c01e10b4f133c06b24da9afdddc4f47c0d3b5215074c253820d8b87c22f5f`.
Final review found two related emergency deadlocks: an AI with zero people and
housing rejected its only legal founding site beside retained development, or
used its only site for a farm first. The fix permits adjacent paid founding and
prioritizes housing **only for organic zero-total-population/zero-housing
recovery**. Normal openings, existing housing, deployed people and ordinary farm
priorities retain their rules. Both real-execution regressions require a 2,000-food
city purchase and subsequent recruitment; no free food or people were added.

Final AI SHA-256 is
`19d807a3a8acab3aca96f015952119685041162955beb9e02f8355fce23dda5b`.
Its full 12,000-tick seed01 replay matches the pre-fix core hash, all 1,201 samples,
19,966 action/capture events and 1,054 cadence events exactly. This verifies that
seed, not all 40 post-fix policy windows. The final full suite has **488 passing
tests in 54 files**, build/typecheck and scoped lint pass, and scoped final review
approved opt-in human playtesting with no remaining Critical/Important findings.

The final replay took 163.3s wall time under concurrent screening/verification
load, core p95 32.29ms, maximum 172.25ms. Spikes exceeding one 100ms tick budget
remain disclosed; this is not a blanket scalability claim.

Raw per-seed traces and four streamed cohort bundles are retained under
`docs/balance-runs/organic-reviewed-*.json.gz`, plus
`organic-recovery-fixed-replay-01.json.gz`. The small
[summary](balance-runs/organic-reviewed-summary.json) records every window,
policy totals, provenance and exact replay checks. Output creation is exclusive.
The initial post-run bundle attempt exceeded JavaScript's single-string limit;
all 40 successful per-seed files were intact. Streaming their JSON into gzip
resolved packaging without rerunning or changing simulations. Summary generation
reads one seed at a time rather than materializing a whole cohort string.

Example reproduction from `simplefront/`:

```sh
rtk proxy node --import tsx scripts/painted-balance.ts --organic --seed simplefront-pace-01 --ticks 12000 --out docs/balance-runs/NEW-organic-seed-01.json.gz
rtk proxy node --import tsx scripts/painted-balance.ts --organic --seed simplefront-pace-01 --compare-policies --rotation 0 --out docs/balance-runs/NEW-organic-policy-0-seed-01.json.gz
```

Repeat retained seeds `simplefront-pace-01` through `simplefront-pace-10` and
rotations 0/1/2. Use per-seed files for large runs; the CLI's all-seed final
serialization shares the single-string-size limit observed above. Temporary
controller orchestration/streaming/summary scripts are retained in the probe
directory. Eight processes ran concurrently, so matrix timings are contended.

The integration is ready for the user to playtest through the preview URL.
**The 10–15-minute target, human opening/midgame/recovery/endgame approval and
normal-default rollout remain open.** Ordinary SimpleFront still uses painted
defaults; OpenFront live and the demos remain independent. No deployment or
commit was performed.

The small summary is not ignored and can be versioned with this report; raw gzip
traces remain local artifacts. All four streamed bundles passed integrity checks.
The final browser smoke check also passed all seven preview/isolation cases after
the recovery correction, with zero page errors.
