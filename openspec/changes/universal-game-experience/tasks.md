## 1. Lock the Game Boundary

- [x] 1.1 Add focused tests that characterize the existing OpenFront/LeanFront worker startup, spawn, pause/turbo, restart, and HUD behavior before changing its predicates.
- [x] 1.2 Define the minimal discriminated game registration and normalized presentation types for worker-backed and field-backed games.
- [x] 1.3 Build one playable-game registry containing OpenFront Live, original LeanFront, LeanFront Simple, Conquest, and Empire.
- [x] 1.4 Filter Terrain, Grazing, Settlement, and any incomplete system out of the game-variant selector while retaining their study manifests.

## 2. Generalize the Common Lifecycle

- [x] 2.1 Replace `selectedLiveGame()` as the experience gate with a backend-neutral selected-game lookup, leaving backend checks only around backend operations.
- [x] 2.2 Make every registered game initialize, select its declared match view, start ticking, and enter spawning through one mount sequence.
- [x] 2.3 Route pause/resume and turbo through the selected backend while preserving current worker behavior.
- [x] 2.4 Make restart and game/map switching clear common presentation state and repeat the full startup/spawn sequence.

## 3. Add the GPU Game Path

- [x] 3.1 Add LeanFront Simple's field-game mapping for local/AI slots, spawn command and acceptance anchor, people/food/tile statistics, commitment/actions, alive state, and rejection result.
- [x] 3.2 Route LeanFront Simple spawn, attack, city, farm, raze, and stop actions through its existing field intent/brush queues with no CPU simulation mirror.
- [x] 3.3 Populate the common presentation model from LeanFront Simple aggregate outputs and bounded hovered-tile queries.
- [x] 3.4 Give Conquest and Empire equivalent minimal spawn, roster, statistics, outcome, and target mappings so both satisfy the playable-game contract.

## 4. Make Existing Match UI Universal

- [x] 4.1 Render the existing spawn prompt, common HUD frame, pause/turbo/restart, statistics/history, defeat, and feedback surfaces for every selected game.
- [x] 4.2 Drive resource rows and optional action controls from the selected game so LeanFront Simple shows people/food and OpenFront retains its richer controls.
- [x] 4.3 Reuse deterministic nation identity for field games, including stable names, colors, flags, spawn markers, and LeanFront Simple's three AI nations.
- [x] 4.4 Generalize the accepted-spawn camera flight and mask transition without changing their existing worker timing.
- [x] 4.5 Generalize nation hover, tile validity, and attack-target feedback using backend-native bounded data.
- [x] 4.6 Clear stale rejection, hover, target, nation, camera, and history state after success, restart, map change, or game change as appropriate.

## 5. Verify the Contract

- [x] 5.1 Add cross-backend tests proving worker and GPU games both auto-start, require accepted click-to-place spawning, and support pause/turbo/restart.
- [x] 5.2 Add LeanFront Simple tests for three named AI identities, spawn markers, adaptive HUD values/actions, rejection/defeat, hover identity, and target feedback.
- [x] 5.3 Add selector tests proving only complete game variants are advertised and studies remain outside the game list.
- [x] 5.4 Add a regression test proving GPU presentation reads only aggregates/bounded tile data and does not add a full-plane CPU mirror.
- [x] 5.5 Run the focused shell/worker/field tests, full test suite, typecheck/lint, and production build; fix only regressions introduced by this change.

## 6. Correct Exact Cross-Backend Parity

- [x] 6.1 Replace fixed field-game nations with the selected map manifest's complete roster and literal coordinates.
- [x] 6.2 Remove worker nation spawn jitter so Live uses the same literal manifest centers.
- [x] 6.3 Seed map nations efficiently in GPU state without a CPU-authoritative simulation mirror or per-tile/per-player scans.
- [x] 6.4 Route field games through the Live palette, territory mask, plot sprite, and segment-highlight presentation.
- [x] 6.5 Update field tick display on completed simulation batches instead of aggregate readback cadence.
- [x] 6.6 Run focused parity tests, full tests, lint/typecheck, and the production build.

## 7. Correct Spawn Timing and Map Validity

- [x] 7.1 Add regressions for GPU spawn acknowledgement on the accepting batch and generated-map nation centers on dry playable land.
- [x] 7.2 Read the bounded GPU spawn output immediately after a completed spawn tick instead of waiting for aggregate sampling.
- [x] 7.3 Exclude lake tiles in generated nation placement and repair the affected Verdantia and Estuaria manifest coordinates without runtime relocation.
- [x] 7.4 Run focused tests, full tests, lint/typecheck, production build, formatting, and strict OpenSpec validation.

## 8. Make LeanFront Simple's Opening Economy Playable

- [x] 8.1 Add a regression for whole starting units, four-tick farm affordability, non-profitable farm seeding, and whole-number resource presentation; tune only the existing defaults and shared display path needed to pass it.
- [x] 8.2 Run focused tests, typecheck/lint, production build, formatting, and strict OpenSpec validation.
