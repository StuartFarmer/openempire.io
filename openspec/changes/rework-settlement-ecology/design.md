# Design: rework-settlement-ecology

The living document for the ecology model. Modify freely — specs follow this.

## The model in one picture

```
 PEAK POPULATION ──award──▶ FOUNDING PAIR ──place──▶ two nuclei, two automata
      ▲              (1 settlement seed + 1 farm seed,
      │               one ladder: basePop · n^k)
      │                                   ┌───────────────┴───────────────┐
      │                                   ▼                               ▼
      │                            CITY spreads (exists)          FIELD spreads (§1b)
      │                            bounded by FOOD                rate ∝ tile suitability
      │                            density caps rise w/ tenure    tilled only with LABOR
      │                                   │                               │
      │                                   ▼                               ▼
      │                            houses people                  tilled tiles produce
      │                                   │                       local food + storage
      │                                   ▼                       (tenure grows, §2)
      └──── births/deaths ◀── neighborhoods feed people ◀─────────────────┘
                      the ecology loop (and the death spiral)

 CONQUER LAND: tiles arrive tenure-ZERO, possibly DAMAGED — conquest buys
 ROOM for both automata to spread into, never awards.
```

Three player decisions remain: **where to attack**, **where to plant awarded
seeds**, **what to protect**. Everything else runs itself.

## 1. Seed awards

**One ladder, paired awards.** The nth crossing of the peak-population ladder
`basePop · n^k` banks a **founding pair**: one settlement seed AND one farm
seed. A new town needs a field in food-shed reach and a lone field feeds
nobody — the pair is the unit of founding. (Revised 2026-07-15: the original
peak-territory farm-seed ratchet is DELETED — under field growth (§1b) one
farm seed yields a whole growing district, so per-25-tiles awards were an
order of magnitude too generous, and territory's reward is now the room it
gives the automata to spread into.)

- **Ratchet, not current value**: awards trigger when the population
  high-water mark crosses a threshold. Losing people never revokes a seed
  ("fixed" settlements), and oscillating can't farm awards.
- **Power-law ladder, tapered past constant effort** (revised 2026-07-15):
  the nth pair triggers at `basePop · n^(k · ladderTaper)` with `k` the
  measured area↔perimeter exponent and `ladderTaper > 1`. At taper 1 each
  founding costs a constant increment of frontier effort; the adopted taper
  (2) makes awards THIN OUT with size — a big nation founds little, because
  mid-game conquest captures enemy settlements and farms and supplies the
  plots instead. `basePop`, `k`, and the taper are Config.food() knobs; `k`
  is discovered, not hand-picked.
- Seeds are **banked tokens** placed via the BuildBar (agency retained);
  placement costs nothing. Food's only job is feeding people. Farm and
  settlement seeds bank separately — the pair is awarded together but the
  player chooses where (and when) each is planted.
- **Spawn kit = the same pair**: Core (the first "settlement") plus one farm
  nucleus — pre-placed per current spawn behavior. No purchase path anywhere.
- **Barns**: gone. Storage is an emergent property of stable farmland (§2).

## 1b. Field growth — the farm CA

A planted Farmland is a **nucleus, not a plot** — the field grows itself,
exactly as a Settlement's city does. Two coupled automata over the same land:
the city bounded by food, the field gated by labor, and the loop between them
(§4) is the whole economy.

One per-tile scalar drives everything: **establishment/maturity `E`**
(the existing `farmMaturity` plane). States are bands of `E` plus one bit
(labor-covered), never a separate enum:

```
                1x1 plot pops                      labor covers tile?
  WILD ────────────────────────────▶ CLAIMED ────────────┬────────────┐
 (open to     paced by the field's   (tilled-soil     yes│            │no
  either CA)  output; labor-gated;    plot — city CA     ▼            ▼
              tile weighted by        skips it)       TILLED        FALLOW
              suitability × water)                 produces food  senesces (E ↓)
                                                   tenure runs        │
                                                         ▲            │ E < claim
                                                         └── labor ◀──┘ (dies to 0)
                                                            returns      ▼
                                                                     WILD again
                                                                 (either CA may claim)
```

