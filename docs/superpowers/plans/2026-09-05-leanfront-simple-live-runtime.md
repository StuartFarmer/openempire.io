# LeanFront Simple Live Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LeanFront Simple a worker-backed Live ruleset that executes OpenFront's exact combat and territorial expansion while substituting the approved integer city/farm economy.

**Architecture:** `ShellSim.worker` will create LeanFront Simple through the existing `GameRunner`, `AttackExecution`, and `AttackImpl` path. A ruleset-scoped runtime will replace only `urbanTick`, keep compact integer stocks for existing Settlement/Farmland units, and optionally use a compact WebGPU growth pass; the CPU calculator is the fallback and oracle.

**Tech Stack:** TypeScript, Vitest, Web Workers, WebGPU/WESL through the existing `FieldKernel`, Lit shell UI, OpenSpec.

**Spec:** `docs/superpowers/specs/2026-09-05-leanfront-simple-live-runtime-design.md`

## Global Constraints

- `leanfront-simple` remains separate from both `openfront` and original `leanfront`.
- Combat, ownership, neutral exploration, nation simulation, and retreat execute through the existing core classes; do not add a mode-specific attack, frontier, incursion, or ownership implementation.
- City and farm plots occupy only their selected tile and never spread automatically.
- People and food are whole integers; people are troops and never consume food.
- Initial per-level capacity is 20,000, seed fraction is 0.10, city/farm rates are 0.03/0.06, city/farm/raze costs are 4,000/3,000/1,000 food, and attack energy is 40 milli-food per active person per combat tick.
- The CPU worker owns canonical gameplay state; WebGPU accelerates only compact plot growth and must have a CPU fallback.
- `src/core` must not import `src/client`, and every core change must have a focused test.
- Preserve all unrelated dirty-worktree changes; stage only files named by the current task.
- Add no dependency and no generic framework for this one ruleset.

---

### Task 1: Register LeanFront Simple as the Third Live Ruleset

**Files:**

- Modify: `src/core/game/Rulesets.ts`
- Modify: `src/client/games/registry.ts`
- Replace: `src/client/games/leanfront-simple/system.ts`
- Create: `src/client/games/leanfront-simple/runtime.ts`
- Modify: `src/client/games/experience.ts`
- Modify: `tests/Rulesets.test.ts`
- Modify: `tests/LeanFrontSiblingModes.test.ts`
- Modify: `tests/CoreDependencyBoundary.test.ts`

**Interfaces:**

- Produces: `RulesetID = "openfront" | "leanfront" | "leanfront-simple"`.
- Produces: `LeanFrontSimpleConfig extends Config`; economy overrides arrive in Task 3.
- Produces: a `LiveGameDefinition` whose id and view are both `leanfront-simple` and whose runtime is dynamically imported.
- Consumes: shared `live-game.wesl`; no LeanFront Simple combat layers.

- [ ] **Step 1: Replace the sibling-mode expectation with a failing worker-backend test**

```ts
test("registers three separate worker-backed Live games", () => {
  expect(LIVE_GAMES.map(({ id }) => id)).toEqual([
    "openfront",
    "leanfront",
    "leanfront-simple",
  ]);
  expect(getLiveGame("leanfront-simple")?.system.id).toBe("leanfront-simple");
  expect(
    PLAYABLE_GAMES.find(({ id }) => id === "leanfront-simple")?.backend,
  ).toBe("worker");
});
```

- [ ] **Step 2: Extend the ruleset test with the third id and config type**

```ts
expect(RULESET_IDS).toEqual(["openfront", "leanfront", "leanfront-simple"]);
expect(isRulesetID("leanfront-simple")).toBe(true);
expect(
  createRulesetConfig("leanfront-simple", gameConfig, null, false),
).toBeInstanceOf(LeanFrontSimpleConfig);
```

- [ ] **Step 3: Run the focused tests and confirm they fail on the field registration**

Run:

```bash
npx vitest tests/Rulesets.test.ts tests/LeanFrontSiblingModes.test.ts tests/CoreDependencyBoundary.test.ts --run
```

Expected: failures show that `leanfront-simple` is absent from `RulesetID`/`LIVE_GAMES` and still has backend `field`.

- [ ] **Step 4: Add the minimal ruleset and Live render registration**

```ts
// src/core/game/Rulesets.ts
export type RulesetID = "openfront" | "leanfront" | "leanfront-simple";
export const RULESET_IDS = [
  "openfront",
  "leanfront",
  "leanfront-simple",
] as const;
export class LeanFrontSimpleConfig extends Config {}

// createRulesetConfig switch
case "leanfront-simple":
  return new LeanFrontSimpleConfig(gameConfig, userSettings, isReplay);
```

Replace `leanfront-simple/system.ts` with the same thin render-conduit shape as `openfront/system.ts`: shared Live params, player palette fields, and `views: { "leanfront-simple": { source: liveGameView } }`. It must declare no tick phases.

Register it in `LIVE_GAMES`:

```ts
{
  id: "leanfront-simple",
  system: leanfrontSimple,
  view: "leanfront-simple",
  createRuntime: async (game) =>
    (await import("./leanfront-simple/runtime")).createRuntime(game),
}
```

Add a compile-safe runtime stub that Task 4 will replace:

