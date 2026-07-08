# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is a **lean fork of OpenFront.io**: vanilla game rules, singleplayer-only, with a procedural world generator. The online periphery (server, auth, cosmetics, store, clans, ads, chat, moderation, multiplayer lobbies) has been stripped. See "Boundaries" below before adding anything back.

## Commands

```bash
npm run inst        # Install deps (npm ci --ignore-scripts — do NOT use npm install)
npm run dev         # Single vite process, hot reload (no game server exists)
npm test            # Run all tests (Vitest)
npm run lint        # ESLint
npm run format      # Prettier
npm run gen-maps    # Bake maps: map-generator/assets/maps/* → resources/maps/* + Maps.gen.ts (needs Go)
npm run build-prod  # Production build (static site)
```

**Run a single test file:**

```bash
npx vitest tests/YourTest.test.ts --run
npx vitest TerrainMapLoader --run   # match by name pattern
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
  └─ exports image.png + terrain-colors.png + info.json
       └─ drop into map-generator/assets/maps/<name>/
            └─ npm run gen-maps  (Go)
                 └─ resources/maps/<name>/{map.bin,map4x.bin,map16x.bin,manifest.json,thumbnail.webp,terrain-colors.png}
                    + src/core/game/Maps.gen.ts (regenerated — never hand-edit)
                    + en.json map section
```

- **Tile format (1 byte/tile, must stay in sync):** bit 7 land, bit 6 shoreline, bit 5 ocean, bits 0–4 magnitude (31 = impassable). Encoder: `map-generator/map_generator.go` (`packTerrain`). Decoder: `src/core/game/GameMap.ts`.
- **terrain-colors.png sidecar:** optional full-res RGBA baked by the generator. `manifest.terrain_colors: true` → `TerrainColorSidecar.ts` attaches it as `BoardMap.colorizer` → `TerrainPass` renders it instead of procedural terrain shading. Full-res only (rejected for compact/4x map size).
- The Go tool regenerates `Maps.gen.ts` and the en.json map section from whatever folders exist — adding/removing a map is adding/removing a folder and re-running `gen-maps`.
- Maps kept: `world` (classic), `pangea001`, `pangea002`, `majormenor` (generated).

## Boundaries — read before making changes

- **Game rules stay vanilla.** Do not remove or alter core sim features (nukes, trains, warships, alliances, teams, bots, win conditions…). This fork changes *terrain*, not *rules*. Gameplay experiments live in git history (branch `analysis-game-board-library-componentization`), not here.
- **Do not re-add stripped subsystems** (server, auth/JWT, cosmetics/patterns/store, clans, ads, analytics, matchmaking, chat UI, moderation, CI/deploy scripts) unless explicitly asked.
- `src/games/alternative/index.ts` re-exports only the world generator. Don't grow it back into a gameplay module without an explicit request.

## Key files

| File                                           | Purpose                                    |
| ---------------------------------------------- | ------------------------------------------ |
| `src/core/Schemas.ts`                          | Intent/message types (zod)                 |
| `src/core/GameRunner.ts`                       | Sim orchestrator (tick loop)               |
| `src/core/game/GameImpl.ts`                    | Game state implementation                  |
| `src/core/game/GameMap.ts`                     | Tile storage + bit format decoder          |
| `src/core/game/Maps.gen.ts`                    | Generated map registry — never hand-edit   |
| `src/client/LocalServer.ts`                    | In-browser "server" (turn loop)            |
| `src/client/ClientGameRunner.ts`               | Client game loop (joinLobby entry)         |
| `src/client/board/GameBoard.ts`                | Embeddable board library                   |
| `src/client/GeneratorPage.ts`                  | World-generator UI (#generator)            |
| `src/games/alternative/world/`                 | Procedural world engine                    |
| `map-generator/map_generator.go`               | Map baker (terrain encoding)               |
| `tests/util/Setup.ts`                          | Test helper — creates test games           |

## UI text / i18n

English only. All user-visible text goes through `translateText()` with a key in `resources/lang/en.json` (the only translation file). `tests/TranslationSystem.test.ts` fails on orphaned or missing keys — prune en.json when deleting UI.

## Testing patterns

Tests use `setup()` from `tests/util/Setup.ts` with small maps from `tests/testdata/maps/` (not `resources/maps/`). Exercise the core simulation directly — not mocks. Map/manifest consistency is enforced by `tests/MapConsistency.test.ts`; run `npm run gen-maps` if it complains about sync.

## Tech stack

Vite + TypeScript, raw WebGL renderer, Lit + Tailwind CSS 4, Howler (audio), Zod, Vitest, Go (map baker only).
