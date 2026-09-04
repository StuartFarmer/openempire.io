# flag-library-bake Specification

## Purpose
TBD - created by archiving change add-nation-flags. Update Purpose after archive.
## Requirements
### Requirement: Approved-flag selection

The `gen-flags` pipeline SHALL build the shipped flag library only from entries the external review marked `keep`, ignoring `pass` and `auto-pass` entries.

#### Scenario: Only kept flags are baked

- **WHEN** the review decisions file lists an SVG with status `pass` or `auto-pass`
- **THEN** that SVG SHALL NOT be copied into `resources/flags/` or appear in `flags.manifest.json`

#### Scenario: Kept flags are baked

- **WHEN** the review decisions file lists an SVG with status `keep` and the source file exists on disk
- **THEN** an optimized copy SHALL exist under `resources/flags/` and a matching entry SHALL appear in `flags.manifest.json`

### Requirement: Pure-vector preference

The pipeline SHALL prefer pure-vector, low-complexity flags by dropping SVGs whose source file size exceeds a configurable byte threshold (default chosen to exclude embedded-raster flags), and SHALL record the drop count.

#### Scenario: Oversized flag excluded

- **WHEN** a kept SVG's file size exceeds the size threshold
- **THEN** it SHALL be excluded from the library and counted in the pipeline's reported "dropped (too large)" total

### Requirement: Optimized copies with stable slugs

Each baked flag SHALL be optimized with SVGO and written under a deterministic slug derived from its filename, with collisions disambiguated so that every slug is unique.

#### Scenario: Slug collision disambiguated

- **WHEN** two kept source files reduce to the same base slug
- **THEN** the pipeline SHALL assign distinct slugs and both SHALL be present in the manifest with no overwrite

#### Scenario: Deterministic output

- **WHEN** the pipeline runs twice against the same source set
- **THEN** it SHALL produce the identical set of slugs and manifest entries (no run-to-run randomness)

### Requirement: Flag manifest

The pipeline SHALL emit `resources/flags/flags.manifest.json` as the index the client uses to enumerate and sample flags. Each entry SHALL carry at least a flag `id` (`flag:<slug>`) and a human-readable display name; entries SHALL be ordered so that a size-ascending ("purest vector first") slice is available.

#### Scenario: Manifest enumerates the library

- **WHEN** the pipeline finishes
- **THEN** `flags.manifest.json` SHALL contain one entry per baked flag, each with a unique `id` and a display name, and the total entry count SHALL equal the number of baked SVG files

### Requirement: External source is not committed

The pipeline SHALL take the review-decisions file and flag source directory as CLI arguments and SHALL NOT require the multi-gigabyte external source set to be committed to the repository; only the optimized, selected outputs live under `resources/flags/`.

#### Scenario: Source path supplied at run time

- **WHEN** `gen-flags` is invoked without a source-path argument
- **THEN** it SHALL fail with a clear message rather than assuming a hardcoded absolute path
