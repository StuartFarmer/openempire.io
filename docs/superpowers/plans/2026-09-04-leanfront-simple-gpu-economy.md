# LeanFront Simple GPU Economy Implementation Plan

> **Sibling-mode correction:** The completed GPU economy lives at game id
> `leanfront-simple` under `src/client/games/leanfront-simple/`. The original
> `leanfront` live runtime and economy have been restored. Task 7's removal
> instructions and older `src/client/games/leanfront/` paths are historical and
> superseded by this correction.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone LeanFront Simple GPU field game where player-painted cities grow people, player-painted farms grow globally spendable food, and every action spends food, while retaining the original LeanFront game.

**Architecture:** LeanFront Simple is a `defineFieldSystem` sibling of both the original LeanFront live game and the existing GPU `conquest` game. Five persistent tile fields remain GPU-resident; one command per player is admitted per submitted tick through the existing player-intent buffer, aggregates fund the following tick, and a compact GPU output buffer reports spend/result data without full-field readback. The existing field compiler/viewer receive only the reusable primitives this game actually needs: prior-tick scalar visibility, intent brushes, a one-action FIFO, compact `u32` player outputs, and one-word hover reads.

**Tech Stack:** TypeScript 6, Lit, WebGPU/WGSL, WESL, Vitest, Vite, the repository's lazily loaded Playwright Chromium harness.

**Spec:** `docs/superpowers/specs/2026-09-04-leanfront-simple-gpu-economy-design.md`

## Global Constraints

- OpenFront's rules, worker runtime, rendering conduits, and reference behavior do not change.
- The original `leanfront` live game remains registered and unchanged; the new
  field game uses id `leanfront-simple` and has no CPU mirror.
- `troops` is the only people/manpower resource; no separate civilian population is added.
- Cities and farms grow only within their already-painted tile; no shader may paint, migrate, zone, or spread a plot to a neighboring tile.
- Food is stored on farm tiles, aggregated globally per owner, and never consumed by people.
- Every post-spawn action spends food; rejected actions are no-ops and food never becomes negative.
- New city/farm levels use flat per-level costs and linear capacity stacking; there is no gameplay level cap.
- Growth is `r * stock * ln(capacity / stock)`, seeded only on creation and captured-farm restart; upgrades preserve stock.
- The GPU remains authoritative for tile state. Normal play reads back only scalars, compact player outputs, and the currently hovered tile's five words.
- Fixed-point food accounting uses the compiler's `SUM_FX = 256`; tolerated aggregate debit error is strictly less than `contributingFarmCount / 256` food because each farm is quantized independently.
- Add no dependency and no CPU simulation mirror.

---

## File structure

### Shared field runtime

- Modify `src/client/webgpu/FieldDynamics.ts`: split tick advance from scalar clearing; declare intent brushes, local-player metadata, and compact `u32` player outputs; compile and decode those declarations.
- Modify `src/client/webgpu/FieldKernel.ts`: allow a readable buffer range to start at an element offset, so hover reads one word instead of an entire tile plane.
- Modify `src/client/viewer/FieldViewerBase.ts`: maintain per-player action FIFOs, stamp intent brushes into those FIFOs, submit at most one queued command per player per tick, expose scalars to input, read player outputs, and preserve direct field brushes.
- Modify `tests/FieldDynamics.test.ts`: pin compiler pass order and the new manifest contracts.
- Create `tests/FieldViewerActions.test.ts`: pin FIFO ordering, action tick assignment, and batch clamping without requiring a browser GPU.
- Create `tests/FieldKernel.test.ts`: pin the byte offset and length of a one-word ranged read.

### LeanFront game

- Replace `src/client/games/leanfront/system.ts`: standalone manifest, initial parameters, phases, scalars, intent brushes, input, and AI.
- Create `src/client/games/leanfront/actions.ts`: action/result constants, packed-result decoding, click mapping, and the three-rule starter AI.
- Create `src/client/games/leanfront/lib/economy.wesl`: pure Gompertz, action validation/pricing, budget, and seed helpers.
- Create `src/client/games/leanfront/lib/conquest.wesl`: copy the existing GPU conquest helpers, removing only the separate-population militia input.
- Replace the contents of `src/client/games/leanfront/layers/` with `owner.wesl`, `troops.wesl`, `cityLevel.wesl`, `farmLevel.wesl`, `food.wesl`, and transient `incursion.wesl`.
- Create `src/client/games/leanfront/views/leanfront.wesl`: ownership, city, farm, stock, and contested-border rendering over terrain tint.
- Create `tests/LeanFrontSystem.test.ts`: manifest, shader contract, action codec, and “no automatic plot expansion” guards.

### Shell and cutover

- Modify `src/client/GameShellPage.ts`: list LeanFront as a composed GPU field game, use the shared queued-tick entry point, show LeanFront's local people/food/spend, expose attack commitment/stop controls, and read/format one hovered tile.
- Modify `src/client/games/registry.ts`: retain only OpenFront in the live worker registry.
- Modify `src/core/game/Rulesets.ts`, `src/client/webgpu/ShellSimProtocol.ts`, `src/client/webgpu/ShellSim.worker.ts`, and `src/core/GameRunner.ts`: remove the obsolete LeanFront CPU ruleset selection while preserving the single OpenFront path.
- Delete `src/client/games/leanfront/runtime.ts` and the entire `src/client/games/leanfront/economy/` directory.
- Delete `tests/GpuEconomy.test.ts`, `tests/SeamDiff.test.ts`, and `tests/OpenFrontRuntimeIsolation.test.ts`; update `tests/LiveGameRuntime.test.ts`, `tests/LiveGameRegistry.test.ts`, `tests/CoreDependencyBoundary.test.ts`, `tests/Rulesets.test.ts`, and `tests/ShellSimWorkerLifecycle.test.ts` to pin the new boundary.

### GPU acceptance probe

- Create `tests/perf/leanfront/LeanFrontGpuProbe.ts`: browser-side 16×16 deterministic scenario runner and invariant checks.
- Create `tests/perf/leanfront/LeanFrontGpuReplay.ts`: reuse the repository's lazy Playwright pattern to run the probe twice and compare hashes.

---

### Task 1: Preserve previous-tick aggregates during field updates

**Files:**

- Modify: `src/client/webgpu/FieldDynamics.ts`
- Test: `tests/FieldDynamics.test.ts`

**Interfaces:**

- Consumes: existing `CompiledFieldSystem.runTick(kernel, frame): void` and `sim::scalar_<name>(group)` shader accessors.
- Produces: generated `sim/tick` and `sim/zero` passes; layer updates read the previous completed reductions, then reductions are cleared and rebuilt for the new tick.

