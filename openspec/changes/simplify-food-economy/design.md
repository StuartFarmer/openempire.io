# Design: simplify-food-economy

## Context

The rework-settlement-ecology stack (11 systems, 64 knobs) produced emergent behavior nobody — player or bot — could predict. Explore-mode walkthrough (2026-07-20) concluded per mechanic: keep the fork's identity (terrain drives the economy, food gates growth, troops are population), delete every system the player cannot perceive, and return combat to vanilla per-tile attrition upgraded with continuous terrain. The sim already has everything needed: layer bytes (`crop`, `humidity`, `water`, `temperature`) and packed magnitude (0–31 elevation quantization). No sidecar or format changes; the sim still never reads `elevation.bin`/`hydro.bin`.

## Goals / Non-Goals

**Goals:**

- Every surviving mechanic answers exactly one player-visible question; all state it reads is renderable (fertility overlay, farm footprints, elevation shading, biome color, granary/population numbers).
- ~15 tunable knobs, all live-editable through the existing `tune_food_config` intent and panels.
- Deterministic, integer-friendly sim math, same discipline as today.
- Bots remain viable with drastically simpler planning.

**Non-Goals:**

- No new age mechanics, no troops/population split (stays merged), no local famine or logistics revival — complexity returns later as separate, opt-in changes.
- No changes to map formats, the baker, or the generator.
- No redesign of vanilla combat's defender-density / defense-post / size-debuff math — only its terrain input changes.

## Decisions

### D1 — Fertility: equal-weight blend, calibrated to 0.5 at mid-range inputs

`fertility(tile) = (cropN + moistureN + tempFit) / 3`, where `moistureN = (humidityN + waterN) / 2` and `tempFit = max(0, 1 − |tempN − tempOptN| / tempWidthN)` (triangular band). Defaults `tempOptN = 0.65`, `tempWidthN = 0.3` make `tempFit(0.5) = 0.5`, so all-mid-range inputs yield exactly 0.5 — the calibration the proposal requires. Water/impassable tiles are fertility 0.

- Baked **once at map load** into a per-tile `Uint8Array` (0–255) owned by the core sim (new small `FertilityMap` util on the game), so runtime reads are a plain lookup and the client overlay renders the identical plane.
- _Alternative rejected_: Liebig min of factor staves — it's the current model's illegibility (which stave killed you?) and reintroduces the compounding lottery. A mean degrades gracefully and is mentally computable.
- `fertilityBonus` multiplies at the point of production (D2), not in the baked plane, so tuning it live doesn't require a re-bake.

### D2 — Farms: Chebyshev-square footprint, spacing rule instead of overlap resolution

A Farmland works the Chebyshev square of radius `farmRadius` (default 3 → 7×7 = 49 tiles) around its nucleus. Per tick:

`productionMilli = farmOutputMilli × (Σ fertilityN over OWNED land tiles in footprint / footprintArea) × fertilityBonus`

- Unowned, water, and impassable tiles contribute 0 but still divide by the full area — a coastal or border farm visibly underperforms, and conquest inside someone's footprint directly cuts their output (a legible war lever).
- **Placement rule**: a new Farmland may not be placed within Chebyshev `2·farmRadius` of an own existing Farmland — overlap is prevented at placement instead of resolved at runtime (no Voronoi, no dedupe). The hover preview shows the footprint outline, per-tile fertility tint, and red when spacing/ownership invalidates the site.
- _Alternative rejected_: nearest-farm tile assignment (runtime Voronoi) — quietly reintroduces shed machinery.
- No maturation. Optional cosmetic ramp of the tilled-soil paint only; production is full-rate from completion.

### D3 — One pool, buffer-then-famine, food as build currency

Per player per tick, in order: (1) add Σ farm production to the pool; (2) subtract `population × idleConsumptionMilli`; (3) a shortfall drains the pool to 0 before anyone starves; (4) cap the pool at `granaryBase + granaryPerFarm × farms`, overflow discarded. Structure purchases (`costResource: food`, the existing dormant mechanism) draw the same pool. Deployed troops eat nothing extra — war costs people (vanilla per-tile losses), expansion costs food (structures). Two currencies, no overlap.

### D4 — Population: one logistic, asymmetric rates

`target = min(foodCapacity, housing)` where `foodCapacity = productionMilli / idleConsumptionMilli` and `housing = housingBase + housingPerSettlement × settlements`.

- Below target: `Δ = popGrowthRate × pop × (1 − pop/target)` (logistic up).
- Above target **and the granary is empty**: `Δ = −popDeclineRate × (pop − target)` (linear down, `popDeclineRate > popGrowthRate` — famine bites faster than recovery). While the granary holds food, no decline: the war chest is the famine buffer.
- One integer milli-pop credit accumulator per player replaces the four credit channels (birth/death/starve/warStarve). `maxTroops = housing`. Vanilla gold-driven troop regen stays disabled. Exact-zero death rule unchanged; the `minViablePopulation` husk rule is dropped (no birth/death equilibrium exists to sustain a husk under a pure logistic).

### D5 — Combat terrain: continuous slope + wetness inside vanilla attackLogic

Replace the `terrainType` switch (80/100/120, 16.5/20/25) with:

