## Why

The shell currently equates the complete match experience with the worker-backed OpenFront path, so GPU-backed game variants mount as manual field experiments without automatic startup, spawning, nations, match controls, or feedback. The game experience must instead be universal for every playable variant while each variant keeps its own simulation backend and authority model.

## What Changes

- Introduce one backend-neutral game-experience contract covering match startup, spawn placement, camera transition, nation presentation, controls, statistics/history, defeat and rejection states, and map interaction feedback.
- Route both worker-backed and GPU-backed games through the same shell experience while preserving their separate simulation loops, state ownership, and command transports.
- Require every selectable game variant to satisfy the complete contract; a system that cannot satisfy it is not exposed as a game variant.
- Apply the contract to OpenFront Live, LeanFront, LeanFront Simple, Conquest, Empire, and later registered games.
- Reclassify Terrain as rendering infrastructure and keep non-match simulations such as Grazing and Settlement outside the playable game-variant selector.
- Generalize existing OpenFront-only UI gates and state consumption instead of cloning the HUD for each backend.

## Capabilities

### New Capabilities

- `game-experience-contract`: Defines the universal lifecycle, presentation, controls, feedback, backend boundary, and eligibility rules for every selectable game variant.

### Modified Capabilities

None.

## Impact

- `src/client/GameShellPage.ts`: select and render any registered game through the common match experience rather than gating it on a worker-backed live-game lookup.
- Game registration and field-system metadata: distinguish playable games from studies and declare the backend-specific mappings needed by common presentation.
- Worker-backed OpenFront/LeanFront integration: adapt existing worker frames and commands without changing their simulation.
- GPU-backed LeanFront Simple/Conquest/Empire integration: expose bounded match state and commands without introducing a CPU state mirror.
- Shell tests: cover universal startup, spawn, controls, feedback, and selector eligibility across both backend families.
- No new runtime dependency and no change to simulation rules or authority.
