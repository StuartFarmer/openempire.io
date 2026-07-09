# Spec: econ-panel

## ADDED Requirements

### Requirement: Food time-series panel

On layered games the HUD SHALL offer a toggleable economy panel charting the player's food stock over time (ring buffer of recent samples). The y-axis SHALL scale dynamically to the current **maximum food storage capacity among all alive players**, so the player's line reads against the best economy in the game. The panel SHALL show the player's storage-capacity line (their own ceiling within that scale), current production and consumption values, and the player's live **rank by food stock** among alive players.

#### Scenario: Reading the bottleneck

- **WHEN** the player's stock line hugs their capacity line
- **THEN** the panel makes the storage bottleneck visible (build barns); a flat-low line with production ≤ consumption reads as a production bottleneck (build farms)

#### Scenario: Competitive scale

- **WHEN** another player's storage capacity grows past the player's
- **THEN** the y-axis grows with it and the player's line visibly shrinks relative to the leader — with the rank badge stating the position outright

### Requirement: Reusable resource chart

The panel SHALL be built as a resource-agnostic chart component (series source, capacity source, rank source as inputs) so later resources (metal, oil) become additional panel instances, not new implementations.

#### Scenario: Second resource

- **WHEN** a future age adds a second resource
- **THEN** its panel is an instantiation of the same component with different data accessors
