# Design — rework-ai-war-strategy

## Context

Nation attack logic (`AiAttackBehavior`, driven from `NationExecution` every `attackRate` ticks) is a gated pipeline: reserve ratio → trigger-ratio lottery → difficulty-ordered strategy list. Three structural problems:

1. **Wrong denominator.** `hasReserveRatioTroops`/`hasTriggerRatioTroops` divide by `config.maxTroops()` — housing capacity. A food-bound population sits far below housing (the code already notes this at the war-share comment), so nations idle in the 90%-skip trigger lottery for the whole game.
2. **No persistence.** Every attack is fire-and-forget; a winning push is not followed up — the next pass re-rolls the full gate chain.
3. **Unused omniscience.** The sim is perfect-information, but targeting only reads instantaneous home troop counts. Commitments, food runway, and power trends — all readable — are ignored.

Relevant facts about the existing model (verified in code):

- `player.troops()` is the **home/idle pool**: troops in outgoing attacks and transports are deducted and live in the `Attack`/unit. `deployableTroops` reconstructs living population as `troops() + deployed`.
- `player.foodFlow()` exposes `{production, consumption, capacity, population}` where `capacity` is the food-supported population (productionMilli / idleConsumptionMilli) — the sim's own statement of achievable population.
- `player.food()` is the food stock (bigint display units), Barn/tenure-capped with decay.
- Relations are a per-pair integer in [−100, 100] bucketed via `relationFromValue`; `decayRelations` pulls values toward 0 over time. The `hated` strategy attacks `Relation.Hostile` players; embargo machinery keys off the same buckets.
- `attackSegment` picks a **uniform random** aim tile along the contact front and commits a bounded stretch around it.
- The war-share bound (`deployableTroops`, `maxWarShare = 0.2`) is a hard, never-suspended cap — a deliberate lesson (an AI once stacked attacks until its population starved). This change scales it but never removes it.

## Goals / Non-Goals

**Goals:**

- Nations act at the cadence their food economy actually supports (gates measured against achievable population).
- Wars have momentum: a nation winning cheaply keeps pushing (+EV free tiles); a nation bleeding population stops.
- Targeting uses strategic information: enemy commitment share, food runway, power trend, ongoing wars, local power differentials.
- War effort couples to the food economy in both directions (full barns → larger share; lean → smaller), via sweepable `FoodConfig` knobs.
- Deterministic: all randomness through the existing per-nation `PseudoRandom`; no wall-clock, no unseeded floats in decisions beyond the style already used in this file.

**Non-Goals:**

- No changes to bot (PlayerType.Bot) behavior (`attackRandomTarget`) beyond what shared helpers imply — bots stay dumb by design.
- No new fog-of-war / information model: the AI stays omniscient; this change is about _using_ what it sees.
- No changes to AttackExecution combat resolution, alliance mechanics, or nuke/warship behaviors.
- No difficulty rebalance beyond the levers touched here (population multipliers, cadence, budgets untouched).

## Decisions

### D1 — Readiness gates divide by achievable population

`effectiveMaxTroops(mg, player) = clamp(max(foodFlow().capacity, troops() + deployed), 1, config.maxTroops(player))`.

- `capacity` is what current production can sustain; `max` with living population handles the pre-equilibrium ramp (you are at least as "full" as the people you actually have — a nation at its food ceiling reads as ready even if production dips).
- Clamped above by housing so infinite-troops cheats and tiny maps behave.
- Used by `hasReserveRatioTroops`, `hasTriggerRatioTroops`, and `donateTroops`' keep-reserve. `calculateAttackTroops`' reserve target also switches: `targetTroops = max(effectiveMax * reserveRatio, staffingFloor)` — reserves are a fraction of the achievable army, not of housing.

_Alternative considered:_ rolling peak of living population. Rejected: needs state + decay tuning; `foodFlow().capacity` is the sim's own closed-form answer and re-tunes itself with every food-knob change.

### D2 — Power/commitment/runway helpers (WarIntel)

New pure helpers in `src/core/execution/utils/WarIntel.ts` (kept out of EconomyModel, which is the _economy_ marginal-value model):

