## Why

LeanFront Simple currently imitates conquest in a separate GPU field simulation, so its expansion, combat timing, fronts, borders, and nation behavior diverge from OpenFront Live. It must use the actual Live simulation and vary only the economy.

## What Changes

- **BREAKING** Move `leanfront-simple` from the field-game backend to the worker-backed Live `GameRunner` backend.
- Reuse the existing `AttackExecution`, `AttackImpl`, retreat, ownership, neutral exploration, nation, border, spawn, camera, and match-lifecycle paths without a mode-specific combat implementation.
- Add a `LeanFrontSimpleConfig` and runtime that replace only the rich urban/food economy with integer Gompertz growth on player-painted Settlement and Farmland plots.
- Make Settlement and Farmland levels stack capacity linearly, use flat food costs, and never spread automatically.
- Treat people as troops, remove food consumption by people, and charge food for building, upgrading, razing, and active attacks.
- Accelerate the compact plot-growth calculation with WebGPU while retaining the same integer CPU calculator as the authoritative fallback and parity oracle.
- Remove the obsolete LeanFront Simple pressure/diffusion backend once its playable registration has moved.

## Capabilities

### New Capabilities

- `leanfront-simple-live-mode`: Defines the shared Live runtime boundary, painted-plot economy, integer growth, food action costs, nation behavior, presentation parity, and CPU/GPU fallback contract for LeanFront Simple.

### Modified Capabilities

None. Existing OpenFront, original LeanFront, farm-growth, urban-core-growth, tribal-buildings, and tile-damage requirements remain unchanged outside the new ruleset.

## Impact

- Core ruleset/config selection, player economy tick selection, build validation, spawn initialization, and plot lifecycle.
- Live worker protocol and command handling for city, farm, and raze actions.
- LeanFront Simple runtime, compact WebGPU economy calculator, and CPU fallback.
- Game registry and shell presentation mapping.
- Core, GPU parity, worker protocol, shell experience, and OpenFront regression tests.
- No new runtime dependency and no change to map assets or manifest nation coordinates.
