# Spec: tile-damage

## REMOVED Requirements

### Requirement: Combat scars tiles (damage plane, healing, frozen growth)

**Reason**: Invisible per-tile damage froze farms and growth on conquered land, making conquest mysteriously worthless — a major contributor to "strange battle mechanics."
**Migration**: The damage plane, `combatTileDamageMilli`/`tileDamageHealMilli`, the damage render channel, and every damage gate are deleted. Conquered land is immediately usable; the war-scorch outcome survives only as structure razing (`capturedPlotRazeChance`, tribal-buildings spec).

#### Scenario: Clean ground after battle

- **WHEN** a tile changes hands in combat any number of times
- **THEN** it carries no damage state and accepts structures and production immediately