- [ ] **Step 1: Write the failing pass-order tests**

Add tests beside the existing phase-order assertions:

```ts
test("updates see the previous scalars before reduction slots are cleared", async () => {
  const compiled = await compileFieldSystem(reducedSystem);
  const calls = recordRunTick(compiled);
  expect(calls).toEqual([
    "pass:sim/tick",
    "pass:stock/value",
    "swap:value",
    "pass:sim/zero",
    "pass:reduce:total",
  ]);
});

test("tick advance and scalar clearing are separate generated passes", async () => {
  const compiled = await compileFieldSystem(reducedSystem);
  const tick = compiled.kernelConfig.passes.find((p) => p.name === "sim/tick")!;
  const zero = compiled.kernelConfig.passes.find((p) => p.name === "sim/zero")!;
  expect(tick.code).toContain("S.tick = S.tick + 1u");
  expect(zero.code).not.toContain("S.tick = S.tick + 1u");
  expect(zero.code).toContain("atomicStore");
});
```

- [ ] **Step 2: Run the focused tests and confirm the old ordering fails**

Run: `npm test -- tests/FieldDynamics.test.ts`

Expected: FAIL because `runTick` currently begins with `sim/zero` and no `sim/tick` pass exists.

- [ ] **Step 3: Split and reorder the generated passes**

Generate these two single-dispatch passes in `compileFieldSystem`:

```ts
const scalarResetStatements = scalarSlots
  .map((slot) => {
    const reset =
      slot.spec.reduce === "min"
        ? "0x7f7fffffu"
        : slot.base === "i32"
          ? "0"
          : "0u";
    return slot.spec.groupBy !== undefined
      ? `  for (var g = 0u; g < ${slot.words}u; g += 1u) { atomicStore(&S.${slot.member}[g], ${reset}); }`
      : `  atomicStore(&S.${slot.member}, ${reset});`;
  })
  .join("\n");

passes.push({
  name: "sim/tick",
  binds: ["S:SimAtomic!"],
  kind: "single",
  code: "fn once() { S.tick = S.tick + 1u; }",
});

passes.push({
  name: "sim/zero",
  binds: ["S:SimAtomic!"],
  kind: "single",
  code: `fn once() {\n${scalarResetStatements}\n}`,
});
```

Change `runTick` to this exact schedule:

```ts
runTick(kernel, frame) {
  frame.pass("sim/tick");
  for (const phase of updatePhases) {
    for (const name of phase) frame.pass(`stock/${name}`);
    for (const name of phase) kernel.swap(name);
  }
  frame.pass("sim/zero");
  for (const [name] of scalars) frame.pass(`reduce/${name}`);
},
```

Keep `resetState()` clearing `S`, so the first tick sees zero aggregates.

- [ ] **Step 4: Run the compiler suite**

Run: `npm test -- tests/FieldDynamics.test.ts`

Expected: PASS, including all existing phase, scalar, and conquest compile tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/webgpu/FieldDynamics.ts tests/FieldDynamics.test.ts
git commit -m "feat: expose prior field aggregates during ticks"
```

---

### Task 2: Add minimal one-shot brush and player-output contracts

**Files:**

- Modify: `src/client/webgpu/FieldDynamics.ts`
- Test: `tests/FieldDynamics.test.ts`

**Interfaces:**

- Consumes: `FieldSystem.brushes`, `FieldSystem.players`, WESL registry-module generation, and `FieldKernelConfig.buffers`.
- Produces:
  - `FieldBrushSpec = FieldPaintBrushSpec | FieldIntentBrushSpec`.
  - `FieldPlayersSpec.localPlayer?: number` and `outputs?: readonly string[]`.
  - `CompiledFieldSystem.localPlayer`, `playerFieldNames`, `playerOutputNames`, `intentForBrush(name)`, and `decodePlayerOutputs(data)`.
  - Generated WESL registry `package::playerOutputs` with `set_<name>(player, value)` for declared `u32` output words.

- [ ] **Step 1: Write failing manifest and compiler tests**

Use one direct brush and one intent brush in a small test system:

```ts
const system = defineFieldSystem({
  id: "intent-contract",
  name: "intent contract",
  players: {
    count: 3,
    localPlayer: 1,
    fields: { actionKind: "u32", actionTile: "u32", actionTick: "u32" },
    outputs: ["actionResult", "foodSpendFx"],
  },
  brushes: {
    direct: { target: "value", mode: "set", value: 1, radius: 2 },
    city: { intent: 2, radius: 0 },
  },
  views: { value: { layer: "value", ramp: ["#000000", "#ffffff"] } },
  modules: {
    "layers/value.wesl": `
      import package::playerOutputs;
      fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
      fn update(x: i32, y: i32, i: u32) -> f32 {
        if (i == 0u) { playerOutputs::set_actionResult(1u, 9u); }
        return 0.0;
      }`,
  },
});

const compiled = await compileFieldSystem(system);
expect(compiled.localPlayer).toBe(1);
expect(compiled.playerFieldNames).toEqual([
  "actionKind",
  "actionTile",
  "actionTick",
]);
expect(compiled.playerOutputNames).toEqual(["actionResult", "foodSpendFx"]);
expect(compiled.intentForBrush("city")).toBe(2);
expect(compiled.intentForBrush("direct")).toBeUndefined();
expect(compiled.kernelConfig.passes.map((p) => p.name)).toContain(
  "brush/direct",
);
expect(compiled.kernelConfig.passes.map((p) => p.name)).not.toContain(
  "brush/city",
);
expect(compiled.kernelConfig.buffers).toContainEqual(
  expect.objectContaining({
    name: "PO",
    type: "u32",
    count: 6,
    readable: true,
    clearable: true,
  }),
);
```

Also assert diagnostics for a local player outside `0..count-1`, duplicate/invalid output names, an intent brush without the three action fields, and an output import when no outputs are declared.

- [ ] **Step 2: Run the focused suite and confirm the declarations fail to type-check or compile**

Run: `npm test -- tests/FieldDynamics.test.ts`

Expected: FAIL because these manifest fields and compiled methods do not exist.

- [ ] **Step 3: Add the discriminated brush and player metadata types**

Use these public shapes:

```ts
export interface FieldPaintBrushSpec {
  target: string;
  mode: "set" | "add";
  value: number;
  radius: number;
}

export interface FieldIntentBrushSpec {
  intent: number;
  radius: number;
}

