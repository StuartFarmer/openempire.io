# Spec: unified-layered-mode

## ADDED Requirements

### Requirement: Exactly one game mode

The game SHALL run the layered food-economy simulation on every map, unconditionally. The sim SHALL NOT contain a vanilla/classic economy path: no gold or troop accrual tick, no `startManpower`/`startingGold` initialization, no vanilla carrying-capacity formula, and no mode predicate (`hasLayers()` / `hasFoodEconomy()`) for mechanics to branch on. Player initialization SHALL seed population and starting food from `Config.food()` for every player type.

#### Scenario: Any map, same rules

- **WHEN** a game starts on any shipped map
- **THEN** players tick through the food/urban economy (`urbanTick`), receive no gold income, and their carrying capacity comes from the layered population formula

#### Scenario: No mode predicate

- **WHEN** core or client code is inspected for `hasLayers()` / `hasFoodEconomy()`
- **THEN** no such predicate exists on Game, GameMap, Player, GameView, or PlayerView

### Requirement: Map loading requires both sidecars

The map loader SHALL require every map to provide a decodable `layers.bin` and `terrain-colors.png` (with `layers: true` and `terrain_colors: true` in its manifest) and SHALL fail the load with a descriptive error when either is missing or malformed. There SHALL be no silent fallback to an unlayered or procedurally-shaded game.

#### Scenario: Complete map loads

- **WHEN** a map with both sidecars is loaded
- **THEN** the game starts with layer planes decoded and sidecar terrain colors attached

#### Scenario: Incomplete map fails loudly

- **WHEN** a map is missing `layers.bin` or `terrain-colors.png` (or the manifest flags)
- **THEN** loading throws an error naming the map and the missing artifact instead of starting a vanilla game

### Requirement: Full-resolution maps only

Maps SHALL load at full (Normal) resolution only. The map-size option (`GameMapSize`, the `map16x.bin` artifact, and the size selector UI) SHALL be removed from the baker, loader, schemas, and client. `map4x.bin` SHALL be retained solely as the pathfinding minimap (water/rail A*, WaterManager) — it is not a playable resolution and carries no layers. Smaller battlefields SHALL be authored as explicit maps.

#### Scenario: No size selection

- **WHEN** a singleplayer game is configured
- **THEN** no map-size choice exists and the loader fetches only `map.bin` plus the two sidecars

#### Scenario: Baker output

- **WHEN** `npm run gen-maps` runs
- **THEN** no `map16x.bin` is produced for any map, and `map4x.bin` is produced only as the pathfinding minimap

### Requirement: Every shipped map carries both sidecars

Every map folder under `resources/maps/` SHALL contain `layers.bin` and `terrain-colors.png`, with matching manifest flags, enforced by the map-consistency test suite.

#### Scenario: Consistency test enforcement

- **WHEN** `tests/MapConsistency.test.ts` runs
- **THEN** it fails if any shipped map lacks either sidecar or either manifest flag

### Requirement: Gold-economy units stay defined but dormant

Vanilla gold-cost units (City, Factory, Port, warships, nukes, defense posts, etc.) SHALL remain defined in `UnitInfo` with their gold costs, but SHALL NOT be buildable while no mechanism grants gold. They SHALL NOT appear in the build UI. Later ages reactivate them by assigning a payable `costResource` — not by re-adding a mode switch.

#### Scenario: Dormant units are unbuildable

- **WHEN** a player opens the build UI or the sim evaluates `canBuildUnitType` for a gold-cost structure
- **THEN** the unit is absent from the menu and unbuildable (players hold zero gold), while its `UnitInfo` definition remains intact
