## 1. Generator Page

- [x] 1.1 Add `#generator` navigation routing and register a generator page element.
- [x] 1.2 Build a generator page with map id, display name, seed, and supported world generation controls.
- [x] 1.3 Render a pixelated preview from the generated map's terrain color output.

## 2. Export

- [x] 2.1 Add a helper that converts generated terrain into a PNG acceptable to the existing Go map-generator.
- [x] 2.2 Add a helper that builds `info.json` with compatible `id`, `name`, `translation_key`, `categories`, `multiplayer_frequency`, and `nations`.
- [x] 2.3 Add download actions for `image.png` and `info.json`.
- [x] 2.4 Show the manual compile instructions: copy files into `map-generator/assets/maps/<map_name>` and run `npm run gen-maps`.

## 3. Verification

- [x] 3.1 Add the smallest practical test or self-check for exported `info.json` shape and generated PNG dimensions.
- [ ] 3.2 Manually export one map, place it under `map-generator/assets/maps/<map_name>`, and run `npm run gen-maps`.
- [ ] 3.3 Verify the generated map appears in the normal map picker.
- [ ] 3.4 Launch a single-player game on the generated map and verify original OpenFront spawn, expansion, overlays, and combat run on it.

Freeze attempt (Chromium 149.0.7827.55, 2026-09-04): the page exported its five advertised files (`image.png`, `terrain-colors.png`, `layers.bin`, `elevation.bin`, `info.json`) without a page or console error, but exposes no `hydro.bin` download. `npm run gen-maps` therefore stopped with `map foundation-freeze-check has no hydro.bin (required; run derive-layers.ts to retrofit)`. Tasks 3.2–3.4 remain open; source and partial generated output were moved recoverably to `/tmp/openempire-foundation-freeze-check`.
