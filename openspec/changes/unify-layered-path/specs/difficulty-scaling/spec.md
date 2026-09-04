# Spec: difficulty-scaling

## ADDED Requirements

### Requirement: Per-difficulty population multiplier

The layered carrying-capacity formula SHALL apply a configurable multiplier keyed by (player type, game difficulty), replacing the vanilla `maxTroops` type/difficulty scaling. Human players SHALL always use a multiplier of 1; bot and nation multipliers SHALL come from config so the balance harness can tune them.

#### Scenario: Easy difficulty weakens AI capacity

- **WHEN** a nation's max population is computed on Easy difficulty
- **THEN** the layered formula's result is scaled by the configured nation/Easy multiplier (< 1), while a human player's capacity on the same map is unscaled

#### Scenario: Human capacity is difficulty-independent

- **WHEN** the same player state is evaluated across all difficulties for a human player
- **THEN** the computed capacity is identical

### Requirement: AI economy cadence scales with difficulty

The AI economy pulse (bot tribe economy interval and nation structure-build frequency) SHALL stretch on lower difficulties and tighten on higher ones, via configured per-difficulty intervals.

#### Scenario: Slower AI on lower difficulty

- **WHEN** two otherwise-identical seeded games run on Easy and Impossible
- **THEN** the Easy AI attempts economy builds at a strictly lower frequency than the Impossible AI

### Requirement: AI target precision scales with difficulty

AI economy placement SHALL choose the best-scored candidate on the highest difficulty, and on lower difficulties SHALL choose uniformly (via the sim's seeded PRNG) among the top-k scored candidates, with k increasing as difficulty decreases. The attack-priority bonus for enemy economy tiles (Farmland/Settlement) SHALL scale by a per-difficulty `resourceFocus` factor (1.0 at the highest difficulty, decreasing on lower ones).

#### Scenario: Suboptimal placement on lower difficulty

- **WHEN** an Easy-difficulty nation places a Farmland with multiple candidate plots
- **THEN** the chosen plot is drawn from the top-k candidates by score rather than always the argmax

#### Scenario: Blunter economy-hunting on lower difficulty

- **WHEN** an Easy-difficulty AI attack weighs an enemy Farmland tile
- **THEN** the economy-tile priority bonus is applied at a fraction (< 1) of its Impossible-difficulty strength

#### Scenario: Determinism preserved

- **WHEN** the same seeded game is replayed at the same difficulty
- **THEN** every AI choice (cadence tick, chosen candidate) is identical across runs
