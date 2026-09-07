# SimpleFront Painted Global Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the independent SimpleFront app use painted city/farm tiles, global sigmoid resources, and upfront military food costs, with passive opponents until active AI is adapted.

**Architecture:** Select the new economy through the existing SimpleFront Config seam. Keep resource state and transactions in the core, preserve existing combat execution order, and use the worker/UI only for ordered input and authoritative readouts. Leave legacy copied configs/tests available without running their economy in the selected SimpleFront game.

**Tech Stack:** Existing TypeScript, Vitest, Lit, Zod, Vite, and copied rendering infrastructure; no added dependencies.

**Spec:** [Approved planning baseline](../specs/2026-09-06-simplefront-painted-economy-design.md), [OpenSpec design](../../../openspec/changes/simplefront-painted-global-economy/design.md), and [capability specs](../../../openspec/changes/simplefront-painted-global-economy/specs).

**Execution record (2026-09-06):** Implemented directly in the existing checkout. Completed work is tracked in the [OpenSpec checklist](../../../openspec/changes/simplefront-painted-global-economy/tasks.md); actual test/build/browser results and implementation notes are in [SimpleFront verification](../../../simplefront/docs/painted-economy-verification.md). No commits or deployment were performed.

## Global Constraints

- Implementation must remain inside the independent `simplefront/` application. Root OpenFront Live and its reference document remain unchanged.
- Food is action currency. People never eat it, and it is never distributed across tiles.
- No workers, local stores, or logistics. All people are troops.
- Deployed troops count toward troop capacity.
- AI changes are designed now but implemented later.
- Rates below are per 100 ms simulation tick. Turbo changes wall time, not the number of resource updates per game tick.
- No new dependencies, changes to root launch routing, deletion of legacy infrastructure, or per-plot resource inventories.
- Preserve pre-existing dirty/untracked work. In particular, the whole independent copy is currently untracked; do not stage that entire directory as part of an unrelated checkpoint.

The initial preset is food capacity `5000 + 5000*farms`, troop capacity `10000*cities`, start food/troops `4000/2000`, food bootstrap `2/tick`, recruitment bootstrap `1/tick`, both growth coefficients `0.003/tick`, farm/city prices `2000/3000` food, and land/boat dispatch `40` milli-food per troop.

---

## Working conventions and file map

Commands below run from the repository root unless a `--prefix simplefront` is shown. All source/test paths below are inside the copy. Use `npm --prefix simplefront test -- tests/Name.test.ts` for focused tests. Do not install packages or start/restart the user's existing dev servers just to plan or run unit tests.

Before execution, read the worktree-isolation skill and inspect the actual worktree. This plan does not authorize copying over or resetting existing changes. At each task checkpoint inspect only its diff, preserve overlapping user edits, and commit only the verified task paths if git writes are authorized. Never use `git add .` here.

| File                                                             | Role                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| New `simplefront/src/core/configuration/PaintedEconomyConfig.ts` | Typed preset, validation, linear capacity functions, pure sigmoid arithmetic             |
| New `simplefront/src/core/execution/utils/PaintedEconomy.ts`     | Player resource state access, refill, plot-count reconciliation, snapshots, debit helper |
| New `simplefront/src/core/execution/PaintTilesExecution.ts`      | Synchronous ordered per-tile purchases and affordability stop                            |
| New `simplefront/src/client/shell/PaintStroke.ts`                | Pure integer stroke interpolation/deduplication and preview collection                   |
| New `simplefront/tests/util/PaintedSetup.ts`                     | Real-core painted fixtures; explicitly inert or active replenishment                     |
| Existing Config/Rulesets/Game/PlayerImpl/GameImpl                | Select new rules, state access, lifecycle hooks, post-execution tick, hashing            |
| Existing Spawn/Construction/UnitImpl/dispatch executions         | Complete kit, counts/capture/deletion, transaction boundaries                            |
| Existing shell/worker/protocol/game views                        | Painting, resource readouts, passive label, removal of obsolete observers                |

Do not split every formula into a separate module. Add a new file only where listed or where an existing file's actual structure requires a focused testable helper; document any justified deviation in the task checklist.

## Shared interfaces

Define these exact names in tasks 1–2 before consumers use them. `Game`, `Player`, `TileRef`, `PlayerImpl`, and `UnitType` are existing core types.

