# Tasks: restore-organic-growth

Staged so the suite stays green per stage: knob swaps + planes first, then
the three growth systems, then combat shape, then bots/UI/balance.

## 1. Knobs + planes

- [x] 1.1 FoodConfig swap: `farmCost`/`settlementCost`/`housingPerSettlement` → `seedLadderBase`/`seedLadderGrowth`/`fieldGrowthRate` (defaults 4000 / 2 / 0.02); TuningPanel groups; tests updated
- [x] 1.2 `SuitabilityMap` bake beside fertility (`game.suitability(tile)`, D4 formula); tests: low-ground beats high, water 0, determinism; hover rows (HUD + #shell) and overlay wiring

## 2. Seed ladder (seed-ladder spec)

- [x] 2.1 Peak-population ratchet + paired awards at geometric rungs; seed banks on PlayerImpl; `cost() = 0` + seed gates in `canBuild`/`buildUnit` (resurrect the deleted gate from git); spawn kit = pair zero; tests: rung crossings, no re-award, gate
- [x] 2.2 UI: seed counts + "next pair at N" readout in the game build bar and #shell build bar

## 3. Farm fields grow (farm-growth spec)

- [x] 3.1 Worked-field state per Farmland (grow pulse: best-fertility frontier, owned/passable/unclaimed/within radius, deterministic ties); production over worked tiles; conquest eviction + regrowth; tests: ramp, shape-follows-fertility, conquest cut, full-field equals old output
- [x] 3.2 Restore the field render channel (packedFieldUpdates writer/reader from git) + tilled-soil paint of worked tiles (game client and #shell conduit)

## 4. City growth = housing (city-growth spec)

- [x] 4.1 Rewrite UrbanGrowth: demand-gated growth (≥90% housing) / recession (<50%) over suitability from nuclei; first-claim-holds vs fields both ways; `maxTroops = housingBase + cityTiles × popPerDensity`; delete painter-era foodTargetTiles; tests: demand gating, hysteresis, organic shape, housing follows footprint, field/city exclusion
- [x] 4.2 Update FoodEconomy housing readout paths + HUD (population bar vs housing), remove per-settlement housing everywhere

## 5. Combat shape (combat-terrain spec)

- [x] 5.1 AttackExecution priority → `1 + 2·magN + wetnessN`; attackLogic slope input → `magN + climb`; tests: valley-before-ridge ordering, absolute-altitude cost, zero-knob degradation updated

## 6. Bots + reconciliation

- [x] 6.1 TribalEconomy: place banked seeds by binding ceiling (settlement → best suitability, farm → best full-field score); tests updated
- [x] 6.2 Orphan sweep: en.json (cost strings → seed strings), TranslationSystem green, full suite green (known-failing baseline excepted), lint/format
- [x] 6.3 Balance harness A/B vs simplify baseline (alive, leader share, gini, time-to-pair-2, housing dynamics); tune `fieldGrowthRate`/ladder defaults; record in balance-notes.md
- [x] 6.4 In-browser playtest (#shell): field visibly spreading, city growing on suitability, ladder readout, non-circular fronts across a ridge/wet belt; screenshots + notes
