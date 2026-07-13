# Spec delta: tribal-buildings (add-urban-core-growth)

## MODIFIED Requirements

### Requirement: Painted plots — Farmland and Barn kept, Settlement replaced

The player SHALL still paint **Farmland** (food) and **Barn** (storage) plots exactly as before — the food economy is unchanged. Only the **Settlement** plot is removed: the residential city is no longer painted, it _sprawls itself_ as a density field from a founded Core (see `urban-core-growth`), and that sprawl — not settlements — sets the population cap.

#### Scenario: Farms and barns are still painted

- **WHEN** the player is on a layered map with a founded city
- **THEN** the build bar offers Farmland and Barn (not Settlement), and painting them produces/stores food as before

#### Scenario: The city is not painted

- **WHEN** the player wants to grow the city
- **THEN** there is no Settlement to place; the city sprawls on its own from the Core, fed by the player's farms