```ts
// PaintedEconomyConfig.ts — food amounts in these capacities are display units.
export interface PaintedEconomyConfig {
  baselineFoodCapacity: number;
  foodCapacityPerFarm: number;
  troopCapacityPerCity: number;
  startingFood: number;
  startingTroops: number;
  baselineFoodRate: number;
  recruitmentBootstrapRate: number;
  foodGrowthRate: number;
  troopGrowthRate: number;
  farmCostMilli: bigint;
  cityCostMilli: bigint;
  landDispatchMilliPerTroop: bigint;
  transportDispatchMilliPerTroop: bigint;
}
export function foodCapacityMilli(
  farms: number,
  c: PaintedEconomyConfig,
): bigint;
export function troopCapacity(cities: number, c: PaintedEconomyConfig): number;
export function sigmoidGain(x: number, k: number, b: number, r: number): number;
export function advanceResource(
  amount: number,
  capacity: number,
  credit: number,
  baseline: number,
  rate: number,
): { amount: number; credit: number };
export function validatePaintedConfig(c: PaintedEconomyConfig): void;

// PaintedEconomy.ts — state is stored as PlayerImpl._paintedEconomy.
export interface PaintedEconomyState {
  farms: number;
  cities: number;
  foodCredit: number; // fraction of a milli-food
  troopCredit: number; // fraction of a troop
  pendingLandingTroops: number;
  lastRefillTick: number;
}
export interface PaintedResourceSnapshot {
  foodMilli: bigint;
  foodCapacityMilli: bigint;
  foodGainMilli: number;
  idleTroops: number;
  deployedTroops: number;
  totalTroops: number;
  troopCapacity: number;
  troopGain: number;
  farms: number;
  cities: number;
}
export function paintedState(player: Player): PaintedEconomyState;
export function paintedResources(
  game: Game,
  player: Player,
): PaintedResourceSnapshot;
export function reconcilePaintedCapacity(game: Game, player: Player): void;
export function tickPaintedEconomy(game: Game, player: Player): void;
export function changePlotOwner(
  game: Game,
  type: UnitType,
  before: Player | null,
  after: Player | null,
): void;
export function payDispatch(
  game: Game,
  player: Player,
  troops: number,
  kind: "land" | "transport",
): boolean;

// Existing Config gains paintedEconomy(): Readonly<PaintedEconomyConfig> | null.
// Existing Player interface/PlayerImpl gain exact milli-food access:
// foodMilli(): bigint; addFoodMilli(amount: bigint): void;
// removeFoodMilli(amount: bigint): bigint (returns actual debit, never negative).
// EconomyPlayer, Player, and copied PlayerView gain paintedCityCount(): number.
// PlayerImpl returns its count; PlayerView reads its published count, not a core cast.
```

`paintedState` is the single typed accessor to the concrete PlayerImpl field, not a hidden WeakMap or a second resource ledger. `paintedResources` computes troop totals from active pools plus pending handoffs. The existing camp balance remains food authority; selected painted accessors do not sum old granaries. Convert to Number for refill only after ensuring the current capacity/balance is within safe-integer milli-food limits.

## Task 1: Pure configuration, capacities, and sigmoid arithmetic

**Files:** Create `simplefront/src/core/configuration/PaintedEconomyConfig.ts` and `simplefront/tests/PaintedEconomyConfig.test.ts`; modify `simplefront/src/core/configuration/Config.ts` and `simplefront/src/core/game/Rulesets.ts`.

**Consumes:** The accepted preset. **Produces:** All configuration/pure-function interfaces above and `PAINTED_DEFAULTS`; base Config returns null, SimpleFrontConfig returns that preset.

- [ ] Write failing numerical tests, including this table and configuration rejection cases:

```ts
import { expect, test } from "vitest";
import {
  PAINTED_DEFAULTS,
  foodCapacityMilli,
  troopCapacity,
  sigmoidGain,
  advanceResource,
  validatePaintedConfig,
} from "../src/core/configuration/PaintedEconomyConfig";

test("capacity and sigmoid values match the design", () => {
  expect(foodCapacityMilli(1, PAINTED_DEFAULTS)).toBe(10_000_000n);
  expect(troopCapacity(2, PAINTED_DEFAULTS)).toBe(20_000);
  expect(
    [0, 1250, 2500, 3750, 5000].map((x) => sigmoidGain(x, 5000, 2, 0.003)),
  ).toEqual([2, 4.3125, 4.75, 3.3125, 0]);
  expect(advanceResource(9999, 10000, 0.5, 1, 0.003)).toEqual({
    amount: 10000,
    credit: 0,
  });
  expect(advanceResource(15000, 10000, 0.5, 1, 0.003)).toEqual({
    amount: 15000,
    credit: 0,
  });
  expect(() =>
    validatePaintedConfig({ ...PAINTED_DEFAULTS, foodGrowthRate: NaN }),
  ).toThrow();
});
```