```ts
export async function createRuntime(): Promise<LiveGameRuntime> {
  return { beforeTick: async () => {}, dispose: () => {} };
}
```

Remove only the `fieldGame(leanfrontSimple, ...)` entry from `PLAYABLE_GAMES`; the `LIVE_GAMES.map(...)` spread now supplies it.

- [ ] **Step 5: Keep the runtime import isolated**

Update the boundary assertion to require the dynamic import and forbid direct runtime/economy imports from `ShellSim.worker.ts`:

```ts
expect(registrySource).toContain('import("./leanfront-simple/runtime")');
expect(workerSource).not.toMatch(/leanfront-simple\/runtime|SimpleEconomy/);
```

- [ ] **Step 6: Run focused tests until green**

```bash
npx vitest tests/Rulesets.test.ts tests/LeanFrontSiblingModes.test.ts tests/CoreDependencyBoundary.test.ts --run
```

Expected: all pass.

- [ ] **Step 7: Commit the runtime identity boundary**

```bash
git add src/core/game/Rulesets.ts src/client/games/registry.ts src/client/games/leanfront-simple/system.ts src/client/games/leanfront-simple/runtime.ts src/client/games/experience.ts tests/Rulesets.test.ts tests/LeanFrontSiblingModes.test.ts tests/CoreDependencyBoundary.test.ts
git commit -m "feat: run leanfront simple through live worker"
```

### Task 2: Implement the Integer Plot Economy and Scoped Urban Provider

**Files:**

- Create: `src/client/games/leanfront-simple/economy/SimpleEconomy.ts`
- Modify: `src/core/configuration/Config.ts`
- Modify: `src/core/execution/utils/UrbanGrowth.ts`
- Create: `tests/LeanFrontSimpleEconomy.test.ts`
- Modify: `tests/CoreDependencyBoundary.test.ts`

**Interfaces:**

- Produces:

```ts
export type SimplePlotKind = "city" | "farm";
export interface SimplePlotInput {
  unitId: number;
  tile: number;
  owner: number;
  kind: SimplePlotKind;
  level: number;
  stock: number;
}
export interface SimplePlotGrowth extends SimplePlotInput {
  capacity: number;
  growth: number;
  nextStock: number;
}
export interface SimplePlotEconomyConfig {
  capacityPerLevel: number;
  seedFraction: number;
  cityGrowthRate: number;
  farmGrowthRate: number;
  cityLevelCost: bigint;
  farmLevelCost: bigint;
  razeCost: bigint;
  attackMilliPerPerson: bigint;
}
export type SimpleGrowthBatch = (
  records: readonly SimplePlotInput[],
  config: SimplePlotEconomyConfig,
) => Promise<readonly SimplePlotGrowth[]>;
export function growSimplePlot(
  record: SimplePlotInput,
  config: SimplePlotEconomyConfig,
): SimplePlotGrowth;
export function growSimplePlotsCpu(
  records: readonly SimplePlotInput[],
  config: SimplePlotEconomyConfig,
): Promise<readonly SimplePlotGrowth[]>;
export function apportion(
  total: number,
  weighted: readonly { unitId: number; weight: number }[],
): Map<number, number>;
export class SimpleEconomy {
  install(): void;
  prepare(game: Game, grow?: SimpleGrowthBatch): Promise<void>;
  applyPlayer(game: Game, player: Player): boolean;
  plotFrame(): Int32Array;
  dispose(): void;
}
```

- Produces: `setUrbanTickProvider(provider: UrbanTickProvider | null): void`, where a provider returns `true` when it replaced the rich tick.
- Produces: `Config.simplePlotEconomy(): SimplePlotEconomyConfig | null`, returning `null` by default.
- Consumes later: `SimpleGpuGrowth.grow` from Task 5.

- [ ] **Step 1: Write failing growth and apportionment tests**

```ts
const farm = (overrides: Partial<SimplePlotInput> = {}): SimplePlotInput => ({
  unitId: 1,
  tile: 8,
  owner: 2,
  kind: "farm",
  level: 1,
  stock: 2_000,
  ...overrides,
});
const config: SimplePlotEconomyConfig = {
  capacityPerLevel: 20_000,
  seedFraction: 0.1,
  cityGrowthRate: 0.03,
  farmGrowthRate: 0.06,
  cityLevelCost: 4_000n,
  farmLevelCost: 3_000n,
  razeCost: 1_000n,
  attackMilliPerPerson: 40n,
};

test("grows a seeded level-one farm in whole units", () => {
  expect(growSimplePlot(farm(), config)).toMatchObject({
    capacity: 20_000,
    growth: 276,
    nextStock: 2_276,
  });
});

test("uses one final unit near capacity", () => {
  expect(growSimplePlot(farm({ stock: 19_999 }), config).nextStock).toBe(
    20_000,
  );
});

test("assigns proportional remainder by ascending unit id", () => {
  expect([
    ...apportion(5, [
      { unitId: 9, weight: 1 },
      { unitId: 3, weight: 1 },
    ]),
  ]).toEqual([
    [3, 3],
    [9, 2],
  ]);
});
```

Use `Math.fround` at each CPU arithmetic boundary so the CPU oracle matches WGSL f32 arithmetic before flooring.

- [ ] **Step 2: Run the economy test and confirm missing exports fail**

```bash
npx vitest tests/LeanFrontSimpleEconomy.test.ts --run
```

