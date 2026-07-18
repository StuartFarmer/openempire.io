# shared-wesl-library

## ADDED Requirements

### Requirement: A cross-system WESL library is importable as `shared::`

There SHALL be a shared WESL library at `src/client/lab/shared/**.wesl`, linked
into every system's compilation and importable as the `shared::` package (e.g.
`import shared::combat::conquers;`). Shared modules SHALL follow the lib
convention — pure functions taking all values as arguments, with no
`layers::`/`params::` registry imports — so they are system-agnostic. The
compiler SHALL make `shared::` resolvable in every layer, view, and derivation
pass without per-system wiring.

#### Scenario: Any system imports a shared module

- **WHEN** a system's layer file imports `shared::growth::logistic`
- **THEN** the compiler links the shared module and the layer uses it, with no copy of the function in the system folder and no registration beyond the import

#### Scenario: Shared modules take values as arguments

- **WHEN** a shared module needs a layer value
- **THEN** it receives it as a function argument (the caller reads `layers::…` and passes it in), keeping the shared module free of system-specific registry references

### Requirement: Common mechanics are de-duplicated into the shared library

The shared library SHALL be seeded with the mechanics currently copy-pasted or
obviously reusable across systems: at minimum `shared::combat` (deterministic
`defenseOf` / `conquers` conquest with a hysteresis margin) and `shared::pack`
(attacker+pressure `u32` bit-packing). The empire and territory systems SHALL
import these from `shared::` rather than each carrying its own diverged copy.

#### Scenario: Combat lives in one place

- **WHEN** empire and territory both need conquest resolution
- **THEN** both import `shared::combat` (each passing its own parameters), and neither system folder contains a private `combat.wesl`

#### Scenario: The bit-packing encoding is shared

- **WHEN** a system packs an attacker id and pressure into one `u32`
- **THEN** it uses `shared::pack`, so every system that reads/writes that encoding agrees on the bit layout

### Requirement: Reusable authoring fragments are shared in TS

There SHALL be a shared TS surface (`src/client/lab/shared/index.ts`) exposing
reusable manifest fragments — at minimum a standard per-player intent field set
(`PLAYER_INTENT`) that game systems reference for their `players` block, and
reusable AI helpers — so game systems compose common defaults instead of
re-declaring them.

#### Scenario: A game system reuses the standard player intent fields

- **WHEN** a game system declares its `players` block
- **THEN** it can reference the shared `PLAYER_INTENT` field set rather than re-listing `alive`/`attacking`/`commit`/`targetX`/`targetY`, and the shared `ai` helpers can write those same fields
