# Task 1 Report: Preserve previous-tick aggregates during field updates

## Status

Implemented and verified.

## Changes

- Added generated `sim/tick` single-dispatch pass containing only the tick increment.
- Kept scalar reset generation in a separate generated `sim/zero` pass.
- Changed `runTick` ordering to tick advance, stock updates and swaps, scalar reset, then reductions.
- Added regression coverage for pass ordering and separation of tick/reset shader code.
- Updated existing phase-order assertions for the new schedule.

The brief's sample `pass:reduce:total` was normalized to the repository's established `pass:reduce/total` naming convention. The sample's `value` layer name is reserved by the compiler, so the equivalent test fixture uses `amount` while retaining the same behavior.

## TDD evidence

- Before implementation, the two new tests failed: `sim/tick` was absent and the old schedule began with `sim/zero`.
- After implementation, the focused suite passed.

## Verification

- `npm test -- tests/FieldDynamics.test.ts`: 48 passed.
- `npm test`: 159 test files and 1612 tests passed.
- `git diff --check`: clean.

## Self-review

No unrelated files or abstractions were added. Scalar reset expressions remain identical to the prior implementation; only their placement and pass ownership changed.
