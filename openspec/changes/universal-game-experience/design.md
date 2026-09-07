## Context

`GameShellPage` already contains the desired match experience, but almost every part of it is guarded by `selectedLiveGame()`. That predicate identifies the worker-backed OpenFront/LeanFront transport, not whether the selected system is a playable game. As a result, LeanFront Simple, Conquest, and Empire use the GPU field loop but receive study-style mounting, manual play controls, brush input, and generic scalar panels.

The simulations must remain different. OpenFront and original LeanFront are authoritative in `ShellSim.worker`; LeanFront Simple and other field games are authoritative in GPU buffers and accept only compact player intents. The common layer is the lifecycle and presentation around those simulations.

## Goals / Non-Goals

**Goals:**

- Give every selectable game variant the same automatic startup, spawn flow, camera transition, nation presentation, match controls, statistics/history, state feedback, and map interaction feedback.
- Make “is a game” the shell decision boundary and keep “which backend runs it” behind that boundary.
- Reuse the existing OpenFront shell UI and page state instead of creating a second GPU HUD.
- Keep GPU simulations GPU-authoritative with bounded aggregate/tile-query readback only.
- Prevent incomplete studies from appearing as playable variants.

**Non-Goals:**

- Unifying the worker and GPU simulation loops, protocols, state models, or determinism guarantees.
- Making the worker mirror GPU fields or making the CPU authoritative for GPU games.
- Standardizing game rules, resource names, build actions, bot-count support, or balance.
- Deleting Grazing or Settlement experiments; they simply cease to be game variants.

## Decisions

### D1 — Register every playable variant through one discriminated game definition

The shell SHALL resolve the selection to a game definition whose backend is either `worker` or `field`. Worker definitions retain their ruleset/runtime data. Field definitions reference their `FieldSystem` and a small match-experience mapping. The existing system manifests remain the source of mechanics, views, input, AI, params, and scalars.

This is intentionally a data union, not a new runtime framework. `GameShellPage` needs only one `selectedGame()` predicate and small backend branches where work truly differs. The alternative—adding LeanFront Simple checks beside every `selectedLiveGame()` check—would preserve the root coupling and fail again for the next GPU game.

All definitions exposed by the game selector are complete games. Terrain is rendering infrastructure. Grazing and Settlement remain available to development tooling but are removed from the game-variant list. Conquest and Empire either receive the contract in this change or are likewise hidden until they do; no partial-game exception remains.

### D2 — Normalize presentation state, not simulation state

The common UI SHALL consume one page-level match view model containing only presentation data: phase, local-player identity, nation summaries and spawn anchors, resource/stat rows, current commitment, defeat state, rejection feedback, and hovered/target identity.

The worker frame updates that model from its existing messages. A field game updates it from declared aggregate outputs, accepted input, and bounded tile queries. This state is a projection for rendering and history; it is never written back as authoritative game state.

No full ownership, population, food, or troop plane is read from a GPU game to drive gameplay. Existing GPU render buffers stay on the GPU. Hover reads at most the queried tile, and statistics/history sample declared aggregate scalars.

### D3 — Make the lifecycle common and leave commands backend-specific

Mounting any game runs the same shell sequence:

1. Reset and initialize the selected backend.
2. Select the game's declared default match view.
3. Start ticking automatically and enter the spawn phase.
4. Show nation markers while the human chooses a valid base tile.
5. Send a semantic spawn through the selected backend.
6. On acceptance, fly the camera to the base and fade the mask into the match.
7. Continue with the common HUD, controls, hover, feedback, and end-state UI.

The worker branch posts its existing protocol messages. The field branch uses the existing player-intent and brush queues declared by the system. Pause, turbo, restart, spawn, attack, build, and stop remain backend-specific operations behind the existing shell event handlers.

Rejected alternative: forcing field games into the worker. That would introduce a second authority/mirror for GPU games and violate their intent-driven design.

### D4 — Require a minimal experience mapping for field games

A field game definition SHALL declare only what cannot be inferred safely:

- local player slot and participating player slots;
- spawn command and spawn-acceptance/anchor signals;
- default match view;
- nation color source;
- resource/stat rows and optional history series;
- commitment/action bindings;
- alive/defeat and rejection signals;
- tile identity and target-validity lookup.

