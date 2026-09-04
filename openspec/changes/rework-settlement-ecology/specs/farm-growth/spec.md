# Spec: farm-growth

See `design.md` §1b for the model and rationale. A planted Farmland is a
nucleus; the field grows itself as a cellular automaton, the mirror of the
city CA (add-urban-core-growth).

## ADDED Requirements

### Requirement: A Farmland is the nucleus of a growing field

A placed Farmland SHALL anchor a **field**: a contiguous set of per-tile field claims that spreads over time, replacing the static one-tile plot. The CA state SHALL be the existing per-tile establishment/maturity scalar (no separate state enum): a wild tile 4-adjacent to a field tile whose maturity is at or above a configured spread threshold begins accruing establishment, and a tile whose establishment crosses the configured claim threshold becomes a **claimed field tile**. Spread SHALL be restricted to land the player owns, with zero tile damage, that is passable and unclaimed by either automaton. Field tiles SHALL NOT be separate units — the Farmland unit remains the only unit.

#### Scenario: A field outgrows its plot

- **WHEN** a Farmland is planted on suitable ground and time passes with labor available
- **THEN** adjacent suitable tiles establish, cross the claim threshold, and the field's claimed area grows beyond the original tile

#### Scenario: Spread stops at the border

- **WHEN** a field's frontier reaches tiles the player does not own (or damaged or impassable tiles)
- **THEN** establishment does not accrue there and the field does not claim them

### Requirement: Fields grow as discrete tilled plots, paced and labor-gated

(Revised 2026-07-15 after playtest: the continuous per-tile diffusion read as a fast circle flooding out of the seed.) A field SHALL grow by placing discrete **1×1 tilled plots**, one at a time — every structure in the game is single-tile; the tilled-soil look is the plot SPRITE pattern, not a multi-tile footprint. Each nucleus accrues growth credit proportional to its field's TILLED output (a bigger, riper field readies its next plot sooner — the mutual-aid channel), and on reaching the plot cost places ONE plot on its frontier, picked by seeded weighted random over eligible frontier tiles — weight = suitability × water access (humidity, groundwater, river/shore) — so plots favor river valleys without racing along them. Every plot tile SHALL be claim-viable (suitability at or above the claim threshold — a plot on ground that would immediately senesce back to wild is never placed); desert is never eligible. Placement SHALL be gated on LABOR SURPLUS: a plot is placed only when the field's resident pool has spare hands beyond its currently tilled acreage (`farmersPerFieldTile` more) — labor caps field SIZE at the moment of expansion, and growth pace is otherwise set by suitability alone.

#### Scenario: Plots pop up one by one

- **WHEN** a healthy field grows
- **THEN** its area advances one visible tilled plot at a time at a readable cadence — never as a continuous front diffusing outward each tick

#### Scenario: Plots favor the river

- **WHEN** the frontier offers both well-watered and dry-but-viable tiles
- **THEN** the watered tiles are chosen more often (weighted, not exclusive)

#### Scenario: Desert stops a field

- **WHEN** every eligible frontier tile is below the claim-viability threshold
- **THEN** the field stops growing regardless of credit or labor

#### Scenario: No spare hands, no new plots

- **WHEN** a field's residents are fully occupied tilling its current acreage
- **THEN** no plot is placed even at full growth credit — the field waits for people

#### Scenario: A riper field readies plots sooner

- **WHEN** two fields differ only in tilled output (size × maturity)
- **THEN** the stronger field reaches its next patch first

### Requirement: Labor is a coverage gate, not a growth rate

A claimed field tile SHALL be **tilled** only while the field's shed-cell labor pool covers it at `farmersPerFieldTile`, with coverage assigned in deterministic rank order (maturity, then suitability). Only tilled tiles produce food and run their tenure clock. Claimed tiles left uncovered SHALL lie **fallow**: they produce nothing and their establishment senesces. A fallow tile senescing below the claim threshold SHALL die outright — establishment cleared to zero, the tile reverted to wild — and spread SHALL NOT re-drive ground the current coverage refresh already ranked, so reversion is decisive rather than a boundary oscillation. This coverage gate REPLACES the labor yield-multiplier of task 4.1 — labor is applied exactly once.

#### Scenario: Labor loss kills the margins first

- **WHEN** a field's labor pool shrinks below what its claimed area needs
- **THEN** the lowest-ranked (young, marginal) tiles go fallow and senesce first while the mature core stays tilled — the field contracts inward

#### Scenario: Labor returns before reversion

- **WHEN** the labor pool recovers while fallow tiles still hold establishment above the claim threshold
- **THEN** those tiles are tilled again and resume producing without re-establishing from wild

#### Scenario: An abandoned field dies

- **WHEN** a field's labor pool stays at zero
- **THEN** its tiles senesce and revert to wild from the margins inward, and the land becomes available to either automaton

### Requirement: First claim holds between the two automata

Claimed field tiles SHALL be ineligible for urban growth, and city tiles SHALL be ineligible for field spread — symmetric precedence, whichever automaton claimed the tile first keeps it while the claim lives. Land SHALL move between the automata only by death: a tile that reverts to wild (field senescence, or city razing/recession) is thereafter claimable by either. Tiles below the claim threshold (merely establishing) SHALL count as wild for precedence.

#### Scenario: The city grows around the field

- **WHEN** urban growth's best-suitability frontier tile is a claimed field tile
- **THEN** the city skips it and grows elsewhere — the field is never paved over

#### Scenario: A dead field yields to the city

- **WHEN** a fallow field tile reverts to wild and the city CA later selects it
- **THEN** the tile urbanizes normally

### Requirement: Field yield is the sum of its tilled tiles

Food production of a field SHALL be `Σ over tilled tiles of maturity · f_soil · yieldPerTile`. The per-plot district adjacency bonus SHALL be removed (clustering advantage is now structural, via spread), and no labor multiplier SHALL apply to yield.

#### Scenario: A grown field out-produces its old plot

- **WHEN** a field has grown to N tilled tiles of comparable maturity
- **THEN** it produces on the order of N times a single plot — the growth IS the production curve

### Requirement: Fields are visible as tilled soil

Claimed field tiles SHALL render with the **same tilled-soil plot pattern as the Farmland structure** (the sprite look every tribal plot shares, drawn per tile by the plot pass) — a field reads as brown worked earth spreading plot by plot, indistinguishable in texture from its nucleus.

#### Scenario: Watching a field grow

- **WHEN** a field grows
- **THEN** each new claimed tile appears as a tilled-soil plot; fallow dieback removes plots one by one

### Requirement: The soil effect on food production is a tunable exponent

Normalized crop fertility (cropN) SHALL enter the food model through a configurable exponent `cropEffectExponent` (default 1 — raw fertility, today's behavior) wherever it affects production: the Liebig soil stave in climate suitability AND the per-tile yield factor (sim harvest and the planner's steady-yield mirrors alike). Because soil multiplies in at both sites, settled yield scales as ~cropN^(2·exponent) where soil is the binding stave — the exponent is THE lever for how life-and-death spawn soil quality is: below 1 it compresses the good-vs-bad-soil spread, at 0 soil is ignored entirely.

#### Scenario: Compressing the spawn-site lottery

- **WHEN** `cropEffectExponent` is lowered from 1 to 0.5
- **THEN** the settled-yield ratio between a 0.9-fertility tile and a 0.3-fertility tile falls from ~9× to ~3×, in both the sim's harvest and the planner's estimates
