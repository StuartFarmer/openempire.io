## Context

The original OpenFront game already has a complete map asset pipeline: `map-generator/assets/maps/<map>/image.png` plus `info.json` are compiled by `npm run gen-maps` into `resources/maps/<map>/map.bin`, `map4x.bin`, `map16x.bin`, `manifest.json`, `thumbnail.webp`, and `src/core/game/Maps.gen.ts`.

The current generated world code produces an in-memory `BoardMap` with OpenFront-compatible terrain bytes and richer optional layers. The first playable deliverable should use that generator only to create map source files, then let the existing Go map-generator and original OpenFront runtime do the rest.

## Goals / Non-Goals

**Goals:**

- Add a `#generator` route/page for adjusting seeded world generation settings.
- Preview the generated map with the same terrain color output used by the current generated board.
- Export source files compatible with `map-generator/assets/maps/<map_name>`.
- Let generated maps become playable through the existing `npm run gen-maps` and map picker path.

**Non-Goals:**

- No runtime custom map loading.
- No browser filesystem writes.
- No new map binary compiler in TypeScript.
- No alternative troop, economy, AI, or networking work.
- No new dependency for ZIP export in the first pass.

## Decisions

1. Use the existing Go map-generator as the only binary compiler.

   Alternative considered: compile `map.bin`, `map4x.bin`, `map16x.bin`, and `manifest.json` in-browser. That duplicates working code and risks subtle format drift.

2. Export `image.png` and `info.json` from the browser.

   Alternative considered: export a ZIP/folder. Browsers cannot download folders directly, and adding ZIP support is not needed to prove the flow. Downloading two files is enough for `map-generator/assets/maps/<map_name>`.

3. Add generated maps to the game by copying files into `map-generator/assets/maps/<map_name>` and running `npm run gen-maps`.

   Alternative considered: make generated maps appear instantly in the picker. The current picker depends on generated `GameMapType` and `Maps.gen.ts`, so instant custom maps would require a second map registry.

4. Keep generated layers out of the original OpenFront game path.

   The original game consumes terrain bytes and state. Layers stay useful for previews and future alternative mechanics, but they are not required to play OpenFront on generated terrain.

## Risks / Trade-offs

- Manual copy step can be clunky -> document the exact folder path and command on the generator page.
- Downloading two files is less polished than ZIP -> add ZIP only if the manual flow proves useful enough.
- Generated `image.png` must encode terrain in a way the Go generator preserves -> verify by exporting a map, running `npm run gen-maps`, and starting a single-player game on the new map.
- Large browser-generated maps can be slow -> start with existing generator defaults and expose only supported config values.
