# Spec delta: gpu-economy (port-economy-to-gpu)

## ADDED Requirements

### Requirement: The GPU economy plays the same game

When a ruleset computes its economy on the GPU, it SHALL play the SAME GAME as the CPU implementation of the same rules: the same rules, the same knobs, the same quantities, the same distributions. Where the two differ tile by tile, the difference SHALL be attributable to the GPU evaluating a quantity MORE ACCURATELY — fresher, or in a different rounding — and never to a rule having changed.

Bit-identity SHALL NOT be the contract. Requiring it would mean reproducing the CPU's own approximations on purpose: its distance fields are refreshed on a cadence and read stale for up to ten ticks, so an implementation that floods every tick is more correct and cannot match hashes. Faithfulness to a cached snapshot is not a goal worth paying for.

Conformance SHALL therefore be demonstrated by all of:

1. **Per-pass isolation.** Each pass SHALL agree with the CPU function it replaces when both are given the SAME inputs — zero missing entries, zero predicate disagreements, and exact integer totals where the arithmetic is integer.
2. **Replay determinism.** The same seed on the same device SHALL produce the same game (see determinism below).
3. **Behavioural equivalence.** Balance metrics over several seeds — leader share, Gini, first elimination, survivors — SHALL fall inside the noise band the balance harness already characterises for seed-to-seed variation.
4. **The other ruleset untouched.** OpenFront's seeded reference hashes SHALL be unchanged.

Metrics alone cannot distinguish a correct port from a subtly wrong one, which is why (3) is the weakest of the four and never stands on its own; (1) is what actually carries the proof, pass by pass, against inputs held equal.

#### Scenario: A difference is explained, not tolerated

- **WHEN** a GPU-computed per-tile value differs from the CPU's
- **THEN** the difference is attributable to a named cause — a fresher input, or a stated floating-point bound — and not to a changed rule

#### Scenario: The other ruleset is untouched

- **WHEN** the GPU economy exists
- **THEN** OpenFront's seeded reference hashes are unchanged

### Requirement: Per-player quantities are not represented as fields

Work that is PER TILE — distance fields, crop maturity, tenure, district production and capacity, field extent, placement frontiers — SHALL compute on the GPU. State that is PER PLAYER — population, food stock, births, deaths, starvation, awarded seeds — SHALL NOT be indexed by tile.

This constrains REPRESENTATION, not the choice of processor. A per-player quantity held in a small dense array indexed by player slot is not a field, and computing it on the device is permitted: it relocates an addition, and nothing in the game can observe where an addition happened. What is prohibited is giving a per-player quantity a per-tile home, because people then acquire a location and starvation, labour and births all follow it.

The rule that a consumer cannot move while its producer stays behind applies to per-tile producers and consumers. It SHALL NOT be generalised into a requirement that per-player quantities become fields.

#### Scenario: Population is not relocated

- **WHEN** the economy computes on the GPU
- **THEN** population remains a per-player quantity and is not stored per tile

#### Scenario: A per-player total may be reduced on the device

- **WHEN** a per-player total is accumulated into a dense array indexed by player slot and read back per player
- **THEN** that is not a per-tile representation, and the game it produces is unchanged

### Requirement: What crosses back is bounded by content, not by map area

Results returning from the GPU SHALL be bounded by the SIZE OF THE ANSWER — districts, players, or covered tiles — and SHALL NOT scale with the area of the map. Per-district and per-player scalars indexed by a dense slot are the normal shape.

A whole field MAY cross back where it is genuinely the answer, provided it crosses at the CADENCE OF ITS CONSUMER rather than every tick, and provided the CPU work it implies is counted as part of its cost. MEASURED on spqr at tick 9102: two shed planes copy back in 4.3 ms against 0.7 ms for three district slot arrays — the copy is affordable. What is not is the O(grid) scan needed to partition a merged plane back into per-player answers, at 13.2 ms every time. A readback whose consequence is a full-map scan has not avoided the round trip; it has moved it.

An accumulator indexed by tile ref is grid-sized, so reading back "small results" so indexed costs more than the fields it was meant to replace. Slot assignment SHALL be a function of the set of districts, not of the order they are enumerated.

#### Scenario: Readback does not scale with the map

- **WHEN** the same game runs on a larger map with the same number of districts
- **THEN** the bytes returned per tick do not grow with the map's area

#### Scenario: A field crossing back is costed with its consequences

- **WHEN** a whole field is read back
- **THEN** the CPU work required to turn it into per-player answers is measured as part of that readback's cost, not treated as free

### Requirement: A weighted draw reproduces the distribution, and is a function of state

Where the CPU makes a weighted random choice over a candidate set, the GPU implementation SHALL select a candidate with the SAME PROBABILITY — the same candidate set, the same weights, the same law. It SHALL NOT be required to select the same candidate, since that would demand reproducing the CPU's evaluation order for no gain in play.

Both implementations' candidate POOL SHALL be a function of the board, never of the order a data structure was built in. A draw whose outcome depends on the insertion history of a map is not reproducible by anything but that exact map, and two identical boards would play differently — which is a defect regardless of where the draw runs.

The candidate set and its weights are per-tile work and SHALL be parallel. The draw itself MAY be parallel.

#### Scenario: The same board draws from the same pool

- **WHEN** a placement draw runs on the CPU and on the GPU from the same state
- **THEN** both draw from the same candidates with the same weights

#### Scenario: Build order does not decide the outcome

- **WHEN** the same set of candidates is assembled in two different orders
- **THEN** the draw's distribution is unchanged

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

Where the GPU evaluates in single precision what the CPU evaluates in double, the difference SHALL be bounded and STATED. An unexplained per-tile difference is a defect even when it is small; a stated one is a specification.

#### Scenario: A rounding difference is measured rather than assumed

- **WHEN** a pass evaluates a term in single precision
- **THEN** its worst divergence from the double-precision result is measured and recorded, not asserted to be negligible
