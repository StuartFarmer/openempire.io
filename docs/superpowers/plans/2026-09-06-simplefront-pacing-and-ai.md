# SimpleFront Pacing and AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user selected direct execution; do not dispatch subagents.

**Goal:** Deliver active paid-action opponents and tune the independent SimpleFront toward natural 10–15 minute standard matches with reproducible evidence.

**Architecture:** Keep the selected economy and AI authoritative in the copied core. One shared controller observes global resources and bounded local candidates, then delegates to existing paid purchase/combat executions. The worker publishes configuration/results; a real-core benchmark measures the same implementation.

**Tech Stack:** Existing TypeScript, Vitest, Lit, Zod, Vite, Node, and tsx. No added dependencies.

**Spec:** [Approved design](../specs/2026-09-06-simplefront-pacing-and-ai-design.md), [OpenSpec change](../../../openspec/changes/simplefront-pacing-and-ai/).

## Global Constraints

- Implementation stays inside `simplefront/`; root OpenFront Live, launch routing, assets, and unrelated changes remain unchanged.
- Work directly in the existing checkout. No subagents, broad staging, commits, server restarts, or deployment are authorized by this plan.
- Preserve manual complete-plot painting, global food, all-people-as-troops, exact milli-food charges, deployed/landing accounting, and existing combat/retreat mechanics.
- Initial capacities: `5000 + 5000 × farms` food; `10000 × cities` troops. Opening: one farm, one city, 4000 food, 2000 troops.
- Initial prices: farm 1500, city 2000, land/transport dispatch 0.2 food per newly committed troop.
- Every 100 ms tick: `gain = (a*K + r*x)*(1-x/K)` below capacity. Food `(a,r)=(0.001,0.004)`; troops `(0.0001,0.003)`.
- No workers, eating, logistics, ecological planners, autonomous plot growth, new economic bonuses, weapons, or diplomacy subsystem.
- Calibrate Verdantia, 25 authored nations, 50 bots, Medium, normal simulation speed, and the unchanged >80% FFA victory threshold. No forced 15-minute winner.
- Preserve copied legacy fixtures explicitly. New selected-runtime tests must use actual SimpleFront configuration.
- A benchmark timeout is unfinished, not a victory. Formula estimates and accelerated runs are not human-playability evidence.

## Execution checkpoints

Read the approved spec and this plan before implementation. Read the worktree and
TDD skills at execution time. Establish a fresh copied-suite/typecheck baseline;
the last recorded baseline was 142 tests in 20 suites, not a substitute for a
fresh run. Preserve the existing eight-file root diff and untracked copy.

Each task is a separate red/green/review cycle. Run the new test before production
edits, verify a relevant failure, implement, then rerun focused tests and
typecheck. If unrelated baseline failures exist, record them without changing
their scope. Record checkpoints in OpenSpec rather than committing untracked
application files. The final gate includes lint/build/browser/root checks.

All commands below run from the repository root. `npm --prefix simplefront test
-- tests/File.test.ts` resolves test paths relative to the copied app. Use local
installed binaries; do not download dependencies to execute this plan.

## Files and contracts

| File inside `simplefront/`                                                                                                        | Responsibility                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/core/configuration/PaintedEconomyConfig.ts`                                                                                  | Renamed bootstrap fractions, normalized helper, validated initial preset |
| New `src/core/configuration/PaintedAIConfig.ts`                                                                                   | Difficulty cadence and policy thresholds                                 |
| New `src/core/execution/utils/PaintedAI.ts`                                                                                       | Bounded observations, serializable state, deterministic decisions        |
| New `src/core/execution/PaintedAIExecution.ts`                                                                                    | Attach once, schedule, submit existing executions                        |
| Existing `Config.ts`, `Rulesets.ts`, `PlayerImpl.ts`, `SpawnExecution.ts`, `NationExecution.ts`                                   | Selection, AI state/hash, lifecycle integration                          |
| Existing `utils/PaintedEconomy.ts`, `PaintTilesExecution.ts`, `AttackExecution.ts`, `TransportShipExecution.ts`, `GameUpdates.ts` | Shared normalized projections and measured action outcomes               |
| New `src/client/shell/SimpleFrontMatch.ts`                                                                                        | Small pure result/difficulty helpers                                     |
| Existing `ShellSimProtocol.ts`, `ShellSim.worker.ts`, `GameShellPage.ts`, local `en.json`                                         | Difficulty input, active labels, final result UI                         |
| New `tests/util/PaintedAISetup.ts`                                                                                                | Real-core active AI fixtures with optional inert resource rates          |
| New `tests/perf/balance/PaintedBalance.ts`                                                                                        | Actual runner/map/controller measurement and serialization               |
| New `scripts/painted-balance.ts`                                                                                                  | Node file-loading/CLI boundary using installed tsx                       |
| New focused tests listed in tasks                                                                                                 | Requirements and regression evidence                                     |

Avoid repurposing the old `RunGameCore.ts` harness: its `SweepConfig extends
Config` selects the legacy economy and its metrics read food flow/idle troops.
Read it for local map-loading/runner patterns only.

### Economy signatures (Task 1)

```ts
// PaintedEconomyConfig.ts: replace absolute bootstrap fields, keep all other fields.
foodBootstrapFraction: number; // replaces baselineFoodRate
troopBootstrapFraction: number; // replaces recruitmentBootstrapRate

