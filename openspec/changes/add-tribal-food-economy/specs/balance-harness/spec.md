# Spec: balance-harness

## ADDED Requirements

### Requirement: Headless seeded balance runs
The repo SHALL provide a headless harness (FullGamePerf pattern, no browser) that runs N full bot games from given seeds and config overrides and emits per-game time series: each player's territory share, population, food stock, production and consumption, starvation deaths, plus elimination times and the winner.

#### Scenario: Reproducible run
- **WHEN** the harness runs twice with the same seed and config
- **THEN** the emitted metrics are identical

### Requirement: Snowball metrics
The harness SHALL compute per run: leader territory share over time, territory Gini coefficient over time, and time-to-first-elimination — the signals used to detect runaway feedback loops (leader share growing superlinearly).

#### Scenario: Metrics in output
- **WHEN** a balance run completes
- **THEN** the output (JSON) contains the Gini and leader-share series and summary stats across seeds

### Requirement: Knob sweeps
The harness SHALL accept a set of `Config.food` knob overrides per run so a sweep (values × seeds) can be scripted, producing a comparison table across configurations.

#### Scenario: Sweeping a knob
- **WHEN** the harness is invoked with three values for the starvation rate across five seeds
- **THEN** it produces fifteen runs' metrics grouped by knob value