export type FieldBrushSpec = FieldPaintBrushSpec | FieldIntentBrushSpec;

export interface FieldPlayersSpec {
  count: number;
  localPlayer?: number;
  fields: Record<string, "f32" | "u32">;
  outputs?: readonly string[];
}
```

Intent brushes require `actionKind`, `actionTile`, and `actionTick` as `u32` fields. Keep the direct-brush compiler unchanged behind `if ("target" in spec)`.

- [ ] **Step 4: Generate the compact player-output buffer and registry**

Allocate one `u32` struct word per declared output per player:

```ts
{
  name: "PO",
  type: "u32",
  count: playerCount * Math.max(1, playerOutputs.length),
  clearable: true,
  readable: true,
}
```

Extend import scanning with the `playerOutputs` registry. Build its generated WESL from the existing binding index and manifest values:

```ts
modules["playerOutputs.wesl"] = [
  `struct PlayerOutput {\n${playerOutputs.map((name) => `  ${name}: u32,`).join("\n")}\n}`,
  `@group(0) @binding(${indexOf("PO")}) var<storage, read_write> PLAYER_OUTPUTS: array<PlayerOutput, ${playerCount}>;`,
  ...playerOutputs.map(
    (name) =>
      `fn set_${name}(p: u32, value: u32) { PLAYER_OUTPUTS[min(p, ${playerCount - 1}u)].${name} = value; }`,
  ),
].join("\n");
```

Expose output names and decode the interleaved records using `DataView.getUint32(offset, true)`. Output writes persist until a later GPU write replaces them; do not clear `PO` every tick.

- [ ] **Step 5: Run compiler tests**

Run: `npm test -- tests/FieldDynamics.test.ts`

Expected: PASS. Existing systems still default to `localPlayer = 0`, have no `PO`, and keep direct brush behavior.

- [ ] **Step 6: Commit**

```bash
git add src/client/webgpu/FieldDynamics.ts tests/FieldDynamics.test.ts
git commit -m "feat: add field intent brushes and player outputs"
```

---

### Task 3: Queue exactly one discrete action per player per submitted tick

**Files:**

- Modify: `src/client/viewer/FieldViewerBase.ts`
- Modify: `src/client/webgpu/FieldDynamics.ts`
- Create: `tests/FieldViewerActions.test.ts`

**Interfaces:**

- Consumes: Task 2's `CompiledFieldSystem.intentForBrush`, `localPlayer`, `decodePlayerOutputs`, and action-field convention.
- Produces:
  - `InputContext.scalars`, `InputContext.queuePlayer(p, fields)`.
  - `InputContext.player(p): Readonly<Record<string, number>>` for reading the
    CPU-side persistent intent before merging a target update.
  - `AIContext.queuePlayer(p, fields)`.
  - exported pure helpers `playerActionBatchSize(requestedTicks, queues)` and `dequeuePlayerActions(queues, actionTick)` for the viewer and its unit test.
  - protected `beginSimulationBatch(requestedTicks): number`, called once before every base, turbo, or shell field-game batch.
  - protected `playerOutputReadout` for the shell HUD.

- [ ] **Step 1: Write failing FIFO tests**

Create `tests/FieldViewerActions.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  dequeuePlayerActions,
  playerActionBatchSize,
} from "../src/client/viewer/FieldViewerBase";

describe("field player action queue", () => {
  test("takes one action per player in FIFO order and stamps the GPU tick", () => {
    const queues = [
      undefined,
      [
        { actionKind: 2, actionTile: 7 },
        { actionKind: 3, actionTile: 8 },
      ],
      [{ actionKind: 4, actionTile: 9 }],
    ];
    expect(dequeuePlayerActions(queues, 12)).toEqual([
      undefined,
      { actionKind: 2, actionTile: 7, actionTick: 12 },
      { actionKind: 4, actionTile: 9, actionTick: 12 },
    ]);
    expect(queues[1]).toEqual([{ actionKind: 3, actionTile: 8 }]);
    expect(queues[2]).toEqual([]);
  });

  test("limits a command-bearing submission to one tick", () => {
    expect(playerActionBatchSize(8, [undefined, [{ actionKind: 2 }]])).toBe(1);
    expect(playerActionBatchSize(8, [undefined, []])).toBe(8);
  });
});
```

- [ ] **Step 2: Run the test and confirm the helper is absent**

Run: `npm test -- tests/FieldViewerActions.test.ts`

Expected: FAIL because `dequeuePlayerActions` is not exported.

- [ ] **Step 3: Add the FIFO and context methods**

Use this queue behavior in `FieldViewerBase.ts`:

```ts
export function dequeuePlayerActions(
  queues: (Record<string, number>[] | undefined)[],
  actionTick: number,
): (Record<string, number> | undefined)[] {
  return queues.map((queue) => {
    const action = queue?.shift();
    return action === undefined ? undefined : { ...action, actionTick };
  });
}

