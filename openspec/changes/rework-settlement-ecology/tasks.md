# Tasks: rework-settlement-ecology

Build-order, not phases. Each core task ships with tests. Everything gated on
`game.hasLayers()`.

## 1. Tile damage (foundation — smallest, everything gates on it)

- [x] 1.1 Per-tile damage field (sparse Map on GameImpl, milli 0..1000, deterministic insertion-order heal each tick in executeNextTick); applied in AttackExecution only for tiles taken FROM A PLAYER (wilderness expansion leaves no scar); knobs `combatTileDamageMilli`/`tileDamageHealMilli`
- [x] 1.2 Gates: urban CA skips damaged tiles (addCityTiles eligibility); plotSpawn refuses all plots on damaged ground; farmTick freezes a damaged farm (no ripening, no senescence)
- [x] 1.3 Render: brown wash, alpha ∝ damage — packedDamageUpdates channel (GameImpl→GameRunner→GameView→WebGLFrameBuilder), second DensityPass instance with `damageOverlay` settings; verified in-browser (verify-tile-damage.mjs: buffer bytes + heal rate + visible brown scar at a bot war front)
- [x] 1.4 Tests (tests/TileDamage.test.ts): combat scars / wilderness doesn't, cap + linear heal to zero, plot refusal until healed, farm freeze/resume, city grows around the scar

## 2. Tile stability (tenure)

- [x] 2.1 Tenure ledger on GameImpl (sparse milli-tick Map, owner-agnostic); accrual in `TileTenure.tenureTick` (called from urbanTick): city tiles age only while population ≥ tenureSaturationRatio × housing (demand gate — note: gate is city-wide, per-tile occupancy isn't modeled yet), farms only once settled at climate suitability; damage = 0 prerequisite
- [x] 2.2 Taxonomy: conquer/relinquish hard-reset; vacancy decays tenureDecayMilli/tick on the supply cadence (no density + no Farmland); damage pauses both accrual AND decay
- [x] 2.3 Consumers: housing bonus Σ(capMult−1)·popPerDensity → maxTroops + foodTargetTiles (aged cities densify instead of sprawling); nucleus pace boost 1+wNucleusTenure·g(core tenure) in growUrbanArea. Farm-storage consumer lands with task 4. Knobs: tenureCapMultMax/tenureHalfTicks/tenureSaturationRatio/tenureDecayMilli/wNucleusTenure
- [x] 2.4 Render: the density byte is now fill × (0.55 + 0.45·g(tenure)) — young suburbs dim, old cores bright — via the existing DensityPass channel (urbanRenderByte, single source in TileTenure; emitted on byte change as tiles age)
- [x] 2.5 Tests (tests/TileTenure.test.ts, 8): demand gate on/off, damage pause, farm settle gate, conquest reset, vacancy-decay-vs-occupied, curve plateau, capacity/footprint consumer, nucleus boost

## 3. Seed awards

- [x] 3.0 Scaling-law discovery: BalanceRun logs per-nation `(tick, area, border, pop, troops)` + `fitScaling` log-log OLS. **Measured k = 1.263 (verdantia, R² 0.941, n 5830) / 1.272 (pangea001)** — adopted `scalingExponent: 1.26`
- [x] 3.1 `SeedAwards.seedAwardTick` (from urbanTick, every player): peak-territory → farm seeds (1 per farmSeedTilesPerSeed=25 tiles), peak-population → settlements at `settlementLadderBasePop(10k) · n^1.26`; ratchets never re-award
- [x] 3.2 Settlement/Farmland cost 0n; canBuild gates on banked seeds (bots included — they route through canBuild); buildUnit spends (floored, so the pre-placed spawn kit never underflows — kit stays pre-placed per spec); seeds synced to client via PlayerUpdate
- [x] 3.3 BuildBar: seed counters replace food prices for Settlement/Farmland (lime when banked, red at zero; Barn keeps its food price); award toast deferred to polish
- [x] 3.4 Tests (tests/SeedAwards.test.ts): territory ratchet no-refarm, n^k ladder + famine no-revoke, spend/refuse/free placement, settlement gate. Harness sanity: 16/26 nations alive at t2000 under the seed regime

## 4. Local food + labor (biggest sim rewire)

- [ ] 4.1 Labor factor: localPop within food-shed / farmersPerFarm soft multiplier on farm yield
- [ ] 4.2 Local distribution: food-shed becomes the feeding channel — per-neighborhood fed-ratio; births/deaths applied through the neighborhood's density field
- [ ] 4.3 Local storage: per-farm capacity = storageCurve(tenure); Barn removed (unit, BuildBar, bots, en.json); global-stock plumbing replaced; spoilage on local stocks
- [ ] 4.4 Time-constant guard: starvation faster than senescence + tenure decay (spec'd invariant, tested)
- [ ] 4.5 Tests: unpeopled breadbasket, regional famine stays regional, old-district reserves, famine-recovery floor

## 5. Bots + reconciliation

- [ ] 5.1 TribalEconomy places awarded seeds (best food-shed/climate spots) instead of food-budgeting; no Barn planning
- [ ] 5.2 Reconcile with add-greedy-economy-planner (its purchase-planning half is obsoleted — trim or fold in)

## 6. Balance

- [ ] 6.1 Harness sweep: award ladders, tenure/damage/heal time constants, farmersPerFarm; verify blitz-snowball softens (conquest = tenure-zero land) and turtling doesn't ossify (plateau works); findings into balance-notes