- **Growth is discrete: 1×1 tilled plots, one at a time** (revised
  2026-07-15 — playtest: continuous per-tile diffusion read as a circle
  flooding out of the seed, far too fast and too big; ALL structures are
  single-tile — the "2×2" tilled look is the plot sprite's sub-tile
  pattern, drawn by the plot pass). Each nucleus accrues growth credit
  from its field's TILLED output; at the plot cost it places ONE plot on a
  weighted-random frontier tile (seeded PRNG), weight = suitability ×
  water access (humidity, groundwater, river/shore) — plots FAVOR the
  river without racing along it — and must be claim-viable (suitability ≥
  claim threshold), so desert never gets a plot. Placement is LABOR-GATED:
  only when the field's residents have spare hands for one more tile
  (farmersPerFieldTile). Pace knobs: fieldPatchCostMilli (credit per plot)
  with the per-tick credit capped (fieldPatchDriveCapMilli) so big fields
  don't machine-gun plots. Render: claimed tiles are painted into the plot
  buffer as Farmland ground (GameView → PlotCache → PlotPass), so fields
  share the exact tilled-soil sprite of their nucleus.
- **Labor is a coverage gate.** The field's shed-cell labor pool (the existing
  nearest-farm Voronoi, §4) covers claimed tiles at `farmersPerFieldTile`
  each, ranked by maturity-then-suitability. Covered tiles are TILLED
  (produce, age tenure); uncovered tiles lie FALLOW and senesce. When the pool
  shrinks, the frontier and marginal tiles lose their farmers first — the
  field contracts to its fertile old core with no special-case code. This
  REPLACES the §4 labor yield-multiplier (no double-counting).
  Two anti-flap rules (found by test): a fallow tile senescing below the
  claim threshold DIES OUTRIGHT (establishment cleared — otherwise the
  tilled core re-drives it the same tick and it hovers at the boundary),
  and spread never re-drives ground the current refresh already ranked.
  Freshly claimed tiles between refreshes get GRACE (ripen, judged next
  refresh) so cadence staleness never flaps the frontier.
- **First claim holds while alive.** Field tiles are invisible to the city CA
  (skip already exists) and city tiles to field spread — symmetric, whichever
  was there first stays. Land moves between the automata only through death:
  a fallow tile senescing below the claim threshold reverts to WILD, then
  either may take it. Where you plant shapes your city's growth corridors.
  Two guards keep the automata from strangling each other at spawn (found
  in-game): the CORE tile never recedes while the population lives (a famine
  dip must not hand the capital's ground to the field CA and lock the city
  out), and the spawn kit farm plants at DISTANCE 3 from the core, on the
  best climate-suitability candidate — the field belongs near the village,
  not in it, and a kit farm on hostile ground would senesce below claim and
  never seed a field (maturity settles AT suitability).
- **Spread respects the usual gates**: owned land only (borders bound
  fields, same as the city CA), damage must be 0, impassable never.
- **Mutual aid is the credit stream.** Growth credit is the field's summed
  tilled maturity — a riper, larger field readies its next plot sooner, so
  healthy districts compound while a struggling nucleus crawls; two fields
  growing into each other simply merge (shed Voronoi already attributes
  tiles to nearest nucleus). The old per-plot `adjacencyBonus` district
  multiplier stays DELETED.
- **Yield is per-tile**: Σ over TILLED tiles of `maturity · f_soil ·
yieldPerTile`. No district bonus, no labor multiplier.
- **Perf/render note**: the update rule is a neighborhood convolution over two
  byte planes (maturity × suitability) — shader-friendly later if needed. Sim
  stays CPU/deterministic. Render: green wash ∝ maturity through the existing
  DensityPass-style channel (the damage brown wash's twin).

## 2. Tile stability (tenure)

One clock, many consumers. A single map-wide per-tile tenure counter
(owner-agnostic — stability is the tile's continuous life, not the holder's).

**Demand-gated**: the clock only runs while the tile is _pushed against its
current limit_:

- City tile: runs while the tile is fully populated at its current density cap.
  A half-empty tile doesn't need more density, so it doesn't age.
- Farm tile: runs while TILLED (labor-covered, §1b) and maturity has settled
  at the tile's climate suitability (the farm is doing all this ground
  allows). Fallow tiles neither age nor decay tenure faster than vacancy.

**Consumers** (all saturating curves — a plateau, so old empires don't become
unassailable; reuse the Gompertz shape from FarmGrowth):

- **City density cap**: `popPerDensity · capCurve(tenure)` — young suburb holds
  fewer people per tile than a century-old core.