export function playerActionBatchSize(
  requestedTicks: number,
  queues: (Record<string, number>[] | undefined)[],
): number {
  return queues.some((queue) => (queue?.length ?? 0) > 0)
    ? Math.min(1, requestedTicks)
    : requestedTicks;
}
```

`queuePlayer` appends without merging, so drag order is preserved. `player(p)` returns `this.playerIntents[p] ?? {}`. Persistent attack fields still use `setPlayer`/`mergePlayerIntent`.

- [ ] **Step 4: Route intent brushes and cap command-bearing batches**

In `stampBrush`, branch before the direct GPU brush pass:

```ts
const intent = this.compiled.intentForBrush(brush);
if (intent !== undefined) {
  this.queuePlayerAction(this.compiled.localPlayer, {
    actionKind: intent,
    actionTile: y * this.mapWidth + x,
  });
  return;
}
```

`beginSimulationBatch` must use a monotonic `submittedTick`, reset to zero with the world:

```ts
protected beginSimulationBatch(requestedTicks: number): number {
  if (requestedTicks <= 0) return 0;
  const ticks = playerActionBatchSize(requestedTicks, this.playerActionQueues);
  const actions = dequeuePlayerActions(this.playerActionQueues, this.submittedTick + 1);
  actions.forEach((action, p) => {
    if (action !== undefined) this.mergePlayerIntent(p, action);
  });
  this.flushPlayers();
  this.submittedTick += ticks;
  return ticks;
}
```

Call it in the base `encodeFrame`, turbo pump, and Task 6's shell `advance` before encoding tick passes. While a FIFO is non-empty, use a one-tick frame; this is the minimum correct solution because CPU `queue.writeBuffer` cannot change `PL` between compute passes already recorded into one command buffer. Return to adaptive batches immediately after the FIFO drains.

When the brush tool is active, `onTileGesture` stamps the active brush before consulting `input.onTile`; pan-tool clicks continue to reach the game's spawn/attack hook.

- [ ] **Step 5: Read compact outputs with the scalar timer**

When `playerOutputNames.length > 0`, read `PO`, decode it, and assign `playerOutputReadout`. Clear `PO` only on `resetState()`. A failed read during teardown remains ignored just like the scalar read.

- [ ] **Step 6: Run the unit suites**

Run: `npm test -- tests/FieldViewerActions.test.ts tests/FieldDynamics.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/client/viewer/FieldViewerBase.ts src/client/webgpu/FieldDynamics.ts tests/FieldViewerActions.test.ts
git commit -m "feat: queue field game actions per tick"
```

---

### Task 4: Define LeanFront's standalone state, economy, input, and AI

**Files:**

- Replace: `src/client/games/leanfront/system.ts`
- Create: `src/client/games/leanfront/actions.ts`
- Create: `src/client/games/leanfront/lib/economy.wesl`
- Create: `src/client/games/leanfront/lib/conquest.wesl`
- Replace: `src/client/games/leanfront/layers/owner.wesl`
- Replace directory contents: `src/client/games/leanfront/layers/` (remove `damage.wesl`, `density.wesl`, `front.wesl`, `highlight.wesl`, `plot.wesl`, and `supply.wesl`)
- Create: `src/client/games/leanfront/layers/cityLevel.wesl`
- Create: `src/client/games/leanfront/layers/farmLevel.wesl`
- Create: `src/client/games/leanfront/layers/food.wesl`
- Create: `src/client/games/leanfront/layers/incursion.wesl`
- Create: `src/client/games/leanfront/layers/troops.wesl`
- Create: `src/client/games/leanfront/views/leanfront.wesl`
- Create: `tests/LeanFrontSystem.test.ts`

**Interfaces:**

- Consumes: Tasks 1–3's previous aggregates, intent brush protocol, compact outputs, `playerIntent(5)`, and the existing conquest terrain/combat math.
- Produces: `leanfront`, `LEAN_ACTION`, `LEAN_RESULT`, `decodeLeanResult`, six dynamic layers, five grouped aggregates, and a field-game input/AI contract.

- [ ] **Step 1: Write failing manifest and codec tests**

Create `tests/LeanFrontSystem.test.ts` with these contract assertions:

```ts
test("declares only the simple economy state and tuning surface", async () => {
  const compiled = await compileFieldSystem(composeTerrain(leanfront));
  expect(compiled.layerNames).toEqual([
    "cityLevel",
    "farmLevel",
    "food",
    "incursion",
    "owner",
    "troops",
  ]);
  expect(Object.keys(leanfront.params ?? {})).toEqual([
    "cityCapacityPerLevel",
    "farmCapacityPerLevel",
    "cityGrowthRate",
    "farmGrowthRate",
    "seedFraction",
    "cityLevelCost",
    "farmLevelCost",
    "razeCost",
    "attackCostPerPerson",
    "seaLevel",
    "attackPower",
    "attrition",
    "conquestGarrison",
    "neutralDefense",
    "terrainWeight",
    "flipMargin",
  ]);
  expect(leanfront.phases).toEqual([
    ["incursion"],
    ["owner", "troops", "cityLevel", "farmLevel", "food"],
  ]);
  expect(compiled.localPlayer).toBe(1);
  expect(compiled.intentForBrush("city")).toBe(LEAN_ACTION.city);
  expect(compiled.intentForBrush("farm")).toBe(LEAN_ACTION.farm);
  expect(compiled.intentForBrush("raze")).toBe(LEAN_ACTION.raze);
});

test("packs a result code with its originating tick", () => {
  expect(decodeLeanResult((123 << 8) | LEAN_RESULT.accepted)).toEqual({
    tick: 123,
    code: LEAN_RESULT.accepted,
  });
});

test("plot shaders never derive a new plot from neighboring plots", () => {
  const city = leanfront.modules["layers/cityLevel.wesl"];
  const farm = leanfront.modules["layers/farmLevel.wesl"];
  expect(city).not.toMatch(/cityLevel::at|farmLevel::at/);
  expect(farm).not.toMatch(/cityLevel::at|farmLevel::at/);
  expect(city).toContain("actionTile");
  expect(farm).toContain("actionTile");
});
```

Also assert the scalars are exactly `totalFood`, `totalPeople`, `tilesOwned`, `totalCityLevels`, and `totalFarmLevels`, each grouped by `owner` where appropriate.

- [ ] **Step 2: Run the new suite and confirm the live conduit manifest fails**

Run: `npm test -- tests/LeanFrontSystem.test.ts`

Expected: FAIL because the current LeanFront is a render-only live game.

- [ ] **Step 3: Add action/result constants and mapping**

Use stable numeric values shared with WGSL comments:

```ts
export const LEAN_ACTION = {
  none: 0,
  spawn: 1,
  city: 2,
  farm: 3,
  raze: 4,
} as const;
export const LEAN_RESULT = {
  none: 0,
  accepted: 1,
  unaffordable: 2,
  notOwned: 3,
  impassable: 4,
  wrongType: 5,
  overflow: 6,
  invalid: 7,
} as const;

export function decodeLeanResult(packed: number) {
  return { tick: packed >>> 8, code: packed & 0xff };
}
```

The input hook uses `ctx.scalars.tilesOwned[ctx.localPlayer]`: at zero it first writes `{ alive: 1, attacking: 0, commit }` and queues `spawn`; otherwise a pan-tool click writes the standard attack target with `alive = 1`, `attacking = 1`, and `ctx.player(ctx.localPlayer).commit ?? 0.6`. Escape writes `attacking = 0`.

The AI uses deterministic per-player anchor quadrants. If `tilesOwned[p]` is zero it writes `{ alive: 1, attacking: 0, commit: 0.6 }` and queues spawn. Otherwise it queues a farm near its anchor when `totalFood[p] < 0.5`, queues a city near its anchor otherwise, and attacks only when `totalFood[p] >= 0.5`. Invalid random build targets are harmless and retried on the next 40-tick cadence; no CPU tile-state mirror is introduced.

- [ ] **Step 4: Write the pure economy helper module**

Use one guarded Gompertz function and fixed action decisions:

```wgsl
struct ActionDecision {
  result: u32,
  costFx: u32,
  nextCityLevel: u32,
  nextFarmLevel: u32,
  clearsTile: u32,
}

