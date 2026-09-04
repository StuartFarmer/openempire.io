## Why

Generated maps currently lose their rich world-engine coloring when compiled into OpenFront maps because the existing map pipeline keeps only terrain bytes. We need generated maps to render with their baked climate/biome/elevation colors while preserving the original OpenFront gameplay format.

## What Changes

- Export an optional `terrain-colors.png` from the generator page using the generated world-engine terrain colors.
- Teach the Go map-generator to copy an optional `terrain-colors.png` source file into `resources/maps/<map_name>/terrain-colors.png`.
- Extend map loading so runtime map data can expose an optional rich terrain color asset path.
- Attach a `BoardMap.colorizer` for maps that provide the color sidecar.
- Preserve existing map behavior when the sidecar is absent.
- Defer runtime layer loading and any gameplay use of rich layers.

## Capabilities

### New Capabilities

- `rich-terrain-color-sidecar`: Generated maps can provide an optional baked terrain color image that the OpenFront renderer uses instead of deriving terrain colors from the terrain byte.

### Modified Capabilities

- None.

## Impact

- Affected generator page: adds a `terrain-colors.png` download.
- Affected Go map-generator: copies an optional sidecar file from source maps to generated map resources.
- Affected runtime loader/renderer: optionally loads sidecar RGBA data and wires it into the existing `BoardMap.colorizer` hook.
- Existing maps, map binaries, gameplay terrain bytes, and simulation rules remain compatible.