- **Farm storage capacity**: local milli-food capacity per FIELD TILE =
  `storageCurve(tenure)` — a field's granary emerges from its old core tiles,
  exactly as city density does. Replaces Barns.
- **Settlement nucleus strength**: growth pacing and/or supply radius scale with
  the nucleus tile's tenure. The nucleus is logically the oldest tile in the
  metro — founding early matters, capitals have gravity.

**Disruption taxonomy** (the key tuning surface — asymmetric on purpose,
because stability stacks a third positive-feedback loop onto the death spiral):

| Disruption                       | Response to tenure    | Rationale                                   |
| -------------------------------- | --------------------- | ------------------------------------------- |
| Ownership flip (conquest)        | Hard reset to 0       | War scars land; conquest = investment       |
| Depopulation (famine, recession) | Slow decay, NOT reset | Famine must be recoverable, not a crater    |
| Combat over the tile             | Clock paused + damage | Battlefield stalls growth, doesn't erase it |
| Plot razed (war-razing change)   | Reset                 | Composes with add-war-razing-and-spoilage   |

A tile must be **fully healed** (damage = 0, §3) before its clock can run.

## 3. Tile damage

- Fighting over a tile (tile inside an active attack's advance; exact trigger:
  each tile conquered in combat, plus tiles the front passes through) adds
  damage `0..1`.
- Damage **heals linearly over time** (knob: healPerTick). Heavily contested
  corridors stay battle-worn for a long while.
- While damage > 0 the tile: cannot receive urban growth, cannot have a farm
  planted, an existing farm's maturity is frozen (or senesces — open question),
  and tenure is paused. **Full heal before stability.**
- **Render**: a single standard brown, alpha-scaled by current damage. Later:
  texture/rubble pass; for now the gradient tint is the readability
  requirement.

## 4. Local food + labor

The local-ledger model ("rung B"): food is local, the population count stays
global but is _spatialized_ by the existing per-tile density field.

- **Labor**: moved from yield multiplier to the §1b COVERAGE GATE — the pool
  covers claimed field tiles at `farmersPerFieldTile` each (ranked
  maturity-then-suitability); covered tiles till and produce, uncovered tiles
  lie fallow and senesce. Labor bounds the field's SIZE the way food bounds
  the city's, closing the loop spatially. The pool itself keeps the 4.1
  plumbing (computed at food-shed refresh):
  1. city-dwellers in the field's nearest-farm Voronoi cell of the shed, with
     surplus spilling to under-covered fields of the same shed network (a
     dense core staffs several nearby fields); PLUS
  2. an equal split of the RURAL population — everyone not housed in a city
     tile. Discovered the hard way: without the rural pool the model is a
     bootstrap death-trap (a young village has no city tiles → no labor →
     no food → never earns a city tile). Rural labor is aspatial until §4.2
     spatializes the population fully.
     (History: 4.1 shipped labor as a soft yield multiplier
     `max(laborFloor, min(1, pool/farmersPerFarm))`; measured effect on the
     harness — verdantia t2000: 25/26 nations alive (was 16), leader share
     12.8% (was 20.6%). The coverage gate supersedes the multiplier — one labor
     mechanism, no double-counting; the anti-snowball brake now acts on field
     AREA instead of yield.)
- **Distribution (as built)**: the feeding unit is the REGION — the
  connected component of the shed flood (union-find over nuclei whose
  floods touch). The shed CUTOFF, not the Voronoi seam, is the locality
  bound: a metro eats from every farm within reach; disconnected or
  out-of-reach regions share nothing. Three cohorts eat each tick:
  district civilians (per-region production + granaries), the CAMP (people
  beyond every shed, fed only by the baseStorage spawn stake — the fate of
  a city with no field in reach), and the WAR cohort (deployed troops, fed
  by requisition: production tax → camp → granaries). Starvation is
  per-cohort; recession prefers the worst-fed region's tiles (fedByFarm).
  Implementation traps (all hit, all fixed): density is HOUSING not
  headcount (scale by occupancy); scale refresh-time headcounts to the
  live idle pool (or newborns starve in the camp between refreshes);
  flooring dust joins a district; the labor pool (capped, spilled) is NOT
  the feeding population (peopleByFarm vs laborByFarm).