- [ ] Run `npm --prefix simplefront test -- tests/PaintedEconomyConfig.test.ts`; confirm the new imports/tests fail before implementation.
- [ ] Implement the preset and the arithmetic below. Validate finite nonnegative scalar settings, integer capacities/start counts, nonnegative bigint prices, safe-integer capacity conversions, and stable coefficients. Permit an explicitly all-zero refill set in test fixtures; the normal preset must satisfy positive recovery and `b < r*Kmin`.

```ts
export const PAINTED_DEFAULTS: Readonly<PaintedEconomyConfig> = {
  baselineFoodCapacity: 5000,
  foodCapacityPerFarm: 5000,
  troopCapacityPerCity: 10000,
  startingFood: 4000,
  startingTroops: 2000,
  baselineFoodRate: 2,
  recruitmentBootstrapRate: 1,
  foodGrowthRate: 0.003,
  troopGrowthRate: 0.003,
  farmCostMilli: 2_000_000n,
  cityCostMilli: 3_000_000n,
  landDispatchMilliPerTroop: 40n,
  transportDispatchMilliPerTroop: 40n,
};
export function sigmoidGain(x: number, k: number, b: number, r: number) {
  return k <= 0 || x >= k ? 0 : (b + r * x) * (1 - x / k);
}
export function advanceResource(
  x: number,
  k: number,
  credit: number,
  b: number,
  r: number,
) {
  if (k <= 0 || x >= k) return { amount: x, credit: 0 };
  const gain = sigmoidGain(x, k, b, r);
  if (gain > 0 && k - x <= 1) return { amount: k, credit: 0 };
  const accumulated = credit + gain;
  const whole = Math.min(k - x, Math.floor(accumulated));
  return {
    amount: x + whole,
    credit: x + whole === k ? 0 : accumulated - whole,
  };
}
```

- [ ] Run the new tests plus `npm --prefix simplefront run typecheck`; confirm legacy Config remains null and SimpleFront selects the preset. Checkpoint only these task files.

## Task 2: Global ledger and once-per-tick integration

**Files:** Create `simplefront/src/core/execution/utils/PaintedEconomy.ts`, `simplefront/tests/PaintedEconomy.test.ts`, and `simplefront/tests/util/PaintedSetup.ts`; modify copied `Game.ts`, `PlayerImpl.ts`, `GameImpl.ts`, `PlayerExecution.ts`, `GameUpdates.ts`, `src/client/view/PlayerView.ts`, and `tests/util/TestConfig.ts` only where the new accessors/projection require them.

**Consumes:** Task 1 functions and Config selection. **Produces:** State/snapshot/refill interfaces above and `paintedFixture(active?: boolean): Promise<{ game: Game; player: Player; rival: Player }>` for later tasks.

- [ ] Build the fixture from the existing real `setup("plains", ...)`, with two Human PlayerInfos, owned disjoint land blocks, and `setSpawnTile` on both. Subclass `TestConfig`, override `paintedEconomy` to return PAINTED_DEFAULTS or a copy with all four refill parameters zero, and delegate BOTH `attackLogic` and `attackTilesPerTick` to `Config.prototype` for real combat. The `active=true` fixture overrides only the refill setting; do not infer it from map layers. Initially give no plots, so baseline recovery tests require no later task.

```ts
import { Config } from "../../src/core/configuration/Config";
import { PAINTED_DEFAULTS } from "../../src/core/configuration/PaintedEconomyConfig";
import { PlayerInfo, PlayerType } from "../../src/core/game/Game";
import { setup } from "./Setup";
import { TestConfig } from "./TestConfig";

export async function paintedFixture(active = false) {
  class PaintedTestConfig extends TestConfig {
    override paintedEconomy() {
      return active
        ? PAINTED_DEFAULTS
        : {
            ...PAINTED_DEFAULTS,
            baselineFoodRate: 0,
            recruitmentBootstrapRate: 0,
            foodGrowthRate: 0,
            troopGrowthRate: 0,
          };
    }
    override attackLogic(...args: Parameters<Config["attackLogic"]>) {
      return Config.prototype.attackLogic.apply(this, args);
    }
    override attackTilesPerTick(
      ...args: Parameters<Config["attackTilesPerTick"]>
    ) {
      return Config.prototype.attackTilesPerTick.apply(this, args);
    }
  }
  const infos = ["painter", "rival"].map(
    (id) => new PlayerInfo(id, PlayerType.Human, null, id),
  );
  const game = await setup("plains", {}, infos, undefined, PaintedTestConfig);
  const [player, rival] = infos.map((info) => game.player(info.id));
  for (const [i, p] of [player, rival].entries()) {
    const x0 = 10 + i * 10;
    for (let y = 10; y < 20; y++)
      for (let x = x0; x < x0 + 10; x++) p.conquer(game.ref(x, y));
    p.setSpawnTile(game.ref(x0, 10));
  }
  return { game, player, rival };
}
```

