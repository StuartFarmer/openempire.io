# tribal-buildings Specification

## Purpose
TBD - created by archiving change rework-persistent-tiles-and-burn. Update Purpose after archive.
## Requirements
### Requirement: Captured plots are burnt, not razed

When territory holding a tribal plot changes hands through conquest, the plot (Settlement or Farmland nucleus) SHALL transfer to the conqueror and its tile SHALL be burnt (combat tile-damage + fire effect), never deleted. The plot's tile SHALL keep its land-use type and regrow as the conqueror's own once healed (per tile-damage).

#### Scenario: Conquest captures and burns a district

- **WHEN** a player conquers a farm district's plots
- **THEN** the plots transfer to the conqueror, every tile burns for the heal duration, and the district regrows as the conqueror's farmland — no plot is deleted

#### Scenario: DefensePosts are still destroyed

- **WHEN** a conquered tile holds a DefensePost
- **THEN** the DefensePost is destroyed on capture as before (only tribal economy plots persist-and-burn)
