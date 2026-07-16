# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is a **lean fork of OpenFront.io** being grown into a 3-age resource game (Tribal/food, Middle/metal, Modern/oil): singleplayer-only, with a procedural world generator. The online periphery (server, auth, cosmetics, store, clans, ads, chat, moderation, multiplayer lobbies) has been stripped. Game rules diverge from vanilla **only via OpenSpec changes** (`openspec/changes/`) — see "Boundaries" below.

## Commands

```bash
npm run inst       # Install deps (npm ci --ignore-scripts — do NOT use npm install)
npm run dev        # Single vite process, hot reload (no game server exists)
npm test           # Run all tests (Vitest)
npm run lint       # ESLint
npm run format     # Prettier
npm run gen-maps   # Bake maps: map-generator/assets/maps/* → resources/maps/* + Maps.gen.ts (needs Go)
npm run build-prod # Production build (static site)

# Author a new world headlessly (CLI twin of the #generator page), then bake:
npx tsx map-generator/gen-world.ts --name myworld --seed 7 --width 512 --height 256
# Balance harness: seeded headless bot games with food-knob overrides
npx tsx tests/perf/balance/BalanceRun.ts --map verdantia --runs 3 --nations 25 [--difficulty Easy | Medium | Hard | Impossible]
```

Note: `gen-world.ts` and the run-openfront skill need the unsaved dev deps `canvas` and `playwright`; install them **together** (`npm install --no-save playwright canvas && npm rebuild canvas`) — installing one evicts the other.

**Run a single test file:**

```bash
npx vitest tests/YourTest.test.ts --run
npx vitest TerrainMapLoader --run # match by name pattern
```