Expected: module/export resolution failure.

- [ ] **Step 3: Implement the minimal growth and exact integer distribution functions**

```ts
export function growSimplePlot(
  r: SimplePlotInput,
  config: SimplePlotEconomyConfig,
): SimplePlotGrowth {
  const capacity = config.capacityPerLevel * Math.max(1, Math.floor(r.level));
  if (r.stock >= capacity)
    return { ...r, capacity, growth: 0, nextStock: r.stock };
  const ratio = Math.fround(capacity / Math.max(1, r.stock));
  const raw = Math.fround(
    Math.fround(
      Math.fround(
        r.kind === "city" ? config.cityGrowthRate : config.farmGrowthRate,
      ) * r.stock,
    ) * Math.fround(Math.log(ratio)),
  );
  const growth = Math.max(1, Math.floor(raw));
  return {
    ...r,
    capacity,
    growth,
    nextStock: Math.min(capacity, r.stock + growth),
  };
}
```

`apportion` must floor proportional shares, then distribute the remaining units one at a time in ascending `unitId` order. Return an empty map for non-positive totals or empty inputs.

Add `SimplePlotEconomyConfig` and the default `simplePlotEconomy() { return null; }` to `Config.ts`; the concrete values remain in `LeanFrontSimpleConfig` in Task 3.

- [ ] **Step 4: Add the opt-in provider without changing the default urban tick**

```ts
export type UrbanTickProvider = (mg: Game, player: Player) => boolean;
let urbanTickProvider: UrbanTickProvider | null = null;

export function setUrbanTickProvider(p: UrbanTickProvider | null): void {
  urbanTickProvider = p;
}

export function urbanTick(mg: Game, player: Player): void {
  if (urbanTickProvider?.(mg, player) === true) return;
  foodTick(mg, player);
  // existing function body remains byte-for-byte below this gate
}
```

- [ ] **Step 5: Implement compact stock reconciliation in `SimpleEconomy`**

`prepare` must:

1. enumerate only active Settlement/Farmland units;
2. create seed stock 2,000 for unseen units and initialize a first-seen player's published baseline without double-counting the spawn balances;
3. reset stock on owner change (city 0, farm 2,000) and delete records for missing units, retaining the amount lost by each previous owner;
4. cap/cost newly seen and existing attacks as specified in Task 4 so returned people and food charges are visible in the current core balances;
5. compute external deltas as `currentCoreBalance - lastPublishedBalance`, then apply those deltas to the surviving plot records after lifecycle losses;
6. keep returned people in a per-player dormant reserve when no city exists, include that reserve in the published troop balance, and distribute it when a city is acquired; food has no non-farm reserve;
7. calculate next stocks with the supplied batch function or CPU function;
8. stage one result per player for synchronous `applyPlayer`.

`applyPlayer` must set exact aggregate troops/food by removing the old balance and adding the staged balance, then return `true`. `plotFrame()` packs six integers per active plot: `[tile, kind, level, stock, capacity, growth]` sorted by tile.

- [ ] **Step 6: Prove provider disposal restores rich economy**

```ts
test("disposing simple economy restores the default urban tick", () => {
  const provider = vi.fn(() => true);
  setUrbanTickProvider(provider);
  urbanTick(game, player);
  expect(provider).toHaveBeenCalledOnce();
  setUrbanTickProvider(null);
  provider.mockClear();
  urbanTick(game, player);
  expect(provider).not.toHaveBeenCalled();
});
```

Construct `game` and `player` with the existing `setup()` helper and clear the provider in `afterEach`, matching `FarmTickProvider.test.ts`.

- [ ] **Step 7: Run economy and dependency tests**

```bash
npx vitest tests/LeanFrontSimpleEconomy.test.ts tests/CoreDependencyBoundary.test.ts --run
```

Expected: all pass and no core-to-client import appears.

- [ ] **Step 8: Commit the CPU economy seam**

```bash
git add src/client/games/leanfront-simple/economy/SimpleEconomy.ts src/core/configuration/Config.ts src/core/execution/utils/UrbanGrowth.ts tests/LeanFrontSimpleEconomy.test.ts tests/CoreDependencyBoundary.test.ts
git commit -m "feat: add leanfront simple plot economy"
```

### Task 3: Configure Plot Building, Spawn, Capture, and Razing

**Files:**

- Modify: `src/core/game/Rulesets.ts`
- Modify: `src/core/game/PlayerImpl.ts`
- Modify: `src/core/execution/SpawnExecution.ts`
- Modify: `src/core/execution/DeleteUnitExecution.ts`
- Modify: `tests/Rulesets.test.ts`
- Modify: `tests/LeanFrontSimpleEconomy.test.ts`

**Interfaces:**

- Consumes: `SimplePlotEconomyConfig` and the null default from Task 2.
- Consumes: `LeanFrontSimpleConfig` from Task 1.
- Preserves: all default Config, OpenFront, and original LeanFront behavior.

- [ ] **Step 1: Add failing ruleset-specific unit-info tests**

