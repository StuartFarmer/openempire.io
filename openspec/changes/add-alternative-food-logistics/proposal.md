## Why

The alternative sandbox needs a playable economy constraint so expansion does not fill the board from one click. Food should act as logistics energy: actions get more expensive as they operate farther from settlements.

## What Changes

- Add a Milestone 1 plan for global food, settlement-distance logistics cost, and food-constrained wilderness expansion on `#alternative`.
- Add a Milestone 2 plan for farms and additional settlement buildings, but defer implementation.
- Keep the current OpenFront-style expansion mechanic for Milestone 1.
- Do not add magnet hold, drag campaigns, local food storage, networking, AI, or combat changes in this initiative.

## Capabilities

### New Capabilities

- `alternative-food-logistics`: Food production, food spending, settlement-distance cost, and food-constrained expansion for the alternative sandbox.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/games/alternative`, `src/client/AlternativeSandboxPage.ts`, focused tests.
- APIs: adds alternative-mode helpers and runtime globals/layers; no base OpenFront engine API changes.
- Dependencies: no new dependencies.