- [ ] Write and run a failing baseline test:

```ts
import { expect, test } from "vitest";
import { paintedFixture } from "./util/PaintedSetup";
import {
  paintedResources,
  tickPaintedEconomy,
} from "../src/core/execution/utils/PaintedEconomy";

test("baseline recovers once without any farms or troops", async () => {
  const { game, player } = await paintedFixture(true);
  player.removeFoodMilli(player.foodMilli());
  player.setTroops(0);
  game.executeNextTick();
  expect(player.foodMilli()).toBe(2000n);
  expect(player.troops()).toBe(0);
  const before = player.foodMilli();
  tickPaintedEconomy(game, player); // current tick differs after executeNextTick
  const after = player.foodMilli();
  tickPaintedEconomy(game, player);
  expect(player.foodMilli()).toBe(after);
  expect(after).toBeGreaterThanOrEqual(before);
  expect(paintedResources(game, player).troopCapacity).toBe(0);
  expect(player.isAlive()).toBe(true);
});
```

Run: `npm --prefix simplefront test -- tests/PaintedEconomy.test.ts`. Also test spawn/dead skips, active refill at zero with an explicitly seeded count in this unit-level test, credit retention, no negative refill for excess troops, and baseline reaching farm price from zero.

- [ ] Implement exact milli-food access and the post-execution resource pass. The operational sequence is:

```ts
const cfg = game.config().paintedEconomy();
if (!cfg || game.inSpawnPhase() || !player.hasSpawned() || !player.isAlive())
  return;
const state = paintedState(player);
if (state.lastRefillTick === game.ticks()) return;
reconcilePaintedCapacity(game, player);
const snapshot = paintedResources(game, player);
const food = advanceResource(
  Number(snapshot.foodMilli),
  Number(snapshot.foodCapacityMilli),
  state.foodCredit,
  cfg.baselineFoodRate * 1000,
  cfg.foodGrowthRate,
);
const troops = advanceResource(
  snapshot.totalTroops,
  snapshot.troopCapacity,
  state.troopCredit,
  cfg.recruitmentBootstrapRate,
  cfg.troopGrowthRate,
);
player.addFoodMilli(BigInt(food.amount) - snapshot.foodMilli);
player.addTroops(troops.amount - snapshot.totalTroops);
state.foodCredit = food.credit;
state.troopCredit = troops.credit;
state.lastRefillTick = game.ticks();
```

Place the pass before player snapshots/hash collection in GameImpl, after old executions/initializations. Skip `urbanTick` in PlayerExecution only when painted settings are selected; preserve its non-economic work. In Config.maxTroops, use `troopCapacity(player.paintedCityCount(), cfg)` without difficulty multipliers for the selected ruleset. Extend the existing EconomyPlayer contract and copied PlayerView projection so a view is never unsafely cast to PlayerImpl. Include new state in selected-ruleset hashing and clear it on reset; keep the old hash branch for non-painted fixtures.

- [ ] Verify focused resource tests, `tests/FoodEconomy.test.ts` under its explicitly legacy config, and typecheck. Checkpoint the ledger before layering in plot mutations.

## Task 3: Plot lifecycle, complete spawn kit, and capacity loss

**Files:** Modify copied `SpawnExecution.ts`, `PlayerImpl.ts`, `GameImpl.ts`, `UnitImpl.ts`, `Config.ts`, and the new economy module; create `simplefront/tests/PaintedEconomyPlots.test.ts`.

**Consumes:** State/counts/refill from Task 2. **Produces:** `changePlotOwner` implemented for Settlement/Farmland, accurate counts at every lifecycle path, and complete selected-ruleset spawn behavior.

- [ ] Write failing unit-lifecycle tests. This representative test uses direct `buildUnit` as a fixture setup operation, not the user purchase validator:

```ts
import { expect, test } from "vitest";
import { UnitType } from "../src/core/game/Game";
import { paintedResources } from "../src/core/execution/utils/PaintedEconomy";
import { paintedFixture } from "./util/PaintedSetup";

test("capture moves capacity without gifting troops", async () => {
  const { game, player, rival } = await paintedFixture();
  player.addFood(100000n);
  const tile = [...player.tiles()][0];
  player.buildUnit(UnitType.Settlement, tile, {});
  player.setTroops(15000);
  const rivalTroops = rival.troops();
  rival.conquer(tile);
  expect(paintedResources(game, player).cities).toBe(0);
  expect(paintedResources(game, rival).cities).toBe(1);
  expect(player.troops()).toBe(15000);
  expect(rival.troops()).toBe(rivalTroops);
});
```

