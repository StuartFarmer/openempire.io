## Why

SimpleFront's painted economy is currently a passive sandbox. Its resource
timings and absent active opponents do not yet support the approved 10–15 minute
build–expand–fight match rhythm.

## What Changes

- Scale food and recruitment bootstrap with global capacity while preserving
  S-shaped refill, exact food debits, and total deployed troop accounting.
- Tune initial farm/city prices to 1500/2000 food and dispatch to 0.2 food per
  troop, retaining the 4000-food/2000-troop opening and existing capacities.
- Introduce one deterministic paid-action controller for bots and nations,
  including development, reserves, expansion, campaigns, retreat, and transport.
- Add selected difficulty input and a final winner/time projection in the shell;
  retain existing victory and battle mechanics.
- Add reproducible real-core match measurements and strategy comparisons; tune
  against recorded evidence without claiming simulated results prove human fun.
- **BREAKING**: Selected SimpleFront refill fields/preset and active-opponent
  behavior change. Old SimpleFront turn logs are not promised compatibility.

## Capabilities

### New Capabilities

- `simplefront-capacity-paced-resources`: Capacity-scaled refill and the initial
  playtesting preset, extending the prior unarchived painted-economy delivery.
- `simplefront-paid-action-ai`: Shared resource-constrained active opponents.
- `simplefront-match-flow`: Difficulty selection and visible final match results.
- `simplefront-balance-evidence`: Deterministic match and strategy measurements.

### Modified Capabilities

None in the current main `openspec/specs` catalog. The preceding SimpleFront
painted-economy change is complete but unarchived; this change layers onto its
implementation without rewriting its historical artifacts.

## Impact

Implementation stays inside `simplefront/`: configuration, resource projections,
AI/spawn lifecycle, worker/protocol/UI, copied translations, tests, and a local
benchmark. Root OpenFront Live, root launch routing, dependencies, map assets,
combat mechanics, and the >80% FFA victory threshold remain unchanged. Detailed
approved requirements are in the [design spec](../../../docs/superpowers/specs/2026-09-06-simplefront-pacing-and-ai-design.md).