```ts
test("simple plots have flat food costs and upgrades", () => {
  const cfg = createRulesetConfig("leanfront-simple", gameConfig, null, false);
  const game = {} as Game;
  const player = {} as Player;
  expect(cfg.unitInfo(UnitType.Settlement)).toMatchObject({
    costResource: "food",
    constructionDuration: 0,
    upgradable: true,
  });
  expect(cfg.unitInfo(UnitType.Settlement).cost(game, player)).toBe(4_000n);
  expect(cfg.unitInfo(UnitType.Farmland).cost(game, player)).toBe(3_000n);
  expect(cfg.simplePlotEconomy()?.razeCost).toBe(1_000n);
});
```

Also assert `new Config(...).simplePlotEconomy()` and `new LeanFrontConfig(...).simplePlotEconomy()` are `null`.

- [ ] **Step 2: Add failing core-game tests for spawn kit and exact-tile upgrades**

Create a LeanFront Simple game with `setup()`/`createRulesetConfig`, spawn a player, and assert:

```ts
expect(player.units(UnitType.Settlement)).toHaveLength(1);
expect(player.units(UnitType.Farmland)).toHaveLength(1);
expect(player.troops()).toBe(2_000);
expect(player.food()).toBe(2_000n);
expect([...player.densityEntries()]).toEqual([]);
```

Build then upgrade the exact same plot and assert level 2, unchanged pre-growth stock, and two exact flat debits.

- [ ] **Step 3: Run the focused tests and confirm config/spawn failures**

```bash
npx vitest tests/Rulesets.test.ts tests/LeanFrontSimpleEconomy.test.ts --run
```

Expected: Simple config has no overrides and spawn still creates rich density plus only a farm.

- [ ] **Step 4: Add one capability config and the Simple overrides**

```ts
// Rulesets.ts
const SIMPLE_PLOTS: SimplePlotEconomyConfig = {
  capacityPerLevel: 20_000,
  seedFraction: 0.1,
  cityGrowthRate: 0.03,
  farmGrowthRate: 0.06,
  cityLevelCost: 4_000n,
  farmLevelCost: 3_000n,
  razeCost: 1_000n,
  attackMilliPerPerson: 40n,
};

export class LeanFrontSimpleConfig extends Config {
  override simplePlotEconomy() {
    return SIMPLE_PLOTS;
  }
  override unitInfo(type: UnitType): UnitInfo {
    if (type === UnitType.Settlement)
      return {
        cost: () => SIMPLE_PLOTS.cityLevelCost,
        costResource: "food",
        constructionDuration: 0,
        upgradable: true,
      };
    if (type === UnitType.Farmland)
      return {
        cost: () => SIMPLE_PLOTS.farmLevelCost,
        costResource: "food",
        constructionDuration: 0,
        upgradable: true,
      };
    return super.unitInfo(type);
  }
}
```

- [ ] **Step 5: Disable only the plot seed gate for Simple**

In `PlayerImpl.canBuildUnitType`, wrap the existing Settlement/Farmland seed checks:

```ts
if (this.mg.config().simplePlotEconomy() === null) {
  if (unitType === UnitType.Settlement && this._settlementSeeds < 1)
    return false;
  if (unitType === UnitType.Farmland && this._farmSeeds < 1) return false;
}
```

Do not change seed awards or seed deduction for other rulesets.

- [ ] **Step 6: Branch only the spawn economy kit**

In `SpawnExecution.foundCore`, keep shared territory/core placement. When `simplePlotEconomy()` is non-null:

```ts
player.setDensity(coreTile, 0);
player.buildUnit(UnitType.Settlement, coreTile, {});
if (kitTile !== null) player.buildUnit(UnitType.Farmland, kitTile, {});
player.setTroops(Math.floor(simple.capacityPerLevel * simple.seedFraction));
player.removeFood(player.food());
player.addFood(
  BigInt(Math.floor(simple.capacityPerLevel * simple.seedFraction)),
);
return;
```

The existing rich density, maturity, and starting-food branch remains unchanged below it.

- [ ] **Step 7: Charge razing through the existing deletion execution**

After ownership/land validation but before `recordDeleteUnit()`:

```ts
const simple = mg.config().simplePlotEconomy();
if (simple !== null && TribalStructures.has(unit.type())) {
  if (player.food() < simple.razeCost) {
    this.active = false;
    return;
  }
  player.removeFood(simple.razeCost);
}
```

Leave the existing cooldown, deletion delay, ownership validation, and burn/message behavior intact.

- [ ] **Step 8: Run plot lifecycle tests**

```bash
npx vitest tests/Rulesets.test.ts tests/LeanFrontSimpleEconomy.test.ts tests/PersistentTilesBurn.test.ts --run
```

Expected: Simple tests pass; existing persistent-plot behavior remains green.

- [ ] **Step 9: Commit the ruleset economy configuration**

```bash
git add src/core/game/Rulesets.ts src/core/game/PlayerImpl.ts src/core/execution/SpawnExecution.ts src/core/execution/DeleteUnitExecution.ts tests/Rulesets.test.ts tests/LeanFrontSimpleEconomy.test.ts
git commit -m "feat: configure leanfront simple plots"
```

### Task 4: Add the Runtime, Global Food Debits, and Attack Energy

**Files:**

- Modify: `src/client/games/leanfront-simple/runtime.ts`
- Modify: `src/client/games/LiveGameRuntime.ts`
- Modify: `src/client/games/leanfront-simple/economy/SimpleEconomy.ts`
- Create: `tests/LeanFrontSimpleRuntime.test.ts`
- Create: `tests/LeanFrontSimpleCombatParity.test.ts`

