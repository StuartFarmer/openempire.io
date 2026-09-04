# Spec delta: tribal-buildings (rework-persistent-tiles-and-burn)

Conquest no longer deletes captured plots. Every plot on conquered ground is
captured by the new owner and burns in place (per tile-damage), rather than a
fraction being razed out of existence.

## REMOVED Requirements

### Requirement: Conquest razes part of the district

**Reason**: Worked land is now permanent and conquest is a turnkey spoil — captured plots transfer to the new owner and burn in place instead of a probabilistic fraction being destroyed. Deleting the nucleus would erase the tile's type, which contradicts "every conquered tile keeps its type."

**Migration**: Remove the `capturedPlotRazeChance` roll from the conquest path in `PlayerExecution.ts` (the `TribalStructure` owner-changed loop): every non-`DefensePost` structure on conquered ground is `captor.captureUnit(u)`, never `u.delete()`. The captured tile is burnt through combat tile-damage (per tile-damage) and shows the fire effect. `capturedPlotRazeChance` stays DEFINED in `FoodConfig` (dormant) but no longer governs conquest. `DefensePost` deletion on conquest is unchanged.

## ADDED Requirements

### Requirement: Captured plots are burnt, not razed

When territory holding a tribal plot changes hands through conquest, the plot (Settlement or Farmland nucleus) SHALL transfer to the conqueror and its tile SHALL be burnt (combat tile-damage + fire effect), never deleted. The plot's tile SHALL keep its land-use type and regrow as the conqueror's own once healed (per tile-damage).

#### Scenario: Conquest captures and burns a district

- **WHEN** a player conquers a farm district's plots
- **THEN** the plots transfer to the conqueror, every tile burns for the heal duration, and the district regrows as the conqueror's farmland — no plot is deleted

#### Scenario: DefensePosts are still destroyed

- **WHEN** a conquered tile holds a DefensePost
- **THEN** the DefensePost is destroyed on capture as before (only tribal economy plots persist-and-burn)
