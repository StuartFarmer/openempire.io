## Context

The accepted planning baseline is [the detailed design](../../../docs/superpowers/specs/2026-09-06-simplefront-painted-economy-design.md). The user approved proceeding to implementation planning; the design's section 5 values are the initial test preset, not a claim of balanced gameplay.

SimpleFront has its own copied core, assets, tests, settings, and worker app. `SimpleFrontConfig` currently inherits the old Config without overrides; its runtime is a no-op. The copied tree also contains dormant variants and legacy tests. This change must select the new economy for SimpleFront without importing root code or rewriting unrelated test fixtures.

## Goals / Non-Goals

**Goals:** global sigmoid food/troops, linear capacity, manual completed plots, food-paid dispatch, accurate ownership/deployment accounting, clear passive-opponent sandbox, and tests proving removal of logistics while preserving combat behavior.

**Non-goals:** active AI, new military mechanics, new dependencies, GPU resources, nonlinear capacity implementation, plot upgrades, demolition UI, activating gold units, root gameplay changes, or blanket deletion of legacy files.

## Decisions

### Core ownership, not a client provider

Add a small `PaintedEconomyConfig` definition and a core `PaintedEconomy` module. Use the existing Config/ruleset seam: copied base Config returns null for the new settings; `SimpleFrontConfig` returns the accepted preset. This is ruleset selection, not a map/layer-dependent second economy. Only SimpleFront is offered by this independent app's registry. Legacy copied fixtures can explicitly keep their existing Config, while new tests exercise the actual SimpleFront settings.

Keep food in the player's milli-food balance, new fractional credits/counts on the player, and existing troop pools authoritative. Do not store a second copy of food or per-plot resource stocks. Count plots incrementally at unit/tile lifecycle hooks. Reconcile capacity reductions before another order can spend overflow food.

After existing executions and initialization, run one resource pass before player updates/hashes. Skip unspawned, dead, and spawn-phase players. Disable the old food/urban sequence for this selected ruleset. Observer code and overlays must also stop invoking old food sheds or supply fields.

### Shape and starting preset

Use `(b + rX)(1 - X/K)` below capacity and zero at/above capacity, with fractional credits and one-quantum ceiling snap. Food capacity is `5000 + 5000*farms`; troop capacity is `10000*cities`. Starting balances are 4000 food and 2000 troops. Food baseline is 2/tick, troop bootstrap is 1/tick while a city exists, and both growth coefficients are 0.003/tick. Farm/city prices are 2000/3000 food; both initial dispatch prices are 40 milli-food/troop.

No stock gift accompanies building/capture. No food consumption, aging, supply attrition, or autonomous land growth remains active. Old population-zero extinction is replaced by the existing territorial alive predicate; combat collapse behavior is unchanged.

### Explicit plot authority and painting transactions

Use `Settlement` for a painted city and `Farmland` for a farm, each fixed at level one. Density/maturity conduits, if needed for drawing, are projections of plot presence only. They do not confer additional capacity. The initial city becomes an explicit plot; legal spawning requires two distinct kit cells and is validated before reroll mutation.

A new bounded `paint_tiles` intent carries a kind and up to 4096 ordered tile references. Validate each tile immediately before its purchase; skip invalid/already-painted cells and stop at the first unaffordable valid cell. Purchases are synchronous within this execution, so replenishment cannot fund a trailing queued cell. Existing single-tile construction intents use the same validation/purchase path.

For the first UI, preview the interpolated one-tile stroke while dragging and commit it on pointer release as one bounded intent. This avoids inventing persistent cross-frame stroke transactions. A click commits one tile. Deduplicate while previewing; the core deduplicates again. Cancellation discards the preview. Reaching the limit displays the limit and stops collecting cells. Painting feedback reports actual placed/skipped cells, cost, and an affordability stop, not an optimistic client-side success.

### Dispatch transaction and transition accounting

Normalize/clip the troop request, validate contact/destination/spawn eligibility, verify food, then commit debit and deployment. Move hostile-order side effects after successful validation. Rejected dispatches do not mutate resources or diplomacy.

Charge only new funded commitments. A paid transport's queued landing attack is explicitly marked as a handoff and carries the same soldiers in deployment accounting until the attack is initialized. Release the temporary count exactly once on success, refund, or termination. Neither rescaling/merging an attack nor handing off passengers is new recruitment or another fee.

The fee is not refunded after successful dispatch, including later path failure or retreat; existing troop refunds remain. Existing combat internals remain in place. Regression tests isolate them by disabling replenishment and supplying sufficient food.

### Passive sandbox instead of an unadapted AI

Do not execute old Nation/Tribe planners in this selected ruleset. Use the existing deterministic spawn selection to create passive opponents with normal plots, economy, and defense. The shell labels this state as a sandbox. Keep old behavior for legacy copied test configs. Active AI's future priority model is documented in the detailed design, but no new attack/build decision engine is implemented here.

### State and compatibility

New resource readouts use a named structured-clone summary shared by core and worker/client, not another undocumented packed stride. Keep existing transport/front conduits. Add food, fractional credits, plot counts, and handoff state to the selected ruleset's state hash; preserve non-painted hash behavior. Clear all new state on a permitted reroll/reset. Do not claim old SimpleFront turn logs run identically under the new rules; no saved-match migration is promised by this change.

## Risks / Trade-offs

- Sigmoid recovery is slow at low balances → baseline/bootstrap and validated recovery tests; tune rates after playtesting.
- Mutation ordering can spend capacity overflow or duplicate passengers → lifecycle hooks and handoff-specific tests, not only UI tests.
- Existing setup stubs combat formulas → use real-attack fixtures for parity, not the default `TestConfig.attackLogic` stub.
- Keeping legacy fixtures could hide a runtime still using old rules → independently test the actual `simplefront` Config/registry and worker frame path.
- Retaining old files could retain expensive observers → prove no selected-game food-shed/supply/growth calls during a no-input run.
- Passive opponents reduce play challenge → explicit sandbox label; active AI is a separate deliverable, not represented as finished.
- Preview-on-drag commits only on release → simpler deterministic transaction; display ghost tiles and cancel clearly.

## Migration Plan

Implement and verify within the copied application, behind its already distinct Config selection. Do not alter root launch middleware. Preserve unrelated worktree changes. Run focused tests per task, then both isolation checks and root regression checks. Keep production launch behavior unchanged until the selected SimpleFront path, UI, and passive opponents work together.

If implementation must be rolled back, revert only this change's own commits or patches; never reset the workspace or overwrite the original copy. Do not delete existing resource files or user saves as part of rollout.

## Open Questions

No blocking rule choices remain for this first implementation. Numerical balance and active-AI behavior require subsequent playtesting/design work, not guesses hidden in this implementation. The code-oriented plan defines exact interfaces, files, and acceptance commands.
