# flag-selection-ui Specification

## Purpose
TBD - created by archiving change add-nation-flags. Update Purpose after archive.
## Requirements
### Requirement: Flag ref resolution

The client SHALL provide a resolver that turns a flag ref of the form `flag:<slug>` into a fetchable URL for the corresponding `resources/flags/<slug>.svg` asset (via `assetUrl`). An unknown or empty ref SHALL resolve to no flag rather than throwing.

#### Scenario: Known ref resolves to a URL

- **WHEN** the resolver is given `flag:<slug>` for a slug present in `flags.manifest.json`
- **THEN** it SHALL return the asset URL for that flag's SVG

#### Scenario: Unknown ref resolves to nothing

- **WHEN** the resolver is given an empty string or a ref whose slug is not in the manifest
- **THEN** it SHALL return a null/undefined result and callers SHALL render no flag image

### Requirement: Front-page flag picker

The front page SHALL present a flag control next to the name input that opens an emoji-picker-style popover. The popover SHALL display a 7×7 grid of 49 flags sampled at random from the manifest.

#### Scenario: Opening the picker shows a random slice

- **WHEN** the player opens the flag picker
- **THEN** it SHALL show 49 distinct flags drawn at random from the library, each rendered from its SVG

#### Scenario: Library smaller than 49

- **WHEN** the manifest contains fewer than 49 flags
- **THEN** the picker SHALL show all available flags without error or duplication

### Requirement: Reroll

The picker SHALL provide a dice-icon control that resamples a new random slice of 49 flags without closing the popover.

#### Scenario: Reroll resamples

- **WHEN** the player activates the dice/reroll control
- **THEN** the grid SHALL be replaced with a newly sampled set of up to 49 flags

### Requirement: Selection persistence and preview

Selecting a flag SHALL persist the chosen ref via `UserSettings.setFlag()`, close the popover, and update a small preview shown on the flag control. A control to clear the selection SHALL persist no-flag via `clearFlag()`.

#### Scenario: Selection persists across reload

- **WHEN** the player picks a flag and later reopens the front page
- **THEN** the previously chosen flag SHALL be shown as the current preview and used as the human's flag

#### Scenario: Clearing selection

- **WHEN** the player clears their flag selection
- **THEN** no flag preview SHALL be shown and the human nation SHALL fall back to a deterministic-random flag in the shell
