# Balance notes

## v2 — scarcity economy (rework-tribal-scarcity)

Same harness setup as v1 (verdantia, 25 nations + 10 bots, 3000 ticks,
3 seeds). After removing gold, nerfing land harvest to √fertility, making
farms the production engine, and escalating costs:

| Config                     | mean leader | max leader | Gini | starved |
| -------------------------- | ----------- | ---------- | ---- | ------- |
| **v2 defaults**            | 12.5%       | 15.3%      | 0.37 | 7.5k    |
| landHarvestMilli 400 (2×)  | 12.6%       | 14.0%      | 0.38 | 12k     |
| farmProductionMilli 100 (½)| 11.7%       | 13.8%      | 0.42 | 7.1k    |
| startingFood 2000 (½)      | 13.6%       | 17.2%      | 0.36 | 9.2k    |
| populationPerSettlement 25k| 13.2%       | 14.6%      | 0.42 | 10k     |

Structure census at defaults: ~180 Farmland, ~40 Barns, ~35 Settlements,
zero gold structures — farms are the economy's engine as designed (v1 was
15 farms / 70 settlements). Leader share fell from 28%/45% (v1) to
12.5%/15.3%: the scarcity loop (escalating costs + storage-gated saving +
√land harvest) is a much stronger flattener than any single v1 knob. The
economy is robust to ±2× on individual knobs. Defaults accepted.

## v1 — initial knob sweep (task 6.4, superseded by v2)

First sweep with the BalanceRun harness. Setup: map `verdantia` (512×256,
seed 42), 25 procedural nations + 10 bots, 3000 ticks (~5 min of game),
3 seeds per config, defaults except the named override. Signal = final
leader territory share (of owned tiles) / territory Gini across alive
players / total starvation deaths.

| Config                      | mean leader | max leader | Gini | starved |
| --------------------------- | ----------- | ---------- | ---- | ------- |
| **defaults**                | 28.3%       | 44.7%      | 0.55 | 61k     |
| starvationDeathFraction .005| 27.9%       | 31.7%      | 0.40 | 16k     |
| starvationDeathFraction .05 | 17.7%       | 19.9%      | 0.42 | 151k    |
| farmlandFertilityMult 100   | 28.2%       | 35.1%      | 0.55 | 61k     |
| farmlandFertilityMult 800   | 25.4%       | 35.3%      | 0.50 | 61k     |
| populationPerSettlement 5k  | 12.0%       | 15.3%      | 0.32 | 61k     |
| populationPerSettlement 50k | 44.1%       | 53.2%      | 0.51 | 61k     |
| decayDenom 500 (fast decay) | 24.9%       | 26.6%      | 0.43 | 61k     |
| decayDenom 20000 (slow)     | 26.5%       | 40.1%      | 0.47 | 61k     |

## Findings

1. **`populationPerSettlement` is the primary snowball lever** — leader share
   scales 12% → 28% → 44% across 5k/25k/50k. This is the designed dampener
   working: conquered land grants production, not population, so housing
   throttles how fast a lead converts to armies. Lower it to flatten games.
2. **`starvationDeathFraction` punishes overreach** — at 0.05 the mean leader
   share drops to 17.7% (armies that outrun their food die), at the cost of
   2.5× total starvation deaths (harsher for everyone).
3. Farmland multiplier and storage decay are secondary (≤3-point effects) —
   fine-tuning knobs, not structural ones.
4. No runaway detected at defaults: max leader share 44.7% after 3000 ticks
   in the worst seed, and eliminations start ~tick 950 — competitive but
   decisive. Acceptance posture: keep defaults; if games feel too
   winner-takes-all in playtesting, first move `populationPerSettlement`
   toward 15k, then starvation toward 0.03.

## Repro

```bash
npx tsx tests/perf/balance/BalanceRun.ts --map verdantia --runs 3 \
    --ticks 3000 --bots 10 --nations 25 [--override key=value]
```

Same seed + config ⇒ identical output (`--check-repro`).

## v2.1 — ghost start + starvation parity