export function capacityScaledGain(
  x: number,
  k: number,
  bootstrapFraction: number,
  growthRate: number,
): number;
// Existing advanceResource still accepts an absolute baseline internally;
// its callers pass bootstrapFraction * capacity. No duplicated integration math.
```

### AI signatures (Tasks 2–5)

```ts
export type PaintedAIPolicy = "balanced" | "farm-first" | "expansion-first" | "military-first";
export interface PaintedAIConfig {
  decisionTicks: number;
  reserveMin: number; reserveMax: number;
  cityFill: number;
  neutralShare: number; enemyShare: number;
  budgetHorizonTicks: number;
  campaignSampleTicks: number; stallSamples: number;
  candidateBudget: number; coastRadius: number;
}
export function paintedAIConfig(difficulty: Difficulty): Readonly<PaintedAIConfig>;

// New Config method returns null; SimpleFrontConfig returns the difficulty preset.
paintedAI(): Readonly<PaintedAIConfig> | null;

export interface PaintedAIState {
  attached: boolean;
  phase: number; reserveRatio: number; policy: PaintedAIPolicy;
  lastDecisionTick: number;
  plotCursor: number; borderCursor: number; coastCursor: number;
  campaign: null | {
    targetID: PlayerID; sampleTick: number; targetTiles: number;
    ourTroops: number; stalled: number;
  };
  pendingCoast: TileRef | null;
  foodBlockedTicks: number;
}
export type PaintedAIDecision =
  | { kind: "wait"; reason: "food" | "troops" | "threat" | "no-target" | "no-site" }
  | { kind: "paint"; plot: "farm" | "city"; tile: TileRef }
  | { kind: "attack"; targetID: PlayerID | null; sourceTiles: TileRef[]; troops: number }
  | { kind: "transport"; tile: TileRef; troops: number }
  | { kind: "retreat"; attackID: string }
  | { kind: "boat-retreat"; unitID: number };
export function paintedAIState(player: Player): PaintedAIState | null;
export function dispatchTroops(
  idle: number, total: number, reserveRatio: number, share: number,
  foodMilli: bigint, costMilliPerTroop: bigint,
): number;
export function decidePaintedAI(
  game: Game, player: Player, state: PaintedAIState,
): PaintedAIDecision;
export function attachPaintedAI(gameID: string, game: Game, player: Player): void;
export class PaintedAIExecution implements Execution {
  constructor(private player: Player);
  // Execution interface: init, tick, isActive, activeDuringSpawnPhase.
}
// tests/util/PaintedAISetup.ts; resource rates can be inert, AI remains real.
export function aiFixture(options?: {
  inertResources?: boolean; playerType?: PlayerType.Bot | PlayerType.Nation;
}): Promise<{ game: Game; player: Player }>;
```

`PlayerImpl._paintedAI: PaintedAIState | null` owns the state. Keep one cast in
`paintedAIState`, like the existing resource helper. The policy variants are
benchmark-only priority ordering over the same choices; never expose free
resources or different validators. Production attachments always use balanced.

### Match result signatures (Task 6)

```ts
export interface SimpleFrontMatchResult {
  winnerID: PlayerID | null;
  winnerName: string;
  humanWon: boolean;
  elapsedSeconds: number;
}
export function simpleFrontResult(
  game: Game,
  humanID: PlayerID | null,
): SimpleFrontMatchResult | null;
export function parseSimpleFrontDifficulty(value: unknown): Difficulty;
// ShellSimIn.init: difficulty?: Difficulty
// ShellSimFrame: matchResult?: SimpleFrontMatchResult | null
```

### Measurement signatures (Task 7)

```ts
// New member in existing GameUpdateType and discriminated update union.
export interface PaintedActionUpdate {
  type: GameUpdateType.PaintedAction;
  player: PlayerID;
  kind: "farm" | "city" | "land" | "transport";
  outcome: "committed" | "rejected";
  reason?: "invalid" | "unaffordable";
  spentMilli: bigint;
  troops: number;
  tile?: TileRef;
}
// New observer helper in existing PaintedEconomy.ts; does not mutate balances.
export function recordPaintedAction(
  game: Game,
  action: Omit<PaintedActionUpdate, "type">,
): void;

