## ADDED Requirements

### Requirement: Selected next-match difficulty

SimpleFront SHALL expose a difficulty selector, default invalid/missing values
to Medium, persist only in SimpleFront's settings namespace, and pass the
validated selection into a new worker match. It SHALL not change an existing
match's deterministic configuration in place or modify OpenFront settings.

#### Scenario: Difficulty change during play

- **WHEN** the player chooses Hard while a Medium match is running
- **THEN** the choice is identified as next-match configuration
- **AND** restarting creates a Hard match without mutating the old simulation

### Requirement: Authoritative visible match completion

The worker SHALL project the actual core winner and elapsed simulation time,
publish the final interactive frame before stopping, and expose a restartable
win/loss result. SimpleFront SHALL reject new play actions for a completed match,
clear results on restart, keep ambient UI separate, and retain the existing
greater-than-80-percent FFA victory rule without a 15-minute forced cutoff.

#### Scenario: Victory and restart

- **WHEN** the real core declares a winner
- **THEN** the final frame names the winner, identifies the human outcome, and shows elapsed time
- **AND** no further interactive ticks/actions resume that completed match
- **AND** restart clears the result and creates fresh resource/AI state

### Requirement: Active economy presentation

The selected UI SHALL replace the passive-sandbox notice only when active AI is
wired and verified, retain authoritative resource/cost/painting feedback, and
use copied translated strings without restoring obsolete seed/logistics controls.

#### Scenario: Playing against active opponents

- **WHEN** a selected SimpleFront match starts with active opponents
- **THEN** it displays current paid painting/dispatch prices and no passive-opponent claim
