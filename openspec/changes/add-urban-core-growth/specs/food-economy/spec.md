# Spec delta: food-economy (add-urban-core-growth)

## MODIFIED Requirements

### Requirement: Production comes from the urban density field

Food production SHALL be computed from the urban density field rather than Farmland plots: production = Σ over owned land of `crop(x) · density(x) · supplyQuality(x→core)`. Built, fertile, supplied land feeds people; unbuilt or unsupplied land does not. Farmland/Settlement/Barn plots are removed.

#### Scenario: Density and fertility produce food

- **WHEN** density rises on fertile, supplied tiles
- **THEN** production rises; on infertile or unsupplied tiles it does not

### Requirement: Consumption and population scale with density

The population cap and consumption SHALL derive from summed density (`Σ density · popPerDensity`) rather than Settlement counts. The allocation slider still splits production between population growth (feeding the logistic rate `r`) and storage; storage cap, decay, and starvation stages are unchanged and run on the density-derived flows.

#### Scenario: Allocation still trades growth for banking

- **WHEN** the player shifts allocation toward storage
- **THEN** the logistic growth rate `r` slows and the food stock banks, exactly as before but with area (not plot builds) as the growth outlet
