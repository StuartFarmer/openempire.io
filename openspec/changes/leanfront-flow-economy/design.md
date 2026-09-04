## Context

Two facts drive every decision here.

**People are a field, not a scalar.** Once population lives per tile, "which farm
does this tile's labor serve" stops being a question — labor is whoever is
standing there. The food shed's Voronoi, the labor pools and the spillover caps
are all static approximations of people moving, and transport replaces them.

**The world has a scale.** 10 km per tile (per-map overridable), one tick per day.
Rates stop being knobs and become consequences.

## Goals / Non-Goals

**Goals:**

- One representation for people: a field, everywhere.
- Local, parallel update rules — no global flood in the per-tick path.
- Rates derived from km/tile and tick/day rather than tuned in arbitrary units.
- An emergent logistics network that roads can improve.

**Non-Goals:**

- Agent tracking. Flow is a relaxation over counts, not individuals.
- Storage. Surplus is lost; granaries are a later mechanic, deliberately absent.
- Changing OpenFront.

## Decisions

**D1 — Population is an integer field with a per-tile fractional carry.**
Integer people so a village is three people and not 3.4; carry so growth below
one person per tick still accumulates. This is what `_birthCredit` already does
per player, moved per tile.

**D2 — Births are sampled per TILE, which is the parallel form of sampling a
tile.**
The stated model is: pick a tile with probability `pop_i / total`, add a person.
For a per-capita birth process that is a multinomial draw, and it FACTORISES into
independent per-tile draws — `births_i ~ Poisson(pop_i × rate)` — with the same
marginals and no atomics, no serialisation and no cross-tile communication.

Cheapest correct form is stochastic rounding:

```
lambda = pop * birthRate
births = floor(lambda + U)      // U seeded per tile per tick
```

Mean exactly `lambda`; for `lambda < 1` it is Bernoulli(`lambda`), so small
settlements get whole births occasionally rather than fractions continuously —
the lumpiness the sampled model is wanted for. A Knuth Poisson draw is available
if the extra variance is wanted; the difference is variance, not mean.

Rejected: literally drawing K tiles by K weighted races. Each birth needs its own
winner, so K reductions per tick, where K is in the hundreds at realistic
populations. The per-tile draw is the same distribution for one pass (~0.3 ms).

**D3 — Transport is push/gather, and conservative.**
A relaxation that subtracts here and adds there RACES if written as a pull: two
tiles reading one source both take it. Split it:

```
pass 1 (push):   each tile computes its own outflow to each neighbour
pass 2 (gather): each tile sums the inflows aimed at it
```

No atomics, exactly conservative, two dispatches. The same machinery moves people
and food — one implementation, two quantities.

**D4 — Movement is one tile per tick, and that is a real speed.**
At 10 km/tile and one tick per day, single-neighbour exchange moves people
10 km/day. That is right for MIGRATION — relocating — and it keeps the scheme
stable without multi-hop iteration.

Daily COMMUTING is a different mechanism and must not be confused with it: a
worker walking to a field and home again covers ~10–20 km, i.e. 1–2 tiles. That is
the shed radius (D5), not flow. The two separate cleanly once the scale is fixed.

**D5 — Work is done by people on the tile, relaxed by a small radius.**
Start at radius 0 — a field tile is worked by its own residents. The radius knob
then loosens it continuously, and at 10 km/tile a realistic value is 1–2 tiles.
That makes the shed a LOCAL CONVOLUTION rather than a global Voronoi flood, which
removes the equidistant tie-break problem entirely (there is no seam to break).

Production is proportional to workers up to a per-tile ceiling; past it the
district must plant a new tile, which is what the patch mechanic already does.

**D6 — Food flows to the hungry, decays, and surplus is LOST.**
Food moves by the same transport as people, toward a hunger gradient, at a finite
speed. It decays on a timer. Anything not eaten and not decayed is simply gone:
there is no storage field, no capacity, no granary. The justification is in-world
(no bandwidth to haul it back, spoilage) and it removes the entire storage half of
the ledger. Storage returns later as a deliberate MECHANIC — a building that
extends the timer — rather than as ambient bookkeeping.

Per-tile decay is a field, not a constant, so upgraded farm tiles can keep food
longer without a special case.

**D7 — Death is local.** People die where they are, of hunger or of age. No
cohorts, no pooling, no requisition — the "camp" and "war" cohorts exist only
because population was a scalar that had to be divided up.

**D8 — Urban is a threshold on density, and density IS housing.**
One field, not two. Crossing the threshold makes a tile urban; the value above it
scales development continuously from village to megalopolis, which is a render and
a capacity curve rather than discrete tiers.

**D9 — Conquest razes completely, for now.**
Flee 0, raze 100%: conquest zeroes the population field on the captured tile. The
intended model is flee / raze% / transfer, but that is three coupled knobs to tune
at once, and the degenerate case is both the simplest to implement and the
easiest to reason about. Widen it once the flow model is tuned.