- **Storage (as built)**: per TILLED tile, capacity =
  `fieldTileStorageMilli · g(tenure)` — granaries grown from stability,
  banked/drawn/decayed at region level, written back per cell, burned with
  their nucleus. The camp stock (`_foodMilli`, baseStorage cap) survives
  as the spawn stake. Barns are gone. A famine is a _regional_ event — one
  metro recedes while another thrives.
- **Death-spiral guards** (all three deliberate):
  1. labor loss kills the field from the MARGINS inward (coverage ranked by
     maturity/suitability, §1b) — a famine costs frontier tiles, never the
     fertile old core first, so the recovery seed always survives longest;
  2. starvation acts faster than fallow senescence — a famine leaves hungry
     people and intact-ish fields (recoverable), not dead fields;
  3. tenure decays (not resets) on depopulation.

Deferred to a future change ("rung C"): migration — people flowing from
starving neighborhoods toward fed ones. Without it, pockets can still die in
place; watch playtests for whether it's needed.

## 5. Legibility (first-class, not polish)

- Stability must be visible: city tiles intensify (darker/denser render) with
  tenure; heartland readable at a glance.
- Damage: brown gradient (§3).
- Seed bank: award counters where food prices used to be in the BuildBar; a
  toast/ping when a milestone awards a seed.

## 6. The geometric scaling law (discoverable balance basis)

The snowball has a geometric root, prior to any economic tuning. A nation's
**interior (area)** holds its population, farms, and manpower; its **border
(perimeter)** is where all contest — attack, defense, expansion — happens. For
compact territory the two are quadratically related:

```
        A ∝ P²      (circle bound: area grows as the square of circumference)
```

so doubling your fighting frontage **quadruples** the manpower behind it.
Every "per-tile" or "per-person" knob silently inherits this: flat thresholds,
flat award rates, and flat costs are all exponential fuel for whoever is
already biggest.

Real maps are not circles — coastlines, mountains, and neighbors make the
effective exponent an **empirical quantity**: fit `A ∝ P^k` and expect
`k ≤ 2`, varying by map and by game phase (ragged wartime borders have more
perimeter per area than a consolidated blob). So we **measure it, not assume
it**:

- The balance harness (`tests/perf/balance/BalanceRun.ts`) logs a per-nation
  time series each cadence: `(tick, areaTiles, borderTiles, population,
troops)`.
- A fitting pass runs log-log regression over the runs and emits `k` per map
  plus an aggregate — a report artifact recorded in balance-notes, and the
  chosen value checked into Config as `scalingExponent`.
- **Measured 2026-07-14** (BalanceRun, 25 nations + 40 bots, 3000 ticks):
  verdantia `k = 1.263` (R² 0.941, n = 5830), pangea001 `k = 1.272`
  (R² 0.935, n = 2736). Real borders are RAGGED — far below the circle
  bound of 2 — and remarkably map-stable. Adopted `scalingExponent: 1.26`.
- `k` is a **measured constant baked into config**, not a live in-sim
  computation — deterministic, legible, and re-measured whenever knobs or maps
  change enough to matter.

**Consumers** — anything that should cost "constant effort" gets normalized by
the law rather than hand-tuned:

| Quantity                 | Naive (snowball fuel) | Law-normalized             |
| ------------------------ | --------------------- | -------------------------- |
| Founding ladder (§1)     | flat per-100k pop     | nth threshold ∝ `n^k`      |
| Supply / attrition radii | flat radius           | candidate: scale with `√A` |
| Density-cap plateau (§2) | flat ceiling          | candidate: phase-scaled    |

Only the founding ladder is committed in this change (farm seeds inherit it
via the §1 pairing — the old flat per-N-tiles farm award is deleted); the rest
are listed so future balancing reaches for the measured law first and a magic
number second.

## 7. The district planner (bots place founding pairs)

Task 6.1 taught the bots to spend seeds; the harness says they spend them
badly: settlement seeds are hoarded forever (the urban-room deficit trigger
almost never fires — TopSettlements ~0 in balance runs), farm siting ignores
labor (a nucleus on fertile empty frontier stalls at one tile against the
coverage gate), and the two scores are incomparable currencies (a
suitability sum vs population-ticks), so the argmax between them is
meaningless. Under this economy the founding PAIR is the strategic unit —
the town staffs the field, the field feeds the town — and the planner must
select it as one.

