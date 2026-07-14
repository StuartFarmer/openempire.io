# Spec: urban-core-growth

See `growth-model.md` for the full model, math, and paper citations.

## ADDED Requirements

### Requirement: Found a capital and any number of centers

On layered maps, spawning SHALL place a single urban Core at the chosen tile, seeding a starter city tile there and planting a small kit of already-mature Farmland (so the young nation is fed from tick one). Beyond the capital, the player SHALL be able to place any number of **Settlement** seeds ("centers") on owned land — centers are uncapped. Each Settlement is a growth nucleus (a city grows around it from the living population) and a military-supply source. Spamming settlements confers no advantage: the city footprint is bounded by population, so extra empty nuclei only spread the same people thinner.

#### Scenario: Founding the capital

- **WHEN** a player spawns on a layered map
- **THEN** exactly one Core exists at the spawn tile, a starter city tile and mature starter Farmland are placed, and the young population is fed

#### Scenario: Centers are uncapped

- **WHEN** the player places Settlements as fast as they can afford them
- **THEN** none are refused for a "center budget"; but the total city size stays bounded by the nation's population, so extra nuclei do not multiply the city

#### Scenario: A settled center grows from its own population

- **WHEN** the player places a Settlement on owned land near mature farms
- **THEN** a city grows around it from the population, gated by the food-shed there (not the capital's)

### Requirement: Farms mature in place from climate

On layered maps, each Farmland SHALL carry a maturity `M ∈ [0,1]` that advances each tick toward the tile's climate suitability `min(f_temp, f_water, f_soil)` — GDD temperature band (McMaster & Wilhelm), AquaCrop water stress over the water+humidity layers (Raes et al.), and FAO soil fertility (the `crop` layer) — combined by Liebig's minimum, on a Gompertz growth curve. A farm whose maturity exceeds what its tile supports SHALL senesce toward suitability. Farm food yield SHALL scale with maturity: `yield = M · f_soil · farmYieldMilli`.

#### Scenario: A well-sited farm ripens

- **WHEN** a Farmland sits on a tile with good temperature, moisture, and soil
- **THEN** its maturity climbs a slow-start/accelerate/saturate curve toward ~1 and its yield rises with it

#### Scenario: A poorly-sited farm stalls or withers

- **WHEN** a Farmland sits on cold, dry, or barren ground (a low Liebig stave)
- **THEN** its maturity settles low (or senesces) and it yields little, regardless of the other factors

### Requirement: Food-shed drives city growth

On layered maps, mature Farmland SHALL project a **food-shed** — a soft-decay potential `M · 1/(1+(d/foodShedRadius)^foodShedPower)` over owned land at step-distance `d`, separate from the military supply field. A Settlement's urban growth rate SHALL be gated by the food-shed at each candidate tile as a continuous multiplier: land with no food-shed does not urbanize; land ringed by ripe farms grows fastest.

#### Scenario: Cities grow toward their farms

- **WHEN** one settlement sits near mature farms and another has none nearby, in the same nation
- **THEN** the fed settlement grows into a city while the unfed one stays a hamlet

### Requirement: Binary, contiguous city tiles

Each owned land tile SHALL be either a full **city tile** (opaque, density = 1) or not — there is no fractional density gradient. A new city tile SHALL be placed only 4-adjacent to an existing city tile (the contiguity rule); there are no detached satellites. `urbanArea` is therefore the literal count of city tiles, so the visible sprawl and the population it supports are one-to-one. The population cap is `basePopulation + urbanArea · popPerDensity`.

#### Scenario: Opaque, touching tiles

- **WHEN** a city grows
- **THEN** each new cell is a full opaque tile edge-adjacent to the existing city — never a faint partial tile, never a disconnected island

#### Scenario: Sprawl matches population

- **WHEN** the player sees N city tiles
- **THEN** the population cap is `basePopulation + N · popPerDensity` — a big city is a big population, not a faint blob of near-zero tiles

### Requirement: Population is a food-driven demographic; the city tracks it

The population SHALL be modelled as agents with an average lifespan — an aggregate birth/death process per tick. **Deaths** are `pop · (1/avgLifespanTicks) / max(minFedForLife, fedRatio)`: baseline old age, accelerated by starvation so half the food halves the lifespan (doubles deaths), capped at everyone. **Births** are `pop · baseBirthRate · min(birthSurplusCap, surplusRatio)` — rising with food surplus up to a cap at ≥200% food, zero with no food — and clamped to the food headroom (`capacity − pop`) so the population approaches its food-supported size and holds, never overshooting into famine. The **built area SHALL track the living population**: `targetTiles = floor(population / popPerDensity)`; the city grows toward it a paced few whole tiles per tick and razes tiles from the outer edge (nothing protected) as the population falls.

#### Scenario: A fed population grows and holds at its food capacity

- **WHEN** a nation has a food surplus and a population below what its farms feed
- **THEN** births grow the population toward the food-supported size and hold it there, and the city footprint grows with it

#### Scenario: Starvation kills people and razes the city

- **WHEN** the nation cannot feed its population (farms razed, or too few farms)
- **THEN** deaths accelerate (shorter lifespans), the population falls, and city tiles are razed from the outer edge tracking it down

### Requirement: A nation dies when its population dies

On layered maps, a player SHALL be eliminated when their entire living population (idle troops plus deployed) reaches zero — even if they still hold territory. Their land reverts to neutral.

#### Scenario: Starving to death loses the game

- **WHEN** a nation's population starves all the way to zero
- **THEN** the nation is eliminated and its territory becomes neutral, though no enemy ever conquered it

### Requirement: Suitability-driven spatial growth

The frontier tile filled each step SHALL be chosen with probability proportional to `s(x) = max(0, w_food·crop + w_water·(freshwater + w_shore·shore) + w_logi·supplyQuality − w_cong·localDensity) · min(1, wFoodShed·foodShed(x))`. The food-shed factor gates growth to fed land; the congestion term biases the front outward. Tiles the settlements cannot reach through owned land (supply quality ≈ 0) or that no farm feeds (food-shed ≈ 0) do not urbanize.

#### Scenario: Water and coast draw growth

- **WHEN** freshwater or shoreline tiles are within reach and fed by the food-shed
- **THEN** the city preferentially expands toward them over dry interior land of equal fertility

### Requirement: Farms and cities are mutually exclusive

A tile SHALL be farmland or city, never both, and neither ever converts the other. Urban density SHALL NOT deposit on a Farmland tile, and Farmland SHALL NOT be placed on a tile carrying urban density. The scarcity of tiles is the strategy.

#### Scenario: No conversion

- **WHEN** a city grows next to a farm belt
- **THEN** city tiles spread around the farm tiles, never onto them, and the farms are never overwritten

### Requirement: The layered-map buildable set

The layered-map buildable set SHALL be **Settlement** (a city seed / growth nucleus and supply source), **Farmland** (a maturing food source that projects the food-shed), and **Barn** (storage). Each costs food. The player places seeds and food; the cities grow themselves. Field-shaping infrastructure (Roads/aqueducts that let the supply and food-shed fields travel along corridors) is deferred to a later change.

#### Scenario: Seeds, not city fabric

- **WHEN** the player wants a city in a new region
- **THEN** they place a Settlement seed and nearby Farmland, and the city grows on its own as the farms ripen — there is no city fabric to paint tile-by-tile

### Requirement: Razing sets the city back on its curve

Capturing territory SHALL remove its density (razing), dropping the loser's area below `K`; the logistic dynamics then regrow the survivor's captured land over subsequent ticks.

#### Scenario: Rebuilding ruins

- **WHEN** a district is captured and razed
- **THEN** its density resets low and regrows over time under the captor's growth dynamics
