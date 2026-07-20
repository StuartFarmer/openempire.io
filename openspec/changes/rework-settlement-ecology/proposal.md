# Proposal: rework-settlement-ecology

> **SUPERSEDED (2026-07-20) by `simplify-food-economy`.** Playtesting showed
> the assembled ecology (11 interlocking systems, 64 knobs) was illegible:
> optimal play was unclear, battles stacked three invisible death channels,
> and spawn soil quality was a hidden ~cropN² lottery. The whole stack —
> seed awards, farm CA + labor coverage, food sheds/local storage, tile
> stability, tile damage, supply attrition — was replaced by the simple
> model (baked fertility, fixed-radius farms, one pool, one logistic,
> vanilla combat with continuous terrain). The visual language (city
> painting, tilled-soil plots) survives as presentation. See
> `openspec/changes/simplify-food-economy/` for the replacement and its
> per-mechanic rationale.

## Why

`add-urban-core-growth` made the city grow itself, but the _economy of placement_ is still a shop: Settlement/Farmland/Barn are purchased with food and painted freely. That leaves food doing two jobs (feeding people AND funding construction), keeps a snowball channel open (food → plots → food), and makes land history-less — a tile conquered ten seconds ago is identical to one held all game.

This change completes the shift to an **ecology**: plots are **awarded, not purchased** (population milestones award founding pairs — a settlement seed and a farm seed together), **fields grow themselves** the way cities do (a Farmland is a nucleus whose field spreads across suitable ground, tilled only where farmers cover it), food's only job is feeding the population, food and storage are **local** to where they're grown, and tiles accumulate **stability** — tenure converted into capability — that combat **damage** destroys. Geography acquires history: heartlands are dense and buffered, fresh conquests are raw potential, and contested frontiers are battle-worn scars that must heal before they are worth anything.

## What Changes

- **Seeds are awarded, never purchased.** Each **peak-population** milestone on the steepening ladder banks a **founding pair** — one Settlement seed and one farm seed (revised 2026-07-15: the original peak-territory farm ratchet is deleted; a growing field makes one farm seed worth a district, and territory's reward is the room it gives fields and cities to spread). Awards are banked tokens the player places where they choose — placement stays the strategic decision, funding disappears. Plot food costs are removed.
- **Fields grow like cities (farm CA).** A planted Farmland is a **nucleus**: its field spreads tile-by-tile across owned, undamaged, climate-suitable ground, fastest along rivers and fertile valleys, driven by neighboring tiles' maturity (a cellular automaton, the city CA's twin). Labor is a **coverage gate**, not a growth rate: claimed tiles are tilled and produce only while local farmers cover them; uncovered tiles lie fallow, senesce, and revert to wild from the margins inward. Between the two automata, first claim holds — cities never pave living fields, fields never swallow city tiles.
- **Barns are removed.** Storage is _grown_, not built: stable farmland accumulates local storage capacity. An old farming district has deep reserves; a young or captured one has none.
- **Tile stability (tenure clock).** Each tile carries a tenure counter that runs only while the tile is _at its current limit_ (a full city tile, a farm settled at its climate ceiling) — growth is pulled by pressure, not granted by time. Tenure raises the tile's caps on a saturating curve: city density cap, farm storage capacity, settlement nucleus strength. Ownership flips hard-reset tenure; famine decays it slowly; combat pauses it.
- **Tile damage.** Fighting over a tile applies damage that heals over time. A damaged tile cannot urbanize, grow farms, or accrue tenure until **fully healed**. Rendered as a brown tint scaled by current damage — contested areas read as battle-worn at a glance.
- **Local food + labor.** Each field draws farmers from its food-shed neighborhood; the pool tills the field's best tiles first, so an under-peopled region farms a smaller field, not a discounted one. Food lands in the field's food-shed and feeds _that_ neighborhood; local surplus banks into local storage; local shortfall starves locally. Regional famines are visible on the map as one field going fallow and one metro receding while another thrives.

All gated behind `game.hasLayers()`; classic maps stay byte-identical vanilla.

## Capabilities

### New Capabilities

- `seed-awards`: the award ledger — founding pairs (Settlement seed + farm seed) from peak-population milestones on the measured power-law ladder, banked and placed by the player.
- `farm-growth`: the farm CA — Farmland as field nucleus, suitability-rated spread, the labor coverage gate (tilled/fallow), first-claim precedence with the city CA, per-tile yield.
- `tile-stability`: the demand-gated tenure clock, its consumers (density cap, farm storage, nucleus strength), and the disruption taxonomy.
- `tile-damage`: combat damage per tile, healing over time, the fully-healed gate, and the brown battle-worn rendering.

### Modified Capabilities

- `food-economy`: local distribution (food-shed becomes the feeding channel), labor-scaled farm output, storage from stable farmland (Barn capacity removed), local famine.
- `tribal-buildings`: Settlement/Farmland placement consumes awarded seeds instead of food; Barn removed as a buildable.

## Impact

- Core: tenure + damage per-tile fields (map-wide arrays, deterministic); award ledger on PlayerImpl (peak-population ratchet, paired awards); field-claim set + maturity plane as the farm-CA state; FoodEconomy rewired to per-tile field yield and per-neighborhood feeding; FarmGrowth generalized from in-place ripening to spread; UrbanGrowth density cap from tenure + field-tile exclusion.
- Client: seed counters in the BuildBar (replaces food prices); brown damage tint; green field overlay (maturity wash); stability made visible (city tiles intensify with age).
- Bots: TribalEconomy places awarded pairs instead of budgeting food (obsoletes part of `add-greedy-economy-planner` — reconcile before finishing that change).
- Balance: harness sweep of award ladders, tenure curve, damage/heal rates. Expect the blitz snowball to soften further: conquest yields tenure-zero land with no reserves.