fn gompertz(stock: f32, capacity: f32, rate: f32) -> f32 {
  if (capacity <= 0.0 || stock <= 0.0) { return 0.0; }
  let safe = min(stock, capacity);
  return min(capacity, safe + rate * safe * log(capacity / safe));
}

fn toFx(value: f32) -> u32 {
  return u32(max(0.0, round(value * 256.0)));
}

fn affordable(totalFood: f32, costFx: u32) -> bool {
  return toFx(totalFood) >= costFx;
}

fn attackCommit(requested: f32, totalPeople: f32, availableFood: f32,
                costPerPerson: f32) -> f32 {
  if (requested <= 0.0 || totalPeople <= 0.0 || costPerPerson <= 0.0) {
    return clamp(requested, 0.0, 1.0);
  }
  return min(clamp(requested, 0.0, 1.0),
    availableFood / (totalPeople * costPerPerson));
}
```

`decideAction` returns `ActionDecision` for exactly one `actionKind`/`actionTile` when `actionTick == sim::tick()`. City/farm require owned land; opposite types reject; increment from `0xffffffffu` rejects; capacity must remain finite and at most `3.402823e38`; raze accepts a nonempty land tile and clears its ownership/resources; spawn is free and requires the player to own zero tiles. A shared imported action resolver processes due spawns by ascending player ID, rejects a later kit whose territory overlaps an earlier accepted city/farm reservation, and chooses the first neutral, plot-empty land neighbor outside all earlier accepted reservations. All layer transitions use its resolved city/farm pair.

- [ ] **Step 5: Replace the manifest with the exact initial tuning surface**

Declare five player slots (`0` neutral, human `1`, bots `2..4`), standard attack fields plus the three action fields, and outputs `actionResult` and `foodSpendFx`. Start with these flat, deliberately tuneable values:

```ts
params: {
  cityCapacityPerLevel: { value: 1, min: 0.1, max: 8, step: 0.1 },
  farmCapacityPerLevel: { value: 1, min: 0.1, max: 8, step: 0.1 },
  cityGrowthRate: { value: 0.03, min: 0, max: 0.25, step: 0.005 },
  farmGrowthRate: { value: 0.06, min: 0, max: 0.25, step: 0.005 },
  seedFraction: { value: 0.05, min: 0.005, max: 0.25, step: 0.005 },
  cityLevelCost: { value: 0.4, min: 0, max: 4, step: 0.05 },
  farmLevelCost: { value: 0.25, min: 0, max: 4, step: 0.05 },
  razeCost: { value: 0.05, min: 0, max: 1, step: 0.01 },
  attackCostPerPerson: { value: 0.002, min: 0, max: 0.05, step: 0.001 },
  seaLevel: { value: 0.46, min: 0.2, max: 0.8, step: 0.01 },
  attackPower: { value: 2, min: 0, max: 6 },
  attrition: { value: 0.06, min: 0, max: 0.5 },
  conquestGarrison: { value: 0.7, min: 0, max: 1 },
  neutralDefense: { value: 0.06, min: 0, max: 0.5 },
  terrainWeight: { value: 0.5, min: 0, max: 2 },
  flipMargin: { value: 1.6, min: 1, max: 3 },
}
```

Declare `city`, `farm`, and `raze` as radius-zero intent brushes. The five grouped reductions read `food`, `troops`, `owner`, `cityLevel`, and `farmLevel`. Use `import.meta.glob("./**/*.wesl", ...)` so libs, layers, and views are all available to WESL.

- [ ] **Step 6: Add the command resolver and six gameplay transitions**

A first `command` phase calls the shared `resolveAction` helper once per player against previous state and stores its result, cost, resolved level, and spawn reservations in the compact player-output buffer. The incursion and five persistent gameplay shaders consume that record instead of rebinding every resolver dependency, keeping every pass within eight storage buffers. Acceptance, spawn priority/reservations, price, and overflow behavior therefore cannot diverge. Use this transition table:

| Layer       | Free spawn                                               | City/farm action                                | Raze                   | Conquest                     | Growth                                                                    |
| ----------- | -------------------------------------------------------- | ----------------------------------------------- | ---------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `owner`     | claim passable tiles within radius 5                     | unchanged                                       | target becomes neutral | existing conquest flip       | none                                                                      |
| `cityLevel` | target becomes 1                                         | set/increment city only                         | target becomes 0       | retained                     | none                                                                      |
| `farmLevel` | first passable 8-neighbor becomes 1                      | set/increment farm only                         | target becomes 0       | retained                     | none                                                                      |
| `troops`    | city target gets `seedFraction * cityCapacityPerLevel`   | new city gets one seed; upgrade preserves stock | target becomes 0       | surviving conquest garrison  | Gompertz only if resulting city level is nonzero                          |
| `food`      | farm neighbor gets `seedFraction * farmCapacityPerLevel` | new farm gets one seed; upgrade preserves stock | target becomes 0       | captured farm resets to seed | proportional debit, then Gompertz only if resulting farm level is nonzero |

`incursion` is the existing conquest neighbor-pressure shader with `p.commit` replaced by `effectiveCommit(p)`. Compute each player's discrete accepted cost first, subtract it from previous `totalFood[p]`, then cap attack commitment using previous `totalPeople[p]`. On `i == p`, write `foodSpendFx` each tick. The command resolver writes `(sim::tick() << 8u) | result` to `actionResult` from that player's single invocation for each due action.

Debit an existing farm owned by `p` with an integer-derived factor:

```wgsl
let totalFx = toFx(sim::scalar_totalFood(p));
let spendFx = min(totalFx, discreteCostFx(p) + attackCostFx(p));
let keep = select(1.0, f32(totalFx - spendFx) / f32(totalFx), totalFx > 0u);
var nextFood = max(0.0, layers::food::val(i) * keep);
```

This produces deterministic proportional spending with no float atomic and strictly less than one `1 / 256` quantum of discrepancy per contributing farm.

- [ ] **Step 7: Add the view**

Copy the existing conquest player palette and contested-border treatment. Read terrain `tint` as the base, tint owned land by owner, render city tiles as brighter square centers weighted by `troops / cityCapacity`, and farm tiles as green-gold centers weighted by `food / farmCapacity`. Empty owned land retains only the ownership wash. The view never mutates state.

- [ ] **Step 8: Run the LeanFront and compiler tests**

Run: `npm test -- tests/LeanFrontSystem.test.ts tests/FieldDynamics.test.ts`

Expected: PASS; WESL links successfully and the manifest contains no old district/supply/maturity concepts.

- [ ] **Step 9: Commit**

```bash
git add src/client/games/leanfront tests/LeanFrontSystem.test.ts
git commit -m "feat: build simple gpu-native LeanFront economy"
```

---

### Task 5: Prove resource, command, and conquest behavior on a real GPU

**Files:**

- Create: `tests/perf/leanfront/LeanFrontGpuProbe.ts`
- Create: `tests/perf/leanfront/LeanFrontGpuReplay.ts`

**Interfaces:**

- Consumes: `leanfront`, `compileFieldSystem`, `FieldKernel`, `LEAN_ACTION`, player input encoding, scalar/output decoding, and readable dynamic layers.
- Produces: `runLeanFrontGpuProbe(): Promise<LeanFrontProbeResult>` and a CLI that fails on invariant or replay-hash mismatch.

- [ ] **Step 1: Write the browser-side deterministic probe**

Create a 16×16 synthetic map with elevation `0.5` and every tile except index `0` marked as land. Compile a probe clone of LeanFront whose sole view is a direct `owner` ramp (so the test does not need the terrain derivation), create/resize a headless `FieldKernel`, upload `land` and `elevation`, write default params, then run this scenario with one submitted frame per command-bearing tick:

```ts
const scenario = [
  { tick: 1, player: 1, actionKind: LEAN_ACTION.spawn, actionTile: at(4, 8) },
  { tick: 1, player: 2, actionKind: LEAN_ACTION.spawn, actionTile: at(12, 8) },
  { tick: 22, player: 1, actionKind: LEAN_ACTION.farm, actionTile: at(5, 8) },
  { tick: 23, player: 1, actionKind: LEAN_ACTION.city, actionTile: at(4, 8) },
  { tick: 24, player: 1, actionKind: LEAN_ACTION.raze, actionTile: at(5, 8) },
];
```

After spawn, read the test-only owner plane and choose the lowest-index player-2 tile adjacent to player 1; queue a player-2 farm there before combat so capture reset is exercised deterministically. At each tick, write all persistent attack fields plus only that tick's due action. Capture snapshots after spawn, after 20 peaceful growth ticks, after each discrete action, and after 60 attack ticks aimed from player 1 toward that border farm. For the single debit-conservation tick, temporarily write `farmGrowthRate = 0`, count `contributingFarmCount` from the pre-debit planes as owned tiles whose `farmLevel` is nonzero, compare the before/after food sums to `foodSpendFx`, then restore `0.06`.

Before the scenario, run a fresh-kernel growth microcase with two city tiles at equal 20% fill: level 1 with stock `0.2`, and level 2 with stock `0.4`. One tick must leave both stocks monotonic and bounded by `1`/`2`, with the level-2 delta within `1e-5` of twice the level-1 delta. A level-1 city at zero stock must stay zero, proving that only creation/capture code supplies a seed.

After the scenario establishes a player with less food than `cityLevelCost`, submit one city command on an otherwise valid owned empty tile. Assert result `unaffordable` and byte-identical `owner`, `troops`, `cityLevel`, `farmLevel`, and `food` planes before/after that command tick, with both growth rates disabled for the check. During attack ticks, assert `foodSpendFx <= totalFoodFx` and no farm becomes negative.

With growth still disabled, also submit (a) a farm command on the existing city, (b) a city command on player 2's tile, and (c) a city command on water tile `0`. Assert `wrongType`, `notOwned`, and `impassable` respectively, with byte-identical gameplay planes after each rejected command. Assert the successful city upgrade increments its level by exactly one, leaves its pre-growth stock unchanged, and increases capacity by exactly `cityCapacityPerLevel`. For the capture segment only, set `attackPower = 6` and `flipMargin = 1` so the border-farm capture is guaranteed rather than balance-dependent; restore defaults before producing the reported timing average.

- [ ] **Step 2: Add exact invariant assertions inside the probe**

Throw descriptive errors unless all hold:

```ts
assert(
  afterGrowth.tilesOwned[1] === afterSpawn.tilesOwned[1],
  "growth expanded ownership without an attack",
);
assert(
  afterGrowth.totalCityLevels[1] === afterSpawn.totalCityLevels[1],
  "city growth painted or upgraded a tile",
);
assert(
  afterGrowth.totalFarmLevels[1] === afterSpawn.totalFarmLevels[1],
  "farm growth painted or upgraded a tile",
);
assert(
  afterGrowth.totalPeople[1] > afterSpawn.totalPeople[1],
  "city people did not grow",
);
assert(
  afterGrowth.totalFood[1] > afterSpawn.totalFood[1],
  "farm food did not grow",
);
assert(
  allFood.every((v) => Number.isFinite(v) && v >= 0),
  "food became negative or non-finite",
);
assert(noTileHasBothCityAndFarm, "plot fields lost mutual exclusivity");
assert(nonFarmFoodIsZero, "a non-farm tile stores food");
assert(upgradePreservedStockBeforeGrowth, "upgrade granted another seed");
assert(razeClearedOwnerLevelsAndStock, "raze left tile state behind");
assert(
  capturedFarmIsAtLeastSeedAndBelowOldStore,
  "captured farm did not restart from seed",
);
assert(
  Math.abs(foodRemoved - reportedSpend) < contributingFarmCount / 256,
  "proportional debit exceeded one fixed-point quantum per contributing farm",
);
```

Hash `owner`, `troops`, `cityLevel`, `farmLevel`, `food`, `S`, and `PO` bytes with the existing deterministic FNV-style pattern used by performance probes.

- [ ] **Step 3: Write the Node launcher using the existing lazy Playwright pattern**

`LeanFrontGpuReplay.ts` must check `http://localhost:9000/`, lazily import `playwright`, launch Chromium with `--enable-unsafe-webgpu` and `--enable-features=WebGPU`, dynamically import the browser probe through Vite, run it twice in fresh pages, compare hashes, print both result summaries, and exit nonzero on mismatch. Do not add Playwright to `package.json`.

