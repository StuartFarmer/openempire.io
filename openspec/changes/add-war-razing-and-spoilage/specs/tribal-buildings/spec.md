# Spec delta: tribal-buildings (add-war-razing-and-spoilage)

## ADDED Requirements

### Requirement: Conquest razes part of the district

When territory holding a tribal plot changes hands through conquest, the plot SHALL be destroyed (razed) with a configured probability (default 0.5) instead of captured; surviving plots transfer as before. The roll SHALL be deterministic (identical outcome on every client for the same game). Razed plots SHALL show a brief fire animation over their tile as they burn down.

#### Scenario: War is not free income

- **WHEN** a player conquers a 20-plot farm district at the default raze chance
- **THEN** on the order of half the plots burn down and the rest transfer — rebuilding the remainder costs the conqueror food

#### Scenario: Deterministic razing

- **WHEN** the same seeded game runs twice
- **THEN** the same plots burn both times