Playtest report: the human "eats through all food" while nations "expand
no problem". Probe confirmed a mechanical asymmetry, not perception:
troops deployed in attacks left the starvable pool — a 90%-committed
army kept 17.7k of 20k troops through a famine (and conquered 5.7×
territory) while an identical idle player starved to 1.6k. Nations
always attack; cautious humans didn't. Fixes:

1. Starvation now hits idle + attack + boat troops proportionally
   (probe after: attacker ends at 3.3k total vs idle 4.6k — territory
   now *costs* population).
2. Ghost start: basePopulation = one Settlement (15k) and a ghost
   Farmland (baseFarmFertility 150 ≈ 30 food/tick) soften the opening
   for everyone. (Humans still start with more mouths: startManpower
   25k vs Medium nations' 18.75k — vanilla difficulty scaling, kept.)

Harness after (3 seeds × 3000 ticks × 25 nations): leader 12.8% mean /
15.9% max, ~205 farms, 21–23 nations alive (up from 14–16), first
eliminations at tick 1400–2100 (was ~950) — the opening is economic
pressure rather than early elimination.

## v2.2 — uniform start population

Second playtest report: still "out of food immediately" while idle.
Cause: vanilla startManpower survived on layered maps — humans spawned
with 25k people (nations 18.75k, bots 10k) against ghost infrastructure
that feeds ~5k, so the human's stake burned in ~2s and stock pinned to 0
through the starve-down while nations (fewer mouths + instant farm
builds) banked to cap. Fix: on layered maps every player type starts at
`startPopulation` (5k) and the ghost farm was sized up (baseFarmFertility
180) so a modest spawn is at production/consumption breakeven. In-game:
idle player holds 5,033 population indefinitely; food drifts down only
via storage decay (~0.6/tick) — the intended "invest your stake" nudge.
Harness unchanged in shape: leader 13.6%/15.4%, ~213 farms.

## v2.3 — farms out-produce the population cap (banking works)

Playtest feel report: spendable food fluctuated with population, and
barns never held surplus. Probe showed a growth homeostat: population
expands until consumption equals production, equilibrium landed BELOW
the settlement cap, so net inflow → ~0 and storage decay slowly bled
the stock — barns raised a ceiling that nothing ever filled.

Fix chosen (Stuart): raise farm output rather than restructure growth.
farmProductionMilli 200→400 (baseFarmFertility 180→90 so the ghost farm
stays 36/tick and idle stasis is unchanged). Two good farms now exceed
the base cap's consumption → population pins at the settlement cap →
surplus genuinely banks → barns visibly fill (probe: stock 5k-capped →
13k after one barn, holds). Ladder: farm → surplus → pop caps → storage
overflows → barn banks → bank buys the next settlement.

Harness: ~200 farms / ~58 barns / ~40 settlements (barns + settlements
both up — banked food is being spent), leader 15.6%/18.0%, Gini 0.38.

## v3 — tile-painted 2×2 plots (add-tile-painted-structures)

Structures became cheap 2×2 plots painted onto owned land (no spacing,
escalation flattened to +3%/plot, effects ~5× smaller each, +10%/edge-
adjacent same-type neighbor). Standard protocol (3 seeds × 3000 ticks ×
25 nations): ~760 farm plots / ~137 barns / ~103 settlements per game
(~35+ plots per nation — empires are painted), leader 13.2% mean /
14.2% max, Gini 0.35. Territory is now the binding constraint on
building; districts (belts/clusters) confirmed in bot placement and in
the belt-vs-scattered production test.

## v3.1 — single-tile plots, no build time, upgrade-hijack fix

Playtest corrections: the 2×2 was the sprite INSIDE a tile, not the
footprint. Plots are now one tile each (distance-1 adjacency), build
instantly, and — the root of "settlement built but invisible" — tribal
plots are no longer upgradable: buildableUnits was hijacking any build
click within 15 tiles of an existing Settlement/Barn into an instant,
invisible level-up. Farmland stroke-paints (reference foundation UX);
Settlement/Barn are sticky single placements; farmland's tilled rows
derive from each tile's own terrain color. Harness (2×2500 ticks):
~580 farms / ~100 barns / ~70 settlements, leader 8.5%, Gini 0.30,
23–28 of 35 alive — denser economies, flatter games.