export interface PaintedBalanceOptions {
  seed: string;
  maxTicks: number;
  sampleEvery: number;
  policyRotation: 0 | 1 | 2;
  comparePolicies: boolean;
}
export interface PaintedBalanceResult {
  seed: string;
  config: Record<string, unknown>;
  requestedBots: number;
  requestedNations: number;
  spawned: number;
  completed: boolean;
  victorySeconds: number | null;
  finalHash: number;
  wallMs: number;
  events: {
    tick: number;
    event: string;
    player: string;
    data: Record<string, unknown>;
  }[];
  samples: { tick: number; players: Record<string, unknown>[] }[];
}
export function runPaintedBalance(
  options: PaintedBalanceOptions,
  loader: GameMapLoader,
): Promise<PaintedBalanceResult>;
```

At the JSON boundary stringify bigint values as decimal strings; preserve exact
prices. In-memory action records retain bigint. Telemetry updates and wall time
must not affect decisions, PRNG state, or authoritative hash.

## Task 1: Normalize refill and update the selected preset

**Files:** Modify `PaintedEconomyConfig.ts`, `utils/PaintedEconomy.ts`,
`tests/util/PaintedSetup.ts`, `tests/PaintedEconomyConfig.test.ts`,
`tests/PaintedEconomy.test.ts`, `tests/PaintedEconomyMilitary.test.ts`,
`tests/PaintedEconomyPainting.test.ts`, `tests/PaintedEconomyPlots.test.ts`,
`tests/SimpleFrontPaintedWorker.test.ts`, and `tests/SimpleFrontPaintedUI.test.ts`.
Create `tests/PaintedEconomyPacing.test.ts`.

**Interfaces:** Produces economy signatures above; no AI changes yet.

- [ ] Record `git status --short`, root diffstat, copied full-suite result, and
      typecheck. Run `rg -n 'baselineFoodRate|recruitmentBootstrapRate|40n|2_000_000n|3_000_000n' simplefront/src simplefront/tests`
      to identify selected consumers; do not bulk-replace legacy settings.
- [ ] Write the normalized math tests and a real-core timing test:

```ts
test("capacity boosts refill without granting stock", () => {
  expect(capacityScaledGain(0, 10000, 0.001, 0.004)).toBe(10);
  expect(capacityScaledGain(4000, 10000, 0.001, 0.004)).toBeCloseTo(15.6);
  expect(capacityScaledGain(8000, 20000, 0.001, 0.004)).toBeCloseTo(31.2);
  expect(capacityScaledGain(11000, 10000, 0.001, 0.004)).toBe(0);
  expect(capacityScaledGain(0, 0, 0.001, 0.004)).toBe(0);
});
test("no-farm recovery can fund reconstruction in about 23 seconds", async () => {
  const { game, player } = await paintedFixture(true);
  player.removeFoodMilli(player.foodMilli());
  let ticks = 0;
  while (player.foodMilli() < 1_500_000n && ticks < 300) {
    game.executeNextTick();
    ticks++;
  }
  expect(ticks).toBeGreaterThanOrEqual(225);
  expect(ticks).toBeLessThanOrEqual(235);
});
```

- [ ] Run `npm --prefix simplefront test -- tests/PaintedEconomyPacing.test.ts`
      and verify missing helper/old timing failures.
- [ ] Rename bootstrap fields, update frozen defaults/prices, and implement:

```ts
export function capacityScaledGain(x: number, k: number, a: number, r: number) {
  return sigmoidGain(x, k, a * k, r);
}
// Snapshot: capacityScaledGain(Number(food), Number(capacity), c.foodBootstrapFraction, c.foodGrowthRate).
// Tick: advanceResource(Number(food), Number(capacity), s.foodCredit,
//   c.foodBootstrapFraction * Number(capacity), c.foodGrowthRate).
```

Validate each resource pair with `0<a<r` and `a+r<=1`, accepting explicit
`(0,0)` fixtures. Preserve all safe-count/capacity/rebuild checks. Update
projection and integration together, with no food-unit/milli-unit mix.

- [ ] Change tests asserting the old preset to assert the new exact amounts:
      500 troops cost 100 food, two farms cost 3000. For partial-stroke tests set
      exact stocks so the intended insufficient-food case still occurs. Preserve
      the real-combat trace and add one-city/added-city headroom and opening-build
      timing tests using the spec's estimates with small quantization tolerance.
- [ ] Run all copied tests and typecheck; record the task checkpoint. Do not
      label intentional old-preset failures as unrelated or erase assertions.

## Task 2: Deterministic AI lifecycle and budget primitives

**Files:** Create `PaintedAIConfig.ts`, `utils/PaintedAI.ts`,
`PaintedAIExecution.ts`, `tests/util/PaintedAISetup.ts`,
`tests/PaintedAIExecution.test.ts`. Modify selected methods in `Config.ts`,
`Rulesets.ts`, `PlayerImpl.ts`, `SpawnExecution.ts`; retain the painted early
return in `NationExecution.ts` to prevent legacy planners.

**Interfaces:** Produces AI config/state, `dispatchTroops`, attachment, and
execution contracts. `decidePaintedAI` initially returns a legitimate wait.

- [ ] Add primitive tests before integration:

```ts
test("reserve and food both bound a new commitment", () => {
  expect(dispatchTroops(2000, 2000, 0.35, 0.15, 60_000n, 200n)).toBe(300);
  expect(dispatchTroops(2000, 2000, 0.35, 0.15, 20_000n, 200n)).toBe(100);
  expect(dispatchTroops(300, 2000, 0.35, 0.3, 1_000_000n, 200n)).toBe(0);
});
```

Build `aiFixture` in the new fixture file by using the existing plains map
and real `SimpleFrontConfig`, with player type Bot/Nation, successful
`SpawnExecution`, and optional subclass overrides only for inert refill.
Return `{game, player}`. Initial balances always come from the real kit.
Add attach-twice, no-human-attachment, spawn-inactive, and death tests.

- [ ] Run `npm --prefix simplefront test -- tests/PaintedAIExecution.test.ts`
      and record relevant failures.
- [ ] Implement exact dispatch arithmetic, handling a zero-fee test config:

```ts
const reserve = Math.ceil(total * reserveRatio);
const desired = Math.max(0, Math.min(Math.floor(idle * share), idle - reserve));
const affordable =
  costMilliPerTroop === 0n ? BigInt(desired) : foodMilli / costMilliPerTroop;
