# Proposal: add-urban-core-growth

## Why

Today the player assembles the city by hand — painting hundreds of Settlement/Farmland/Barn plots. It works, but it is micromanagement, and it makes the _map_ incidental: fertility and supply gate what you build, but the city's shape is drawn by the mouse, not grown by the land.

The urban-science literature (Marquis & Barthelemy, _Modeling the spatial growth of cities_, 2026; Wang et al., _Urban area growth curves_, 2024) says cities are better described as a **field that grows itself**, and that growth cleanly factors into two questions:

- **How much** the city grows — a logistic S-curve: slow founding → acceleration → saturation at a carrying capacity `K` set by the land (Wang et al. fit this to 258 US cities over 200 years; the logistic beats every alternative, RMSE 0.019).
- **Where** that growth lands — a cellular-automaton suitability rule: the frontier expands into tiles by a local score, with congestion pushing growth outward (Marquis & Barthelemy; Ishikawa's crowding diffusion; Andersson's "Unwilling Neighbor" rule).

This fork already has the pieces to build that field: the supply field is the logistics term, the crop layer is fertility, the terrain bitmask carries shoreline, and the world generator computes river/lake hydrology (currently discarded at bake time). This change turns the city from something you _paint_ into something you _found and steer_.

## What Changes

- **Found a capital, don't paint a city.** Spawn places a single urban **Core** (replacing the starter-kit plots). From there the city grows on its own.
- **Per-tile urban density field** replaces discrete plots. Each owned land tile has a density `0..1`; food production, consumption, and population cap derive from the density field × fertility instead of from plot counts.
- **Logistic area dynamics.** Per player per tick, the built area advances `ΔA = r · A · (1 − A/K)`, where `K` is the summed suitability of reachable land and the growth rate `r` is fed by food surplus (the allocation slider splits production between growth `r` and storage, unchanged in spirit).
- **Suitability-CA spatial step.** New density is deposited on frontier tiles with probability ∝ `s(x) = w_food·crop + w_water·(freshwater+shore) + w_logi·supplyQuality(x→core) − w_cong·localDensity`. Congestion makes the interior saturate and pushes expansion to the edge, which reproduces the empirical exponential density gradient `ρ(r) ∝ e^(−r/r₀)`, `radius ∝ √P` scaling, and rough (Eden/KPZ) city edges — all emergent, none hand-authored.
- **Satellites and coalescence.** A small fraction of growth jumps beyond the frontier, seeding secondary settlements that grow and merge back into the core — polycentric cities for free (the paper's headline mechanism).
- **Structures become infrastructure that reshapes the field**, not the fabric itself: an Aqueduct raises the water term along a corridor, a Road raises logistics, a Granary raises local `K`. The player steers _where_ the self-organizing city grows without placing its tiles.
- **New hydrology layer.** A `water` plane (freshwater proximity from the generator's rivers/lakes/irrigation) is baked into `layers.bin`; shoreline is read free from the terrain bitmask.
- **Combat and razing compose naturally.** Razing drops captured area below `K`, so the logistic regrowth surge rebuilds ruins over time; `maturity = A/K` becomes a real strategic readout.

All of this is gated behind `game.hasLayers()`; classic maps stay byte-identical vanilla. It ships on the `urban-core-growth` branch so it can be dropped wholesale if it does not play well.

## Capabilities

### New Capabilities

- `urban-core-growth`: the Core, the density field, logistic area dynamics, the suitability-CA spatial step, satellites/coalescence, and the field-shaping infrastructure.
- `map-hydrology`: the baked freshwater `water` layer plane.

### Modified Capabilities

- `food-economy`: production/consumption/population derive from the density field and carrying capacity rather than plot counts; growth rate `r` is fed by food surplus.
- `tribal-buildings`: painted plots are removed; the buildable set becomes field-shaping infrastructure (Core, Aqueduct, Road, Granary).

## Impact

- Core: new `UrbanGrowth` module + density field on the sim; `water` plane in `MapLayers`; `found_capital` intent; food loop rewired onto density; supply field consumed as the logistics driver.
- Generator/baker: export the `water` plane; the demo map `estuaria` (river valley meeting a coast) showcases hydrology + shore + fertility growth.
- Client: render a continuous urban density field instead of plot sprites; found-capital + infrastructure UX; density/hydrology overlays.
- Bots: found a capital and place infrastructure toward high-suitability land (reuse of the TribalEconomy brain, retargeted).
- Balance: harness sweep of the suitability weights and `r` before any UI polish — the model is descriptive; the _fun_ is in the tuning.