- [ ] **Step 4: Run the GPU replay**

Terminal 1: `npm run dev -- --host 127.0.0.1 --port 9000`

Terminal 2: `npx tsx tests/perf/leanfront/LeanFrontGpuReplay.ts`

Expected: both runs report the same hash; every assertion passes; the summary includes initial/final people, food, owned tiles, city levels, farm levels, total spend, and average GPU milliseconds per tick.

- [ ] **Step 5: Commit**

```bash
git add tests/perf/leanfront/LeanFrontGpuProbe.ts tests/perf/leanfront/LeanFrontGpuReplay.ts
git commit -m "test: add deterministic LeanFront gpu replay"
```

---

### Task 6: Add bounded hover reads and LeanFront field-game controls

**Files:**

- Modify: `src/client/webgpu/FieldKernel.ts`
- Modify: `src/client/viewer/FieldViewerBase.ts`
- Modify: `src/client/GameShellPage.ts`
- Create: `tests/FieldKernel.test.ts`
- Test: `tests/LeanFrontSystem.test.ts`

**Interfaces:**

- Consumes: Task 3's `beginSimulationBatch`, `playerOutputReadout`; Task 4's scalars, parameters, and result codec.
- Produces: `FieldKernel.readBuffer(name, elements?, firstElement?)`, LeanFront selection as a normal composed field game, local resource HUD, commitment control, result feedback, and semantic hover rows.

