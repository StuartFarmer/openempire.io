# Task 6 report

## RED

- Replaced LeanFront Simple field-scalar/brush expectations with worker startup and `plot_action` coverage.
- Added worker-harness checks for upgrade, build, rejection without a queued intent, raze, compact sextets, and runtime stats.
- Confirmed the new shell/protocol tests failed before the protocol and shell routing changes.

## GREEN

- `plot_action` resolves only through optional runtime capabilities; the worker stamps successful core intents and returns bounded `action_result` feedback.
- Frames transfer runtime plot sextets and prefer runtime stats while preserving the existing food-flow fallback.
- LeanFront Simple starts as a worker game, shares spawn/attack/pause/turbo/restart/camera/nation/border/plot-conduit paths, and routes only city/farm/raze clicks through `plot_action`.
- Hover/HUD reads integer sextets; cancellation uses the selected outgoing attack through the existing `cancel_attack` intent path.

## Visual/common-path assertions

- Spawn camera is sourced from the accepted worker frame's `spawnAnchor`; nation markers remain sourced from `nationSpawns`.
- Highlight continues from `myBorder` plus `borderSegment`; sprites still consume the shared packed `plot` conduit; owner/plot/front/density/damage/supply remain shared buffers.
- Focused checks passed:
  - `npx vitest tests/GameShellExperience.test.ts tests/LeanFrontSimpleWorkerProtocol.test.ts tests/NationLiteralSpawn.test.ts tests/MapConsistency.test.ts --run` — 38 passed.
  - `npx vitest tests/ShellSimWorkerLifecycle.test.ts tests/LeanFrontSimpleRuntime.test.ts tests/LeanFrontSimpleEconomy.test.ts --run` — 28 passed.
  - `npx tsc --noEmit` and `git diff --check` — passed.
