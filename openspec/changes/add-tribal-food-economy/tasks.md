# Tasks: add-tribal-food-economy

## 1. Config + state foundations

- [x] 1.1 Add `Config.food` block (all knobs: idle/move/fight consumption milli-rates, decay numer/denom, base pop cap, pop per Settlement, base storage, storage per Barn, farmland fertility mult, natural fertility production rate, starvation deaths per milli-deficit, surplus buffer ticks, building food costs)
- [x] 1.2 `PlayerImpl`: food stock (bigint milliunits), `fertilitySum`, cached Tribal building counts; expose `food()`, caps, production/consumption breakdown for the view
- [x] 1.3 Incremental `fertilitySum` maintenance on tile conquer/relinquish (mirror `numTilesOwned` accounting); tests for capture-transfers-production

## 2. The food tick

- [x] 2.1 Implement the fixed-order food pass in `PlayerExecution.tick`, gated on `game.hasLayers()`: production → activity-scaled consumption → storage overflow + decay → surplus-throttled growth / starvation
- [x] 2.2 Activity counters: moving troops (outgoing attacks not in contact + boats) and fighting troops (attacks exchanging tiles) exposed from existing attack state
- [x] 2.3 Replace max-troops with the Settlement cap on layered maps (`Config` branch with explicit `hasLayers` parameter; test both branches)
- [x] 2.4 Deterministic unit tests per spec scenario: abundance growth, cap binding, storage buffering, starvation, decay, overflow loss, war consumption premium, cross-client determinism (two sims, same seed)

## 3. Tribal buildings

- [x] 3.1 `UnitType.Settlement/Farmland/Barn` + unit info entries with `costResource: "food"`; `ConstructionExecution` cases; affordability check against food stock
- [x] 3.2 Wire effects: Settlement→cap, Barn→storage, Farmland→production (own tile crop byte × mult); capture/destroy updates counts and effects
- [ ] 3.3 BuildMenu entries + icons gated on `hasLayers()`; hidden on classic maps; en.json keys
- [x] 3.4 Tests: build/deduct/reject-unaffordable, capture transfers effects, hidden on unlayered maps

## 4. Bots

- [x] 4.1 `NationStructureBehavior` Tribal branch: Settlement when near cap, Farmland on highest-crop unfarmed owned tile, Barn when overflow lost exceeds threshold — gated on `hasLayers()`
- [x] 4.2 Test: seeded bot game on a layered fixture map — bots build all three types and avoid extinction-by-starvation at default knobs

## 5. Client readout

- [ ] 5.1 Player update plumbing: food stock/cap, production, consumption to `PlayerView`
- [ ] 5.2 ControlPanel food readout (stock/cap + net flow, starvation warning state) shown only on layered maps

## 6. Balance harness + tuning

- [ ] 6.1 `tests/perf/balance/BalanceRun.ts` (FullGamePerf pattern): N seeds × config overrides → JSON time series (territory share, Gini, pop, food, starvation, eliminations, winner)
- [ ] 6.2 Metrics module + summary table output; reproducibility test (same seed → identical metrics)
- [ ] 6.3 Author a layered fixture map for tests/harness (small seeded world via the world engine, baked into `tests/testdata/maps/`)
- [ ] 6.4 Initial sweep of the four highest-leverage knobs (starvation rate, decay, farmland mult, pop/Settlement); record chosen defaults + leader-share acceptance thresholds in the harness config and `Config.food` comments
- [ ] 6.5 Re-export + re-bake pangea001/pangea002/majormenor with layers.bin via the generator page

## 7. Verification

- [ ] 7.1 tsc/lint/vitest at baseline; classic-map game byte-identical (existing sim tests untouched)
- [ ] 7.2 run-openfront end-to-end on a layered map: build all three structures, watch food flow, force a starvation event, confirm bots' economies function
- [ ] 7.3 Update CLAUDE.md boundaries section: rules now change via OpenSpec changes; document `Config.food` and the layered-map gate