LeanFront Simple maps these to its existing `hasSpawned`, `spawnCityTile`, people, food, tiles, action result, and player-intent outputs. Conquest and Empire receive the smallest equivalent mapping using their existing ownership/player fields and spawn brushes. Unsupported game-specific controls are omitted; universal controls and states are not optional.

The type/registration boundary SHALL reject a field entry advertised as a game when the mapping is missing. This makes completeness a registration invariant instead of a runtime convention.

### D5 — Reuse the existing shell UI as the common presenter

The spawn prompt, HUD frame, nation labels, flags, camera tween, mask fade, pause/turbo/restart controls, statistics/history panel, defeat state, rejection status, and hover/target treatments SHALL be rendered from the normalized view model rather than `selectedLiveGame()`.

Content stays game-specific. Resource rows and available actions come from the game definition/state, so LeanFront Simple shows people and food while OpenFront keeps its richer rows and build bar. A control whose mechanic does not exist—such as adjustable bot count for a fixed-slot GPU game—is not rendered.

Nation naming and flags reuse the existing deterministic flag/name presentation. The selected map manifest is the sole source of the nation roster and literal spawn centers for every backend. A game mode neither substitutes a fixed roster nor jitters authored coordinates.

Generated-map authoring excludes ocean, impassable, and lake tiles when choosing those centers. Source `info.json` and baked manifests carry the same corrected coordinate; runtime code does not hide invalid map data by relocating a nation.

Territory palette, borders, attack-source highlighting, plot sprites, and the post-spawn mask reuse the existing Live presenter. Field games supply their GPU-native owner/plot/highlight data to that presenter; they do not maintain a second CPU simulation or a custom visual approximation.

GPU spawn acceptance is a bounded player-output read performed immediately after the accepting simulation batch. The slower aggregate readback remains for statistics only, so it cannot add up to 500 ms to the common camera transition.

### D6 — Restart is a full lifecycle reset

Restart SHALL clear presentation history, hover/target state, feedback, nation markers, camera-centering state, and backend state, then repeat the same automatic mount/spawn sequence. Switching maps or variants uses the same reset path. This avoids backend-specific stale state and makes restart behavior testable once.

### D7 — LeanFront Simple uses whole gameplay units with precise simulation state

LeanFront Simple SHALL start each level-one city and farm with 10 units against a capacity of 100. City, farm, and raze actions cost 20, 15, and 5 food respectively, so the starting farm reaches the first expansion cost within four ordinary growth ticks and a newly built farm cannot repay its own cost from its seed.

Gompertz growth and combat remain floating-point internally to avoid stalling small per-tick changes. Player-facing people, food, and capacity amounts SHALL be rounded to whole units.

## Risks / Trade-offs

- **Some field games lack semantic spawn/outcome outputs** → add only the minimal declared signals or hide the variant until it satisfies the contract; do not infer match state from arbitrary scalar names.
- **Common UI may accidentally become an OpenFront schema** → model resources/actions as labeled presentation rows and capabilities while keeping each backend's payload private.
- **GPU hover/statistics could cause expensive synchronization** → use existing aggregate readbacks and bounded single-tile queries; never read full planes for UI.
- **The large `GameShellPage` diff could mix extraction with visual redesign** → preserve existing appearance and behavior, changing predicates/state sources first.
- **Study access becomes less obvious** → retain study manifests and tests in developer/lab tooling, but do not advertise them as playable games.

## Migration Plan

1. Add the common game-definition union and normalized presentation state while preserving the current worker path.
2. Replace OpenFront-only UI/lifecycle predicates with the common selected-game predicate and verify worker behavior remains unchanged.
3. Add the field-game command/state mapping and migrate LeanFront Simple.
4. Give Conquest and Empire the required minimal mappings or remove them from the selector until compliant.
5. Remove Terrain, Grazing, and Settlement from the playable variant selector while retaining their study code.
6. Add cross-backend lifecycle tests and run the existing shell, field, and worker suites.

Rollback is a normal code revert; no persisted data or protocol migration is involved.

## Open Questions

None. The universal behavior and the worker/GPU authority boundary are explicit.
