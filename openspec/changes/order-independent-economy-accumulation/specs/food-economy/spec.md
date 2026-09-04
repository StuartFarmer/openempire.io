# Spec delta: food-economy (order-independent-economy-accumulation)

`Food stock is deterministic integer state` already required "no floating-point
accumulation", but the district loop in `foodTick` was summing each tile's yield
and storage capacity as floats and flooring only at the end. That is a violation
of the existing requirement, not a new rule — but it also has a consequence the
requirement never spelled out: float addition is not associative, so a district's
total depended on the order its tile set happened to be yielded in, and no
producer other than that exact traversal could reproduce it.

This states where the rounding happens, so the totals are a property of the tile
SET.

## MODIFIED Requirements

### Requirement: Food stock is deterministic integer state

Each player SHALL have a food stock held as integer state (no floating-point accumulation), updated once per tick in a fixed order: production → consumption → storage overflow/decay → growth/starvation. All rates SHALL be named knobs in `Config.ts` under a single `food` block. Where a total is accumulated over a SET of tiles — a district's production, a district's storage capacity — each tile's contribution SHALL be rounded to integer milliunits BEFORE it is added, so the total is a function of the set and not of the order the set is traversed in. A total SHALL NOT be reached by summing floating-point per-tile terms and rounding at the end.

#### Scenario: Determinism across clients

- **WHEN** the same seeded game runs on two clients
- **THEN** every player's food stock is identical on both at every tick

#### Scenario: A district total does not depend on traversal order

- **WHEN** a district's production and storage capacity are accumulated over its tilled tiles in two different orders
- **THEN** both orders yield exactly the same integer totals
