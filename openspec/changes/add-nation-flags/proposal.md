## Why

Vanilla OpenFront let players pick a flag; this fork deleted the flag assets, the picker UI, and the `flag:`/`country:` ref resolver, leaving only inert schema fields and a WebGL renderer the `#shell` doesn't use. Nations now render unflagged and unidentifiable at a glance. We have a curated library of ~10,256 approved SVG flags and want them back: a flag beside every nation in the `#shell`, and a front-page picker to choose the human's own flag.

## What Changes

- **Bake a flag library** from the external approved set into `resources/flags/`: a new `npm run gen-flags` step reads the reviewer's `keep` decisions (~10,256 SVGs), prefers pure-vector files (by size), optimizes with SVGO, copies them under stable slugs, and emits `resources/flags/flags.manifest.json` (the id → path + display-name index the picker samples).
- **Restore a flag ref resolver** (`flag:<slug>` → `/flags/<slug>.svg`) on the client — the piece deleted with `Cosmetics.ts` — so a chosen ref becomes a fetchable URL.
- **Front-page flag picker**: an emoji-picker-style popover next to the name input showing a random 7×7 = 49 slice of the library, with a dice-icon reroll to resample. The pick persists via the existing `UserSettings.setFlag()` and shows as a small preview.
- **Every nation gets a flag in the `#shell`**: rendered as a DOM `<img>` in the existing nation labels (hover chip + spawn markers). Resolution order per nation: an authored **specific** flag → a random pick from an authored **historical list** → otherwise a **deterministic-random** flag from the library (seeded by nation id, so it is stable across a session). The human's nation uses their front-page pick.
- **Thread the per-nation `flag` field** (already declared on the manifest `Nation` type but silently dropped in `toNation`) through to the shell, extended to accept a single id or a list.
- **No changes** to the vanilla WebGL name-pass / `FlagAtlasArray` renderer (the `#shell` uses a DOM overlay, not GL) and no re-introduction of the stripped cosmetics store/catalog.

## Capabilities

### New Capabilities

- `flag-library-bake`: The offline `gen-flags` pipeline that turns the external approved-flag set into the shipped `resources/flags/` assets and `flags.manifest.json`.
- `flag-selection-ui`: The front-page popover picker (random 49 slice, dice reroll, persistence, preview) and the `flag:` ref resolver it relies on.
- `nation-flag-display`: Assigning a flag to every nation (specific / historical-list / deterministic-random / human override) and rendering it beside nation labels in the `#shell`.

### Modified Capabilities

<!-- No existing openspec/specs/ capabilities; nothing's spec-level behavior is being changed. -->

## Impact

- **New assets**: `resources/flags/*.svg` (~10k) + `resources/flags/flags.manifest.json`; served at `/flags/<slug>.svg` (dev `publicDir: resources`; prod asset-manifest copy).
- **New tooling**: `map-generator/flags/gen-flags.ts` (or similar) + `gen-flags` npm script; new dev dep `svgo`. Source path (the external review folder) is a CLI arg, not committed.
- **Client**: new picker component + `flag:` resolver; `PlayPage.ts` / `UsernameInput.ts` (picker mount); `GameShellPage.ts` (`playerFlag` map, `<img>` in `updateHoverChip` + `updateNationSpawnMarkers`); `ShellSimProtocol.ts` + `ShellSim.worker.ts` (carry a flag id per nation/name entry, human flag through init).
- **Core (minimal, cosmetic pass-through, tested)**: `NationCreation.toNation` reads the manifest `flag` (extended to `string | string[]`) and resolves list picks with the seeded sim PRNG; `TerrainMapLoader` `Nation` type widened. The sim never branches on flags — purely carried data. Real-world map manifests already carry `flag` codes (e.g. earthmini `"va"`).
- **Persistence**: reuses `UserSettings` `"flag"` key (`getFlag`/`setFlag`/`clearFlag`), already present.
- **i18n**: new `en.json` keys for the picker (title, reroll tooltip).
