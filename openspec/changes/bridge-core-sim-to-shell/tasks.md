# Tasks — Bridge the core sim into the #shell terrain

## 1. The thin viewer system

- [x] 1.1 `src/client/lab/systems/openfront/`: an `owner` layer (u32, init-only — never GPU-ticked, CPU-written) + `views/openfront.wesl` (`fn color`) compositing an owner→colour palette over `layers::tint`; `kind: "game"`, `defaultMap`, `defaultView: "openfront"`. No params/players/ai (the sim is the authority).

## 2. The sim bridge in the shell

- [x] 2.1 `GameShellPage`: hold a `GameRunner | null`; on mounting the openfront system, `createGameRunner` for the current map (Singleplayer, N bots, randomSpawn) via `FetchGameMapLoader`; destroy it on system/map switch + disconnect.
- [x] 2.2 Drive the sim from the loop: each advance, `gr.addTurn({turnNumber, intents: []})` + `gr.executeNextTick()`; read `gr.game.map().tileStateBuffer()` → owner `& 0xfff` → `kernel.writeBuffer("owner", …)`; run the openfront view over the terrain. Do NOT GPU-tick the owner field.
- [x] 2.3 A smallID→colour palette (deterministic hue by id), read by the overlay (in-shader hash or an uploaded palette).

## 3. Register + reframe

- [x] 3.1 Register openfront in the `#shell` game list (composed on terrain).
- [x] 3.2 Note in docs that the cellular games are ecology studies; the real game is the CPU sim rendered over the terrain.

## 4. Verify

- [x] 4.1 tsc + lint. `#shell`: pick OpenFront-live, the sim spawns + expands, territory renders over the terrain and updates each tick, distinct colours, no page errors. Perf acceptable on the default map.
