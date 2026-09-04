# Proposal: restore-organic-growth

## Why

Playtesting simplify-food-economy surfaced three regressions against the old model's feel: structures are spammed (fixed farm circles + per-settlement housing coupons force dozens of purchases), footprints appear instantly instead of growing, and expansion fronts are circular (the conquest priority still reads the vanilla 3-band terrain classes, and 93% of generated-map land falls in ONE band; adjacent magnitude deltas are 0–1 step, so the climb term is dead). This change restores the organism — awarded founding pairs, growing fields, growing cities, terrain-shaped fronts — on top of the simple model's accounting (one pool, one logistic, baked planes, vanilla combat), with **zero net change to the knob count** and none of the deleted illegible systems (no labor, no sheds, no supply attrition, no tile damage).

## What Changes

- **BREAKING — seeds replace purchases (the ladder returns, simplified).** Settlement and Farmland cost nothing and are placeable only with a banked seed. A geometric peak-population ladder banks one **founding pair** (settlement seed + farm seed) at `seedLadderBase × seedLadderGrowth^(n−1)` — "every next town costs twice the people." The spawn kit is pair zero. A visible readout shows the next rung. Knob swap: `farmCost`/`settlementCost` → `seedLadderBase`/`seedLadderGrowth`.
- **BREAKING — farms grow their field.** A Farmland starts at its tile and adds one worked tile at a time (paced by `fieldGrowthRate`, best-fertility frontier first, owned land only, within `farmRadius` — now a maximum, not an instant stamp). Production = fertility of the tiles currently worked, so growth IS the ramp; the tilled-soil paint spreading IS the state. Placement preview unchanged.
- **BREAKING — cities grow housing over a baked suitability plane; the painter is deleted as a concept.** A per-tile **suitability** plane (baked once at load, like fertility: fertility + water/shore access + low elevation) drives real city growth: when population presses the housing ceiling, each city adds tiles best-suitability-first from its nuclei (Core + Settlements), paced by `urbanGrowthRate`; it recedes when population falls. Housing = `housingBase + cityArea × popPerDensity` — the city you see is the troop cap you have. Knob swap: `housingPerSettlement` (dead) → `fieldGrowthRate`.
- **Expansion variance (zero knobs).** The conquest priority reads continuous terrain (`magN`, wetness) instead of the 3 bands — fronts flow through lowlands and dry corridors. The combat slope input becomes `magN + climb` (absolute altitude + uphill delta), reviving `kSlope` on smooth generated maps.
- Bots place seeds by the binding-ceiling rule (unchanged logic; "affordable" becomes "banked").

## Capabilities

### New Capabilities

- `seed-ladder`: the geometric founding-pair ladder — ratchet, paired awards, spawn kit as pair zero, the next-rung readout.
- `city-growth`: the baked suitability plane and demand-gated organic city growth that IS housing.

### Modified Capabilities

- `farm-growth`: the worked field grows from the nucleus instead of appearing instantly; production follows the grown field.
- `tribal-buildings`: seed-gated placement replaces food purchase; housing moves to city-growth; razing/capture unchanged.
- `food-economy`: `maxTroops = housingBase + cityArea × popPerDensity`; food becomes purely the famine buffer (no build currency).
- `economy-planner`: bots place whichever banked seed unbinds the binding ceiling.
- `combat-terrain`: continuous conquest priority; slope input includes absolute magnitude.

## Impact

- **Core**: `FoodConfig` knob swap (23 → 23); `SeedLadder` util (new, small); `FarmField` growth state per Farmland; `SuitabilityMap` bake beside `FertilityMap`; `UrbanGrowth` rewritten demand-gated; `Config.maxTroops`/`attackLogic`/`AttackExecution` priority; `PlayerImpl` seed banks + `canBuild` gates (resurrected from git); worked-field render channel restored (the old field byte channel).
- **Client**: build bar shows seed counts + next-rung readout; suitability joins fertility in hover rows/overlay; #shell conduits for the worked-field plane.
- **Tests**: seed-ladder, field-growth, city-growth suites; farm/economy/planner tests updated; balance re-sweep (housing dynamics change materially).
- No map/sidecar changes; the sim still reads only map.bin + layers.bin.