Run `npm --prefix simplefront test -- tests/PaintedEconomyPlots.test.ts` and confirm failure. Add tests for food clamp before the next action, duplicate reconciliation, actual deletion, relinquishment, capture followed by PlayerExecution, and initial kit/reroll failure without mutation.

- [ ] Implement lifecycle hooks with a single contribution transition per ownership change. Preserve complete captured plots for this ruleset; bypass the old maturity/empty-density economic reset. `changePlotOwner` ignores non-economic types and `before===after`, adjusts the relevant integer counts once, then reconciles affected capacities. Reconciliation subtracts `foodMilli-Kf` if positive and clears credit, but never calls `removeTroops` for excess population.

```ts
if (type !== UnitType.Settlement && type !== UnitType.Farmland) return;
if (before === after) return;
const key = type === UnitType.Settlement ? "cities" : "farms";
if (before) paintedState(before)[key]--;
if (after) paintedState(after)[key]++;
if (before) reconcilePaintedCapacity(game, before);
if (after) reconcilePaintedCapacity(game, after);
```

Centralize each existing create/capture/delete path's call so later structure-owner reconciliation cannot transfer the contribution twice. Use explicit plot existence for recomputation assertions. For spawn, compute two legal cells before mutation, clear prior state once, build both free kit units without charging/seed gates, then set initial balances once. No intermediate capacity clamp may destroy the opening stake before both kit plots exist.

- [ ] Verify all plot tests and a 1000-tick active-refill test that leaves plot positions unchanged. Typecheck and checkpoint.

## Task 4: Ordered painting purchase execution

**Files:** Create copied `PaintTilesExecution.ts` and `tests/PaintedEconomyPainting.test.ts`; modify copied `Schemas.ts`, `ExecutionManager.ts`, `ConstructionExecution.ts`, `PlayerImpl.ts`, `Config.ts`, and `GameUpdates.ts`.

**Consumes:** Config prices, plot lifecycle, exact food access. **Produces:** `PaintTilesExecution(player: Player, kind: "city" | "farm", tiles: readonly TileRef[])`, a shared synchronous `purchasePaintedTile(game, player, kind, tile)` helper in that file, and a `paint_tiles` intent/result.

The purchase helper returns `"placed" | "duplicate" | "invalid" | "unaffordable"`. A result update carries `kind`, `placed: TileRef[]`, `skipped: number`, `spentMilli: bigint`, and `stoppedUnaffordable: boolean`. Use a new typed GameUpdate entry so the worker observes actual execution, not a second guessed result.

- [ ] Write and run a failing partial-purchase test:

```ts
import { expect, test } from "vitest";
import { PaintTilesExecution } from "../src/core/execution/PaintTilesExecution";
import { paintedFixture } from "./util/PaintedSetup";
import { paintedResources } from "../src/core/execution/utils/PaintedEconomy";

test("a stroke stops instead of waiting for more money", async () => {
  const { game, player } = await paintedFixture();
  player.removeFoodMilli(player.foodMilli());
  player.addFood(4000n);
  const tiles = [...player.tiles()].slice(0, 3);
  game.addExecution(new PaintTilesExecution(player, "farm", tiles));
  for (let i = 0; i < 3; i++) game.executeNextTick();
  expect(paintedResources(game, player).farms).toBe(2);
  expect(player.foodMilli()).toBe(0n);
  player.addFood(2000n);
  for (let i = 0; i < 3; i++) game.executeNextTick();
  expect(paintedResources(game, player).farms).toBe(2);
});
```

Command: `npm --prefix simplefront test -- tests/PaintedEconomyPainting.test.ts`. Cover invalid tile refs, foreign/water/impassable/damaged cells, same-kind duplicates, other-kind occupancy, seedless purchase, two orders competing for food, and 4097-cell schema rejection.

- [ ] Implement the schema and execution. The helper validates land/owner/damage/existing plot and exact balance before calling the synchronous build path. Let that build path deduct the configured food price once; do not debit in both the helper and `buildUnit`. Old single-tile ConstructionExecution delegates to this same helper for painted types. Set costs in selected Config metadata, duration zero, upgrades false, and bypass rich-economy seed/field gates only for this ruleset.

```ts
export const PaintTilesIntentSchema = z.object({
  type: z.literal("paint_tiles"),
  kind: z.enum(["city", "farm"]),
  tiles: z.array(z.number().int().nonnegative()).min(1).max(4096),
});
// Inside the one-shot execution's tick, outside spawn phase:
for (const tile of new Set(this.tiles)) {
  const result = purchasePaintedTile(this.game, this.player, this.kind, tile);
  if (result === "unaffordable") {
    stoppedUnaffordable = true;
    break;
  }
  if (result === "placed") placed.push(tile);
  else skipped++;
}
// Publish one typed result and mark execution inactive.
```

