# shared-wesl-library

## ADDED Requirements

### Requirement: A cross-system WESL library is importable as `shared::`

There SHALL be a shared WESL library at `src/client/lab/shared/**.wesl`, linked
into every system's compilation and importable as the `shared::` package (e.g.
`import shared::growth::logistic;`). Shared modules SHALL follow the lib
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

### Requirement: The shared library holds only game-agnostic primitives

The shared library SHALL contain only GENERIC, game-agnostic primitives —
reusable math and helpers that are not tied to any one system's rules (e.g.
`shared::growth` logistic/decay, `shared::diffusion` a relax step,
`shared::palette` color ramps). A system's SPECIFIC mechanics — its combat
resolution, defense/conquest rules, and the data encodings those rules use —
SHALL live in that system's own `lib/`, never in `shared::`, even when two
systems have similar versions. Similarity between systems SHALL NOT be a reason
to promote a mechanic into `shared::`.

#### Scenario: A system's combat rules stay in the system

- **WHEN** empire and territory each resolve conquest (with different defense formulas and deterministic vs stochastic rules)
- **THEN** each keeps its own `lib/combat.wesl`, and `shared::` contains no combat/defense/conquest module

#### Scenario: Only generic math is promoted

- **WHEN** a helper is genuinely game-agnostic (logistic growth, a diffusion step, a color ramp)
- **THEN** it MAY live in `shared::` and any system imports it, passing its own parameters

### Requirement: Reusable authoring fragments are shared in TS

There SHALL be a shared TS surface (`src/client/lab/shared/index.ts`) exposing
reusable manifest fragments — at minimum a standard per-player intent field set
(`PLAYER_INTENT`) that game systems reference for their `players` block, and
reusable AI helpers — so game systems compose common defaults instead of
re-declaring them.

#### Scenario: A game system reuses the standard player intent fields

- **WHEN** a game system declares its `players` block
- **THEN** it can reference the shared `PLAYER_INTENT` field set rather than re-listing `alive`/`attacking`/`commit`/`targetX`/`targetY`, and the shared `ai` helpers can write those same fields