- [ ] **Step 1: Write failing read-range and shell-boundary tests**

Create `tests/FieldKernel.test.ts` using `Object.create(FieldKernel.prototype)` plus fake `bufferSpecs`, `buffers`, polarity, device buffer creation, and command encoder. Assert:

```ts
await kernel.readBuffer("food", 1, 37);
expect(copyBufferToBuffer).toHaveBeenCalledWith(source, 37 * 4, staging, 0, 4);
```

Extend `tests/LeanFrontSystem.test.ts` to read `GameShellPage.ts` and assert:

```ts
expect(shellSource).toContain("composeTerrain(leanfront)");
expect(shellSource).toContain("beginSimulationBatch");
expect(shellSource).toContain('readBuffer("cityLevel", 1, tile)');
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm test -- tests/FieldKernel.test.ts tests/LeanFrontSystem.test.ts`

Expected: FAIL because buffer reads only support prefixes and LeanFront is still in the live registry.

- [ ] **Step 3: Add one-word ranged reads**

Change the method signature to:

```ts
async readBuffer(
  name: string,
  elements?: number,
  firstElement = 0,
): Promise<ArrayBuffer>
```

Reject negative/non-integer offsets, clamp `elements` to `capacity - firstElement`, and use `firstElement * 4` as the source offset in `copyBufferToBuffer`. Existing callers retain prefix behavior.

- [ ] **Step 4: Mount LeanFront as a normal GPU field game**

Import `leanfront` directly in `GameShellPage.ts` and place `composeTerrain(leanfront)` immediately after the live OpenFront entry. Do not add it to `LIVE_GAMES`. Therefore `selectedLiveGame()` is undefined for LeanFront and the existing field tick/render/control path runs it.

At the start of the shell's field-game `advance`, use:

```ts
ticks = this.beginSimulationBatch(ticks);
if (ticks <= 0) return;
```

The base and turbo paths already call the same method from Task 3.

- [ ] **Step 5: Add attack and resource controls to the generic field panel**

When `compiled.playerFieldNames` contains `commit`, render a range input `0..1` with step `0.05`, initialized at `0.6`, and a stop button. Changes write `{ alive: 1, commit: value }` to `compiled.localPlayer`; stop writes `{ attacking: 0 }`.

For `systemId === "leanfront"`, show only the local player's:

```text
people = totalPeople[localPlayer]
food   = totalFood[localPlayer]
spend  = playerOutputReadout[localPlayer].foodSpendFx / 256
```

Decode a changed `actionResult` word and set a short status message for rejected codes; accepted actions need no toast.

- [ ] **Step 6: Read and format the hovered LeanFront tile**

Make `FieldViewerBase.readScalars` protected. Override it in `GameShellPage`, await `super.readScalars()`, and only when LeanFront plus a valid hover tile is active read one word from `owner`, `troops`, `cityLevel`, `farmLevel`, and `food` with `readBuffer(name, 1, tile)`.

Format rows from the mutually exclusive levels:

```ts
const city = cityLevel > 0;
const farm = farmLevel > 0;
const level = city ? cityLevel : farm ? farmLevel : 0;
const stock = city ? troops : farm ? food : troops;
const perLevel = city
  ? this.paramValues.cityCapacityPerLevel
  : farm
    ? this.paramValues.farmCapacityPerLevel
    : 0;
const rate = city
  ? this.paramValues.cityGrowthRate
  : farm
    ? this.paramValues.farmGrowthRate
    : 0;
const capacity = perLevel * level;
const growth =
  capacity > 0 && stock > 0 ? rate * stock * Math.log(capacity / stock) : 0;
```

Show owner, plot (`empty`, `city`, `farm`), level, people or food stock, capacity, and growth/tick. This five-word hover read is the only routine tile-state readback.

- [ ] **Step 7: Run the focused suites and manually smoke the controls**

Run: `npm test -- tests/FieldKernel.test.ts tests/FieldDynamics.test.ts tests/FieldViewerActions.test.ts tests/LeanFrontSystem.test.ts`

Run: `npm run build-dev`

Manual check at `http://localhost:9000/`: select LeanFront, pan-click land to spawn, play until food grows, paint a city and farm by drag, confirm each affected tile was explicitly crossed by the brush, set an attack target, stop the attack, and inspect a city/farm hover.

Expected: no console/WGSL errors; tools queue commands rather than directly mutating layers; HUD/hover update from bounded readbacks.

- [ ] **Step 8: Commit**

```bash
git add src/client/webgpu/FieldKernel.ts src/client/viewer/FieldViewerBase.ts src/client/GameShellPage.ts tests/FieldKernel.test.ts tests/LeanFrontSystem.test.ts
git commit -m "feat: expose LeanFront gpu controls and readouts"
```

---

### Task 7: Remove the superseded live LeanFront and CPU/GPU mirror

**Files:**

- Modify: `src/client/games/registry.ts`
- Modify: `src/core/game/Rulesets.ts`
- Modify: `src/client/webgpu/ShellSimProtocol.ts`
- Modify: `src/client/webgpu/ShellSim.worker.ts`
- Modify: `src/core/GameRunner.ts`
- Delete: `src/client/games/leanfront/runtime.ts`
- Delete: `src/client/games/leanfront/economy/` (entire directory)
- Delete: `tests/GpuEconomy.test.ts`
- Delete: `tests/SeamDiff.test.ts`
- Modify: `tests/LiveGameRuntime.test.ts`
- Modify: `tests/LiveGameRegistry.test.ts`
- Delete: `tests/OpenFrontRuntimeIsolation.test.ts`
- Modify: `tests/CoreDependencyBoundary.test.ts`
- Modify: `tests/Rulesets.test.ts`
- Modify: `tests/ShellSimWorkerLifecycle.test.ts`