- [ ] Verify painting/plot/resource tests plus typecheck; checkpoint the action contract before connecting the client.

## Task 5: Paid dispatch and troop handoff accounting

**Files:** Modify copied `AttackExecution.ts`, `TransportShipExecution.ts`, `PaintedEconomy.ts`, `AttackImpl.ts` only if transition bookkeeping requires it, and relevant cleanup code; create `simplefront/tests/PaintedEconomyMilitary.test.ts`. Also create local copies of root `tests/FrontLineTroops.test.ts`, `tests/SegmentAttack.test.ts`, `tests/SupplyLines.test.ts`, and `tests/Attack.test.ts` at the corresponding `simplefront/tests/` paths; these four tests are not currently in the copy. Do not overwrite its existing `BorderSegment.test.ts`.

**Consumes:** Exact food access, snapshot totals, config prices. **Produces:** `payDispatch` at final commit points and explicit paid boat-handoff accounting that cannot be invoked as an uncharged user order.

- [ ] Bring in those four regression tests as physical local test files, inspect their imports/fixture references, and run them before editing dispatch behavior. Their relative imports must resolve inside SimpleFront. Required existing map fixtures include `big_plains`, `plains`, and `ocean_and_land`; copy only a missing fixture or test helper if an import audit identifies one, never point a runtime/test import into the parent application. Record any baseline failure rather than silently expecting all imported tests to pass.

- [ ] Write failing paid/rejected attack tests using adjacent owned blocks from the fixture and inert refill:

```ts
import { expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { paintedFixture } from "./util/PaintedSetup";

test("500 new troops cost 20 food at initialization", async () => {
  const { game, player } = await paintedFixture();
  player.removeFoodMilli(player.foodMilli());
  player.addFood(20n);
  player.setTroops(2000);
  game.addExecution(new AttackExecution(500, player, null));
  game.executeNextTick(); // initialization, before first combat tick
  expect(player.foodMilli()).toBe(0n);
  expect(player.troops()).toBe(1500);
});
test("food shortage does not resize or debit the order", async () => {
  const { game, player } = await paintedFixture();
  player.removeFoodMilli(player.foodMilli());
  player.addFood(19n);
  player.setTroops(2000);
  game.addExecution(new AttackExecution(500, player, null));
  game.executeNextTick();
  expect(player.foodMilli()).toBe(19000n);
  expect(player.troops()).toBe(2000);
  expect(player.outgoingAttacks()).toHaveLength(0);
});
```

Run `npm --prefix simplefront test -- tests/PaintedEconomyMilitary.test.ts`; confirm failure. Add real coast-fixture tests for one boat fee, landing gaps, blocked/path-failed dispatch, post-commit no-food-refund, retreat troop refunds, mergers charging only new troops, no diplomacy mutation on rejection, and no eating/distance losses at zero food.

- [ ] Implement the debit helper and place it only after all validation but before troop mutation. Validate positive finite integer commitment; return false without changing state if unaffordable. Old non-painted configs pass through without food debit. In selected dispatch paths, move embargo/alliance-rejection effects after successful resource validation.

```ts
const c = game.config().paintedEconomy();
if (!c) return true;
if (!Number.isSafeInteger(troops) || troops <= 0) return false;
const perTroop =
  kind === "land"
    ? c.landDispatchMilliPerTroop
    : c.transportDispatchMilliPerTroop;
const cost = BigInt(troops) * perTroop;
if (player.foodMilli() < cost) return false;
return player.removeFoodMilli(cost) === cost;
```

For a boat landing, transfer passengers into `pendingLandingTroops` before removing the boat; transfer them from pending into the new attack without duplication at initialization. Give the handoff execution an internal exactly-once release/refund guard. Keep movement timing unchanged. Do not treat arbitrary `removeTroops=false` executions as permission to create new free soldiers: distinguish existing internal handoffs from newly funded actions.

- [ ] Verify military tests alongside `FrontLineTroops`, `SegmentAttack`, `BorderSegment`, `Attack`, and `SupplyLines` on legacy fixtures. Add paired real-combat golden traces with refill disabled and ample food; compare retained casualties/territory/refunds, excluding intentional logistics removal. Checkpoint.

## Task 6: Passive-opponent runtime and removal of hidden economy callers

**Files:** Modify copied `NationExecution.ts`, `SpawnExecution.ts`, `GameRunner.ts` or `ExecutionManager.ts` where opponent setup requires it, `ShellSim.worker.ts`, and `games/simplefront/system.ts`; create `simplefront/tests/SimpleFrontPaintedRuntime.test.ts`.