**D-DP1: One currency, restored.** Every placement scores in
population-ticks over the derived horizon H (add-greedy-economy-planner D1).
A farm nucleus is priced as the FIELD it can grow, labor-capped:

```
roomYieldMilli  = Σ over scout window of suit·cropN · fieldTileYieldMilli   // yield-weighted spreadable room
laborTiles      = residents / farmersPerFieldTile                           // the coverage gate, inverted
laborYieldMilli = laborTiles × (roomYieldMilli / roomTiles)                 // capped field at avg tile yield
score           = min(roomYieldMilli, laborYieldMilli) / idleConsumptionMilli × (H − ramp)
```

`residents` is the housed population within a small scout window of the
site (a scoring approximation of the shed-cell pool, like
FIELD_SCOUT_RADIUS — with `popPerDensity` 10 000 and `farmersPerFieldTile`
200, ONE full city tile staffs a whole scout-window field, so the test is
really "is there a town in reach"). The dead-ground gate (site can't hold a
claim) stays.

**D-DP2: The pair is a candidate.** When both seeds are banked, the planner
samples JOINT district sites: settlement candidates on owned ground, each
paired with the best farm site in a standoff annulus around it (the spawn
kit's collar, ~3 tiles, inside food-shed reach). Pair value = settlement
room value + farm value at PAIRED labor (`residents + popPerDensity` — the
town the seed founds is the labor stake; derived, not tuned). The winning
pair dispatches BOTH constructions in one pulse action. This is the move
the rules were designed around and the argmax could never express.

**D-DP3: Seed pressure replaces the deficit-only trigger.** A banked pair
earns nothing; a placed one compounds (field → food → births → next
milestone). So pairs place whenever a joint site scores positive — no
waiting for room starvation. Lone seeds (banks diverge via conquest and the
pre-placed kit) keep their triggers: lone settlements still relieve room
deficit (D3) and now also LABOR RELIEF — the marginal field yield unlocked
by staffing a labor-starved nucleus in shed reach, priced with the same
D-DP1 function at both labor levels. Lone farms use D-DP1 directly, which
makes an unstaffable frontier nucleus score ~0 and a near-town site win.

**D-DP4: Seeds are capital — a safety discount.** Conquest zeroes maturity
and tenure and combat damage freezes growth, so a seed spent on the
contested frontier is a seed wasted. All placement scores multiply by a
hostile-border factor: min Chebyshev distance to another player's tile
within a small window, normalized to 1 when no rival is near. Wilderness
does not discount (expansion room is exactly where districts belong).

**Kept from add-greedy-economy-planner:** greedy argmax, bounded seeded-PRNG
sampling, the top-k precision lever, the pure-EconomyModel/dispatch split,
and the `tryBuild(budget)` surface. Attack ROI (territory = room; enemy
districts = the post-taper plot supply) stays a future change.

## Determinism & perf

- Tenure and damage are map-wide integer arrays updated on the existing supply
  cadence (`supplyRefreshTicks`) — same pattern as SupplyField/FoodShed. All
  math integer or fixed-order float; no wall-clock, no unseeded randomness.
- Neighborhood feeding reuses the food-shed BFS already computed per player per
  cadence; the incremental cost is one pass over owned tiles.

## Open questions (edit as they resolve)

1. ~~Farm-seed award basis~~ RESOLVED 2026-07-15: paired with the settlement
   ladder (§1) — one founding pair per crossing; territory ratchet deleted.
2. Damaged farms: freeze maturity or senesce while damaged? (Field tiles:
   freeze is shipped behavior — spread also skips damaged tiles.)
3. Do awarded-but-unplaced seeds persist forever, or expire? (Lean: forever —
   simpler, and hoarding placement is self-punishing since unplaced seeds feed
   no one.)
4. Exact ladder values, tenure-curve time constants, damage/heal rates — all
   harness territory (`tests/perf/balance/`). New with §1b: claim threshold
   `fieldClaimMilli`, spread-rate constant, water-weighted suitability
   weights, `farmersPerFieldTile` (note: replaces `farmersPerFarm=50` per
   PLOT — per-tile must be much smaller).
5. Migration (rung C) — only if regional death-in-place proves unfun.
6. Does a lone field nucleus with zero labor bootstrap? The nucleus tile
   itself should probably always count as tilled (rural pool covers it) so a
   spawn kit can start the loop — verify in harness, it's the §4.1
   death-trap's field-model twin.
