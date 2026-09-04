# organic-conquest

## ADDED Requirements

### Requirement: Mobilizing converts civilians to troops at an economic cost

A player SHALL convert `pop` (civilians who farm and produce food) into `troops` (who fight and move but do not farm), and back. Mobilization SHALL reduce food production in proportion to the civilians withdrawn, so raising an army shrinks the economy that feeds it — the central tension. `pop + troops` together SHALL remain bounded by the supplied carrying capacity.

#### Scenario: An army is paid for in food

- **WHEN** a player mobilizes a large fraction of a region's population
- **THEN** that region's food production falls and its store draws down, so a sustained army requires surplus fertile land behind it

#### Scenario: Demobilization restores the economy

- **WHEN** troops are demobilized back to civilians
- **THEN** food production recovers as the population returns to farming

### Requirement: Troops flow toward a directed target and attrite beyond supply

Troops SHALL move toward a player-directed target as a field flow along the supply gradient. Troops beyond their player's supply range SHALL attrite over time (unsupplied forces waste away), so offensives cannot be pressed arbitrarily far from settled land.

#### Scenario: A supplied advance holds; an unsupplied one withers

- **WHEN** a player pushes troops into contested land within supply range and, separately, far beyond it
- **THEN** the supplied force sustains itself while the unsupplied force attrites and dwindles

### Requirement: Contested tiles resolve by deterministic attrition with stable frontlines

At a contested border tile the outcome SHALL be deterministic: attacking force (troops massed on adjacent owned tiles, degraded by a supply factor) versus defending force (the tile's `troops` plus a militia fraction of its `pop` plus a terrain defense bonus). Both sides SHALL lose troops proportional to the smaller force. The attacker SHALL capture the tile only when its force exceeds the defense by a capture margin (hysteresis), preventing frontline oscillation; otherwise the attack is repelled with losses to both.

#### Scenario: The larger supplied force wins predictably

- **WHEN** a clearly superior supplied army attacks a weakly held border tile
- **THEN** it captures the tile, both sides take losses, and the survivors occupy it

#### Scenario: Frontlines are stable, not flickering

- **WHEN** two comparable forces meet along a border
- **THEN** tiles do not rapidly flip back and forth each tick — the capture margin holds a stable frontline until one side gains a decisive advantage

#### Scenario: Terrain favors the defender

- **WHEN** a tile with a strong terrain defense bonus (e.g. mountains, river crossing) is attacked
- **THEN** it resists a numerically larger attacker that would take open ground of the same size

### Requirement: Staging carrying capacity caps troop density

The troops a player can mass to attack a tile SHALL be bounded by the carrying capacity of the staging tiles they occupy — an army cannot stack beyond what the land it stands on can supply. Attacks staged from barren land SHALL be weaker than those staged from fertile land, all else equal.

#### Scenario: No desert doomstack

- **WHEN** a player tries to mass a huge army on low-capacity desert to strike an adjacent valley
- **THEN** the massed force is capped by the desert's carrying capacity, so the attack is limited despite the player's total strength elsewhere

### Requirement: A development threshold flags readiness for the next age

The system SHALL track a per-player development measure (e.g. sustained total population above a threshold) and flag when a player is ready to advance to Age II. In this slice the flag SHALL be observable but SHALL NOT unlock any new economy, resource, or unit — it is the hook the metal age will build on.

#### Scenario: Readiness is flagged, not consumed

- **WHEN** a player's sustained population crosses the development threshold
- **THEN** the system reports that player as Age-II-ready, and gameplay is otherwise unchanged in this slice

### Requirement: A stochastic combat mode is specified for later comparison

The design SHALL record a stochastic alternative to deterministic attrition — probabilistic tile capture weighted by the attack/defense ratio via a deterministic per-tick shared random roll (the territory prototype's method) — so it can be A/B tested against the deterministic model without re-deriving the design. This alternative SHALL NOT be implemented in this slice.

#### Scenario: The alternative is documented but dormant

- **WHEN** this change is implemented
- **THEN** deterministic attrition is the only active combat resolution, and the stochastic mode exists only as a written specification for a future toggle