**Interfaces:**

- Consumes: Task 6's standalone LeanFront registration in the shell.
- Produces: one live worker game (`openfront`), one standalone GPU LeanFront, and no obsolete mirror/probe/config path.

- [ ] **Step 1: Rewrite boundary tests first**

Pin the intended registry:

```ts
test("keeps only OpenFront in the live worker registry", () => {
  expect(LIVE_GAMES.map((entry) => entry.id)).toEqual(["openfront"]);
  expect(getLiveGame("leanfront")).toBeUndefined();
});
```

Update the dependency-boundary test to assert that `registry.ts`, `ShellSim.worker.ts`, and `GameRunner.ts` contain neither `leanfront/runtime` nor `GpuEconomy`. Replace the LeanFront worker lifecycle fixture with `ruleset: "openfront"`. Reduce the ruleset test to `RULESET_IDS === ["openfront"]`, `isRulesetID("leanfront") === false`, and a normal `Config` returned for OpenFront.

- [ ] **Step 2: Run boundary tests and confirm the old live registration fails**

Run: `npm test -- tests/LiveGameRegistry.test.ts tests/LiveGameRuntime.test.ts tests/CoreDependencyBoundary.test.ts tests/Rulesets.test.ts tests/ShellSimWorkerLifecycle.test.ts`

Expected: FAIL because LeanFront still has a live runtime and ruleset entry.

- [ ] **Step 3: Collapse the live registry and ruleset seam**

Leave `LIVE_GAMES` with only OpenFront. In `Rulesets.ts`, make:

```ts
export type RulesetID = "openfront";
export const RULESET_IDS = ["openfront"] as const;
export const DEFAULT_RULESET: RulesetID = "openfront";
```

Delete `LeanFrontConfig` and its switch arm. Remove comments claiming LeanFront is a CPU ruleset. Keep the existing parameter on `createGameRunner` and the protocol's optional ruleset field for OpenFront wire compatibility; both now accept only `"openfront"`. `ShellSim.worker.ts` continues selecting the OpenFront runtime through the one-entry registry.

- [ ] **Step 4: Delete the mirror implementation and mirror-only tests**

Remove `src/client/games/leanfront/runtime.ts`, all files under `src/client/games/leanfront/economy/`, `tests/GpuEconomy.test.ts`, `tests/SeamDiff.test.ts`, and the now-redundant runtime-isolation test. Keep `tests/LiveGameRuntime.test.ts` but remove its LeanFront fallback case so it continues to pin OpenFront's no-op runtime. Do not retain dead probes, field passes, upload helpers, or fallback warnings.

- [ ] **Step 5: Run all boundary and core regression tests**

Run: `npm test -- tests/LiveGameRegistry.test.ts tests/LiveGameRuntime.test.ts tests/CoreDependencyBoundary.test.ts tests/Rulesets.test.ts tests/ShellSimWorkerLifecycle.test.ts tests/core/GameRunner.test.ts`

Expected: PASS; OpenFront still initializes through `ShellSim.worker`, and LeanFront is absent from that worker path.

- [ ] **Step 6: Commit**

```bash
git add -A src/client/games/leanfront src/client/games/registry.ts src/core/game/Rulesets.ts src/client/webgpu/ShellSimProtocol.ts src/client/webgpu/ShellSim.worker.ts src/core/GameRunner.ts tests
git commit -m "refactor: retire mirrored LeanFront runtime"
```

---

### Task 8: Final regression, GPU replay, and documentation check

**Files:**

- Modify if verification exposes a mismatch: only files already named in Tasks 1–7
- Verify: `docs/superpowers/specs/2026-09-04-leanfront-simple-gpu-economy-design.md`

**Interfaces:**

- Consumes: the complete standalone game and cutover.
- Produces: a clean, reproducible implementation ready for review; no additional runtime API.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: PASS with no unhandled rejection, shader link diagnostic, or obsolete LeanFront mirror assertion.

- [ ] **Step 2: Run type-check and production-shape build**

Run: `npm run build-dev`

Expected: both `tsc --noEmit` and the Vite development build PASS.

- [ ] **Step 3: Run the deterministic GPU acceptance scenario twice**

Terminal 1: `npm run dev -- --host 127.0.0.1 --port 9000`

Terminal 2: `npx tsx tests/perf/leanfront/LeanFrontGpuReplay.ts`

Expected: matching hashes, all economy/conquest invariants PASS, and measured GPU time printed. Record the printed initial defaults and metrics in the commit body; do not retune unless an invariant or obvious zero-action deadlock fails.

- [ ] **Step 4: Verify removal and scope mechanically**

Run:

```bash
rg -n "GpuEconomy|leanfront/runtime|district_yield|farm_tenure|shed_" src tests
rg -n "cityLevel::at|farmLevel::at" src/client/games/leanfront/layers/cityLevel.wesl src/client/games/leanfront/layers/farmLevel.wesl
git diff --check
git status --short
```

Expected: the first two searches return no matches; `git diff --check` returns no output; status contains only the intended implementation files if the final verification adjustment is not yet committed.

- [ ] **Step 5: Compare every design requirement to observable evidence**

Check this traceability list:

| Design requirement                            | Evidence                                                        |
| --------------------------------------------- | --------------------------------------------------------------- |
| User-only plot painting; growth never expands | source guard plus peaceful GPU snapshot in Task 5               |
| People and troops unified                     | no `pop` layer; `totalPeople` reduces `troops`                  |
| Global farm food                              | `totalFood` reduction plus proportional per-owner debit         |
| Flat stack cost/capacity                      | action price is constant; capacity is `perLevel * level`        |
| Gompertz growth and seeding                   | helper and GPU growth assertions                                |
| Food-priced build, raze, explore, combat      | `discreteCostFx`, `attackCostFx`, spend output, debit invariant |
| Capture and raze semantics                    | GPU captured-farm and cleared-tile assertions                   |
| Existing GPU conquest behavior                | copied conquest helpers and incursion/owner/troops path         |
| Bounded GPU boundary                          | scalars, `PO`, and five one-word hover reads only               |
| Spawn kit                                     | free spawn scenario creates territory, city, and farm           |
| Human controls and three-rule AI              | manual smoke plus action/AI source tests                        |
| OpenFront unchanged                           | worker/boundary tests and full suite                            |

- [ ] **Step 6: Commit final verification-only corrections, if any**

If verification required an edit:

```bash
git add -A
git commit -m "fix: close LeanFront gpu acceptance gaps"
```

If it required no edit, do not create an empty commit.
