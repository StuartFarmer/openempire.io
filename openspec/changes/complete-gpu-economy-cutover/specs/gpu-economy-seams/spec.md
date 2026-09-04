# Spec delta: gpu-economy-seams (complete-gpu-economy-cutover)

## ADDED Requirements

### Requirement: A seam is verified on what it serves

Before a provider seam is wired into the simulation, the ARTEFACT IT HANDS OVER SHALL be compared against the CPU function it replaces, on the same board. Verifying the pass BEHIND the seam is not sufficient: compaction, readback and any CPU-side reassembly are transformations that can each be wrong on their own.

The comparison SHALL cover the seam's whole output — for a field, both its membership and its values — and SHALL state how much it compared, so an empty or degenerate set cannot pass silently.

#### Scenario: The served artefact is diffed, not the pass behind it

- **WHEN** a provider is about to be installed
- **THEN** the values it would return are compared with the CPU's, and the comparison reports the size of the set it covered

#### Scenario: A verified pass does not imply a verified seam

- **WHEN** a compute pass already agrees with the CPU
- **THEN** the seam built on it is still verified separately, because compaction and reassembly sit between them

### Requirement: A performance measurement carries a health assertion

Any measurement of simulation cost SHALL be accompanied by an assertion that the simulation is still ALIVE — a count of the entities the work is done over, compared against the same count without the change.

A tick that runs faster because the work was skipped, thrown out of, or starved away is indistinguishable from a tick that runs faster because it was optimised, unless something counts the work. This SHALL NOT be left to judgement after the fact.

#### Scenario: A speed-up that killed the board is rejected

- **WHEN** a change makes the tick faster and the count of districts, farms or living players falls materially
- **THEN** the result is treated as a defect, not an improvement

#### Scenario: An exception inside a seam cannot pass as a saving

- **WHEN** a provider throws inside the simulation's tick
- **THEN** the health assertion fails, rather than the aborted work being reported as a lower tick cost

### Requirement: A measurement resolves the effect it claims

An A/B of simulation cost SHALL be INTERLEAVED — the two arms alternating on the same evolving board — and SHALL take enough samples that the difference it reports exceeds the board's own tick-to-tick variation.

Comparing two consecutive blocks of ticks on a board whose p95 is twice its median measures the board, not the change.

#### Scenario: Consecutive blocks are not an A/B

- **WHEN** simulation cost is compared before and after a change
- **THEN** the arms alternate on one board rather than running as separate blocks

### Requirement: A field that needs reassembling has not been ported

Where a per-tile field returning from the device would require the CPU to scatter, bucket, sort or index it before use, the field SHALL NOT be returned. The DERIVATION that consumes it SHALL move to the device instead, and the results SHALL cross back per district and per player.

MEASURED, and the reason this is a requirement rather than a preference: serving the shed's flood alone cost 16 ms per tick of CPU scatter and per-player bucketing — more than the flood it replaced was worth, turning a saving into a loss. Work moved off the device and then undone on the host has not moved.

A reassembly is the signature of a consumer left behind. Before adding one, the readers of the field SHALL be enumerated; a reassembly is justified only if some reader genuinely needs per-tile data on the host after the cutover.

#### Scenario: The scatter is removed rather than optimised

- **WHEN** serving a field would require the CPU to reassemble it per player
- **THEN** the consumer of that field moves to the device, rather than the reassembly being made faster

#### Scenario: The readers are enumerated before a field is returned

- **WHEN** a per-tile field is proposed to cross back
- **THEN** every host reader of it after the cutover is listed, and the return is justified against that list or abandoned

#### Scenario: Reassembly cost belongs to the readback

- **WHEN** a readback requires CPU work to become usable
- **THEN** that work is measured as part of the readback's cost when deciding whether the seam pays

### Requirement: A seam states how stale it may be, and consumers are guarded

A provider computed from a snapshot SHALL declare what may have changed since. Where its output names simulation ENTITIES — a farm, a settlement, a player — the consumer SHALL treat a name it no longer recognises as absent, not as an error and not as valid.

An external flood is computed before the tick and consumed during it, so a source it names may have been destroyed in between. A consumer that assumes otherwise fails inside the tick, and a failure there aborts the remaining work silently.

#### Scenario: A destroyed entity in a stale result is skipped

- **WHEN** a provider's output references an entity the consumer no longer has
- **THEN** that entry is skipped and the rest of the result is used

#### Scenario: Staleness is bounded and stated

- **WHEN** a seam is defined
- **THEN** the interval between the snapshot it reads and the tick it serves is stated, so a consumer can reason about what may have moved

### Requirement: Per-tile consumers switch together

The per-tile consumers of the GPU economy SHALL be switched as a unit for a ruleset. A partial switch SHALL NOT ship.

MEASURED: the dispatch and the upload are paid once per tick however many consumers are served, so the first consumer switched is net NEGATIVE (87.9 ms plus 29 ms of fixed cost, against 97.4 ms), the second roughly breaks even, and only the remainder are pure saving. A partial port is slower than no port.

#### Scenario: One consumer alone does not ship

- **WHEN** only some per-tile consumers are served from the device
- **THEN** the ruleset continues to use the CPU economy until the rest are ready

#### Scenario: The fixed cost is attributed once

- **WHEN** the cost of the GPU economy is reported
- **THEN** the dispatch and upload are counted once per tick, not once per consumer
