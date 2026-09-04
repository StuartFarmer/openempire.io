# Design: restore-organic-growth

## Context

simplify-food-economy delivered the legible accounting (one pool, one logistic, baked fertility, vanilla combat) but playtest showed three feel regressions: structure spam, instant footprints, circular fronts. Diagnosis (2026-07-20): the conquest priority still uses the vanilla 3-band terrain switch and 93.4% of verdantia land is a single band (adjacent magnitude deltas: 81% zero, 18% one step — the climb term never fires). The fix philosophy: restore the old model's _organism_ with the simple model's _bookkeeping_ — every growth process is a paced, visible spread over a baked, hover-readable plane.

## Goals / Non-Goals

**Goals:**

- Zero net knob change (23 → 23) — three swaps, no additions.
- Full symmetry: farms spread over the fertility plane; cities spread over a suitability plane. Both are real sim state, both rendered, both previewable. No cosmetic "painter" concept anywhere.
- Few structures, each one an organism: one founding pair carries a region.
- Terrain-shaped fronts with no new mechanics — just continuous inputs to existing formulas.

**Non-Goals:**

- No return of labor coverage, food sheds, supply attrition, tile damage, tenure, or Liebig staves.
- No allocation slider, no local famine, no per-district anything.
- No map format changes.

## Decisions

### D1 — Knob swaps (23 → 23)

| Out                    | In                 | Meaning                                                                                                                 |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `farmCost`             | `seedLadderBase`   | peak population banking the FIRST founding pair (default 4 000)                                                         |
| `settlementCost`       | `seedLadderGrowth` | rung multiplier (default 2 — each pair needs double the people)                                                         |
| `housingPerSettlement` | `fieldGrowthRate`  | worked-tile growth pace for farm fields (fraction of remaining field per tick, min 1 tile per pulse like the city pace) |

`farmRadius` becomes the field's MAXIMUM Chebyshev radius. `urbanGrowthRate` is the city's growth pace. `farmOutputMilli` keeps its meaning ("a full field on perfect land yields this") — it is simply reached over time now.

### D2 — Seed ladder: geometric, paired, ratcheted

Rung n sits at `seedLadderBase × seedLadderGrowth^(n−1)`. Crossing a rung with PEAK population (a per-player high-water mark, never re-awarded) banks one settlement seed + one farm seed. The spawn kit is pair zero (placed structures, not banked seeds). `unitInfo.cost` returns 0 for Settlement/Farmland; `canBuild` requires a banked seed of the type (the exact gate deleted by simplify-food-economy — resurrect from git, `git show` on PlayerImpl before that change). HUD/build bar show seed counts and "next pair at N" (the legibility the old ladder never had).

- _Alternative rejected_: the old `basePop × n^(k·taper)` power ladder — two coupled exponents, one empirically measured; the geometric form says its rule in one sentence.

### D3 — Farm fields grow

Per completed Farmland, a worked-tile set (sim state, per player like the old farm maturity map but boolean): starts as the nucleus, and on each growth pulse adds the best-fertility frontier tile (4-adjacent to the field, owned, land, passable, unclaimed by any other field or city, within `farmRadius` of the nucleus). Pace: `fieldGrowthRate × remainingTiles` per tick, min one tile per full pulse — same pacing family as city growth. Deterministic: ties break by lowest tile ref; a seeded weighted-random variant is NOT used (greedy reads better and previews exactly).

Production per farm = `farmOutputMilli × (Σ fertility over WORKED tiles / (255 × fullFootprintArea)) × fertilityBonus` — the same formula as today with the worked set replacing the radius stamp, so a grown field on full-owned land converges to today's exact output. Losing a worked tile (conquest) removes it from the set immediately; the field regrows it later if reclaimed. Fields NEVER overlap (spacing rule unchanged) and stop at borders — organic shapes fall out of fertility (valleys) + ownership.

