## Why

Food-gated instant expansion is too binary: tiles either claim immediately or not at all. The alternative game needs movement speed across tiles, where food is energy, troops are throughput, and terrain/logistics determine work required.

## What Changes

- Replace instant frontier claims in the alternative expansion system with movement-work jobs.
- Model capture as a consequence of troop movement into a tile.
- Spend food into movement work each tick, capped by troop throughput and logistics friction.
- Use terrain, settlement distance, and optional elevation slope to determine movement work.
- Keep the current click-to-expand UX and OpenFront-style frontier selection.
- Defer true per-tile troop storage, magnet hold, drag campaigns, local food routing, and combat.

## Capabilities

### New Capabilities

- `alternative-movement-work-expansion`: Movement-work based expansion where food buys work, troops define work throughput, and tiles capture when movement work completes.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/games/alternative`, `src/client/AlternativeSandboxPage.ts`, focused tests.
- APIs: adds alternative-mode movement job state/helpers; no base OpenFront engine API changes.
- Dependencies: no new dependencies.
- Relationship: builds on the current alternative food logistics work.
