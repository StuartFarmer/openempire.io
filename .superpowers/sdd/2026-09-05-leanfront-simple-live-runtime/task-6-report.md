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

## Review fix loop

- Literal nation spawning now queues the exact manifest tile once and never
  re-spawns an already-spawned nation during the spawn phase. Verdantia and
  Estuaria manifest centers were regenerated onto dry, passable land; their
  generator sources match the shipped manifests.
- Simple city/farm/raze modes clear the shared attack-source highlight. Attack
  mode and other Live games retain it.
- Added direct checks for shared Simple spawn/attack messages, action-result
  status, sextet transfer/application, shared conduit/sprite/palette updates,
  restart/navigation cleanup, and defeat action hiding.
- Fix-loop verification passed:
  - Focused shell/protocol/nation/map: 49 passed.
  - Lifecycle/runtime/economy: 28 passed.
  - `npx tsc --noEmit`, `npm run lint`, Prettier check, and `git diff --check` passed.

## Committed files

- `src/client/GameShellPage.ts`
- `src/client/webgpu/ShellSimProtocol.ts`
- `src/client/webgpu/ShellSim.worker.ts`
- `src/core/execution/NationExecution.ts`
- `tests/GameShellExperience.test.ts`
- `tests/LeanFrontSimpleWorkerProtocol.test.ts`
- `tests/NationLiteralSpawn.test.ts`
- `tests/MapConsistency.test.ts`
- `resources/maps/{verdantia,estuaria}/manifest.json`
- `map-generator/assets/maps/{verdantia,estuaria}/info.json`
- `map-generator/gen-nations.ts`

## Exact-head follow-up

- The detached exact-head registry check initially exposed six missing
  universal-presentation dependencies. This follow-up commits the shared live
  shader, camera sprite shader, field live/border modules, and the Conquest and
  Empire system wiring. Obsolete LeanFront Simple field layers remain out of
  scope for Task 7 removal.
- Worker-backed mount and restart now set `running` before a synchronous
  `ready` message can read it.
- Manifest coordinates deliberately override team-area relocation as well as
  random relocation. The team-mode regression verifies the exact authored
  tile reaches `SpawnExecution`.
