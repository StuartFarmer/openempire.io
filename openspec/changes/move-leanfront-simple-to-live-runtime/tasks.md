## 1. Lock the Live Runtime Boundary

- [ ] 1.1 Replace the sibling-mode registry assertions with failing tests that require `leanfront-simple` to be the third worker-backed Live ruleset while preserving original LeanFront.
- [ ] 1.2 Add `LeanFrontSimpleConfig`, register its runtime and shared Live view, and prove it uses the existing `GameRunner` creation path.
- [ ] 1.3 Add an abundant-food tick-by-tick parity test covering player and neutral attacks, ownership, people, active fronts, and retreat state.

## 2. Add the Simple CPU Economy

- [ ] 2.1 Add failing unit tests for integer seeds, Gompertz growth, capacity stacking, overflow preservation, and deterministic proportional distribution.
- [ ] 2.2 Implement the compact city/farm stock calculator and one scoped urban-tick provider with install/dispose lifecycle.
- [ ] 2.3 Configure Settlement and Farmland for flat food costs, same-tile upgrades, no seed gate, instant construction, and no automatic spread only in LeanFront Simple.
- [ ] 2.4 Give each spawned player one free level-one Settlement and Farmland, seed both at 2,000, and keep rich density/maturity/food systems inactive.
- [ ] 2.5 Reconcile build, upgrade, capture, survivor return, and deletion changes between core balances and compact plot stocks with integer invariants.

## 3. Route Food-Gated Actions Through GameRunner

- [ ] 3.1 Add a worker `plot_action` command that resolves city/farm clicks to existing build or upgrade intents and raze clicks to the existing delete path.
- [ ] 3.2 Apply the flat raze food price in the existing deletion execution for configs that declare a simple plot economy, with unaffordable actions remaining no-ops.
- [ ] 3.3 Add runtime attack-energy handling that tracks new attacks, caps them before their first combat tick, charges 40 milli-food per active person per tick, leaves `AttackExecution` unchanged, and returns survivors without malus on energy exhaustion.
- [ ] 3.4 Add focused tests for global farm debits, flat costs, rejection without mutation, attack affordability, ongoing exhaustion, and no people upkeep.

## 4. Add the Compact GPU Accelerator

- [ ] 4.1 Add a compact plot-record WebGPU kernel that computes only next integer stocks and aggregates, with no ownership, combat, frontier, or nation state.
- [ ] 4.2 Add runtime fallback that permanently selects the CPU calculator after GPU initialization or dispatch failure.
- [ ] 4.3 Add CPU/GPU exact-parity tests for empty, seeded, near-capacity, upgraded, captured, overflow, and large integer records.

## 5. Reuse Live Commands and Presentation

- [ ] 5.1 Extend worker frames with compact plot stock/level/capacity/growth deltas and bounded action feedback while retaining the shared stats, nation, border, spawn, and attack data.
- [ ] 5.2 Route LeanFront Simple city, farm, raze, attack, stop, spawn, pause, turbo, restart, and statistics controls through the worker backend.
- [ ] 5.3 Remove field-backend special cases and update shell tests for exact spawn-camera timing, mask transition, manifest nations, ownership colors, sprites, hover values, deploy highlight, rejection, and defeat behavior.

## 6. Remove the Obsolete Backend and Verify

- [ ] 6.1 Remove LeanFront Simple's playable field-system registration, pressure/diffusion/incursion/ownership shaders, field-only actions, and tests after confirming no remaining imports.
- [ ] 6.2 Run focused ruleset, economy, attack, worker, registry, shell, GPU parity, nation, and OpenFront reference tests.
- [ ] 6.3 Run the full non-baseline unit suite, lint, typecheck, production build, `git diff --check`, and strict OpenSpec validation.
