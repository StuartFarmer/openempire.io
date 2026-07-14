# Tasks: rework-settlement-ecology

Build-order, not phases. Each core task ships with tests. Everything gated on
`game.hasLayers()`.

## 1. Tile damage (foundation — smallest, everything gates on it)

- [ ] 1.1 Per-tile damage field (map-wide int array) + apply-on-combat hooks in AttackExecution; heal-per-tick on the supply cadence; deterministic
- [ ] 1.2 Gates: urban CA skips damaged tiles; Farmland placement refused; farm maturation halted while damaged
- [ ] 1.3 Render: brown tint pass, alpha ∝ damage (single standard brown)
- [ ] 1.4 Tests: contested corridor accumulates, heals linearly, gates hold, determinism

## 2. Tile stability (tenure)

- [ ] 2.1 Per-tile tenure field + demand gate (city tile at cap / farm at settled maturity) + damage-=-0 prerequisite; cadence update
- [ ] 2.2 Disruption taxonomy: hard reset on ownership flip + razed plot; slow decay on depopulation; pause during combat
- [ ] 2.3 Consumers: city density cap = capCurve(tenure); Settlement nucleus pacing from nucleus-tile tenure; saturating curves + Config.food() knobs
- [ ] 2.4 Render: city-tile intensity scales with tenure (heartland readable)
- [ ] 2.5 Tests: demand gate, taxonomy asymmetry, plateau, cap consumer, determinism

## 3. Seed awards

- [ ] 3.0 Scaling-law discovery: BalanceRun logs per-nation `(tick, area, border, pop, troops)`; log-log fit of `A ∝ P^k` per map + aggregate; report → balance-notes; adopt fitted `k` as Config `scalingExponent` (default 2 until measured)
- [ ] 3.1 Peak-territory / peak-population ratchets on PlayerImpl; award ledgers; settlement ladder = `basePop · n^scalingExponent`
- [ ] 3.2 Placement path consumes seeds, zero food cost; damage gate; spawn kit expressed through the seed system
- [ ] 3.3 BuildBar: seed counters replace prices; disabled at zero; award ping/toast
- [ ] 3.4 Tests: ratchet no-refarm, ladder math, spend/refuse, spawn kit

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
