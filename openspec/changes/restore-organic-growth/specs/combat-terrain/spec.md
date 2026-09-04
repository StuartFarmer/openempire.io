# Spec: combat-terrain

Continuous terrain in the conquest ORDER, and absolute altitude in cost
(design.md D5). Zero new knobs.

## ADDED Requirements

### Requirement: The conquest priority reads continuous terrain

`AttackExecution`'s tile-ordering priority SHALL replace its Plains/Highland/Mountain factor (1 / 1.5 / 2) with the continuous `1 + 2·magnitudeN + wetnessN` (`magnitudeN = magnitude/31`, `wetnessN = (humidity + water)/510`), so front shape varies within terrain bands: advances flow through low, dry ground and lag on hills and wet forest. Measured motivation: 93.4% of verdantia land falls in the single Highland band, so the banded factor produced circular fronts.

#### Scenario: Fronts flow through the lowlands

- **WHEN** an attack front spans a valley and a ridge of the same vanilla terrain class
- **THEN** the valley tiles are conquered earlier on average than the ridge tiles

## MODIFIED Requirements

### Requirement: Attack cost and speed read continuous slope and wetness

(Amended: the slope input.) The slope input to the cost/speed factors SHALL be `magnitudeN(target) + climb` — absolute altitude plus the uphill-only delta — instead of climb alone, because generated maps are smooth at tile scale (81% of adjacent deltas are zero) and a delta-only term never fires. All other behavior of this requirement (wetness term, defender factors untouched, `kSlope = kWet = 0` degrading to flat vanilla) is unchanged.

#### Scenario: High ground is expensive to take, not just to climb into

- **WHEN** an attacker conquers a high-magnitude tile from equally high ground
- **THEN** the tile still costs more than a lowland tile (absolute term), and attacking it from below costs more again (climb term)
