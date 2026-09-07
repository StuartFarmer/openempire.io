## ADDED Requirements

### Requirement: Reproducible actual-core standard matches

Balance measurements SHALL use actual SimpleFront configuration, map, spawn,
controller, action and winner paths on Verdantia with 25 authored nations, 50
bots, Medium, and normal simulation time. The benchmark SHALL record requested
and successful spawn counts, use seeds simplefront-pace-01 through -10, stop at
victory or 20 simulation minutes, and repeat seeds to verify deterministic traces.

#### Scenario: Unfinished measurement

- **WHEN** a run reaches 12000 post-spawn ticks without a winner
- **THEN** it reports unfinished with no fabricated victory time
- **AND** its survival/land/resource data remains in the report

### Requirement: Accurate action and pacing measurements

The benchmark SHALL record first build/neutral dispatch/neutral capture/enemy
dispatch/enemy capture/elimination, victory time, survivors, land share,
resource/plot curves, exact spending by category, rejected orders and legal
food-blocked decisions. It SHALL distinguish spending from refill/capacity loss,
exclude internal handoffs from new commitments, and keep telemetry out of game
decisions and hash inputs.

#### Scenario: Captured farm and landing

- **WHEN** capacity falls through capture and a previously paid transport lands
- **THEN** discarded food is not recorded as a purchase
- **AND** the landing is not recorded as another paid dispatch

### Requirement: Strategy comparison and honest calibration

The process SHALL compare farm-first, expansion-first and military-first
priorities using the same AI machinery, rotated seats and matched seeds at
2, 5 and 10 minutes. It SHALL retain tested presets and results, report medians,
ranges and unfinished runs, and aim for 10–15 minute median completed standard
matches with at least eight of ten finishing within the measurement horizon.
It SHALL report shortfalls rather than silently change approved map, population,
victory or combat rules. Human pacing claims SHALL include normal-speed playtest
evidence separate from accelerated simulation results.

#### Scenario: Target missed

- **WHEN** the tested preset produces a median outside the target or fewer than eight completions
- **THEN** the report states the shortfall and identifies measured causes
- **AND** numerical tuning retains comparison evidence or requests a new design decision for changes outside the approved rules

### Requirement: Independent verified delivery

Delivery SHALL include copied tests, typecheck, lint, build, browser flow,
source/asset/settings isolation and root picker/runtime checks. Root OpenFront
gameplay SHALL remain unchanged. Existing dirty work SHALL be preserved.

#### Scenario: Final handoff

- **WHEN** the implementation is handed back
- **THEN** the report identifies actual verification results and unresolved limits
- **AND** it does not claim deployment, root changes, or successful balance without evidence