**Interfaces:**

- Produces:

```ts
export type LivePlotAction = "city" | "farm" | "raze";
export type LiveActionResolution =
  | { ok: true; intent: Intent }
  | { ok: false; message: string };
export interface LiveRuntimeStats {
  population: number;
  production: number;
  consumption: number;
  starved: number;
}

export interface LiveGameRuntime {
  beforeTick(): Promise<void>;
  resolvePlotAction?(
    player: Player,
    action: LivePlotAction,
    tile: number,
  ): LiveActionResolution;
  plotFrame?(): Int32Array;
  stats?(player: Player): LiveRuntimeStats;
  dispose(): void;
}

export interface SimpleEconomyActions {
  resolvePlotAction(
    game: Game,
    player: Player,
    action: LivePlotAction,
    tile: number,
  ): LiveActionResolution;
  stats(player: Player): LiveRuntimeStats;
}
```

- Consumes: `SimpleEconomy.prepare`, `applyPlayer`, and `plotFrame`.
- Preserves: `AttackExecution.ts` and `AttackImpl.ts` without edits.

- [ ] **Step 1: Write failing attack-energy unit tests**

```ts
test("caps a newly seen attack before its first combat tick", async () => {
  // 10 food funds floor(10 * 1000 / 40) = 250 people.
  attack.setTroops(1_000);
  await economy.prepare(game);
  expect(attack.troops()).toBe(250);
  expect(player.troops()).toBe(previousIdle + 750);
  expect(player.food()).toBe(0n);
});

test("energy exhaustion returns survivors without retreat malus", async () => {
  await economy.prepare(game); // marks and funds the new attack
  player.removeFood(player.food());
  await economy.prepare(game);
  expect(player.outgoingAttacks()).toEqual([]);
  expect(player.troops()).toBe(previousIdle + survivingAttackTroops);
});
```

Use real `AttackImpl` instances created by `AttackExecution`, not test doubles.

- [ ] **Step 2: Implement integer attack charging inside `SimpleEconomy.prepare`**

```ts
const chargeFor = (people: number, milli: bigint): bigint =>
  (BigInt(Math.max(0, Math.floor(people))) * milli + 999n) / 1000n;
const affordablePeople = (food: bigint, milli: bigint): number =>
  Number((food * 1000n) / milli);
```

Track `seenAttackIds`. For a new id, cap with `attack.setTroops(cap)`, return the excess with `attack.attacker().addTroops(excess)`, then debit the charge. For an already-seen id, either debit its full charge or return all survivors and call `attack.delete()` before `GameRunner` executes the next combat tick. Retire ids no longer present.

- [ ] **Step 3: Implement global farm reconciliation**

At each prepare, compare the last published aggregate to `player.food()`. Remove any core debit from farm records using `apportion`; add no food except plot growth/seeding. After growth, publish the new exact aggregate through `removeFood(player.food())` plus `addFood(BigInt(total))`. Assert no record goes negative.

- [ ] **Step 4: Implement exact plot-action resolution**

```ts
resolvePlotAction(game, player, action, tile) {
  const config = game.config().simplePlotEconomy()!;
  const plot = game.plotAt(tile);
  if (action === "raze") {
    if (!plot || plot.owner() !== player) return { ok: false, message: "No owned plot here" };
    if (player.food() < config.razeCost) return { ok: false, message: "Not enough food" };
    return { ok: true, intent: { type: "delete_unit", unitId: plot.id() } };
  }
  const unit = action === "city" ? UnitType.Settlement : UnitType.Farmland;
  if (plot?.type() === unit && plot.owner() === player) {
    if (!player.canUpgradeUnit(plot)) return { ok: false, message: "Cannot upgrade this plot" };
    return { ok: true, intent: { type: "upgrade_structure", unit, unitId: plot.id() } };
  }
  if (plot) return { ok: false, message: "Raze the existing plot first" };
  if (player.canBuild(unit, tile) === false) return { ok: false, message: "Cannot build here" };
  return { ok: true, intent: { type: "build_unit", unit, tile } };
}
```

- [ ] **Step 5: Create and dispose the runtime**

```ts
export async function createRuntime(game: Game): Promise<LiveGameRuntime> {
  const economy = new SimpleEconomy();
  economy.install();
  return {
    beforeTick: () => economy.prepare(game),
    resolvePlotAction: (player, action, tile) =>
      economy.resolvePlotAction(game, player, action, tile),
    plotFrame: () => economy.plotFrame(),
    stats: (player) => economy.stats(player),
    dispose: () => economy.dispose(),
  };
}
```

Task 5 will inject the GPU batch when available; this task ships a playable CPU fallback first.

- [ ] **Step 6: Write the tick-by-tick combat parity test**

Create two identical tiny games with the same seed and players. Use the inert test economy for OpenFront and inject an identity `SimpleGrowthBatch` for LeanFront Simple so neither economy changes troop balances during this combat-isolation test. Give Simple effectively unlimited food, enqueue the same real `AttackExecution`, and for at least 30 ticks compare:

```ts
expect(snapshot(simpleGame)).toEqual(snapshot(openGame));
```

The snapshot must include sorted owner ids, both players' idle troops, each outgoing attack's target/troops/retreating/retreated state, and sorted `[frontTile, troopsAt]` entries. Repeat once against Terra Nullius and once against another player.

