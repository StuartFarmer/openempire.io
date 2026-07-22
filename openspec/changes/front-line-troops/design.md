## Context

`AttackImpl` holds `_troops: number` plus `_border: Set<TileRef>` — the set of
**enemy tiles the attack is currently pressing**. `_borderSize` feeds
`attackTilesPerTick` (the per-tick tile budget), and `clusteredPositions()` uses
`_border` purely to place HUD labels. Troops are never associated with a tile.

`AttackExecution.tick()` dequeues tiles from a priority heap, and for each one
calls `Config.attackLogic(gm, attackTroops, attacker, defender, tileToConquer)`
with the attack's **global** troop count, subtracting the returned loss from that
same global number.

`borderSegment()` (`src/core/execution/utils/BorderSegment.ts`) already turns a
click into a contiguous stretch of the player's border, with breadth decaying
exponentially in cursor distance. It is already computed and already shipped to
the sim as `sourceTiles`, and `AttackExecution.init()` already uses it to seed
the conquest queue. Only the force resolution ignores it.

## Goals / Non-Goals

**Goals:**

- Force has a location. Committing troops affects the stretch you committed to.
- Countering an incoming push at one point does not dissolve it elsewhere.
- Concentration is a real tactic: troops-per-tile decides local outcomes.
- `attack.troops()` stays valid as a total so no client/AI/stat reader breaks.

**Non-Goals:**

- Defender-side spatialization (population-weighted defense). Deliberately out —
  it was tried in `localize-defender-density`, measured, and removed: population
  is far too sparse for it to matter (11 populated tiles in a 66k-tile world).
- Troop _movement_ as a standalone order. Troops move only as part of an attack.
- Changing terrain magnitudes, defense posts, fallout, traitor, or large-nation
  modifiers.

## Decisions

### D1: Troops live on the attack's front — the enemy tiles it presses

`_troops: number` → `_troopsAt: Map<TileRef, number>` keyed by the tiles in
`_border`. `troops()` returns a maintained sum, so every existing caller is
unaffected.

Troops sit on the tiles being _pressed_, not on the attacker's own staging
ground. This is the smaller change: `_border` already exists, is already
maintained by `addBorderTile`/`removeBorderTile`, and is already the exact set
of places where this attack is in contact with the enemy.

_Alternative considered:_ troops on the attacker's own frontier tiles (more
physical — an army stands on its own ground and pushes outward). Rejected for
now: it needs a second per-tile structure alongside `_border` and a rule for
moving troops onto each newly conquered tile, for no behavioural gain at this
stage. Revisit if troop movement ever becomes an order in its own right.

### D2: A commitment is distributed across the clicked segment

`init()` seeds the front from `sourceTiles` (the clicked stretch) or the whole
border. Whatever tiles that seeding produces, `startTroops` is spread over them
**evenly**, with the integer remainder handed out in tile order so the sum is
exact and the result is deterministic.

Even spreading, not weighted: the segment already encodes the player's intent
(`borderSegment` narrows it as the cursor goes deeper), so weighting by
suitability or terrain inside the segment would fight the player's aim.

### D3: Opposing fronts clash only where they are adjacent

This is the fix for the reported bug. Delete the global annihilation loop.

Geometry: if A attacks B, `A._border` holds **B-owned** tiles. If B attacks A,
`B._border` holds **A-owned** tiles. Along a shared frontier those two sets are
4-adjacent to each other. So for each pair `(a, b)` with `a ∈ A.front`,
`b ∈ B.front`, `adjacent(a, b)`, the forces at `a` and `b` annihilate by
`min(A.troopsAt(a), B.troopsAt(b))`.

Consequences, all intended:

- Countering at one end of the border leaves an enemy push at the other end
  completely untouched — the fronts are not adjacent, so there is no pair.
- Annihilation is bounded by what is _locally_ present, so a huge army cannot
  erase a push it has not reached.
- A tile's force can be spent against several opposing tiles it touches, and
  vice versa; iterate pairs in a fixed tile order so the outcome is
  deterministic.

### D4: Advance spends the force at the tile

`attackLogic` receives the troops local to `tileToConquer` instead of the
attack's global total, and the loss is subtracted from that tile's entry. If the
local force is exhausted the tile is not taken and is re-queued behind the rest
of the front — that stretch stalls while the remainder of the front keeps
advancing.

This is what makes concentration pay. Cost per tile is driven by
`within(defender/attacker, 0.6, 2)`, so a thin stretch sits at the 2× ceiling
while a concentrated one sits at the 0.6× floor — a 3.3× swing that today is
invisible because `attackTroops` is the whole army no matter how wide the front.

### D5: Bounded seep along the front

Each tick, every front tile gives a configured fraction of its troops to be
shared with its front-adjacent neighbours. Without this, a stretch that stalls
stays stalled forever and a breakthrough cannot be exploited. With it, an army
is a viscous fluid rather than a rigid lattice.

The fraction is a knob (`frontSeepFraction`). At 0 the front is perfectly rigid;
at 1 it re-averages every tick and the change degenerates back toward the
current global-pool behaviour. Seep is computed from a snapshot of the field so
it does not depend on iteration order.

### D6: `setTroops` scales the field

Existing callers (`AttackExecution.retreat`, merges, boat arrivals) call
`setTroops(n)`. Keep the signature: it rescales every entry proportionally to
hit the new total, preserving the distribution's shape. When the field is empty
and `n > 0`, fall back to spreading over the current front.

### D7: The AI commits to segments

`AiAttackBehavior` currently attacks with no `sourceTiles`, taking the
whole-border path. It picks a segment of its border facing the target — otherwise
every AI push is maximally thin and the AI is strictly disadvantaged by D4.

## Risks / Trade-offs

- **The front stalls into stalemate.** A push that runs low everywhere stops
  rather than grinding on. → D5's seep plus the existing retreat path; watch
  `firstElim` and alive-counts in the harness.
- **Front oscillation.** Two adjacent fronts trading a tile back and forth every
  tick. → The lab `conquest` system solves this with a hysteresis margin on
  `conquers`; adopt the same if it appears.
- **Cost.** Per-tile bookkeeping on every conquest and a seep pass per tick, vs
  a scalar today. The field is bounded by the front size, not the map. → Watch
  `tests/perf`.
- **AI regression.** D7 is a real behaviour change on top of a combat change;
  if AI win-rates collapse, the segment width is the first knob to widen.
- **Balance shifts.** Concentration becoming viable is the _point_, but it will
  move every conquest-pace number. Expect a re-sweep.

## Migration Plan

No persisted state or wire format changes — the field is derived and rebuilt by
normal play. Stage it: land the field with a single front tile per attack
(equivalent to today), verify the suite is unchanged, then enable real
distribution, then the local clash. Rollback is reverting the change.

## Open Questions

- `frontSeepFraction`'s default is unmeasured; the harness sets it.
- Should a stalled stretch retreat on its own rather than waiting for the whole
  attack to retreat? Deferred — it needs a per-stretch retreat concept.
- Should the defender's population eventually weight local defense (the
  `localize-defender-density` idea)? Only worth revisiting once cities are
  large enough for fronts to reach them.
