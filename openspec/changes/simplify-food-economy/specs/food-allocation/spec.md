# Spec: food-allocation

## REMOVED Requirements

### Requirement: The population-share allocation slider

**Reason**: An extra decision axis the playtester never used; the buffer-then-famine pool order (feed people from production, bank the surplus, draw the granary on shortfall) makes the split automatic and legible.
**Migration**: The `food_allocation` intent, `foodPopulationShare` state, `defaultPopulationShare` knob, and both allocation sliders (HUD and #shell) are deleted from Schemas, executions, and UI. en.json keys pruned.

#### Scenario: No slider, same outcome

- **WHEN** production exceeds consumption
- **THEN** people eat first and the surplus banks to the granary cap with no player input
