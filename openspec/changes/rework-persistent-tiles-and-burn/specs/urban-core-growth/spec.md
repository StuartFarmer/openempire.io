# Spec delta: urban-core-growth (rework-persistent-tiles-and-burn)

A city that shrinks leaves a persistent **empty urban lot**, not blank ground.
The zone was already retained under recession; this makes the idle state
visible and guarantees it regrows in place.

## ADDED Requirements

### Requirement: Recession leaves a persistent empty urban lot

When population falls and the urban footprint recedes, a dropped city tile SHALL retain its `Urban` land-use zone and become an **empty urban lot** — developed ground with no house — rather than reverting to blank terrain. The lot SHALL remain the owner's `Urban`-zoned tile, ineligible for field spread, and SHALL regrow a house (regain density) when population returns and the urban CA re-selects it. Recession SHALL never drop a nucleus tile (Core or completed Settlement) while the player lives.

#### Scenario: A shrinking city leaves lots behind

- **WHEN** population collapses and the footprint recedes from its outer tiles
- **THEN** each vacated tile becomes an empty urban lot that stays the owner's `Urban` land, not neutral wild ground

#### Scenario: The city refills its own lots first

- **WHEN** population recovers after a recession
- **THEN** the urban CA regrows houses on the retained empty lots in place, rather than the lots having reverted and been re-competed by the field automaton

#### Scenario: Nucleus tiles survive recession

- **WHEN** a nation recedes to its nucleus count while alive
- **THEN** the Core and each completed Settlement keep their city tile

### Requirement: The empty urban lot is rendered as developed idle ground

The renderer SHALL draw an empty urban lot as a distinct persistent state (cleared/developed ground without a house), separate from both an occupied city tile (house) and undeveloped wild terrain — so a receded district still reads as a settled place at a glance in both the WebGPU shell and the WebGL renderers.

#### Scenario: A ghost district is legible

- **WHEN** the player views a district that lost its population
- **THEN** the tiles show as empty developed lots (no houses), visibly distinct from wild land, until they regrow houses
