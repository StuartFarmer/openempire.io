## Why

We need a clean path from the new seeded world generator into the original OpenFront game without rebuilding the game loop. The lowest-risk path is to export map source files that the existing Go map-generator already knows how to compile into playable OpenFront map assets.

## What Changes

- Add a `#generator` page that exposes foundation-style world generation controls.
- Generate a seeded map preview in the browser using the current alternative world generator code.
- Export an OpenFront map source bundle containing `image.png` and `info.json`.
- Document the existing compile step: place the exported source under `map-generator/assets/maps/<map_name>` and run `npm run gen-maps`.
- Make generated maps playable through the existing map picker after compilation, using the original OpenFront engine, attack system, rendering overlays, and game loop.
- Defer runtime custom maps, direct filesystem writes from the browser, and alternative troop mechanics.

## Capabilities

### New Capabilities

- `generator-map-export`: A browser generator page can export seeded generated maps as source files compatible with the existing OpenFront map-generator pipeline.

### Modified Capabilities

- None.

## Impact

- Affected client code: navigation/hash routing, a new generator page, and reusable generator preview/export helpers.
- Affected game assets: exported map source folders are manually copied into `map-generator/assets/maps/<map_name>` before running `npm run gen-maps`.
- Affected build flow: existing `npm run gen-maps` remains the only compiler from source map files to playable `resources/maps` binaries and `Maps.gen.ts`.
- No new runtime map-loader system, networking, AI, or game-engine changes are required for this pass.
