# Spec: food-economy

Housing follows the grown city (design.md D4); food loses its build-currency
role.

## MODIFIED Requirements

### Requirement: Population follows one logistic toward min(food, housing)

(Amended: the housing term only.) Population SHALL move toward `target = min(productionMilli / idleConsumptionMilli, housing)` where `housing = housingBase + cityTiles × popPerDensity` (city-growth spec). All logistic behavior — growth rate, faster decline with an empty granary, the milli-credit accumulator, `maxTroops = housing`, the exact-zero death rule — is unchanged from simplify-food-economy.

#### Scenario: The city ceiling follows demand

- **WHEN** a fed player's population presses housing and the city grows a tile
- **THEN** housing rises by `popPerDensity` and the logistic resumes toward the new ceiling

### Requirement: One national food pool

(Amended: purchases only.) The pool mechanics are unchanged (production in, consumption out, buffer-then-famine, `granaryBase + granaryPerFarm × farms` cap), but nothing draws the pool except eating: structures are seed-gated and free (tribal-buildings spec), so food is purely the famine buffer.

#### Scenario: Food buys time, not buildings

- **WHEN** a player banks a full granary
- **THEN** the only thing it changes is how long the population survives a production collapse
