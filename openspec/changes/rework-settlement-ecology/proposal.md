# Proposal: rework-settlement-ecology

## Why

`add-urban-core-growth` made the city grow itself, but the _economy of placement_ is still a shop: Settlement/Farmland/Barn are purchased with food and painted freely. That leaves food doing two jobs (feeding people AND funding construction), keeps a snowball channel open (food → plots → food), and makes land history-less — a tile conquered ten seconds ago is identical to one held all game.

This change completes the shift to an **ecology**: plots are **awarded, not purchased** (land earns farm seeds, people earn settlements), food's only job is feeding the population, farms need local farmers to tend them, food and storage are **local** to where they're grown, and tiles accumulate **stability** — tenure converted into capability — that combat **damage** destroys. Geography acquires history: heartlands are dense and buffered, fresh conquests are raw potential, and contested frontiers are battle-worn scars that must heal before they are worth anything.

## What Changes

- **Seeds are awarded, never purchased.** Farm seeds accrue from **peak territory** (tiles held, ratcheted at the highest ever); Settlement seeds from **peak population** milestones on a steepening ladder. Awards are banked tokens the player places where they choose — placement stays the strategic decision, funding disappears. Plot food costs are removed.
- **Barns are removed.** Storage is _grown_, not built: stable farmland accumulates local storage capacity. An old farming district has deep reserves; a young or captured one has none.
- **Tile stability (tenure clock).** Each tile carries a tenure counter that runs only while the tile is _at its current limit_ (a full city tile, a farm settled at its climate ceiling) — growth is pulled by pressure, not granted by time. Tenure raises the tile's caps on a saturating curve: city density cap, farm storage capacity, settlement nucleus strength. Ownership flips hard-reset tenure; famine decays it slowly; combat pauses it.
- **Tile damage.** Fighting over a tile applies damage that heals over time. A damaged tile cannot urbanize, grow farms, or accrue tenure until **fully healed**. Rendered as a brown tint scaled by current damage — contested areas read as battle-worn at a glance.
- **Local food + labor.** Farm output is scaled by the farmers actually living in the farm's neighborhood (soft factor, not a cliff). Food lands in the farm's food-shed and feeds _that_ neighborhood; local surplus banks into local storage; local shortfall starves locally. Regional famines are visible on the map as one metro receding while another thrives.

All gated behind `game.hasLayers()`; classic maps stay byte-identical vanilla.

## Capabilities

### New Capabilities

- `seed-awards`: the award ledger — farm seeds from peak territory, Settlement seeds from peak-population milestones, banked and placed by the player.
- `tile-stability`: the demand-gated tenure clock, its consumers (density cap, farm storage, nucleus strength), and the disruption taxonomy.
- `tile-damage`: combat damage per tile, healing over time, the fully-healed gate, and the brown battle-worn rendering.

### Modified Capabilities

- `food-economy`: local distribution (food-shed becomes the feeding channel), labor-scaled farm output, storage from stable farmland (Barn capacity removed), local famine.
- `tribal-buildings`: Settlement/Farmland placement consumes awarded seeds instead of food; Barn removed as a buildable.

## Impact

- Core: tenure + damage per-tile fields (map-wide arrays, deterministic); award ledger on PlayerImpl (peak-pop / peak-territory ratchets); FoodEconomy rewired to per-neighborhood feeding; FarmGrowth gated on damage; UrbanGrowth density cap from tenure.
- Client: seed counters in the BuildBar (replaces food prices); brown damage tint; stability made visible (city tiles intensify with age).
- Bots: TribalEconomy places awarded seeds instead of budgeting food (obsoletes part of `add-greedy-economy-planner` — reconcile before finishing that change).
- Balance: harness sweep of award ladders, tenure curve, damage/heal rates. Expect the blitz snowball to soften further: conquest yields tenure-zero land with no reserves.