- `totalPower(p)` = `troops()` + Σ outgoing attack troops + Σ transport troops — what a player can eventually bring home. Used for **threat** judgments (threat drift D5, surging check D7, troopSendCap's strongest-neighbor scan).
- `committedShare(p)` = deployed / max(1, totalPower) — how much of them is away from home. Used for **opportunity** (victim detection D6).
- `foodRunwayTicks(p)` = `Number(food()) / max(1, foodFlow().consumption)`; `Infinity` when consumption is 0. Used by famine targeting (D6) and war-share scaling (D8).

`troopSendCap` currently scans neighbors by `troops()` (home pool): a neighbor mid-push reads weak and the cap under-retains exactly when retaliation is coming. It switches to `totalPower`. This makes Hard/Impossible _safer_, offsetting the aggression added elsewhere — "AIs don't want to die."

### D3 — Campaign persistence with +EV pacing

`AiAttackBehavior` gains campaign state: `{ targetID, lastTiles, lastPop, stalls }`.

- **Open**: whenever `sendAttack` against a _Player_ succeeds through the normal strategy pipeline, the campaign is set to that target (snapshot own `numTilesOwned()` and living population).
- **Tick-through** (start of `maybeAttack`, after the TN-expansion fast path and the reserve gate, _before_ the trigger lottery): if a campaign is open and the target is alive and not friendly:
  - `gainedTiles = numTilesOwned() > lastTiles`; `popHolding = livingPop ≥ lastPop × campaignPopFloor` (knob, default 0.97).
  - Both true → **reinforce**: `sendAttack(target)` directly (skipping the trigger lottery and strategy scan), refresh snapshots, reset stalls.
  - `popHolding` false → the war is consuming the demography: close the campaign immediately.
  - `gainedTiles` false → `stalls++`; close after `campaignMaxStalls` (knob, default 2) consecutive stalled passes.
- Target dead, eliminated, or now friendly → close.
- Reinforcement still passes through `calculateAttackTroops`: reserve target, staffing floor, war share, and send caps all bind. Persistence changes _cadence_, never _depth_.

Tile count is global (losses elsewhere subtract) — that is the point: the campaign is +EV only if the nation is netting land overall while holding population.

_Alternative considered:_ tracking tiles taken from the specific target. Rejected: needs per-owner accounting the sim doesn't keep; global net worth is the correct EV signal anyway.

### D4 — Dogpile strategy (`joinWar`)

New strategy: scan `borderingEnemies` (ascending home troops) for an enemy X already in a war with a third party — `X.incomingAttacks()` has a non-friendly attacker ≠ us, or `X.outgoingAttacks()` has a target ≠ us — where `X.troops() < our troops()` (home-vs-home: we are hitting their homeland while they are busy). First match → `sendAttack(X)`.

Strategy-order insertion (keeps the difficulty personality distinction):

- Easy: not present.
- Medium: after `traitor`, before `weakest`.
- Hard: after `victim`, before `weakest`.
- Impossible: after `veryWeak`, before `assist`.

### D5 — Threat drift by local power differential

In `maybeAttack` (nations only — bots never run this path), once per pass, for each **bordering** non-friendly, non-bot player T: if `totalPower(T) ≥ threatPowerRatio × totalPower(us)` (knob, default 2), apply `updateRelation(T, −threatDriftPerPass)` (knob, default −10).

- Relation decay (existing) pulls back toward 0, so hostility persists only while the differential does; when the giant stops bordering (or shrinks), relations recover.
- Reaching Hostile feeds the existing `hated` attack strategy and the embargo pass — neighbors of a snowballing player (human or nation) organically turn on it, ally against it (alliance behavior already reads relations), and strike when it overextends (D2/D4 detect the commitment). Anti-snowball with no global leader bookkeeping.
- Nations do **not** drift against teammates or allies (`isFriendly` excluded), and the drift is one-directional (never a bonus for weak neighbors).

_Alternative considered:_ explicit map-leader tracking. Rejected per user direction: local differential composes better — everyone reacts to _their_ giant, which is the map leader only when it actually borders you.

### D6 — Famine warfare

Two independent pieces, both scaled by the existing `aiDifficulty().resourceFocus` lever (0.25 Easy → 1 Impossible):

1. **`starving` strategy**: among `borderingEnemies`, find one with `foodRunwayTicks < starvingRunwayTicks` (knob, default 200) whose home troops don't exceed ours (FFA guard ×1.2 like `findVictim`). A starving enemy loses population under pressure — attacks against it compound. Gated by `random.chance` scaled so it fires reliably at resourceFocus 1 and rarely at 0.25 (chance denominator `round(1/resourceFocus)`, i.e. Easy 1-in-4, Impossible always). Order: Hard/Impossible after `veryWeak`; Medium after `victim`-slot position (before `weakest`); absent on Easy.
2. **Front aiming**: `attackSegment` picks its aim tile by weighted draw instead of uniform. Contact tiles within Chebyshev radius 4 of any enemy Farmland/Settlement get integer weight `1 + round(3 × resourceFocus)`; all others weight 1. Weighted pick via cumulative sum over `random.nextInt` — deterministic, integer-only. TerraNullius targets keep the uniform draw.

### D7 — Strength trend memory

`AiAttackBehavior` keeps `prevPower: Map<PlayerID, number>` — each pass, after using it, it is refreshed with `totalPower` of current bordering players (entries for non-bordering players dropped, so the map stays O(neighbors)).

- `isSurging(p)`: `totalPower(p) > prevPower.get(p) × surgeGrowthFactor` (knob, default 1.1) — growing >10% per pass.
- Used as a _veto_: the `weakest` and `starving` strategies skip a surging enemy in FFA (fighting a nation on a steep growth curve is how you lose to compounding); `findVictim` additionally accepts a candidate whose power _fell_ since last pass and whose `committedShare > 0.5` even if incoming attacks alone miss the 50% bar.
- First sight of a player (no prev entry) → not surging.

### D8 — Dynamic war share

`deployableTroops` scales the share by food runway:

```
runwayN = min(foodRunwayTicks(p), warShareRichRunwayTicks) / warShareRichRunwayTicks   // 0..1
share   = maxWarShare × (warShareLeanScale + (warShareRichScale − warShareLeanScale) × runwayN)
```

New `FoodConfig` knobs (defaults): `warShareLeanScale = 0.5`, `warShareRichScale = 1.75`, `warShareRichRunwayTicks = 500`. At defaults: empty stock → 10% of population deployable, full barns (≥500 ticks of stored food) → 35%, and `warShareLeanScale = warShareRichScale = 1` recovers today's flat behavior exactly (sweepable). The cap remains hard and never suspended.

### D9 — What explicitly does not change

- `forceSendAttack` (spawn-time TN grab), bot pathways, `shouldAttack`'s difficulty-based mercy on humans, alliance request/betray logic, `assistAllies`, `donate` (except D1's denominator), boat-target sampling.
- The staffing floor ("farmers stay home") and its under-attack exemption.

