# Spec delta: tribal-buildings (add-urban-core-growth)

See `../../growth-model.md` for the full model and citations.

## MODIFIED Requirements

### Requirement: Painted plots are seeds — Settlement, Farmland, Barn

The player SHALL place three kinds of plot on layered maps, all seeds rather than finished structures:

- **Settlement** — a city seed. It seeds urban density on its tile and is a growth nucleus; the city grows outward on its own, gated by the food-shed around it. It is also a military-supply source. The player may place as many as they can afford, founding cities in new regions.
- **Farmland** — a food seed. It ripens in place from the tile's climate (maturity `M`), yielding food scaled by maturity and projecting the food-shed that nearby settlements grow on.
- **Barn** — storage, as before.

Settlement and Farmland are **mutually exclusive per tile** and never convert each other: a farm cannot be planted on urban density, and urban density never deposits on a farm tile.

#### Scenario: Placing the three seeds

- **WHEN** the player is on a layered map with a founded capital
- **THEN** the build bar offers Settlement, Farmland, and Barn, and placing them seeds a city nucleus, plants a maturing farm, or adds storage respectively

#### Scenario: The city is not painted

- **WHEN** the player wants to grow a city
- **THEN** they place a Settlement seed (and Farmland to feed it); the city sprawls on its own from the seed — there is no city fabric painted tile-by-tile

#### Scenario: Mutual exclusivity

- **WHEN** the player tries to place Farmland on a tile that already carries urban density
- **THEN** the placement is rejected — a tile is farm or city, never both
