# Spec: tile-stability

See `design.md` §2 for the model, curves, and disruption taxonomy.

## ADDED Requirements

### Requirement: Every tile carries a demand-gated tenure clock

On layered maps, each land tile SHALL carry a **tenure** counter (a single map-wide field, owner-agnostic). The clock SHALL advance only while the tile is pushed against its current limit — a city tile fully populated at its current density cap, or a Farmland whose maturity has settled at its tile's climate suitability — and only while the tile is fully healed (damage = 0). A tile below its limit SHALL NOT age (it does not need more capability).

#### Scenario: A full city tile ages

- **WHEN** a city tile sits at its current density cap for a sustained period
- **THEN** its tenure climbs

#### Scenario: A half-empty tile does not age

- **WHEN** a city tile holds fewer people than its current cap
- **THEN** its tenure does not advance

#### Scenario: A damaged tile does not age

- **WHEN** a tile has any remaining combat damage
- **THEN** its tenure does not advance regardless of population or maturity

### Requirement: Tenure raises tile capability on a saturating curve

Tenure SHALL feed each consumer through a saturating curve (steep early growth, plateau — an old tile and a very old tile are nearly equal):

- **City density cap**: the people a city tile can hold rises with its tenure, from a young-suburb floor to a mature-core ceiling (multiples of the base `popPerDensity`).
- **Farm storage capacity**: each Farmland's local food-storage capacity rises with its tenure from zero (see food-economy delta — this replaces Barns).
- **Settlement nucleus strength**: a Settlement's growth pacing (and/or supply reach) rises with its nucleus tile's tenure — the nucleus is naturally the oldest tile in its metro, so capitals and early foundings have gravity.

#### Scenario: Old cores are denser

- **WHEN** two city tiles have equal surroundings but one has far greater tenure
- **THEN** the older tile's density cap (and thus its population at capacity) is higher, up to the plateau

#### Scenario: The plateau bounds compounding

- **WHEN** a tile's tenure grows far past the curve's saturation point
- **THEN** its caps approach a fixed ceiling — age never compounds without bound

### Requirement: Disruption resets, decays, or pauses tenure by cause

Tenure SHALL respond to disruption asymmetrically: an **ownership flip hard-resets** the tile's tenure to zero (conquest yields raw land); **depopulation** (the tile falling below its limit through famine or recession) SHALL decay tenure slowly rather than reset it (famine is a setback, not a crater); **combat over the tile** SHALL pause the clock (and apply damage per tile-damage); a **razed plot** resets the tile's tenure.

#### Scenario: Conquest resets the clock

- **WHEN** a tile changes owner
- **THEN** its tenure is zero for the new owner — captured heartland arrives as raw land

#### Scenario: Famine decays, recovery resumes

- **WHEN** a starving city tile empties below its cap and later refills
- **THEN** tenure decayed during the vacancy but did not reset, and the clock resumes from the decayed value

### Requirement: Stability is visible

The renderer SHALL make tenure readable at a glance: city tiles visibly intensify (e.g. darker/denser fill) as tenure climbs, so heartlands, young frontiers, and raid scars are distinguishable without an overlay.

#### Scenario: Heartland vs frontier

- **WHEN** the player views a nation with an old core and freshly conquered edges
- **THEN** the core visibly reads as denser/older than the raw frontier