return Number(BigInt(desired) < affordable ? BigInt(desired) : affordable);
```

Validate inputs before bigint conversion. Difficulty defaults: ticks
30/20/15/10, reserve [.30,.40], cityFill .75, neutral/enemy shares .15/.30,
horizon 200, campaign interval 100, stallSamples 2, candidateBudget 256,
coastRadius 96. Seed phase and reserve with the existing hash/PRNG utilities;
thereafter use stable ordering, not new randomness every tick.

- [ ] Attach in successful painted spawn only for Bot/Nation. Add a
      serializable nullable `_paintedAI` field to PlayerImpl and include its
      decision-affecting fields in selected hash, excluding the observational
      `foodBlockedTicks` counter. `attachPaintedAI` reuses an attached state rather than adding
      an execution. A permitted reroll resets strategic memory/cursors, preserves
      the existing attachment, and resets the timing anchor; a dead controller
      becomes inactive and clears its attached flag.
- [ ] Implement scheduling guard:

```ts
const state = paintedAIState(this.player);
if (!state || !this.player.isAlive() || game.getWinner() !== null) {
  this.active = false;
  if (state) state.attached = false;
  return;
}
if (game.inSpawnPhase() || !this.player.hasSpawned()) return;
const cfg = game.config().paintedAI();
if (
  !cfg ||
  ticks === state.lastDecisionTick ||
  ticks % cfg.decisionTicks !== state.phase
)
  return;
