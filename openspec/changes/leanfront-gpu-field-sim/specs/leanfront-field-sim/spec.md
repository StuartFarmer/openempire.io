# Spec delta: leanfront-field-sim (leanfront-gpu-field-sim)

## ADDED Requirements

### Requirement: The simulation state is GPU-resident fields

LeanFront's per-tile simulation state SHALL live in GPU buffers and be advanced by compute passes. The fields are: tile OWNER, TROOPS, farm MATURITY, urban DENSITY, tile TENURE, tile DAMAGE, PLOT TYPE, and the derived food-shed and military-supply distance fields.

No field SHALL be uploaded as a mirror of CPU-held state, and no field SHALL be read back per tile during normal play. A field that both sides maintain is two copies of one truth, and keeping them in step is what the mirrored design failed at.

#### Scenario: No per-tile readback in the tick loop

- **WHEN** a LeanFront game advances one tick
- **THEN** no whole-field buffer is copied from the GPU to the CPU

#### Scenario: Structures are a field, not a list

- **WHEN** a Farmland, Settlement or City occupies a tile
- **THEN** it is represented as a value in the plot-type field, not as an entity the CPU tracks per unit

### Requirement: The CPU sends intents, never consequences

The CPU→GPU contract SHALL carry only what the GPU cannot derive: per player per tick, whether the player is ALIVE, its ATTACK TARGET and COMMITMENT, and any BUILD INTENTS issued (tile plus unit type). One-off placements with no derivable rule — the spawn kit — SHALL be brush stamps.

The CPU SHALL NOT send computed consequences of game rules. Where an effect follows from state the GPU already holds, the GPU SHALL derive it. Ownership change, the conquest reseed, urbanization clearing a field tile, and razing are all derivable and SHALL NOT be uploaded as effects.

#### Scenario: Conquest is derived, not sent

- **WHEN** a tile changes owner
- **THEN** the GPU applies the crop loss and the field-zone reseed itself, from the ownership change and the zone already resident, without being told what conquest means

#### Scenario: A build intent names a tile, not a result

- **WHEN** a player builds a Farmland
- **THEN** the CPU sends the tile and the unit type, and the GPU applies cost, placement legality and the resulting field change

### Requirement: The GPU returns aggregates sized by districts, not by area

The GPU→CPU contract SHALL carry only per-player and per-district scalars: population, food stock, production, storage capacity, tiles owned, and the placement draws' winners. These SHALL be indexed by a dense district slot, never by tile ref.

A tile-indexed accumulator is grid-sized; on a 2048×1024 map that is 8 MB per accumulator, so "read back the small aggregates" would cost more than the fields it replaces. Measured district count peaks at 617 on the largest map at full conquest.

#### Scenario: Aggregate readback does not scale with the map

- **WHEN** the same game runs on a larger map with the same number of districts
- **THEN** the bytes read back per tick are unchanged

### Requirement: Troop transport over water is a field

Moving troops across water SHALL be a field payload — a player id and a troop count per tile — advanced toward its destination by shader rules, not a transport-ship entity with per-unit state.

#### Scenario: A crossing needs no entity

- **WHEN** a player sends troops across water
- **THEN** the crossing is carried in the field and resolves on arrival, with no per-ship record on the CPU

### Requirement: LeanFront drops alliances and vehicle entities

Alliances, transport-ship entities and train entities SHALL NOT exist in LeanFront's ruleset. This is a deliberate simplification of the fork, not a defect, and it does not affect OpenFront's ruleset.

#### Scenario: OpenFront is unaffected

- **WHEN** a game is started under the `openfront` ruleset
- **THEN** alliances, transport ships and trains behave exactly as before

### Requirement: Determinism is per-device, and reductions stay order-independent

A LeanFront game SHALL be reproducible from its seed and intents ON A GIVEN DEVICE. It SHALL NOT be required to produce bit-identical results across GPU vendors: WGSL specifies only 2.5 ULP accuracy for division and wider tolerances for transcendentals, so cross-device bit-equality is not available to a float field simulation.

Order-independence remains REQUIRED and is stricter than the CPU needed. Any reduction over a set of tiles SHALL be integer, because a floating-point `atomicAdd` completes in nondeterministic order and therefore varies RUN TO RUN on the same device — which is not a rounding difference but an unreproducible game.

#### Scenario: The same seed replays on the same machine

- **WHEN** a seeded LeanFront game is run twice on one device with the same intents
- **THEN** both runs produce identical results

#### Scenario: A reduction does not depend on completion order

- **WHEN** thousands of threads accumulate into one district total
- **THEN** the total is the same regardless of the order they complete in

### Requirement: LeanFront is verified on a GPU host

LeanFront's balance harness and its GPU-dependent tests SHALL run on a host with a real WebGPU adapter. Node has none, so these SHALL run under headless Chromium, sharing the same run core as the Node host so figures stay comparable.

#### Scenario: The sweep runs on a GPU

- **WHEN** the sweep driver is asked for a LeanFront sweep
- **THEN** it runs each game in a browser host with a real adapter, and reports the adapter alongside the results
