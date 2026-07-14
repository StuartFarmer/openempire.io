# Spec delta: food-economy (add-urban-core-growth)

See `../../growth-model.md` for the full model and citations.

## MODIFIED Requirements

### Requirement: Production comes from maturing Farmland

Food production SHALL come from Farmland plots, scaled by each farm's maturity: production = Σ over farms of `M · f_soil · district · farmYieldMilli`, where `M` is the farm's climate-driven maturity, `f_soil` is the tile's crop fertility, and `district` is the contiguous-belt adjacency bonus. A freshly-planted farm yields almost nothing until it ripens; a farm in a hostile biome never reaches full yield. Farm output is NOT gated by the military supply distance (that governs troops and urban logistics only).

#### Scenario: Mature farms feed people

- **WHEN** a farm's maturity rises on fertile ground
- **THEN** its food output rises with maturity; a barren or immature farm produces little

### Requirement: Consumption and population scale with urban density

The population cap and consumption SHALL derive from summed urban density (`basePopulation + Σ density · popPerDensity`) — the self-grown cities, not Farmland counts. The allocation slider still splits production between population growth and storage; storage cap, decay, and starvation stages are unchanged and run on the density-derived flows.

#### Scenario: Cities set the population cap

- **WHEN** a nation's cities sprawl (summed density rises)
- **THEN** the population cap rises accordingly, and the farms must produce enough to feed it or the population starves

#### Scenario: Allocation still trades growth for banking

- **WHEN** the player shifts allocation toward storage
- **THEN** population growth slows and the food stock banks, exactly as before