state.lastDecisionTick = ticks;
```

Initialize phase within the selected interval, and initialize fresh state
only once. Add hash tests that alter campaign/phase while keeping resources
equal. Start/end/reset tests must prove no duplicate decision pulse.

- [ ] Run focused tests, selected resource tests, and typecheck. Checkpoint.

## Task 3: AI development, reserves, and neutral expansion

**Files:** Modify `utils/PaintedAI.ts`, `PaintedAIExecution.ts`; create
`tests/PaintedAIEconomy.test.ts`. Extend active fixtures and replace the obsolete
passive assertions in `tests/SimpleFrontPaintedRuntime.test.ts` only after active
behavior is available.

**Interfaces:** `decidePaintedAI` returns paid paint/neutral attack or a reasoned
wait. State tracks a bounded food-blocked duration; all legality/debits remain
in existing executions.

- [ ] Write a real-core regression using the new fixture:

```ts
test("a depleted AI rebuilds a missing farm through a paid purchase", async () => {
  const { game, player } = await aiFixture();
  for (const unit of player.units(UnitType.Farmland)) unit.delete(false);
  player.removeFoodMilli(player.foodMilli());
  for (let i = 0; i < 350; i++) game.executeNextTick();
  expect(paintedResources(game, player).farms).toBeGreaterThanOrEqual(1);
  expect(player.foodMilli()).toBeGreaterThanOrEqual(0n);
});
```

Add inert-rate cases showing a plot costs exactly its price, preserves the
intended dispatch reserve, and never builds a city because troops moved from
idle to deployment. Test both essential plots missing, both rebuilt; one legal
tile; no legal sites; all candidates damaged; and no infinite retry.

- [ ] Run `npm --prefix simplefront test -- tests/PaintedAIEconomy.test.ts`
      against the waiting controller and confirm failures.
- [ ] Implement bounded candidate iteration, using stored cursors over stable
      ownership/border iteration. Inspect at most 256 candidates per pass; cycle
      across passes so valid sites beyond the initial window are eventually seen.
      Prefer candidates with four owned cardinal neighbors; stable tile-ref tie
      breaking within the inspected set. Check the same land/damage/occupancy rules
      as `purchasePaintedTile`, then delegate the actual purchase.
- [ ] Calculate a legal prospective dispatch first. Reserve its exact price
      only for discretionary construction. Forecast food for 200 ticks with the
      shared normalized helper and fixed present capacity; no fictitious future
      farms. Expected expense is one next useful plot plus at most one dispatch
      per decision interval from the currently supportable troop budget (never
      repeatedly budget the same troops). A farm is a candidate only when this
      finite expense exceeds stock plus forecast refill. City fill uses total/cap.
- [ ] Implement action precedence from spec: missing farm, missing city,
      threat restraint, useful affordable city, budget-justified farm, neutral
      expansion, wait. If essential rebuilding has no legal site but a funded
      expansion can obtain one, expansion is allowed. If there are zero troops and
      no legal city site, report no-site instead of granting recovery units.
- [ ] Submit selected decisions through existing executions:

```ts
switch (decision.kind) {
  case "paint":
    game.addExecution(
      new PaintTilesExecution(player, decision.plot, [decision.tile]),
    );
    break;
  case "attack":
    game.addExecution(
      new AttackExecution(
        decision.troops,
        player,
        decision.targetID,
        null,
        true,
        decision.sourceTiles,
      ),
    );
    break;
  case "wait":
    break;
}
```

Choose only actual owned source tiles bordering the target; passing interior
tiles or a terra-nullius pseudo-ID must not bypass the attack validator.
Accumulate `foodBlockedTicks` only when a useful, otherwise legal order is
denied for food, using elapsed decision intervals rather than wall time.

- [ ] Run 1000 ticks with actual bot/nation spawns; assert paid expansion and
      increased footprint while spies show no urban/supply/legacy planner calls.
      Check resource balances and plot counts, not simply that methods were called.
      Run focused tests and typecheck; checkpoint.

## Task 4: Local target assessment, defense, campaigns, and retreat

**Files:** Modify `utils/PaintedAI.ts`, `PaintedAIExecution.ts`; create
`tests/PaintedAICombat.test.ts`.

**Interfaces:** Existing decision union gains its enemy/retreat behavior;
campaign state fields are populated and reset. No combat-rule edits.

- [ ] Write fixtures on the existing long-seam map pattern in
      `FrontLineTroops.test.ts`. Test an exposed nearby frontier versus a distant
      enemy force, friendly/immunity rejection, retained idle reserve, and the
      campaign stop rule:

```ts
test("stalled campaign retreats without refunding food", async () => {
  const { game, player } = await aiFixture({ inertResources: true });
  // Use the fixture's neutral border to create a real outgoing commitment.
  game.addExecution(new AttackExecution(300, player, null));
  game.executeNextTick();
  const attack = player.outgoingAttacks()[0];
  const before = player.foodMilli();
  game.addExecution(new RetreatExecution(player, attack.id()));
  for (let i = 0; i < 30; i++) game.executeNextTick();
  expect(player.foodMilli()).toBeLessThanOrEqual(before);
  expect(player.outgoingAttacks().some((a) => a.id() === attack.id())).toBe(
    false,
  );
});
```

The test above protects the shared retreat seam; separately set the real
controller's campaign sample state to two stalled observations and assert
`decidePaintedAI` emits that attack's retreat decision. Suppress unrelated
paid decisions in the seam fixture by disabling its AI after obtaining the
attack, not by replacing retreat code.

- [ ] Run `npm --prefix simplefront test -- tests/PaintedAICombat.test.ts`;
      confirm missing enemy/campaign decisions fail.
- [ ] Build bounded contiguous source fronts from inspected border candidates.
      Estimate a tile's effective force using proposed troops / frontier width ×
      `game.config().food().frontReferenceWidth`; call existing `attackLogic` for
      terrain/casualty/work estimates. Subtract hostile contacting `troopsAt(tile)`
      forces where applicable. Never invoke old `WarIntel` food-runway/staffing code.
      Rank positive exchanges before negative ones, then reachable resource tiles,
      then shorter fronts; use stable target/tile tie-breaking. Revalidate target
      availability and immunity at submission.
- [ ] Threat handling: sum incoming commitments whose fronts touch owned
      territory. If that exceeds idle defenders, stop discretionary dispatch and
      prioritize retreat of a remote losing campaign. Do not counter blindly just
      because an attack exists. Existing defending idle troops continue to fight.
- [ ] Persist one enemy campaign. Every 100 ticks compare target tile count
      and our total troops to the prior sample. Target land reduction with acceptable
      reserve is progress; otherwise increment stalled samples. At two stalls, or
      idle reserve breach, emit retreat for its non-retreating outgoing attack.
      Use the existing `Attack.retreating()` and `Attack.retreated()` flags rather than adding
      repeated retreat executions. Clear campaign on defeat/friendly/lost front.
- [ ] Add dispatch cases for `new RetreatExecution(player, attackID)` and
      enemy `AttackExecution` with the actual selected sources. Validate successful
      reinforcement debits only new troops; rejected submission does not update
      strategic success based solely on queue insertion.
- [ ] Run focused AI tests plus `Attack`, `FrontLineTroops`, `SegmentAttack`,
      and `PaintedEconomyMilitary` tests, then typecheck; checkpoint.

## Task 5: Affordable transport and route failure behavior

**Files:** Modify `utils/PaintedAI.ts`, `PaintedAIExecution.ts`; create
`tests/PaintedAITransport.test.ts` using copied coast fixtures.

**Interfaces:** `transport` and `boat-retreat` decisions; `pendingCoast` reflects
actual active transports, not just attempted queueing.

- [ ] Write a real coast test that creates a bot kit on one landmass, runs
      decisions, and observes a paid boat and landing. Add unaffordable, friendly
      coast, boat-limit, no-route, and repeated-pending-destination cases. Assert
      a landing does not buy troops or pay the dispatch fee twice.
- [ ] Run `npm --prefix simplefront test -- tests/PaintedAITransport.test.ts`
      against the land-only implementation and confirm missing behavior.
- [ ] Scan coastal candidates within radius 96 using the same 256-candidate
      pulse budget and saved cursor. Continue scanning across pulses instead of
      inspecting the same rejected candidates forever. Prefer neutral destinations
      when no land expansion is viable; otherwise assess legal enemy targets with
      the campaign rules. Confirm `canBuildTransportShip(game, player, tile)` and
      `targetTransportTile` before queueing; routing remains in the existing engine.

```ts
case "transport":
  game.addExecution(new TransportShipExecution(player, decision.tile, decision.troops));
  break;
