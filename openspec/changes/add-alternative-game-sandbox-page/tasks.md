## 1. Tests

- [x] 1.1 Add tests for deterministic alternative map creation and buffer/layer sizes.
- [x] 1.2 Add tests for local expansion claiming neighboring land while leaving water unowned.
- [x] 1.3 Add a client page test that verifies the sandbox element renders.

## 2. Alternative Game Core

- [x] 2.1 Add `src/games/alternative` map creation using `BoardMap`, terrain, elevation, and moisture layers.
- [x] 2.2 Add a compact terrain colorizer for the alternative board.
- [x] 2.3 Add a minimal local expansion step.

## 3. Sandbox Page

- [x] 3.1 Add a sandbox custom element/page that renders the alternative board preview and basic controls.
- [x] 3.2 Register the sandbox page in the existing app shell without changing the default OpenFront page.

## 4. Verification

- [x] 4.1 Run focused alternative-game tests.
- [x] 4.2 Run typecheck/build verification.
