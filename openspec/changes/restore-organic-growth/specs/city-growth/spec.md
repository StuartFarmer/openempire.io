# Spec: city-growth

The baked suitability plane and demand-gated organic city growth that IS
housing (design.md D4). Replaces the presentation-only painter.

## ADDED Requirements

### Requirement: Suitability is one baked 0..1 number per tile

The sim SHALL bake a per-tile suitability plane once at map load, beside fertility: `suitability = clamp01((fertilityN + waterAccessN + (1 − magnitudeN)) / 3)` with `waterAccessN = min(1, waterN + 0.5·shore)`; water and impassable tiles are 0. Runtime reads are plain lookups (`game.suitability(tile)`), and the client SHALL expose it exactly like fertility (hover row; overlay).

#### Scenario: Good city land

- **WHEN** two owned tiles differ only in elevation (magnitude)
- **THEN** the lower tile has the higher suitability

### Requirement: Cities grow when their people need homes, over suitability

The per-tile city plane SHALL be real sim state (no cosmetic painter exists). The city holds one tile per `popPerDensity` people — houses follow heads: while `cityTiles < ceil(population / popPerDensity)` it adds `max(1, urbanGrowthRate × gap)` tiles per tick on the best-suitability frontier — 4-contiguous from the nuclei (Core and completed Settlements), owned passable land, never a worked field tile or plot (first claim holds both ways). It recedes from its worst-suitability edge, at the same pace, only when holding more than 1.5× the tiles its population needs (a wide hysteresis band); the Core tile stands while its people live. (Amended during implementation 2026-07-20: the original fixed 90%-of-housing growth gate re-created the follower stall the design flagged — the logistic asymptotes into its own gate — so the city target-follows the population directly, and housing binds exactly when suitable OWNED land runs out: a territorial constraint, not an asymptote race.)

#### Scenario: Demand-gated growth

- **WHEN** a fed player's population presses its housing ceiling
- **THEN** city tiles appear one pace at a time on the most suitable adjacent ground, and growth stops when population no longer presses housing

#### Scenario: Organic shape

- **WHEN** a city's frontier offers a fertile river valley and a barren ridge
- **THEN** the city grows into the valley first — the shape follows the visible suitability plane, never a circle

### Requirement: The city IS the housing

Housing SHALL be `housingBase + cityTiles × popPerDensity`, and `Config.maxTroops` SHALL return it (scaled by the existing AI difficulty multiplier). No per-settlement housing exists; Settlements contribute as growth nuclei only.

#### Scenario: One pair carries a region

- **WHEN** a player founds one Settlement near good land and stays fed
- **THEN** its city grows tile by tile and housing rises with the visible footprint — no additional Settlements are required for the population to keep growing

## REMOVED Requirements

### Requirement: The city footprint is presentation only

**Reason**: Playtest (2026-07-20): per-settlement housing coupons forced settlement spam, and a cosmetic footprint answers no question. The footprint is now the housing mechanic itself, grown over a visible baked plane.
**Migration**: The requirement above; `housingPerSettlement` is removed (knob slot goes to `fieldGrowthRate`).