## Risks / Trade-offs

- **[Aggression spiral: nations exhaust themselves]** → Every new attack path still flows through `calculateAttackTroops` (staffing floor, war share, send caps). D8's lean-scale _lowers_ the cap for starving nations — the collapse mode gets a tighter guard than today. Verified in the balance harness across difficulties.
- **[D1 makes early-game nations hyper-active]** (small capacity → ratios pass immediately) → send sizes stay bounded by war share of a small population; early activity is mostly TN expansion, which was already ungated. Watch in harness; `triggerRatio` constructor range is the fallback lever.
- **[Threat drift makes every nation hate a large human immediately]** → drift is per-pass (−10) against decay, bordering-only, and needs a sustained ≥2× differential; a mid-size player borders nations at <2× for most of the game. `threatPowerRatio` is the tuning lever if playtests feel dog-piley.
- **[Campaign reinforcement floods AttackExecution with parallel attacks]** → `sendAttack` on the same target merges via existing AttackExecution stacking (an attack against the same target adds troops); war share bounds total deployment regardless.
- **[foodFlow() is last-tick state]** → fine: decisions run every ~50–100 ticks; one tick of staleness is noise.
- **[Per-pass neighbor scans add cost]** → all new scans are O(bordering players + own units) on a cadence of ~1/50 ticks; `attackSegment` weighting adds one radius check per contact tile against a precomputed structure-tile set.

## Open Questions

None blocking. Knob defaults (`threatPowerRatio`, `campaignPopFloor`, `starvingRunwayTicks`, war-share scales) are first guesses to be tuned via the sweep harness; all live in `FoodConfig` or module constants per the boundaries above.
