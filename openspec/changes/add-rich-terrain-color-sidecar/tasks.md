## 1. Generator Export

- [x] 1.1 Add `terrain-colors.png` export to the generator page using the generated world-engine terrain colors.
- [x] 1.2 Update generator page instructions to include copying `terrain-colors.png` when present.
- [x] 1.3 Add or update a focused test/self-check for color sidecar export dimensions.

## 2. Map Generation

- [x] 2.1 Update the Go map-generator to copy optional `terrain-colors.png` from `map-generator/assets/maps/<map_name>` to `resources/maps/<map_name>`.
- [x] 2.2 Verify maps without `terrain-colors.png` still generate successfully.

## 3. Runtime Loading

- [x] 3.1 Extend map data/loading types to expose an optional terrain color sidecar path or loader.
- [x] 3.2 Load and decode `terrain-colors.png` only when present.
- [x] 3.3 Validate sidecar dimensions against the loaded `GameMap` dimensions and ignore invalid sidecars.

## 4. Rendering

- [x] 4.1 Attach a `BoardMap.colorizer` when valid rich terrain colors are loaded.
- [x] 4.2 Keep existing terrain-byte palette fallback for maps without valid sidecars.
- [x] 4.3 Add a focused renderer/color utility test proving sidecar colors override terrain-byte colors.

## 5. End-to-End Check

- [x] 5.1 Generate a map with `terrain-colors.png`, run `npm run gen-maps`, and verify the sidecar appears in `resources/maps/<map_name>`.
- [x] 5.2 Launch the generated map and verify the original OpenFront game renders the rich terrain colors.