- [ ] **Step 7: Run runtime, combat, and existing attack tests**

```bash
npx vitest tests/LeanFrontSimpleRuntime.test.ts tests/LeanFrontSimpleCombatParity.test.ts tests/Attack.test.ts tests/FrontLineTroops.test.ts tests/SegmentAttack.test.ts --run
```

Expected: all pass; `git diff -- src/core/execution/AttackExecution.ts src/core/game/AttackImpl.ts` is empty.

- [ ] **Step 8: Commit the runtime and exact combat boundary**

```bash
git add src/client/games/leanfront-simple/runtime.ts src/client/games/LiveGameRuntime.ts src/client/games/leanfront-simple/economy/SimpleEconomy.ts tests/LeanFrontSimpleRuntime.test.ts tests/LeanFrontSimpleCombatParity.test.ts
git commit -m "feat: gate live attacks with simple food energy"
```

### Task 5: Add the Compact GPU Growth Accelerator

**Files:**

- Create: `src/client/games/leanfront-simple/economy/growth-system.ts`
- Create: `src/client/games/leanfront-simple/economy/layers/nextStock.wesl`
- Create: `src/client/games/leanfront-simple/economy/SimpleGpuGrowth.ts`
- Modify: `src/client/games/leanfront-simple/runtime.ts`
- Create: `tests/LeanFrontSimpleGpuGrowth.test.ts`

**Interfaces:**

- Produces:

```ts
export class SimpleGpuGrowth {
  static create(): Promise<SimpleGpuGrowth | null>;
  grow(
    records: readonly SimplePlotInput[],
    config: SimplePlotEconomyConfig,
  ): Promise<readonly SimplePlotGrowth[]>;
  dispose(): void;
}
```

- Consumes: `SimpleGrowthBatch`, `SimplePlotInput`, and `growSimplePlot` from Task 2.
- Uses: existing `compileFieldSystem` and `FieldKernel`; no direct WebGPU framework.

- [ ] **Step 1: Write failing CPU/GPU contract tests**

```ts
test.each([
  ["empty", []],
  ["seeded", [farm({ stock: 2_000 })]],
  ["near cap", [city({ stock: 19_999 })]],
  ["upgraded", [farm({ level: 4, stock: 31_337 })]],
  ["overflow", [city({ stock: 25_000 })]],
  ["large", [farm({ level: 1_000, stock: 8_000_000 })]],
])("matches CPU for %s records", async (_name, records) => {
  const gpu = await SimpleGpuGrowth.create();
  if (!gpu) return;
  expect(await gpu.grow(records, config)).toEqual(
    await growSimplePlotsCpu(records, config),
  );
  gpu.dispose();
});
```

Define the local record helpers in that test file:

```ts
const farm = (overrides: Partial<SimplePlotInput> = {}): SimplePlotInput => ({
  unitId: 1,
  tile: 8,
  owner: 2,
  kind: "farm",
  level: 1,
  stock: 2_000,
  ...overrides,
});
const city = (overrides: Partial<SimplePlotInput> = {}): SimplePlotInput => ({
  unitId: 2,
  tile: 9,
  owner: 2,
  kind: "city",
  level: 1,
  stock: 2_000,
  ...overrides,
});
const config: SimplePlotEconomyConfig = {
  capacityPerLevel: 20_000,
  seedFraction: 0.1,
  cityGrowthRate: 0.03,
  farmGrowthRate: 0.06,
  cityLevelCost: 4_000n,
  farmLevelCost: 3_000n,
  razeCost: 1_000n,
  attackMilliPerPerson: 40n,
};
```

Add a lifecycle test proving `dispose()` destroys the kernel and a rejection test proving runtime permanently uses CPU after a thrown `grow()`.

- [ ] **Step 2: Run the GPU test and confirm missing module failure**

```bash
npx vitest tests/LeanFrontSimpleGpuGrowth.test.ts --run
```

Expected: module resolution failure.

- [ ] **Step 3: Define the compact one-row field system**

Use one logical cell per plot record. Upload `stock`, `level`, and `kind`; provide capacity and both rates as uniforms; derive `nextStock` only. The WESL calculation must mirror the CPU's f32 boundaries:

```wgsl
let capacity = params::capacityPerLevel() * f32(layers::level::val(i));
let stock = f32(layers::stock::val(i));
var next = stock;
if (stock < capacity) {
  let rate = select(params::cityGrowthRate(), params::farmGrowthRate(), layers::kind::val(i) == 2u);
  let growth = max(1.0, floor(rate * stock * log(capacity / max(1.0, stock))));
  next = min(capacity, stock + growth);
}
return u32(next);
```

No owner, attack, border, terrain, or nation buffer belongs in this system.

- [ ] **Step 4: Implement create/upload/dispatch/readback/fallback**

`create()` returns `null` when `navigator.gpu` is absent or kernel setup throws. `grow()` writes the current config uniforms, resizes the kernel to `max(1, records.length) × 1`, uploads typed arrays, executes one derive pass, reads exactly `records.length` `u32` values, and combines them with CPU-derived capacity/growth metadata. Reject if returned length differs.

- [ ] **Step 5: Inject the GPU batch into the runtime**

