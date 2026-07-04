## 1. Tests

- [x] 1.1 Add board-map validation tests for required buffers and custom layer length mismatches.
- [x] 1.2 Add terrain colorizer tests for default OpenFront coloring and custom layer-aware RGBA output.

## 2. Core Contract

- [x] 2.1 Add shared board-map types for terrain, state, typed layers, and terrain colorizers.
- [x] 2.2 Add a board-map validation helper.
- [x] 2.3 Add an adapter from existing `GameMap` instances to the board-map contract.

## 3. Renderer Hook

- [x] 3.1 Route terrain texture creation through the board-map colorizer when supplied.
- [x] 3.2 Preserve the existing terrain-byte colorizer as the default path.

## 4. Public Surface

- [x] 4.1 Export the board-map contract from the reusable board entrypoint.
- [x] 4.2 Document the layer/colorizer extension point in the board library docs.

## 5. Verification

- [x] 5.1 Run focused tests for board-map validation and colorization.
- [x] 5.2 Run typecheck/build verification.
