# Painted economy verification

Verified on 2026-09-06. This records the implemented initial sandbox preset, not
final gameplay balance. See [the rules and tuning map](../README.md#painted-economy-sandbox).

## Scope

The selected SimpleFront runtime uses manually purchased complete farm/city tiles,
global food, sigmoid food/recruitment refill, and upfront dispatch fees. Idle,
attacking, transported, and queued-landing troops share one population capacity.
There is no selected food consumption, worker allocation, autonomous plot growth,
or logistics simulation. Opponents spawn, replenish, and defend, but active AI
building and military orders remain deferred.

Gameplay implementation and its tests are inside `simplefront/`. Root gameplay
was not edited for this implementation. Existing root picker integration and
unrelated dirty files were preserved. No dependencies were added; no commits,
server restarts, or deployment were performed.

## Automated evidence

Commands below run from the repository root.

| Check                                                                                   | Result                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------- |
| Execution-start copied test suite                                                       | 54 tests across 6 suites passed          |
| Added local combat/translation tests, before adapting their behavior                    | 48 tests across 5 suites passed          |
| `npm --prefix simplefront test -- --reporter=dot`                                       | 142 tests across 20 suites passed        |
| `npm --prefix simplefront run typecheck`                                                | Passed                                   |
| `npm --prefix simplefront run lint -- src tests`                                        | Passed                                   |
| `npm --prefix simplefront run build`                                                    | Passed; Vite large-chunk warning remains |
| `npm test -- tests/GameShellExperience.test.ts tests/OpenFrontRuntimeIsolation.test.ts` | 35 tests across 2 suites passed          |
| `openspec validate simplefront-painted-global-economy --strict`                         | Passed                                   |
| `git diff -- src/core src/client/games/openfront`                                       | Empty                                    |

Coverage includes zero-resource recovery, capacity loss and capture, exact food
debits, fractional refill, two-plot spawning and rejected rerolls, partial and
competing paint purchases, dispatch rejection without diplomacy mutation,
transport landing handoffs and retreats, deterministic state hashing, retained
combat traces, passive no-input runtime, and client preview/release/cancel.

The worker integration test runs the actual copied worker, runner, selected
configuration, and simulation core using a small local map fixture. It verifies
authoritative paint results and capacity snapshots without selected supply or
climate observer work. The independence test checks local source/asset/settings
boundaries. Legacy copied economy tests remain explicit non-painted fixtures.

## Browser smoke test

An isolated Chromium session used the existing server on port 9000 and the actual
SPQR map. The complete sequence passed without a page error:

1. Root game picker selected SimpleFront at `/simplefront/#shell`.
2. Spawning produced one city, one farm, and the expected initial capacities.
3. A four-tile mouse drag previewed without purchasing. Release purchased two
   farms for 4000 food and reported an insufficient-food stop. Food capacity
   increased from 10000 to 20000.
4. A land dispatch moved troops from idle into deployment; the HUD showed both
   pools and their shared total.
5. Restart cleared the plots and restored the unspawned resource state.
6. Selecting OpenFront returned to `/#shell`.

## Implementation notes and limits

- Prices, rates, opening balances, and independent capacity functions live in
  `src/core/configuration/PaintedEconomyConfig.ts`.
- Named snapshots also required changes to existing player-state, update-diff,
  and renderer types beyond the plan's abbreviated file map.
- An inert supply-rendering conduit remains in the copied renderer; it is hidden
  and receives no selected supply calculations. Dormant legacy code was not
  broadly deleted.
- Tests and smoke checks are evidence for this local implementation, not a claim
  of exhaustive multiplayer, long-match balance, or cross-browser testing.
- Active AI, plot conversion/demolition controls, nonlinear capacity tuning, and
  compatibility with old SimpleFront turn logs are outside this change.

Implementation was performed directly in the existing checkout at the user's
request. The OpenSpec task checklist records delivery; the original detailed
plan retains its illustrative commands and conditional commit checkpoints.
