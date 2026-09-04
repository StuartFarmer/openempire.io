## ADDED Requirements

### Requirement: Historically curated flag library

The SVG files already present in `resources/flags/` SHALL be the authoritative shipped flag set. Selection, size filtering, family pruning, and collision-safe naming are historical manual-curation steps performed before files enter that directory; `gen-flags` SHALL rebuild from the curated directory without requiring an external decisions file or source-path argument.

#### Scenario: Manifest rebuild uses the curated directory

- **WHEN** `gen-flags` runs with no source or decisions arguments
- **THEN** it SHALL enumerate the current `.svg` files in `resources/flags/` and rebuild the manifest without adding, removing, or renaming flag files

### Requirement: Stable current file identifiers

Each curated SVG filename stem SHALL be its stable slug, and its manifest id SHALL be `flag:<slug>`. Manifest rebuilding SHALL preserve those current filename-based identifiers, including authored country-code slugs used by existing maps.

#### Scenario: Current slugs remain stable

- **WHEN** the manifest is rebuilt from an unchanged `resources/flags/` directory
- **THEN** every SVG SHALL retain the same `flag:<slug>` id and resolve to the same `<slug>.svg` filename

### Requirement: Optional in-place optimization

`gen-flags` SHALL rebuild the manifest without modifying SVG bytes by default. It MAY optimize the curated SVGs in place when explicitly invoked with `--svgo`; if the optional `svgo` package is unavailable, it SHALL warn, skip optimization, and still rebuild the manifest.

#### Scenario: Default rebuild leaves SVGs untouched

- **WHEN** `gen-flags` runs without `--svgo`
- **THEN** it SHALL write the manifest without rewriting any curated SVG

#### Scenario: Optional optimizer is unavailable

- **WHEN** `gen-flags --svgo` runs without the optional `svgo` package installed
- **THEN** it SHALL report that optimization was skipped and SHALL continue the manifest rebuild

### Requirement: Deterministic manifest integrity

The pipeline SHALL emit `resources/flags/flags.manifest.json` with exactly one entry per current curated SVG. Every entry SHALL have a unique filename-derived `id` and a human-readable display name, the manifest count SHALL equal the SVG count, and entries SHALL be ordered deterministically by file size and then id.

#### Scenario: Manifest enumerates the library

- **WHEN** the pipeline finishes
- **THEN** `flags.manifest.json` SHALL contain one uniquely identified entry for every curated SVG and no entry for a missing SVG

#### Scenario: Repeated rebuild is deterministic

- **WHEN** the pipeline runs twice against an unchanged curated directory
- **THEN** it SHALL produce identical manifest entries in identical order

### Requirement: Production flag assets

The production asset build SHALL include every SVG referenced by `flags.manifest.json` and SHALL provide its hashed asset mapping so each manifest id resolves to a shipped file.

#### Scenario: Production build contains the manifest library

- **WHEN** a production build completes
- **THEN** every manifest-mapped flag SHALL have a corresponding built asset under `static/_assets/flags/`