Rendering: worked tiles ship on the restored field byte channel (`packedFieldUpdates`, deleted last change — resurrect writer/reader from git) and draw as the tilled-soil plot pattern, exactly the old look.

### D4 — Suitability plane + demand-gated city growth = housing

`suitability(tile)`, baked once at load beside fertility (u8, `game.suitability(tile)`), constants not knobs:

`suitability = clamp01((fertilityN + waterAccessN + (1 − magN)) / 3)` where `waterAccessN = min(1, waterN + 0.5·shore)` — fertile, watered, LOW ground makes good city land. Water/impassable = 0. Hover row + overlay expose it like fertility.

City growth (replaces the painter wholesale):

- **Grow** when `population ≥ 0.9 × housing` (demand-gated — cities expand because people need homes; constants, not knobs): add `max(1, urbanGrowthRate × pressureGap)` tiles per tick, best-suitability frontier first, 4-contiguous from the nuclei (Core + completed Settlements), owned land, not water/impassable, not a worked field tile or plot (first claim holds between the two spreads, both sides checking the other).
- **Recede** when `population < 0.5 × housing`: remove worst-suitability edge tiles at the same pace; the Core tile stands while people live.
- **Housing** = `housingBase + cityTiles × popPerDensity`. `Config.maxTroops` returns it (× the existing AI difficulty multiplier). This is the anti-spam: one growing city replaces the +8000-per-settlement coupons; Settlements matter as NUCLEI (a second region can urbanize) not as housing line items.
- Stability: housing trails population by the pace (demand-gated growth adds room only when pressed), and population is capped by `min(capacity, housing)` — the pair form a follower system whose real ceiling is food capacity. No oscillation: growth triggers at 0.9, recession at 0.5, a wide hysteresis band.

- _Alternative rejected_: keeping per-settlement housing with a cosmetic painter — that IS the spam and the paint answers no question.

### D5 — Terrain-shaped fronts, zero knobs

- `AttackExecution` priority: replace the 3-band switch with `1 + 2·magN + wetnessN` (same 1..~3 numeric range vanilla's constants spanned; wetness = (humidity+water)/510 as in attackLogic). Fronts flow around hills and rainforest; on a 93%-one-band map, `magN` still varies within the band (10 values), which the switch collapsed.
- `Config.attackLogic` slope input becomes `magN(target) + climb` (absolute + uphill delta) so `kSlope` shapes cost even where deltas are smooth. `kWet` unchanged.

### D6 — Bots

Binding-ceiling rule survives verbatim with "affordable" → "banked": if housing ≤ capacity and a settlement seed is banked, place it (best-suitability sampled site, contiguity not required — a new nucleus opens a new region); else if a farm seed is banked, place it on the best-scoring legal footprint (score = would-be full-field production). Seeds always eventually place (no budgeting).

## Risks / Trade-offs

- [Housing↔population followership could stall like the old trigger did] → the ladder gates SEEDS, not housing: housing grows from area with no purchase step, so the simplify-era stall (logistic asymptoting under a buy trigger) cannot recur; harness A/B before merging.
- [Worked-field state returns per-tile bookkeeping] → one boolean set per farm, no clocks/decay/labor — bounded by `(2·farmRadius+1)²` per farm.
- [Ladder throttles late-game housing hard vs the purchase model (138 settlements → ~8 pairs at 171k pop)] → intended (it was the open balance item); `seedLadderGrowth` is the lever; re-sweep.
- [First-claim-holds between field and city spreads needs both sides checked] → single shared predicate; tests cover both directions.

## Migration Plan

One change, no data migration. `simplify-food-economy` remains accurate for everything it doesn't touch; its specs are amended by this change's deltas.

## Open Questions

- Tuned defaults for `fieldGrowthRate` and the ladder (start: base 4 000, growth 2, fieldGrowthRate 0.02) — set against the harness, recorded in balance-notes.md.
