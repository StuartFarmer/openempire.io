# Design: rework-tribal-scarcity

## Context

The v1 economy (add-tribal-food-economy) made land production linear in owned fertility — territory alone generated surplus, buildings were always affordable, and the game degenerated toward build-speed. This rework makes scarcity the engine: food behaves like the troop model (investment raises rate and capacity), and every purchase competes with every other.

## Goals / Non-Goals

**Goals**: forced early choice branches; expansion with extreme diminishing food returns (land still matters — it's where farms go and what wars are fought over); investments that hurt short-term; no gold in the Tribal age.

**Non-Goals**: metal/oil (gold's successors), touching classic-map behavior, per-building upkeep.

## Decisions

1. **Production = land harvest + farm engine.** `landMilli = floor(pow(fertilitySum, landHarvestExponent) × landHarvestMilli)` (default exponent 0.5 — quadrupling land doubles harvest) plus `farmMilli = farmFertilityLevels × farmProductionMilli` (linear). Defaults sized so raw land sustains ~15–20% of the base population cap and one good farm feeds ~3k people.
2. **Escalating costs via the vanilla convention.** A food `costWrapper` twin: `cost = base × (owned + 1)` where owned = `min(unitsOwned, unitsConstructed)` (same counting as gold buildings, minus the infinite-gold cheat — infinite _food_ is not a cheat we ship). Linear (not vanilla's 2^n) because food throughput is itself capped by storage: the ladder is enforced by capacity, not by exponential prices.
3. **Storage is the ladder gate.** `baseStorage` (5k) is deliberately close to early cost tiers; saving for settlement #3 (6k) requires a Barn first. This is the anti-build-a-thon mechanism: stock is use-it-or-lose-it (overflow + decay), so hoarding requires capacity investment.
4. **Opening arc.** `startingFood` (4k, fits base storage) + starting population above land carrying capacity ⇒ buy farms immediately or starve toward the land level. Growth only ever runs at production surplus, so the crash bottoms out at sustainable population and recovery is investment-driven. No code special-cases "early game" — the arc falls out of the numbers.
5. **Gold removal is a layered-map gate, not a deletion.** `PlayerImpl` starts gold at 0n and `PlayerExecution` skips income when `hasFoodEconomy()`; the client hides the gold chip and gold build entries; the leaderboard shows Food instead of Gold on layered games. Vanilla gold code stays intact for classic maps and for the later ages to repurpose. Residual faucets (conquest gold) are invisible and unspendable on layered maps — acceptable.
6. **Knob set (FoodConfig v2)** — replaces `productionPerFertilityMilli`/`farmlandFertilityMult`; adds `landHarvestMilli` (200), `landHarvestExponent` (0.5), `farmProductionMilli` (200), `startingFood` (4000); costs become base×(owned+1) with bases settlement 2000 / farmland 1000 / barn 800; `baseStorage` 5000, `storagePerBarn` 8000, `populationPerSettlement` 15000 (sweep showed lower = flatter games).

## Risks / Trade-offs

- [Opening crash feels bad] → startingFood buys ~2 farms immediately; tune `startingFood`/`landHarvestMilli` first if playtests say the dip is too deep.
- [Bots deadlock at zero stock] → stock only grows at surplus; bots buy farms from the starting stake (trigger fires at spawn). Harness gate: bot survival + farms-built census.
- [Deficit deadlock for humans who spend the stake wrong] → starvation shrinks population until land+farms sustain it — recoverable by design, never a hard stall.

## Migration Plan

Amends the unarchived add-tribal-food-economy change; layered-map-gated like everything else. Rollback = revert.
