# Spec: supply-field

## REMOVED Requirements

### Requirement: Military supply quality field and war supply attrition

**Reason**: A hidden BFS field the player could not see, adding one of three overlapping death channels that made battles unreadable. Spatial cost of war is now carried entirely by vanilla per-tile attrition with continuous terrain (combat-terrain spec).
**Migration**: `SupplyField.ts`, `warSupplyAttrition`, `supplyRadius`/`supplyDecayPower`/`supplyRefreshTicks`, and the front-quality probe are deleted. Attacks lose troops only through `attackLogic` per-tile losses.

#### Scenario: Distance costs tiles, not a hidden field

- **WHEN** an army pushes far from home
- **THEN** its losses are exactly the per-tile combat costs of the ground crossed — no additional distance-based bleed exists
