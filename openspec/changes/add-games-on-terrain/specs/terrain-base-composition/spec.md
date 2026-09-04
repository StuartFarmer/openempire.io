# terrain-base-composition

## ADDED Requirements

### Requirement: Terrain-derived fields are readable by a game's layers

A derivation field MAY be marked exposed. Exposed derive fields SHALL join the
per-tick layer registry as READ-ONLY inputs, so a composed game's `layers/*.wesl`
read them through the same API as a `layers.bin` plane (`layers::<name>::val(i)`,
`::at(x, y)`, and the neighbor reductions). Writing an exposed terrain field
from a game layer, brush, or init SHALL be a compile diagnostic.

#### Scenario: A game layer reads a terrain field

- **WHEN** a game layer reads `layers::temperature::val(i)` and the composed terrain base exposes `temperature`
- **THEN** it resolves to the terrain derivation's temperature buffer (the real seasonal climate), not a re-derived approximation

#### Scenario: Writing a terrain field is rejected

- **WHEN** a game declares a layer, brush, or init that targets an exposed terrain field
- **THEN** the compiler reports it as read-only (terrain-derived), before linking

### Requirement: The terrain derivation carries its own uniform

A derivation's uniform SHALL be nameable, and the terrain base SHALL use a name
distinct from the generated game `Params` (`P`), so a composed game keeps `P`
for its own param sliders. The compiled kernel SHALL carry both uniforms; the
terrain passes bind the terrain uniform and the game's layers/views bind `P`.

#### Scenario: A game keeps its own params alongside terrain

- **WHEN** a game with its own params is composed onto terrain
- **THEN** the game's params compile to `P` (its sliders) and the terrain derivation reads its worldgen `Params` from a separate uniform, with no collision

### Requirement: A game is composed onto terrain, implicitly

The viewer SHALL treat terrain as the always-on base: it composes the shared
terrain derivation into every selected game (merging the terrain derive stage,
inputs, prep, and exposed fields) without the game declaring a base. Selecting
"no game" SHALL yield the terrain base alone. A game layer name that collides
with a terrain field SHALL be a compile diagnostic.

#### Scenario: Terrain always derives, the game rules on top

- **WHEN** a game is selected in the viewer
- **THEN** the terrain derivation runs (climate/water/biome) and the game's layers tick reading those fields, in one kernel, without the game manifest referencing terrain

#### Scenario: No game selected

- **WHEN** no game (the world) is selected
- **THEN** the viewer shows the terrain base alone, exactly as the standalone terrain view does today
