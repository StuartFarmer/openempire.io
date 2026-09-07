## ADDED Requirements

### Requirement: Clearly passive opponents until AI adaptation

The first painted-economy release SHALL be a labeled sandbox. Spawned nonhuman opponents SHALL receive the same kit, resource rules, ownership, and normal combat defense, but SHALL issue no autonomous construction, dispatch, or structure-deletion orders. The old Nation/Tribe economy planners SHALL NOT run for this selected ruleset. Active AI adaptation SHALL remain outside this change.

#### Scenario: Passive nation retains its farm

- **WHEN** a passive spawned opponent runs past the old tribe deletion cooldown
- **THEN** it has issued no construction, attack, or deletion orders and its kit remains unless the human or territorial rules changed it

### Requirement: No hidden legacy economy execution

Neither core updates nor shell observers for SimpleFront SHALL execute inherited food-distribution, workforce, seed-award, maturity, urban-growth, tenure, or supply-field computations. Unrelated dormant source files and legacy fixtures SHALL NOT be deleted merely to satisfy this requirement.

#### Scenario: Inspecting the map does not compute supply

- **WHEN** a player runs the sandbox and inspects tiles and resource panels
- **THEN** displayed values come from plots/global resources and do not invoke old food-shed or military supply computations

### Requirement: Independent application and regression boundary

Implementation SHALL stay inside SimpleFront's copied application and its tests/resources, apart from planning documentation. It SHALL add no root game-code imports or new dependency. Root OpenFront gameplay, launch routing, separate assets, and settings isolation SHALL remain unchanged. Tests SHALL exercise the actual SimpleFront configuration separately from retained legacy test configurations.

#### Scenario: Editing SimpleFront does not modify OpenFront

- **WHEN** the painted economy is selected through the existing game picker
- **THEN** it loads from the independent SimpleFront app, while selecting OpenFront still runs the unchanged root game