**Known-failing baseline** (pre-existing WIP breakage, not regressions — do not "fix" incidentally, but don't add to it): `tests/InputHandler.test.ts`, `tests/UserSettings.test.ts`, `tests/client/sound/SoundManager.test.ts`, `tests/client/view/GameView.test.ts`, `tests/client/view/PlayerView.test.ts`. Everything else must pass.

## Architecture

1. **`src/core/`** — Deterministic game simulation. No external deps beyond zod/nanoid. Fully deterministic (seeded PRNG, no floating-point in sim logic). Runs in a Web Worker. All `src/core` changes **must** include tests. `tests/CoreDependencyBoundary.test.ts` enforces that core never imports client code.
2. **`src/client/`** — Hand-written WebGL renderer (`src/client/render/gl/`, ~40 passes), Lit + Tailwind UI, input handling. No Pixi.
3. **`src/client/board/`** — The reusable GameBoard library (`createGameBoard`): map + worker + renderer + input in one embeddable component. Package exports: `openfront-client/board`, `/core`, `/render`.
4. **`src/games/alternative/world/`** — The procedural world generator (seeded value-noise → elevation, ocean, climate, biomes, resource maps). Browser-side, deterministic.
5. **`map-generator/`** — Go tool that bakes map sources into runtime binaries.

**There is no server.** Singleplayer runs entirely in-browser: `Transport` (local mode) → `src/client/LocalServer.ts` (in-browser turn loop) → Web Worker running the sim. The only file left in `src/server/` is `PublicAssetManifest.ts`, used by vite at build time.

### Simulation flow (unchanged from upstream)

Player action → **Intent** (`src/core/Schemas.ts`, zod) → `LocalServer` bundles intents into a **Turn** → Worker → an **Execution** per intent → `executeNextTick()` mutates game state → **GameUpdates** → client renders.

### Map pipeline (the point of this fork)

```
GeneratorPage (#generator route, in-browser, seeded WorldEngine)
  └─ exports image.png + terrain-colors.png + layers.bin + info.json
       └─ drop into map-generator/assets/maps/<name>/
            └─ npm run gen-maps  (Go)
                 └─ resources/maps/<name>/{map.bin,map4x.bin,manifest.json,thumbnail.webp,terrain-colors.png,layers.bin}
                    + src/core/game/Maps.gen.ts (regenerated — never hand-edit)
                    + en.json map section
```

**There is exactly one game mode and one map format** (unify-layered-path): every map ships BOTH sidecars (`terrain-colors.png` + `layers.bin`); the baker and `TerrainMapLoader` fail loudly when either is missing — there is no vanilla/classic fallback, no `hasLayers()` predicate, and no map-size option (`map4x.bin` survives only as the pathfinding minimap; it is not a playable resolution).

- **Tile format (1 byte/tile, must stay in sync):** bit 7 land, bit 6 shoreline, bit 5 ocean, bits 0–4 magnitude (31 = impassable). Encoder: `map-generator/map_generator.go` (`packTerrain`). Decoder: `src/core/game/GameMap.ts`.
- **terrain-colors.png sidecar (required):** full-res RGBA baked by the generator. `TerrainColorSidecar.ts` attaches it as `BoardMap.colorizer` → `TerrainPass` uses it as the base terrain texture. `encodeTerrainTile` survives ONLY as the runtime mutation encoder (water nukes; future land modification) — there is no full-map procedural shading.
- **layers.bin sidecar (required):** 6 Uint8 planes (crop, metal, oil, temperature, humidity, water) — format owned by `src/core/game/MapLayers.ts` (exporter and sim both import it). `game.layer("crop", tile) → 0..255` in the sim; layers are guaranteed at load, no gating needed. Only the pathfinding minimap is unlayered and must never be asked for layer data.
- The Go tool regenerates `Maps.gen.ts` and the en.json map section from whatever folders exist — adding/removing a map is adding/removing a folder and re-running `gen-maps`.
- Maps whose engine state is gone (only the baked image.png survives) get BOTH sidecars retrofitted via `npx tsx map-generator/derive-layers.ts --map <name>` — it inverts the baked elevation, runs the world engine's real climate/resource pipeline with a name-derived seed, and bakes terrain colors with the engine palette (`world` and `majormenor` were retrofitted this way). `tribalsmall` is the layered test fixture in `tests/testdata/maps/`; other test fixtures are unlayered on disk and get synthetic layers from `tests/util/Setup.ts`.

### Food economy (Tribal age — the only economy)

`Config.food()` holds every knob; the per-tick loop lives in `src/core/execution/utils/FoodEconomy.ts` / `UrbanGrowth.ts` (called from `PlayerExecution.urbanTick`): fertility+Farmland production → activity-scaled consumption (idle < boats < attacks) → Barn-capped storage with decay → food-modulated births/deaths and urban-core growth. There is no gold income and no vanilla troop/gold tick; players start with `food().startPopulation` and zero gold. `Config.maxTroops` = `basePopulation + urbanArea·popPerDensity`, scaled per (playerType, difficulty) by `Config.aiDifficulty()` (humans always ×1; also carries AI cadence + precision levers). Gold-cost units (City, warships, nukes, …) stay DEFINED but dormant until later ages assign them a payable `costResource` — do not delete them. Settlement/Farmland/Barn cost food via `UnitInfo.costResource`. Balance work happens in the harness (`tests/perf/balance/BalanceRun.ts`, now with `--difficulty`). All food math is integer (bigint milliunits). In tests, games without explicit `layersFill` run an INERT food config (`TestConfig.setInertFood`) so legacy sim tests keep deterministic troop counts.

## Boundaries — read before making changes

- **Rules change only through OpenSpec changes.** Do not remove or alter core sim features (nukes, trains, warships, alliances, teams, bots, win conditions…) or add mechanics ad hoc — every rule change is a scoped change in `openspec/changes/` with specs and tests.
- **One game mode, one map format.** Every map is layered (both sidecars mandatory, enforced by `tests/MapConsistency.test.ts` and the baker); there is no vanilla path, no `hasLayers()`/`hasFoodEconomy()` predicate, and no map-size option. Never reintroduce a mode predicate for new mechanics — new-age mechanics activate by their own explicit rules (e.g. `costResource`), not by map flags.
- **Do not re-add stripped subsystems** (server, auth/JWT, cosmetics/patterns/store, clans, ads, analytics, matchmaking, chat UI, moderation, CI/deploy scripts) unless explicitly asked.
- `src/games/alternative/index.ts` re-exports only the world generator. Don't grow it back into a gameplay module without an explicit request.

## Key files

| File                             | Purpose                                  |
| -------------------------------- | ---------------------------------------- |
| `src/core/Schemas.ts`            | Intent/message types (zod)               |
| `src/core/GameRunner.ts`         | Sim orchestrator (tick loop)             |
| `src/core/game/GameImpl.ts`      | Game state implementation                |
| `src/core/game/GameMap.ts`       | Tile storage + bit format decoder        |
| `src/core/game/Maps.gen.ts`      | Generated map registry — never hand-edit |
| `src/client/LocalServer.ts`      | In-browser "server" (turn loop)          |
| `src/client/ClientGameRunner.ts` | Client game loop (joinLobby entry)       |
| `src/client/board/GameBoard.ts`  | Embeddable board library                 |
| `src/client/GeneratorPage.ts`    | World-generator UI (#generator)          |
| `src/games/alternative/world/`   | Procedural world engine                  |
| `map-generator/map_generator.go` | Map baker (terrain encoding)             |
| `tests/util/Setup.ts`            | Test helper — creates test games         |

## UI text / i18n

English only. All user-visible text goes through `translateText()` with a key in `resources/lang/en.json` (the only translation file). `tests/TranslationSystem.test.ts` fails on orphaned or missing keys — prune en.json when deleting UI.

## Testing patterns

Tests use `setup()` from `tests/util/Setup.ts` with small maps from `tests/testdata/maps/` (not `resources/maps/`). Exercise the core simulation directly — not mocks. Map/manifest consistency is enforced by `tests/MapConsistency.test.ts`; run `npm run gen-maps` if it complains about sync.

## Tech stack

Vite + TypeScript, raw WebGL renderer, Lit + Tailwind CSS 4, Howler (audio), Zod, Vitest, Go (map baker only).
