# Spec delta: gpu-economy (port-economy-to-gpu)

## ADDED Requirements

### Requirement: The GPU economy computes the same game

When a ruleset computes its economy on the GPU, the simulation SHALL produce the SAME RESULTS as the CPU implementation of the same rules. No rule, knob, mechanic or quantity changes because of where it is computed.

Conformance SHALL be demonstrated by SEEDED HASH IDENTITY over a long run, not by comparing summary metrics. Metrics that merely look similar cannot distinguish a correct port from a subtly wrong one.

#### Scenario: A seeded game is unchanged by moving the economy

- **WHEN** the same seeded game is run with the economy on the CPU and on the GPU
- **THEN** the two produce identical hash streams for the whole run

#### Scenario: The other ruleset is untouched

- **WHEN** the GPU economy exists
- **THEN** OpenFront's seeded reference hashes are unchanged

### Requirement: Only per-tile work moves; per-player state stays

Work that is PER TILE — distance fields, crop maturity, tenure, district production and capacity, field extent, placement frontiers — SHALL compute on the GPU. State that is PER PLAYER — population, food stock, births, deaths, starvation, awarded seeds — SHALL remain as it is.

The rule that a consumer cannot move while its producer stays behind applies to per-tile producers and consumers. It SHALL NOT be generalised into a requirement that per-player quantities become fields: doing so changes where people are, which changes starvation, growth and labour, which is a different game.

#### Scenario: Population is not relocated

- **WHEN** the economy computes on the GPU
- **THEN** population remains a per-player quantity and is not stored per tile

### Requirement: Results cross back as aggregates, never as planes

What returns from the GPU each tick SHALL be per-district and per-player scalars, indexed by a dense slot. A whole field SHALL NOT be read back during normal play.

An accumulator indexed by tile ref is grid-sized, so reading back "small results" so indexed costs more than the fields it was meant to replace. Slot assignment SHALL be a function of the set of districts, not of the order they are enumerated.

#### Scenario: Readback does not scale with the map

- **WHEN** the same game runs on a larger map with the same number of districts
- **THEN** the bytes returned per tick are unchanged

### Requirement: A weighted draw is reproduced exactly, not merely in distribution

Where the CPU makes a weighted random choice over a candidate set, the GPU implementation SHALL select the SAME candidate for the same seed and state — not merely a candidate with the same probability.

Building the candidate set and its weights is per-tile work and SHALL be parallel. The DRAW itself is over a handful of candidates and SHALL be evaluated in the CPU's order, serially, because a sampler that reproduces only the distribution changes which tile is chosen and therefore changes the game.

#### Scenario: The same seed picks the same tile

- **WHEN** a placement draw runs on the CPU and on the GPU from the same state and seed
- **THEN** both select the same tile

### Requirement: Determinism is per device, and reductions are order-independent

A GPU-computed game SHALL be reproducible from its seed ON A GIVEN DEVICE. It SHALL NOT be required to produce identical results across GPU vendors, since the shading language specifies only bounded accuracy for division and transcendentals.

Every reduction over a set of tiles SHALL be integer. A floating-point atomic accumulation completes in nondeterministic order and therefore varies between runs ON THE SAME DEVICE — which is not a rounding difference but an unreproducible game.

#### Scenario: The same seed replays on the same machine

- **WHEN** a seeded game is run twice on one device
- **THEN** both runs produce identical results

#### Scenario: A district total does not depend on completion order

- **WHEN** many threads accumulate into one district total
- **THEN** the total is the same regardless of the order they complete in

### Requirement: Floating-point divergence is bounded and named

Where the GPU evaluates in single precision what the CPU evaluates in double, the difference SHALL be bounded and stated, and SHALL NOT be permitted to change a seeded hash. A term whose rounding does change a hash SHALL be converted to integer arithmetic rather than tolerated.

#### Scenario: A rounding difference is not allowed to become a behaviour difference

- **WHEN** single-precision evaluation of a term would alter the simulation's hash
- **THEN** that term is computed in integer arithmetic instead