case "boat-retreat":
  game.addExecution(new BoatRetreatExecution(player, decision.unitID));
  break;
```

- [ ] Derive pending destination from active owned boats' `targetTile()` each
      decision. Clear stale memory when an order failed, the boat landed, or it was
      lost. Bound the AI to one outstanding expedition per destination and preserve
      the configured overall boat limit. Failed pathfinding does not refund an
      already committed fee or trigger free alternative transport.
- [ ] Verify isolated-island/no-route scenarios terminate each decision within
      the candidate budget. Record unreachable geography in benchmark output rather
      than silently changing the map or movement mechanics.
- [ ] Run focused AI and military handoff tests plus typecheck; checkpoint.

## Task 6: Difficulty selection and a complete visible match

**Files:** Create `src/client/shell/SimpleFrontMatch.ts`,
`tests/SimpleFrontMatch.test.ts`. Modify `ShellSimProtocol.ts`,
`ShellSim.worker.ts`, `GameShellPage.ts`, `games/simplefront/system.ts`,
`resources/lang/en.json`, `tests/SimpleFrontPaintedUI.test.ts`,
`tests/SimpleFrontPaintedWorker.test.ts`.

**Interfaces:** Produces match result signatures above and optional difficulty
input. Keep copied non-painted consumers compatible with absent optional fields.

- [ ] Add pure fallback validation and actual-game result tests:

```ts
test("unknown difficulty falls back to Medium", () => {
  expect(parseSimpleFrontDifficulty("Hard")).toBe(Difficulty.Hard);
  expect(parseSimpleFrontDifficulty("tampered")).toBe(Difficulty.Medium);
});
test("result identifies a real winner", async () => {
  const { game, player } = await paintedFixture();
  expect(simpleFrontResult(game, player.id())).toBeNull();
  game.setWinner(player, game.stats().stats());
  expect(simpleFrontResult(game, player.id())).toMatchObject({
    winnerID: player.id(),
    humanWon: true,
  });
});
```

Add UI tests for active label, difficulty persistence without root key
mutation, pending difficulty applied only on restart, win/loss text, elapsed
time, and clearing result/ghost stroke on restart.

- [ ] Run `npm --prefix simplefront test -- tests/SimpleFrontMatch.test.ts tests/SimpleFrontPaintedUI.test.ts`
      and confirm relevant missing behavior.
- [ ] Implement `parseSimpleFrontDifficulty` with the existing `isDifficulty`.
      Read/write `simplefront:match.difficulty` with try/catch for unavailable
      storage. Add a selected SimpleFront dropdown next to match controls; visibly
      mark the next-match setting. Include its validated value in worker init,
      replacing the hardcoded Medium only for the selected app.
- [ ] Implement `simpleFrontResult` using `getWinner()` and
      `elapsedGameSeconds()`. Handle null; Player winners use id/displayName and
      comparison to humanID; team strings use a null winnerID and no false FFA human
      victory. Add result projection to the frame before any renderer/kernel early
      return in `onWorkerFrame`.
- [ ] Publish the last frame, then stop scheduling further interactive ticks
      when it contains a result. Clear pending input and prevent Play/paint/attack
      from resuming the completed match; Restart creates a new runner/result state.
      Ambient runs must not render the interactive win panel.

```ts
post(frame, transfer);
if (!ambient && frame.matchResult !== null && frame.matchResult !== undefined) {
  queued = [];
  setRunning(false, turbo);
}
```

- [ ] Extend the actual worker fixture with an overwhelmingly small playable
      map so real `WinCheckExecution` can finish without a test-only winner message.
      Assert final frame first, no later ticks, restart works, and active nations
      use the selected difficulty. Remove the passive label only once Tasks 3–5
      pass. Use explicit translated keys compatible with the translation scanner.
- [ ] Run client/worker/translation tests, typecheck, and production build;
      checkpoint. No change to winner threshold or turn order.

## Task 7: Real-core benchmark and trustworthy action measurements

**Files:** Create `tests/perf/balance/PaintedBalance.ts`,
`scripts/painted-balance.ts`, `tests/PaintedBalance.test.ts`. Modify
`GameUpdates.ts`, `utils/PaintedEconomy.ts`, `PaintTilesExecution.ts`,
`AttackExecution.ts`, `TransportShipExecution.ts`, and `package.json` scripts.

**Interfaces:** Produces measurement contracts above. Existing observers may
ignore the new update type; no runtime decision depends on it.

- [ ] Test action records with inert refill: accepted farm/city exact debit,
      rejected insufficient-food purchase, accepted land/boat exact debit, invalid
      order no debit, landing no extra commitment record. Assert capturing or losing
      a farm is not classified as food spending. Add a small real-map loader fixture
      to `PaintedBalance.test.ts` and run twice:

```ts
const opts = {
  seed: "simplefront-pace-01",
  maxTicks: 100,
  sampleEvery: 10,
  policyRotation: 0 as const,
  comparePolicies: false,
};
const a = await runPaintedBalance(opts, loader);
const b = await runPaintedBalance(opts, loader);
expect(a.finalHash).toBe(b.finalHash);
expect(a.samples).toEqual(b.samples);
expect(a.events).toEqual(b.events);
expect(a.completed).toBe(false);
expect(a.victorySeconds).toBeNull();
```

- [ ] Run `npm --prefix simplefront test -- tests/PaintedBalance.test.ts`;
      confirm missing records/runner failures.
- [ ] Add `PaintedAction` enum/interface/union member. Emit committed purchase
      only after the shared purchase succeeded, and committed dispatch only from
      its exact successful debit. Emit selected invalid/unaffordable dispatch once
      after failed initialization, with a guarded per-execution outcome flag. Do
      not emit for internal landing handoffs or legacy rulesets. Paint duplicates
      remain skip results rather than invented purchases. Budget-denied AI plans
      are separately measured using `foodBlockedTicks`, not counted as submitted
      rejected orders.
- [ ] Implement runner with actual `createGameRunner(..., "simplefront")`,
      Singleplayer FFA config, Verdantia/default nations/50 bots/Medium, and a
      deterministic human-slot stand-in. Use a fixed client ID and seed-derived
      game ID, permit AI opponents to spawn during the initial spawn phase, then
      choose a deterministic legal human spawn through normal SpawnExecution.
      Attach the same controller to the stand-in only in the benchmark. This
      preserves the human slot/type without a second policy implementation.
      Wait for successful spawning with a 1000-tick bound; failure throws.
- [ ] Execute the actual runner with ordered empty turns. Sample every 10
      ticks after spawn; observe ownership changes every tick to distinguish
      neutral versus enemy captures using prior owner IDs. Record authoritative
      action events and exact cumulative spend by category. Stop on `getWinner()`
      or maxTicks, propagate runner errors, and serialize the effective config.
      Hash the stable ordered player hashes and compare replay traces, not wallMs.
- [ ] For policy comparisons sort players by stable ID; assign the three
      benchmark policy priorities in rotating groups. Repeat each seed with three
      rotations so every seat sees every policy. Policy changes only reorder the
      same eligible options; maintain emergency recovery, defense, prices, reserve,
      and paid-order validation. Keep the balanced ten-seed set separate.
- [ ] Implement the Node loader from copied map files using the actual
      `GameMapLoader` interface (`mapBin`, `map4xBin`, `manifest`, `layersBin`), and
      support CLI `--seed`, `--ticks`, `--compare-policies`, `--rotation`, `--out`.
      Defaults: ten fixed seeds, 12000 ticks, sampleEvery 10. Validate options;
      refuse to overwrite an existing output path. JSON stringify bigint to string.

```json
"balance:painted": "tsx scripts/painted-balance.ts"
```

- [ ] Run the small deterministic test and one short real Verdantia command:
      `npm --prefix simplefront run balance:painted -- --seed simplefront-pace-01 --ticks 300`.
      Confirm spawn count, selected rules, zero legacy food-flow metrics, and no
      false completion. Run copied tests and typecheck; checkpoint.

## Task 8: Measure, tune, and deliver verified playability evidence

**Files:** Tune only `PaintedEconomyConfig.ts`/`PaintedAIConfig.ts` and focused
policy code when supported by measured failures. Create
`docs/painted-pacing-and-ai-verification.md` and generated result files under a
new `docs/balance-runs/` subdirectory. Update `README.md` and OpenSpec checklist.

**Interfaces:** Existing rules and benchmark contracts remain stable; material
rule changes require user direction, not a quiet tuning patch.

- [ ] Run the approved preset on all ten seeds:

```sh
npm --prefix simplefront run balance:painted -- --out docs/balance-runs/initial-balanced.json
```

Use long-running exec sessions with brief status updates; never block
communication waiting for the entire set. Record completed/unfinished runs,
first action/contact/elimination, medians/percentiles, final land share,
survivors, resource curves, purchases, dispatches, and food-blocked durations.

- [ ] Run three rotations for strategy comparisons:

```sh
npm --prefix simplefront run balance:painted -- --compare-policies --rotation 0 --out docs/balance-runs/initial-policies-0.json
npm --prefix simplefront run balance:painted -- --compare-policies --rotation 1 --out docs/balance-runs/initial-policies-1.json
npm --prefix simplefront run balance:painted -- --compare-policies --rotation 2 --out docs/balance-runs/initial-policies-2.json
```

Compare growth/land/survival at 2, 5, and 10 minutes, grouping by seat and seed.
Use the evidence to distinguish slow economic recovery from AI hesitation,
coastal isolation, excessive farming, and genuine combat stalemate.

- [ ] Before each corrective code change, add a failing focused reproduction
      of the measured pathology. Example for reserve deadlock: give a threatened
      player zero cities and affordable rebuilding, then assert a paid city is
      eventually purchased without needing a nonexistent expedition reserve.
      For numerical tuning, add timing bands matching the intended improvement.
      Change one explanatory group of parameters at a time, rerun the same seeds,
      and preserve both old and new result files with distinct names.
- [ ] Target median completed matches of 600–900 seconds and at least 8/10
      completions before 1200 seconds. Report any missed target rather than mark
      successful balance. Do not change the map/population, >80% victory, combat,
      linear capacities/fixed per-tile prices, or no-cheat rules to force a pass.
      If those become necessary, stop tuning at that boundary and present measured
      evidence plus the needed design choice.
- [ ] Browser-playtest at normal speed: root picker → SimpleFront, chosen
      difficulty → spawn → farm/city stroke → expansion → active enemy contact →
      setback/recovery → final result → restart → root OpenFront. Use an isolated
      browser session and existing dev server; do not restart the user's server.
      A short accelerated smoke test can supplement but not replace normal-speed
      pacing observations. Record exactly what was and was not played.
- [ ] Run final checks after the last production edit:

```sh
npm --prefix simplefront test -- --reporter=dot
npm --prefix simplefront run typecheck
npm --prefix simplefront run lint -- src tests scripts
npm --prefix simplefront run build
npm test -- tests/GameShellExperience.test.ts tests/OpenFrontRuntimeIsolation.test.ts
openspec validate simplefront-pacing-and-ai --strict
git diff -- src/core src/client/games/openfront
```

- [ ] Write actual commands, environment, test counts, preset values, benchmark
      summaries, limitations, performance notes, and browser evidence in the
      verification document. Explain any balance shortfall and any inherited
      combat-type advantages still present. Update current README rules/AI state;
      keep prior verification documents as historical evidence. Check only truly
      completed OpenSpec items and hand off without commits/deployment.

## Review and handoff

Spec coverage: Task 1 covers resource math/preset; Tasks 2–5 cover deterministic
shared AI, lifecycle, budgeting, local combat and transport; Task 6 covers
difficulty/results; Tasks 7–8 cover accurate measurement, calibration and final
isolation. The initial quoted timings remain estimates until Task 1 tests run.

Execution mode is already selected: inline, with checkpoints. This plan is an
implementation guide, not a claim that the new AI or target pacing is delivered.