- `climb = max(0, magN(target) − avg(magN of attacker-owned 4-neighbors of target))`, `magN = magnitude/31` — uphill only; downhill is base rate. Uses only packed map.bin bits; deterministic, local, no pathfinding.
- `wetness = (humidityN + waterN) / 2` from the layers the sim already reads.
- `mag = baseCombatMag × (1 + kSlope × climb) × (1 + kWet × wetness)`; `speed = baseCombatSpeed / ((1 + kSlope × climb) × (1 + kWet × wetness))`.
- Defaults `baseCombatMag = 90`, `baseCombatSpeed = 18`, `kSlope = 1`, `kWet = 0.5` roughly reproduce the vanilla range (flat dry ≈ plains, a wet cliff ≈ worse than vanilla mountain). `kSlope = kWet = 0` degrades to flat vanilla — the tuning baseline.
- Everything else in `attackLogic` (defender density, posts, size debuffs, neutral `mag/5` toll, fallout) is untouched. Defenders get no separate terrain bonus — the climb term already encodes high-ground asymmetry; one mechanism, one knob.

### D6 — City painting is presentation with sim-side state, zero feedback

Keep the minimal sim-side footprint painter (contiguity + a fertility/water prettiness score) driving the existing `packedDensityUpdates` channel, sized `population / popPerDensity` tiles around Settlements — because the render pipeline already consumes that channel and replays must reproduce the visuals. The hard rule, enforced by the spec: **nothing in the sim reads the density plane** (no suitability, no housing, no combat effect). The player never paints.

### D7 — Config: one tunable object, combat knobs included

The new ~15-knob set replaces `FoodConfig`'s 64 wholesale but keeps the `FoodConfig` name, the `FOOD_TUNABLE_KEYS` allowlist derivation, and the `tune_food_config` intent — so the HUD tuning panel and the #shell climate-panel section keep working with zero plumbing changes. Combat-terrain knobs (`baseCombatMag`, `baseCombatSpeed`, `kSlope`, `kWet`) live in the same object for the same reason. Knob table:

| Knob                                                    | Default           | Question it answers               |
| ------------------------------------------------------- | ----------------- | --------------------------------- |
| `fertilityTempOptN` / `fertilityTempWidthN`             | 0.65 / 0.3        | what temperature is good farmland |
| `fertilityBonus`                                        | 1                 | how much terrain quality matters  |
| `farmRadius`                                            | 3                 | how big a farm is                 |
| `farmOutputMilli`                                       | tuned             | what a perfect farm yields        |
| `farmCost` / `settlementCost`                           | tuned             | what expansion costs              |
| `granaryBase` / `granaryPerFarm`                        | tuned             | how big the war chest is          |
| `idleConsumptionMilli`                                  | 10                | how much people eat               |
| `popGrowthRate` / `popDeclineRate`                      | tuned             | how fast nations grow / starve    |
| `housingBase` / `housingPerSettlement`                  | tuned             | when a settlement is needed       |
| `popPerDensity`                                         | 10000             | city footprint scale (visual)     |
| `startPopulation` / `startingFood`                      | tuned             | the opening                       |
| `baseCombatMag` / `baseCombatSpeed` / `kSlope` / `kWet` | 90 / 18 / 1 / 0.5 | what a tile costs to take         |

### D8 — Bots: two rules

TribalEconomy reduces to: (1) if affordable and a valid site exists, buy a Farmland on the best-average-fertility legal footprint among sampled candidates; (2) if population is housing-bound and a Settlement is affordable, buy one near the population center. `AiAttackBehavior` keeps vanilla-era reserve/trigger logic minus the deleted food couplings (`fieldStaffingNeed`, war-share demography). The §7/§9 planner calculus (population-ticks, labor relief, pair siting) is deleted with the systems it predicted.

## Risks / Trade-offs

- [Big-bang deletion breaks many compile sites at once] → staged tasks: introduce new model behind the old interfaces first (fertility, pool, logistic), then delete subsystems one per task with their tests, keeping the suite green per task.
- [Balance resets to zero — all sweep history invalidates] → the 15-knob surface is exactly what the balance harness and live tuning panel were built for; a fresh sweep is cheap and the `kSlope=kWet=0` / `fertilityBonus=1` baselines are known quantities.
- [Bots may snowball or stall under the logistic] → harness A/B at defaults during implementation (alive count, leader share vs current model); `popDeclineRate` and structure costs are the levers.
- [Losing the ecology aesthetic (organic fields, local famine)] → accepted; the lab systems in #shell remain the home for ecology experiments, and this change deliberately keeps the city/tilled-soil _visuals_.
- [Spacing rule may frustrate on cramped maps] → radius and spacing derive from one knob; preview makes the constraint visible before the click.

## Migration Plan

Single change, no data migration (no format changes). Old savegames/replays are not a supported surface in this fork. Tuning-panel groups regenerate from the new key list automatically ("other" catch-all guarantees no orphan knobs).

## Open Questions

- Exact tuned defaults for the "tuned" knobs above — set during implementation against the balance harness, recorded in balance-notes.md.
- Whether `rework-settlement-ecology` should be archived as-is (superseded mid-flight) or its completed tasks annotated — decide at archive time.
