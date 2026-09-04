> **PARKED — 2026-08-06.** This design is coherent and was built far enough to
> run, but it is not what was asked for. The objective was to move the EXISTING
> game onto the GPU, and this turned into a different game: making population a
> per-tile field pulled local starvation, travelling labour, food transport,
> birth distribution and migration forces in behind it. Superseded by
> `port-economy-to-gpu`, which ports the original rules unchanged.
>
> Kept rather than deleted. The transport model — bandwidth-limited flow, roads
> worn in by traffic, demand-pulled cultivation — is worth having if a
> field-shaped game is ever wanted on its own terms. The lab system survives at
> `src/client/lab/systems/flow/`; it is simply no longer in the shell picker.

## Why

LeanFront's economy inherits OpenFront's representation, in which POPULATION is a
per-player scalar while housing, farms and food are per-tile fields. Everything
awkward about it follows from that split:

- `occupancy = urbanCivilians / housing` exists only to spread the scalar back
  over the field, and `rural / farmCount` to spread the remainder;
- the food shed is a global Voronoi flood answering "which farm does this tile's
  labor serve" and "which farms feed these people" — questions that only need
  asking because people are not anywhere in particular;
- labor pools, spillover caps and coverage ranking are a static approximation of
  people moving.

Hold people as a FIELD and the questions dissolve: labor is worked by whoever is
standing there, and food feeds whoever is nearby. What replaces the shed is
TRANSPORT — people flow toward work, food flows toward the hungry — which is
local, parallel, and produces an emergent logistics network that roads can
improve.

Separately, the economy's knobs are tuned in arbitrary units, and they do not
agree with each other. Fixing the scale — 10 km per tile, one tick per day —
makes rates derivable instead of tuned, and immediately exposes the disagreement:
`farmGrowthRate` already implies a realistic ~60–100 day growing season and
`tenureHalfTicks` a plausible 3.3 years, while `avgLifespanTicks: 100` implies a
100-DAY human lifespan and `foodShedRadius: 18` a 180 km daily commute. Knobs
compensating for inconsistent scales is a good explanation for why there are so
many of them.

## What Changes

- **Population becomes a field.** People per tile, integer, with a per-tile
  fractional carry. Every per-player population figure becomes a reduction over
  it.
- **Births are sampled, per tile.** Each tile draws its own births from its own
  population — which is the same distribution as picking a tile with probability
  `pop/total`, expressed in the form that parallelises (see design D2).
- **People FLOW.** A conservative relaxation: people move toward food and work,
  are tethered to urban centres, and are repelled by crowding. Flow is where an
  emergent road network attaches — traffic wears paths, paths lower travel cost.
- **Food FLOWS** toward unfed people at a finite speed, decays, and **surplus is
  LOST**. Storage is removed entirely, and is named as a future mechanic rather
  than a missing one.
- **Work is done by people ON the tile**, relaxed by a radius knob. At 10 km/tile
  a realistic daily commute is 1–2 tiles, so the food shed stops being a global
  flood and becomes a small local convolution.
- **Death is local.** People die where they are, of hunger or age.
- **Urban is a density threshold**, housing IS density, and development scales
  continuously from village to megalopolis.
- **Conquest razes.** Flee fraction 0, raze fraction 100% — conquest zeroes the
  population field. The flee/raze/transfer split is a later refinement.
- **The world gains a SCALE:** 10 km per tile by default, overridable per map;
  one tick is one day. Every rate is expressed in real units and derived.
- **BREAKING for LeanFront only.** OpenFront's economy is untouched.

## Capabilities

### New Capabilities

- `leanfront-population-flow`: population as a field, sampled births, local death,
  and the transport model for people and food.
- `leanfront-world-scale`: the km/tile and tick/day constants, and the rule that
  rates are derived from them.

### Modified Capabilities

_None._ OpenFront keeps `food-economy` and `urban-core-growth` as written. This
defines LeanFront's economy separately.

## Impact

- Removes, for LeanFront: the food-shed Voronoi and its tie-break, `laborByFarm`,
  `peopleByFarm`, spillover, coverage ranking, `occupancy`, the rural split,
  `_fieldStockMilli` and the whole storage/granary half of the ledger, and the
  conquest maturity special-casing.
- Adds: a population field with carry, a food field, push/gather transport passes
  shared by both, a traffic/road field, and a per-tile birth draw.
- Requires a re-tune, not a port. The knobs are in inconsistent units today, so
  they cannot be carried across — see the table in `design.md`.
- Needs its own baselines. Snowball metrics from the GPU sweep host are the
  instrument; hash comparison against OpenFront is meaningless across this change.
- A lab page for the flow model, so the forces can be tuned as a cellular
  automaton before they are wired into a game.
