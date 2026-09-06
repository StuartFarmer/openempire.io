# LeanFront Simple Final Fixes

## RED → GREEN evidence

- Capture attack: the new post-capture and concurrent-attack regressions first exposed a commitment larger than surviving city stock; `SimpleEconomy` now shares the surviving-city budget across new attacks before combat.
- Simple nation planner: an empty seed bank prevented every candidate from being considered.  The planner now retains its candidate/construction path for simple plots and asks the existing `canBuild` food gate; replacement after raze is covered too.
- Worker actions: the worker regression now proves successful plot actions produce no immediate success, are confirmed after the authoritative tick, and duplicate same-tile actions yield one success and one rejection.
- Lifecycle and frame: the economy provider is identity-cleared, and worker post-tick reconciliation updates the simple projection without another growth or attack debit.
- Bounds and spawn: signed-frame capacities are capped, GPU-ineligible stocks use the CPU growth path, and cramped spawns fall back deterministically to the nearest owned legal farm tile.
- Plot delta: every current structure tile is touched on the throttled scan, so a city/farm replacement on one tile re-emits its changed plot value.

## Decisions

- Kept the core `GameRunner` authoritative: actions remain the existing intents; the worker only delays feedback until it observes resulting core state.
- Kept rich seed behavior unchanged.  The zero-seed exception applies only when `simplePlotEconomy()` is active and still goes through the existing food affordability check.
- The post-tick pass reuses the simple economy’s reconciliation logic with growth and attack charging disabled, preserving the preceding production statistic.

## Validation

- Focused runtime/economy/worker/AI suites, full `npm test -- --run`, `npm run lint`, `npm run build-prod`, `npx tsc --noEmit`, `git diff --check`, and strict OpenSpec validation were run after the final edits.

## Follow-up re-review

- RED: preflight success could precede a real `ConstructionExecution`, stale deleted plots could remain in the same frame, and global urban providers crossed concurrent games.
- GREEN: build actions wait one core execution tick unless their plot already exists; duplicate razes claim one deletion; sync prunes inactive units; providers are `WeakMap<Game, …>` scoped; Float64 plot sextets preserve overflow exactly; GPU batches fall back for non-u32 records.

## Final ownership and transport pass

- Raze preflight now rejects an already marked plot, so a second-tick command cannot consume food or inherit the first command's acceptance.
- Player aggregate frames use Float64 sextets/rows, preserving whole values above signed-Int32 range.
- Post-tick growth metadata is retained only for the same unit owner; a captured plot starts at zero displayed growth.