```ts
const gpu = await SimpleGpuGrowth.create();
let useGpu = gpu !== null;
const grow: SimpleGrowthBatch = async (records, config) => {
  if (!useGpu || gpu === null) return growSimplePlotsCpu(records, config);
  try {
    return await gpu.grow(records, config);
  } catch {
    useGpu = false;
    return growSimplePlotsCpu(records, config);
  }
};
```

Pass `grow` to `economy.prepare(game, grow)` and dispose the GPU with the economy.

- [ ] **Step 6: Run GPU and CPU economy tests**

```bash
npx vitest tests/LeanFrontSimpleGpuGrowth.test.ts tests/LeanFrontSimpleEconomy.test.ts tests/LeanFrontSimpleRuntime.test.ts --run
```

Expected: all pass on GPU-capable runners; GPU-specific comparisons skip cleanly when unavailable while fallback tests still run.

- [ ] **Step 7: Commit the accelerator**

```bash
git add src/client/games/leanfront-simple/economy/growth-system.ts src/client/games/leanfront-simple/economy/layers/nextStock.wesl src/client/games/leanfront-simple/economy/SimpleGpuGrowth.ts src/client/games/leanfront-simple/runtime.ts tests/LeanFrontSimpleGpuGrowth.test.ts
git commit -m "feat: accelerate simple plot growth on gpu"
```

### Task 6: Route Plot Commands and Plot State Through the Shared Worker Shell

**Files:**

- Modify: `src/client/webgpu/ShellSimProtocol.ts`
- Modify: `src/client/webgpu/ShellSim.worker.ts`
- Modify: `src/client/GameShellPage.ts`
- Modify: `tests/GameShellExperience.test.ts`
- Create: `tests/LeanFrontSimpleWorkerProtocol.test.ts`

**Interfaces:**

- Produces protocol additions:

```ts
// main -> worker
| { type: "plot_action"; action: LivePlotAction; tile: number }

// worker -> main
| { type: "action_result"; action: LivePlotAction; tile: number; ok: boolean; message?: string }

// ShellSimFrame
simplePlots?: Int32Array; // [tile, kind, level, stock, capacity, growth] sextets
```

- Consumes: optional `resolvePlotAction()` and `plotFrame()` runtime capabilities from Task 4.
- Consumes: optional `stats()` so Simple reports people from the shared troop balance, per-tick plot growth as production, attack energy as consumption, and zero starvation without populating the rich `foodFlow` model.
- Preserves: existing `spawn`, `act`, `intent`, `preview`, running/turbo, frame, border, nation, and camera paths.

- [ ] **Step 1: Replace field-intent shell tests with failing worker-command tests**

```ts
test("routes simple plot actions through the live worker", () => {
  const page = workerPage("leanfront-simple");
  for (const action of ["city", "farm", "raze"] as const) {
    page.fieldAction = action;
    page.onTileGesture(3, 4, {} as PointerEvent);
    expect(page.worker.postMessage).toHaveBeenLastCalledWith({
      type: "plot_action",
      action,
      tile: 43,
    });
  }
});
```

Update auto-start expectation for `leanfront-simple` to `[true, "leanfront-simple"]` and delete expectations that read its field scalars or brush buffers.

- [ ] **Step 2: Add failing protocol resolution tests**

Drive the worker handler through exported pure helpers or a worker harness and assert:

- same-type plot emits `upgrade_structure` with exact unit id;
- empty valid tile emits `build_unit`;
- opposite plot emits `action_result` rejection and no queued intent;
- raze emits `delete_unit` with exact unit id;
- Simple frame emits whole stock/capacity/growth sextets.

- [ ] **Step 3: Run the shell/protocol tests and confirm failures**

```bash
npx vitest tests/GameShellExperience.test.ts tests/LeanFrontSimpleWorkerProtocol.test.ts --run
```

Expected: protocol union lacks `plot_action`, and shell still selects field brushes.

- [ ] **Step 4: Add mode-free optional runtime handling to the worker**

```ts
case "plot_action": {
  const me = myPlayer();
  const result = me && runtime?.resolvePlotAction?.(me, msg.action, msg.tile);
  if (!result) break;
  if (result.ok) stamp(result.intent);
  post({
    type: "action_result",
    action: msg.action,
    tile: msg.tile,
    ok: result.ok,
    ...(!result.ok ? { message: result.message } : {}),
  });
  break;
}
```

In `buildFrame`, attach `runtime?.plotFrame?.()` and include its buffer in transfers. In `playerSummary` and `myStats`, prefer `runtime?.stats?.(player)` and retain `foodFlow()` as the fallback for OpenFront and original LeanFront. Do not test `ruleset === "leanfront-simple"` inside the worker.

- [ ] **Step 5: Route clicks while retaining the shared attack path**

When the selected Live game is LeanFront Simple and `fieldAction !== "attack"`, post `plot_action`. Otherwise keep the existing Live spawn/build/`act` flow. The deploy slider continues to set `attackRatio`; stop continues to emit `cancel_attack` for the selected active attack.

Store received sextets in a tile-keyed map used only for LeanFront Simple hover/HUD. Display integers with the existing number formatter. `action_result` clears or sets `status`.

- [ ] **Step 6: Keep common visuals on common data**

Assert the page still derives:

- camera tween from `spawnAnchor` in the accepting worker frame;
- nation markers from `nationSpawns`;
- highlight from `myBorder` and `borderSegment`;
- sprites from the shared packed `plot` conduit;
- colors/mask/fronts from the shared owner/plot/front/density/damage buffers.

