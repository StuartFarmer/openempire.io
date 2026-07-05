## 1. Tests

- [x] 1.1 Add focused tests for deterministic alternative world-engine `BoardMap` generation.
- [x] 1.2 Add a test proving the `BoardMap` render path returns the generated world-engine terrain colors unchanged.
- [x] 1.3 Cover sandbox reset behavior so generated map replacement remains valid.

## 2. Implementation

- [x] 2.1 Port the parallel foundation world-engine domain generator and colorizer into the alternative game area.
- [x] 2.2 Add a `BoardMap` adapter for generated terrain, state, layers, resources, and exact terrain colors.
- [x] 2.3 Make `createAlternativeMap()` use the world-engine adapter.
- [x] 2.4 Update sandbox reset to replace the generated map object.

## 3. Verification

- [x] 3.1 Run focused alternative game and sandbox tests.
- [x] 3.2 Run TypeScript/build verification.
- [x] 3.3 Validate the OpenSpec change with `openspec validate port-alternative-world-engine-generator --strict`.
