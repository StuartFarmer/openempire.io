# Spec: food-economy

## ADDED Requirements

### Requirement: Food economy activates only on layered maps
The food economy (production, storage, consumption, food-gated growth) SHALL be active if and only if the game map has layer data (`hasLayers()`). On unlayered maps every vanilla behavior — including population growth — SHALL remain byte-identical to today.

#### Scenario: Layered map
- **WHEN** a game starts on a map with a layers sidecar
- **THEN** players have a food stock and population growth follows the food rules

#### Scenario: Classic map
- **WHEN** a game starts on a map without layers
- **THEN** no food state exists and population follows the vanilla growth curve

### Requirement: Food stock is deterministic integer state
Each player SHALL have a food stock held as integer state (no floating-point accumulation), updated once per tick in a fixed order: production → consumption → storage overflow/decay → growth/starvation. All rates SHALL be named knobs in `Config.ts` under a single `food` block.

#### Scenario: Determinism across clients
- **WHEN** the same seeded game runs on two clients
- **THEN** every player's food stock is identical on both at every tick

### Requirement: Production comes from fertile owned land and Farmland
Base production per tick SHALL be proportional to the sum of the crop-layer bytes of the player's owned tiles (maintained incrementally on tile capture/loss, never by full-map scans), plus each Farmland's contribution scaled by the fertility of its tile. A tile's contribution SHALL move to the conqueror when territory changes hands.

#### Scenario: Fertile land produces more
- **WHEN** two players own equal tile counts but player A's tiles have higher crop bytes
- **THEN** player A's per-tick production is higher

#### Scenario: Conquest transfers production
- **WHEN** player A captures fertile tiles from player B
- **THEN** A's production rises and B's falls by the same fertility-derived amount

#### Scenario: Farmland scales with local fertility
- **WHEN** identical Farmland is built on a high-fertility tile and a low-fertility tile
- **THEN** the high-fertility Farmland contributes more production

### Requirement: Storage caps the stock and stored food decays
Food above the player's storage cap SHALL be lost the tick it is produced (surplus overflow). The stored stock SHALL decay each tick by a configured fraction (integer floor). Storage cap derives from Barns per the `tribal-buildings` capability.

#### Scenario: Overflow is lost
- **WHEN** production would raise the stock above the storage cap
- **THEN** the stock equals exactly the cap afterward

#### Scenario: Decay
- **WHEN** a full barn sits untouched with zero production and zero consumption
- **THEN** the stock strictly decreases over time by the configured decay rate

### Requirement: Consumption scales with activity
Population SHALL consume food every tick at a base per-person rate; troops committed to attacks or in transit (boats) SHALL consume at a higher rate, and troops in active combat at a higher rate still. All three rates are knobs.

#### Scenario: Idle baseline
- **WHEN** a player has population P and no active attacks
- **THEN** consumption per tick is P × idle rate

#### Scenario: War is expensive
- **WHEN** the same player commits half its troops to an active attack
- **THEN** total consumption per tick strictly exceeds the idle baseline

### Requirement: Food surplus drives growth, deficit starves
When production plus stored food covers consumption, population growth SHALL scale with surplus (bounded by the Settlement-derived population cap). When consumption exceeds production, the shortfall SHALL drain storage first; once storage is empty the remaining deficit SHALL kill population proportionally (starvation), on top of normal combat losses.

#### Scenario: Abundance grows population
- **WHEN** production comfortably exceeds consumption and population is below the cap
- **THEN** population increases each tick

#### Scenario: Cap binds
- **WHEN** population reaches the Settlement-derived cap
- **THEN** growth stops regardless of surplus

#### Scenario: Storage buffers a deficit
- **WHEN** consumption exceeds production but storage holds enough to cover the gap
- **THEN** storage drains and no one starves that tick

#### Scenario: Starvation
- **WHEN** consumption exceeds production and storage is empty
- **THEN** population decreases that tick by the configured starvation response to the deficit
