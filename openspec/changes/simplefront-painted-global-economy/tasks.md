Implementation details, exact interfaces, example tests, and commands are in the [implementation plan](../../../docs/superpowers/plans/2026-09-06-simplefront-painted-global-economy.md). Each item requires a failing test before implementation and fresh passing evidence before completion. Active AI is outside this change.

Completed directly on 2026-09-06. See [verification evidence and implementation notes](../../../simplefront/docs/painted-economy-verification.md). Existing player-state/update/renderer types were extended for the named snapshot; an actual-worker integration test was added; the hidden supply-rendering conduit remains inert. No commits or deployment were performed.

## 1. Configuration and resource mathematics

- [x] 1.1 Add the selected SimpleFront preset and pure capacity/sigmoid/quantization functions with numeric and invalid-config tests.
- [x] 1.2 Wire the existing Config/ruleset seam and verify SimpleFront selection while preserving explicitly legacy fixtures.

## 2. Authoritative player resources

- [x] 2.1 Add exact milli-food access, player credits/count state, real-core painted fixtures, and baseline/zero-resource recovery tests.
- [x] 2.2 Replace the selected economy tick with one post-execution resource pass; remove selected eating/aging/starvation/urban ticks and use total deployed troop headroom.
- [x] 2.3 Include resources/counts/credits/handoffs in selected state hashing, reset, and typed capacity projection; verify determinism and over-capacity rules.

## 3. Explicit plots and lifecycle accounting

- [x] 3.1 Create the two-complete-plot free opening kit, validate both cells before mutation, and test reroll cleanup/rejection.
- [x] 3.2 Maintain plot counts atomically across creation, capture, reconciliation, deletion, relinquishment, and defeat; test no double counting or free stocks.
- [x] 3.3 Preserve intact captured capacity, immediately clamp food overflow, retain excess troops, and verify damage does not disable existing plots.

## 4. Painting purchases

- [x] 4.1 Add bounded paint intent/result types and synchronous per-tile purchase execution with legal/duplicate/invalid/affordability outcomes.
- [x] 4.2 Share the paid placement path with single-tile construction, remove selected seed/ecology/upgrade gates, and test partial strokes and competing purchases.

## 5. Military action charging

- [x] 5.1 Charge actual new land/transport commitments once after validation; test exact cost, no resizing for food, and rejected-order resource/diplomacy atomicity.
- [x] 5.2 Account for queued landings and other troop transitions without capacity gaps, double charges, or changed movement timing.
- [x] 5.3 Add independent local copies of the missing combat regression tests, baseline them, and verify no ongoing food/supply losses, chosen no-food-refund semantics, existing troop refunds, and retained real-combat traces.

## 6. Passive sandbox runtime

- [x] 6.1 Retain deterministic opponent spawning but suppress selected Nation/Tribe planners, initial attacks, and structure deletion; test long no-input runs.
- [x] 6.2 Remove selected observer-side food-shed/supply/maturity work and verify actual SimpleFront Config/runtime rather than only test substitutes.

## 7. Client painting and resource readouts

- [x] 7.1 Implement bounded integer stroke interpolation/deduplication, ghost preview, release commit, and cancellation with pure and UI tests.
- [x] 7.2 Connect authoritative painting results and named resource snapshots through worker/protocol/UI; show actual costs, capacity, refill, troop deployment, and partial rejection.
- [x] 7.3 Add and baseline a local translation-system test; remove obsolete seed/logistics/allocation controls and economic climate claims, add translated sandbox/resource/painting text, and verify render projections.

## 8. Verification and delivery

- [x] 8.1 Complete recovery/capture/handoff/reset/determinism/stroke acceptance tests and run focused tests, typecheck, lint, build, and the complete copied suite against an execution-start baseline.
- [x] 8.2 Verify source/asset/settings independence, unchanged root gameplay, root picker/runtime checks, and browser selection/painting/dispatch/reset/return smoke flow.
- [x] 8.3 Document the new selected rules and passive-opponent limitation in SimpleFront, record actual verification results, and hand off without implementing active AI.