**D10 — Roads emerge from traffic.**
Flow cost is `f(gradient, roadQuality)`. Accumulate a `traffic` field from flow
magnitude and decay it; sustained traffic raises `roadQuality`, disuse lets it
fade. Paths wear in where people actually walk. This is a few lines on passes that
exist anyway, and it makes the logistics network a consequence of the economy
rather than a build menu.

**D12 — POTENTIAL and MOBILITY are separate objects.**
Flow between neighbours is

```
flow(i->j) = mobility(i,j) * (potential(j) - potential(i)) * pop(i) * rate
```

`potential` is where people WANT to be — food availability, urban proximity,
minus crowding. `mobility` is how easily they get there — terrain, and roads.

The split matters because the two do different things. A term in `potential`
changes the EQUILIBRIUM: a rich valley ten tiles from the nearest city is never
settled, because it is simply undesirable, and stays empty permanently. The same
term in `mobility` changes only the RATE: people trickle in slowly and the valley
eventually fills, faster once roads exist.

Both are wanted, and the requirements already imply which is which. Roads "lower
the cost for people to go to different places" — mobility. The urban tether is
about where life is sustainable — potential.

Failure mode to watch for in the lab (D11): food attraction and the urban tether
are competing terms in the SAME sum, so a strong tether makes people pile into
cities and starve rather than walk to food.

**D13 — Food shares people's flow speed, as a tunable ratio.**
Physically a laden cart and a walking migrant are similar, so food moves on the
same transport at the same base speed. The ratio is exposed rather than fixed at
1, because "food outruns migration" and "food lags migration" are different games
and the difference is worth being able to try.

**D14 — The per-tile work ceiling derives from hectares per farmer.**
One tile is 100 km^2 = 10,000 hectares at the default scale. Pre-modern arable
practice is roughly 2-4 hectares worked per farmer, which sets how many workers a
tile can absorb before another must be planted. Deriving it rather than choosing
it means later mechanics have somewhere to attach: a technology that raises
hectares-per-farmer raises the ceiling, with no new knob and no special case.

**D11 — Tune the flow model in a lab page before wiring it to a game.**
The forces (food attraction, urban tether, crowding repulsion) interact, and a
cellular automaton is far easier to tune in isolation than inside a full game.
The lab already hosts exactly this kind of system.

## The scale, and what it exposes

10 km/tile, 1 tick = 1 day. Derived: 1 year = 365 ticks; walking migration 1
tile/tick; a growing season ~90–120 ticks; a pre-modern lifespan ~15,000 ticks.

Checked against today's defaults, which do not agree with each other:

| knob               | default | in real units             | verdict            |
| ------------------ | ------- | ------------------------- | ------------------ |
| `farmGrowthRate`   | 0.08    | field matures ~60–100 d   | already right      |
| `tenureHalfTicks`  | 1200    | 3.3 years to half-plateau | plausible          |
| `avgLifespanTicks` | 100     | **100-day lifespan**      | ~150x off          |
| `foodShedRadius`   | 18      | **180 km daily commute**  | ~10x off           |
| food decay 1/2000  |         | half-life 3.8 years       | grain keeps months |

So the knobs cannot be carried across: some are already in day-units, others were
tuned to arbitrary units to make the game feel right. That inconsistency is a
plausible explanation for why there are so many of them. This change requires a
RE-TUNE, and the sweep is the instrument.

Map scale note: at 10 km/tile, spqr (2048 wide) spans 20,480 km — half Earth's
circumference. Geographically the Mediterranean over 2048 tiles is ~2 km/tile. The
per-map override covers this, but every real-Earth map needs its own value or it
plays at continental scale.

## Risks / Trade-offs

- **The re-tune is the real work.** The mechanics here are simpler than what they
  replace; the risk is entirely in whether the resulting game is good, and that
  is measured by the sweep's snowball metrics, not by any correctness check.
- **Flow may be too fast or too slow at 1 tile/tick.** It is fixed by the scale
  rather than free, which is the point, but if migration feels wrong the honest
  fix is the km/tile constant, not a fudge multiplier.
- **Emergent roads may not emerge.** Traffic-wears-paths can converge to a single
  trunk or to nothing depending on the decay/reinforcement ratio. This is exactly
  what D11's lab page is for.
- **No storage removes a buffer.** Districts will be much more exposed to a bad
  season, which may make famine dynamics violent. That is a tuning question, and
  the deliberate absence of storage makes it a legible one.

## Migration Plan

1. Build the flow model as a lab system and tune the forces there (D11).
2. Add the world-scale constants and re-express the surviving knobs in real units.
3. Implement the fields and passes in the LeanFront field system.
4. Re-baseline on the GPU sweep host; record LeanFront's own reference set.
5. Rollback: LeanFront's ruleset is separate; OpenFront never depends on any of it.

## Open Questions

_None outstanding — see D12, D13 and D14._
