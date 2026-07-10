# Spec: supply-field

## ADDED Requirements

### Requirement: Deterministic per-player supply field

Each player SHALL have a supply field over their owned land: an integer multi-source BFS distance (cardinal steps, owned passable land only) from every completed Settlement and Barn, converted to a quality multiplier `1/(1 + (distance/supplyRadius)^supplyDecayPower)`. Tiles with no path to a node (or beyond the flood cutoff) have quality ~0. The field SHALL be recomputed on a fixed cadence (knob), deterministic and identical across clients, with per-tick cost bounded by the flood cutoff.

#### Scenario: Quality falls smoothly with distance

- **WHEN** a tile sits at the supply radius from its nearest node
- **THEN** its quality is 0.5, with a smooth (not cliff-edge) gradient on either side

#### Scenario: Supply flows only through owned land

- **WHEN** enemy territory or water separates a pocket of owned land from all supply nodes
- **THEN** that pocket's quality is ~0 regardless of straight-line distance

### Requirement: Supply overlay

The client SHALL offer a toggleable overlay shading the player's territory by supply quality, so the logistics envelope is visible before committing to expansion or war.

#### Scenario: Reading the envelope

- **WHEN** the player toggles the supply overlay
- **THEN** well-supplied districts stay untouched (fully transparent) while the under-supplied frontier darkens toward black (alpha 0.8 at quality 0), updating as barns/settlements are painted
