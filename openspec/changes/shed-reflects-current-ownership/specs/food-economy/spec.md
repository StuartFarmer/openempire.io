# Spec delta: food-economy (shed-reflects-current-ownership)

The local-storage requirement says storage lives on field tiles and that
"captured or newly claimed field tiles start with zero capacity and zero stock",
but it never says what becomes of the PREVIOUS owner's stock when ground changes
hands. The answer was whatever the shed's storage representation happened to do:
a per-player Map kept the lost tile listed, so the orphaned stock survived until
that player's next refresh. This states the rule instead.

## MODIFIED Requirements

### Requirement: Storage is local and grown by stability

Barn-based storage SHALL be removed. Each FIELD TILE SHALL carry local storage capacity that rises with its tenure (per tile-stability) from zero — a field's granary emerges from its old core tiles; local surplus banks into the district's capacity and local shortfall draws it down first. Spoilage/decay applies to local stocks as it did to the global stock. Captured or newly claimed field tiles start with zero capacity and zero stock.

A player's shed's PER-TILE COVERAGE SHALL reflect current ownership: a tile belongs to whichever player's shed most recently flooded it, so a player SHALL NOT retain coverage of ground it has lost merely because its own refresh has not yet come round. Stock held in a cell the player no longer covers SHALL be released rather than retained indefinitely.

District HEADCOUNTS, by contrast, are sampled at each player's own shed refresh. The release of an orphaned cell's stock therefore completes at the losing player's next refresh — at most `supplyRefreshTicks` later — not instantaneously. Until then the cell is still a member of one of that player's feeding regions and its stock is still drawable. This is the behaviour that shipped; tightening the release to the moment coverage is lost would be a further change with its own re-baseline (see Open Questions in `design.md`).

#### Scenario: Coverage of lost ground is given up immediately

- **WHEN** a player loses the ground under one of its farm cells to a conqueror, and the conqueror's food-shed floods that ground
- **THEN** the losing player's shed no longer reports coverage of that tile, without waiting for its own refresh

#### Scenario: Stock on lost ground is released at the next refresh

- **WHEN** the ground under a player's farm cell has changed hands and been taken into the conqueror's shed
- **THEN** the losing player's stored field stock for that cell is released no later than that player's next shed refresh, and does not persist beyond it

#### Scenario: A cell still held keeps its stock

- **WHEN** a player's shed is refreshed and a farm cell is still inside it
- **THEN** that cell's stored stock and capacity carry over untouched