Do not add a Simple-specific camera timeout, palette, spawn coordinate transform, or sprite shader.

- [ ] **Step 7: Run the shell, protocol, and nation tests**

```bash
npx vitest tests/GameShellExperience.test.ts tests/LeanFrontSimpleWorkerProtocol.test.ts tests/NationLiteralSpawn.test.ts tests/MapConsistency.test.ts --run
```

Expected: all pass, including Verdantia and SPQR literal manifest nations.

- [ ] **Step 8: Commit worker and shell integration**

```bash
git add src/client/webgpu/ShellSimProtocol.ts src/client/webgpu/ShellSim.worker.ts src/client/GameShellPage.ts tests/GameShellExperience.test.ts tests/LeanFrontSimpleWorkerProtocol.test.ts
git commit -m "feat: connect simple plots to live shell"
```

### Task 7: Remove the Obsolete Field Backend and Complete Verification

**Files:**

- Delete when `rg` proves no imports: `src/client/games/leanfront-simple/actions.ts`
- Delete when `rg` proves no imports: `src/client/games/leanfront-simple/layers/*.wesl`
- Delete when `rg` proves no imports: `src/client/games/leanfront-simple/lib/*.wesl`
- Delete when `rg` proves no imports: `src/client/games/leanfront-simple/views/leanfront.wesl`
- Replace or remove: `tests/LeanFrontSimpleSystem.test.ts`
- Modify: `openspec/changes/move-leanfront-simple-to-live-runtime/tasks.md`

**Interfaces:**

- Consumes: all prior tasks.
- Produces: one playable LeanFront Simple implementation: Live core plus compact economy runtime.
- Preserves: original LeanFront GPU economy files and runtime.

- [ ] **Step 1: Prove the old backend has no caller**

```bash
rg -n "LEAN_ACTION|LEAN_RESULT|lib/conquest|layers/incursion|layers/troops|leanfront-simple/views/leanfront|compileFieldSystem\(composeTerrain\(leanfront" src tests
```

Expected: matches exist only in obsolete files/tests slated for deletion. If a production match remains, remove that import at its new Live call site before deleting anything.

- [ ] **Step 2: Delete only unreachable field implementation files**

Use `apply_patch` deletions for every confirmed-unreferenced file. Keep:

- `src/client/games/leanfront-simple/system.ts` (thin Live render conduit);
- `src/client/games/leanfront-simple/runtime.ts`;
- `src/client/games/leanfront-simple/economy/**`.

Replace `LeanFrontSimpleSystem.test.ts` with assertions that the thin system has no phases/brushes/scalars/player intent outputs and uses only the shared Live view.

- [ ] **Step 3: Run all focused feature tests**

```bash
npx vitest tests/Rulesets.test.ts tests/LeanFrontSiblingModes.test.ts tests/LeanFrontSimpleSystem.test.ts tests/LeanFrontSimpleEconomy.test.ts tests/LeanFrontSimpleRuntime.test.ts tests/LeanFrontSimpleCombatParity.test.ts tests/LeanFrontSimpleGpuGrowth.test.ts tests/LeanFrontSimpleWorkerProtocol.test.ts tests/GameShellExperience.test.ts tests/NationLiteralSpawn.test.ts tests/CoreDependencyBoundary.test.ts --run
```

Expected: all pass.

- [ ] **Step 4: Run OpenFront combat/regression checks**

```bash
npx vitest tests/Attack.test.ts tests/FrontLineTroops.test.ts tests/SegmentAttack.test.ts tests/NeighborIteration.test.ts tests/PersistentTilesBurn.test.ts tests/PlayerUpdateDiff.test.ts --run
```

Expected: all pass with unchanged OpenFront expectations.

- [ ] **Step 5: Run repository verification**

```bash
npm test -- --run
npm run lint
npm run build-prod
npx tsc --noEmit
git diff --check
openspec validate move-leanfront-simple-to-live-runtime --strict
```

Expected: all commands pass except only the documented pre-existing baseline tests if the full suite still includes them; no new failure is accepted.

- [ ] **Step 6: Mark OpenSpec tasks complete only after evidence exists**

Change each completed checkbox in `openspec/changes/move-leanfront-simple-to-live-runtime/tasks.md` from `[ ]` to `[x]`, then rerun:

```bash
openspec status --change move-leanfront-simple-to-live-runtime
openspec validate move-leanfront-simple-to-live-runtime --strict
```

Expected: 21/21 tasks complete and strict validation passes.

- [ ] **Step 7: Commit cleanup and verified change artifacts**

```bash
git add src/client/games/leanfront-simple tests/LeanFrontSimpleSystem.test.ts openspec/changes/move-leanfront-simple-to-live-runtime
git commit -m "refactor: remove simple field combat fork"
```

- [ ] **Step 8: Review the final diff for the forbidden duplicate simulation**

```bash
rg -n "incursion|diffus|flipMargin|conquestGarrison|neutralDefense" src/client/games/leanfront-simple
git diff --stat HEAD~7..HEAD
git status --short
```

Expected: no Simple combat/ownership terms remain; only the thin Live system, runtime, and compact economy exist. Report unrelated pre-existing dirty files without staging them.