**Consumes:** Working selected economy, plots, dispatch. **Produces:** Actual SimpleFront runtime that cannot invoke old planners or observer-side economy work, while non-painted configs preserve old behavior.

- [ ] Write failing tests using a real `createGameRunner`/test map loader configuration for `simplefront`, plus a direct Bot SpawnExecution fixture. Run beyond 1000 ticks with no player orders; assert plots stay constant, outgoing attacks remain empty, and resource counters grow. Spy on `TribalEconomy.tryBuild`, old `urbanTick`, `foodShedField`, and `supplyField` at their actual import boundaries; selected core/worker observation must not call them. Retain unit-test coverage of legacy configs separately.

```ts
// Add to the selected-runtime test after a valid bot SpawnExecution has run:
const initialPlots = bot
  .units(UnitType.Settlement, UnitType.Farmland)
  .map((u) => u.tile());
for (let tick = 0; tick < 1000; tick++) game.executeNextTick();
expect(bot.outgoingAttacks()).toHaveLength(0);
expect(
  bot.units(UnitType.Settlement, UnitType.Farmland).map((u) => u.tile()),
).toEqual(initialPlots);
expect(bot.units().some((u) => u.isMarkedForDeletion())).toBe(false);
```

- [ ] Implement passive behavior at the narrow existing spawn/AI boundary. Do not enqueue TribeExecution after a painted Bot spawn. In NationExecution retain its existing authored/random spawn branch, but return without initializing behaviors or sending the first wilderness attack after spawning under painted settings. Do not remove Nation/Tribe classes or change their legacy-config behavior.
- [ ] Remove selected-game calls to supply/shed/tenure/maturity observers in the worker and view pipeline. Existing map climate data can still render, but it must not produce economic scores. A retained render conduit may carry a constant/projected value; no hidden flood or growth pass may populate it. Add the sandbox label to the copied game metadata.
- [ ] Run `npm --prefix simplefront test -- tests/SimpleFrontPaintedRuntime.test.ts tests/Independence.test.ts`; update only intentional obsolete assertions in Independence (old no-op economy expectations/supply layers), never weaken import/asset/settings checks. Typecheck and checkpoint.

## Task 7: Stroke preview, commit, and resource UI

**Files:** Create copied `src/client/shell/PaintStroke.ts` and `tests/PaintStroke.test.ts`; modify copied `GameShellPage.ts`, `viewer/FieldViewerBase.ts` only for needed gesture-end hooks, `ShellSimProtocol.ts`, `ShellSim.worker.ts`, `games/simplefront/system.ts`, related copied shader projections, and `resources/lang/en.json`; create `tests/SimpleFrontPaintedUI.test.ts`. Copy root `tests/TranslationSystem.test.ts` to `simplefront/tests/TranslationSystem.test.ts` and baseline it before changing translation resources; it is not currently copied and must scan the copy's own source/resources.

**Consumes:** Paint intent/result and `PaintedResourceSnapshot`. **Produces:** `PaintStroke` with `add(x:number,y:number):void`, `tiles(): readonly number[]`, `clear():void`, and `isFull():boolean`; constructor `(width:number,height:number,limit=4096)`. UI release sends exactly one intent; cancellation sends none.

- [ ] Write and run failing pure stroke tests:

```ts
import { expect, test } from "vitest";
import { PaintStroke } from "../src/client/shell/PaintStroke";
test("interpolates and deduplicates ordered tile refs", () => {
  const stroke = new PaintStroke(10, 10);
  stroke.add(1, 1);
  stroke.add(4, 1);
  stroke.add(1, 1);
  expect(stroke.tiles()).toEqual([11, 12, 13, 14]);
  stroke.clear();
  expect(stroke.tiles()).toEqual([]);
});
test("a limited stroke never exceeds the core bound", () => {
  const stroke = new PaintStroke(10, 10, 2);
  stroke.add(1, 1);
  stroke.add(4, 1);
  expect(stroke.tiles()).toEqual([11, 12]);
  expect(stroke.isFull()).toBe(true);
});
```

Command: `npm --prefix simplefront test -- tests/PaintStroke.test.ts tests/SimpleFrontPaintedUI.test.ts`. Add Lit/worker-message tests proving paint-on-release, no purchase during preview/cancel, no seed auto-deselect, authoritative partial results, and the new resource labels.

- [ ] Implement integer Bresenham traversal between sampled cells, insertion-ordered Set deduplication, bounds checks, and the 4096-cell stop. Integrate with the actual `onPointerDown/onPointerMove/onPointerUp` and gesture hooks in FieldViewerBase/GameShellPage rather than installing competing window listeners. While painting, route gestures only to the preview collector; on release queue:

```ts
const tiles = [...stroke.tiles()];
if (tiles.length > 0) this.queueIntent({ type: "paint_tiles", kind, tiles });
stroke.clear();
```

`stroke` is the page's PaintStroke instance; `kind` is the selected city/farm brush. Keep attack input unchanged. A canceled stroke clears without queuing. Wire the execution result update through the worker to show actual placed/skipped/cost/stop values.

- [ ] Publish `PaintedResourceSnapshot` as a named structured-clone field in the shell protocol. BigInt is supported by structured clone; convert milli-food to display units only in formatting, not another mutable balance. Render food/capacity/refill and idle/deployed/total/capacity, fixed per-tile prices, invalid/ghost tiles, and passive-opponent notice. Remove seed-based button disabling, allocation/food-preset controls, supply overlay, and maturity/ecology tips from the selected game's UI. Retain visual climate tools without economic claims.
- [ ] Verify UI/stroke/runtime tests and `tests/TranslationSystem.test.ts`; run typecheck and `npm --prefix simplefront run build`. Checkpoint.

## Task 8: End-to-end evidence, regressions, and handoff

**Files:** Extend copied `PaintedEconomy*.test.ts`, `SimpleFrontPaintedRuntime.test.ts`, `SimpleFrontPaintedUI.test.ts`, `Independence.test.ts`, and `simplefront/README.md`; update this change's task checklist only after evidence exists.

**Consumes:** Tasks 1–7. **Produces:** Verified independent painted sandbox and documented active-AI exclusion.

- [ ] Add missing acceptance tests before final fixes: zero-farm/city reconstruction with actual purchases; city loss above troop cap; no capacity gap on boat landing; same-seed replay including credits; reset/reroll state; 1000 ticks without autonomous land changes; and source-isolation checks. Use the capability-spec scenarios as the completeness checklist, not just code coverage.
- [ ] Run the focused new suite, typecheck, lint, build, and complete copied suite:

```bash
npm --prefix simplefront test -- tests/PaintedEconomyConfig.test.ts tests/PaintedEconomy.test.ts tests/PaintedEconomyPlots.test.ts tests/PaintedEconomyPainting.test.ts tests/PaintedEconomyMilitary.test.ts tests/PaintStroke.test.ts tests/SimpleFrontPaintedRuntime.test.ts tests/SimpleFrontPaintedUI.test.ts tests/Independence.test.ts
npm --prefix simplefront run typecheck
npm --prefix simplefront run lint -- src tests
npm --prefix simplefront run build
npm --prefix simplefront test
```

Compare any failures with an execution-start baseline; do not report known failures as new regressions or silently mark new failures pre-existing. Legacy tests should remain legacy-config tests rather than being globally excluded. Confirm live-game selection tests actually select SimpleFrontConfig.

- [ ] Run relevant root checks without modifying root code:

```bash
npm test -- tests/GameShellExperience.test.ts tests/OpenFrontRuntimeIsolation.test.ts
git diff -- src/core src/client/games/openfront
openspec validate simplefront-painted-global-economy --strict
```

The root diff must match the execution-start baseline. Do not claim full root gameplay equality from a passing picker test alone; retain the independent-copy boundary test and unchanged source evidence.

- [ ] Browser smoke test via the user's existing `npm run dev` entry: select SimpleFront, spawn, inspect the two kit plots, paint a multi-tile stroke with partial affordability, dispatch and verify one fee, verify no ongoing food debit, reset, then return to root OpenFront. Use an isolated browser profile/context so this check does not overwrite a user's ongoing match/settings. Do not restart an existing server unless required and authorized.
- [ ] Document active rules and the passive-opponent limitation in the copied README. Record actual commands/results and any remaining blockers; mark only completed OpenSpec tasks checked. Review the final scoped diff, checkpoint the verified work, and hand off without implementing active AI.

## Coverage and execution order

| Spec requirement                                       | Task      |
| ------------------------------------------------------ | --------- |
| Linear capacities, defaults, curve, quantization       | 1–2       |
| Baseline recovery, zero-population survival, hashing   | 2, 8      |
| Complete kit, lifecycle counts, capture/overflow       | 3         |
| Painting legality, atomic cost, bounded partial stroke | 4, 7      |
| Dispatch debit and no-charge handoffs                  | 5         |
| Preserved combat and no logistics                      | 2, 5–6, 8 |
| Passive-opponent boundary and no hidden observers      | 6         |
| UI feedback, isolation, actual selected runtime        | 7–8       |

Execute in order. Pure math can be reviewed independently, but do not ship an intermediate selected runtime with a new ledger and the old active AI. All tasks 1–8 are required for the first usable sandbox; the future AI implementation is not part of their completion criteria.
