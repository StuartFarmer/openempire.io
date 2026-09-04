# farm-growth Specification

## Purpose
TBD - created by archiving change rework-persistent-tiles-and-burn. Update Purpose after archive.
## Requirements
### Requirement: Labor is a coverage gate, not a growth rate

A claimed field tile SHALL be **tilled** only while the field's shed-cell labor pool covers it at `farmersPerFieldTile`, with coverage assigned in deterministic rank order (maturity, then suitability). Only tilled tiles produce food and run their tenure clock. Claimed tiles left uncovered SHALL lie **fallow**: they produce nothing and their establishment senesces. A fallow tile senescing below the claim threshold SHALL NOT die or revert to wild — instead it SHALL settle at an **initial farmland** floor (`farmSeedMilli`), remaining a claimed field tile of its owner, ready to regrow when labor and suitability return. The tile's land-use zone (`Field`) SHALL persist. This coverage gate REPLACES the labor yield-multiplier of the prior task — labor is applied exactly once.

#### Scenario: Labor loss thins the crop but keeps the field

- **WHEN** a field's labor pool shrinks below what its claimed area needs
- **THEN** the lowest-ranked (young, marginal) tiles go fallow and senesce toward the initial farmland floor while the mature core stays tilled — the field contracts in yield but its tiles remain claimed farmland, not blank ground

#### Scenario: Labor returns and the field regrows in place

- **WHEN** the labor pool recovers over fallow tiles still holding their initial farmland floor
- **THEN** those tiles are tilled again and ripen from the floor without re-establishing from wild

#### Scenario: An abandoned field idles, it does not vanish

- **WHEN** a field's labor pool stays at zero for a long time
- **THEN** its tiles settle at the initial farmland floor and render as idle tilled soil — the land stays the owner's claimed farmland and regrows when worked again

### Requirement: First claim holds between the two automata

Claimed field tiles SHALL be ineligible for urban growth, and city tiles SHALL be ineligible for field spread — symmetric precedence. Once a tile is claimed by either automaton it SHALL remain that automaton's zone permanently for as long as its owner holds the territory: a tile's land-use (`Field` or `Urban`) SHALL NOT revert to wild through senescence or recession. Land SHALL change zone ONLY through conquest (which keeps the type for the new owner, per tile-damage) or when the whole nation is eliminated (territory reverts to neutral). Tiles that have never been claimed by either automaton remain wild and claimable by whichever reaches them first.

#### Scenario: A drained field is never paved over

- **WHEN** a field tile senesces to its initial farmland floor and the urban CA's best frontier tile is that tile
- **THEN** the city skips it — the tile is still `Field` and regrows as farmland

#### Scenario: Zones only trade hands by conquest

- **WHEN** a player's field or city tile is neither conquered nor the player eliminated
- **THEN** the tile keeps its land-use zone indefinitely regardless of crop or population decline
