# OpenEmpire Foundation Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every experiment, create a shallow and certified shared OpenEmpire foundation, freeze OpenFront Live at that foundation, and resume the GPU economy only inside LeanFront.

**Architecture:** Both selectable games use the existing terrain, board, shell, worker protocol, nations, focused-border combat, burn events, and deterministic core. A small live-game registry owns the only game-ID decision, while dynamically loaded per-game runtimes own pre-tick lifecycle differences; OpenFront remains CPU-only and LeanFront alone owns GPU-economy setup. The immutable `openempire-foundation-v0` tag and `openfront-live` branch are cut before the archived GPU checkpoint is transplanted onto `leanfront`.

**Tech Stack:** TypeScript 6, Lit, Vitest, Vite, WebGPU/WESL, Go, OpenSpec, Git

**Spec:** `docs/superpowers/specs/2026-09-04-openempire-foundation-freeze-design.md`

## Global Constraints

- Preserve all current committed and uncommitted work before rewriting history; do not use `git reset`, `git checkout --`, or delete experiments.
- Keep stable shared directories in place. Move only the two live-game entry systems and LeanFront-owned GPU economy.
- Dependencies remain one-way: OpenFront Live and LeanFront may use shared code, but neither game imports the other.
- Selecting OpenFront must not construct or dynamically import LeanFront's GPU runtime.
- Keep the existing `ShellSimProtocol` `ruleset?: RulesetID` field; it is the wire-compatible game ID.
- Do not introduce a plugin framework, a generic economy framework, a full simulation fork, new dependencies, or speculative provider seams.
- Keep the existing CPU food economy and present balance unchanged. Record reference behavior; do not rebalance it.
- Share one live-game WESL overlay until a real presentation difference requires a fork.
- The runtime contract is exactly `beforeTick(): Promise<void>` plus `dispose(): void`.
- Fix shared defects at their common source and run the shared gates against both games.
- Use `apply_patch` for content edits and `git mv` only for tracked relocations.
- Do not mark an OpenSpec checkbox complete without the named command or browser evidence.

---

## Planned File Ownership

```text
src/client/games/
├── LiveGameRuntime.ts             shared two-method runtime contract
├── registry.ts                    sole game-ID lookup and lazy runtime loading
├── shared/live-game.wesl          shared territory/mask overlay
├── openfront/
│   ├── system.ts                  OpenFront picker/render metadata
│   ├── runtime.ts                 CPU-only no-op pre-tick lifecycle
│   └── layers/*.wesl              OpenFront conduit declarations
└── leanfront/
    ├── system.ts                  LeanFront picker/render metadata
    ├── runtime.ts                 initially no-op; later owns GpuEconomy
    ├── layers/*.wesl              LeanFront conduit declarations
    └── economy/                   restored GPU uploader, probes, and passes
```

Stable shared code stays in `src/core`, `src/client/board`, `src/client/shell`, and `src/client/webgpu`. The only new abstraction is the lifecycle that already has two concrete implementations and one current behavioral difference.

---

### Task 1: Preserve the complete deep branch and separate unrelated skill edits

**Files:**

- Preserve in first archive commit: `.claude/skills/run-openfront/ledger-check.mjs`
- Preserve in first archive commit: `.claude/skills/run-openfront/gpu-econ-check.mjs`
- Preserve in first archive commit: `openspec/changes/port-economy-to-gpu/`
- Preserve in first archive commit: `openspec/changes/complete-gpu-economy-cutover/`
- Preserve in first archive commit: `src/client/economy/`, `src/client/webgpu/`, `src/client/shell/KnobHelp.ts`, `src/core/`, `tests/`
- Preserve separately: `.claude/skills/openspec-*/SKILL.md`, `.codex/skills/openspec-*/SKILL.md`

**Interfaces:**

- Consumes: clean committed source at branch `feat/economy-as-fields`; current dirty GPU/tooling working tree.
- Produces: `archive/gpu-economy-checkpoint` pointing at one game-WIP commit and `archive/economy-as-fields-full-history` containing that commit plus a separate skill-instruction commit.

- [ ] **Step 1: Verify the expected starting point and branch names**

```bash
git branch --show-current
git log -1 --oneline
git branch --list 'archive/economy-as-fields-full-history' 'archive/gpu-economy-checkpoint' 'foundation/openempire-v0' 'openfront-live' 'leanfront'
git status --short
```

Expected: current branch is `feat/economy-as-fields`; `git log -1` is the plan commit; none of the five destination names already exists. If a destination exists, stop and inspect it instead of overwriting it.

- [ ] **Step 2: Create the full-history archive branch without changing the working tree**

```bash
git switch -c archive/economy-as-fields-full-history
```

Expected: the same dirty files remain visible under the new branch name.

- [ ] **Step 3: Stage only game, GPU, diagnostic, and OpenSpec work**

```bash
git add .claude/skills/run-openfront/ledger-check.mjs .claude/skills/run-openfront/gpu-econ-check.mjs openspec/changes/port-economy-to-gpu openspec/changes/complete-gpu-economy-cutover src/client/economy src/client/shell/KnobHelp.ts src/client/webgpu/FieldKernel.ts src/client/webgpu/ShellSim.worker.ts src/core/execution/utils src/core/game/Game.ts src/core/game/PlayerImpl.ts tests/DrawProbe.test.ts tests/FarmTickProvider.test.ts tests/LandUseZoning.test.ts tests/SeamDiff.test.ts tests/perf/balance/DrawPrecision.ts
git diff --cached --stat
git diff --cached --check
```

Expected: no `.claude/skills/openspec-*` or `.codex/skills/openspec-*` file is staged; the staged diff contains the GPU economy checkpoint and its provider/tests only.

- [ ] **Step 4: Commit the GPU checkpoint and retain a direct pointer to that one commit**

```bash
git commit -m "wip(leanfront): preserve GPU economy checkpoint"
git branch archive/gpu-economy-checkpoint
```

Expected: `archive/gpu-economy-checkpoint` points at the new WIP commit.

- [ ] **Step 5: Commit only the remaining skill-instruction edits**

```bash
git add .claude/skills/openspec-apply-change/SKILL.md .claude/skills/openspec-archive-change/SKILL.md .claude/skills/openspec-explore/SKILL.md .claude/skills/openspec-propose/SKILL.md .claude/skills/openspec-sync-specs/SKILL.md .codex/skills/openspec-apply-change/SKILL.md .codex/skills/openspec-archive-change/SKILL.md .codex/skills/openspec-explore/SKILL.md .codex/skills/openspec-propose/SKILL.md .codex/skills/openspec-sync-specs/SKILL.md
git diff --cached --check
git commit -m "chore(skills): preserve local OpenSpec instructions"
git status --short
```

Expected: empty status. This is the recovery checkpoint; do not proceed from a dirty archive.

---

### Task 2: Create the shallow, buildable OpenEmpire snapshot

**Files:**

- Snapshot: complete tree from `feat/economy-as-fields`
- Excludes: both commits unique to `archive/economy-as-fields-full-history`

**Interfaces:**

- Consumes: `main` and the clean tree at `feat/economy-as-fields`.
- Produces: branch `foundation/openempire-v0` with one squashed snapshot commit whose tree is byte-for-byte equal to `feat/economy-as-fields`.

- [ ] **Step 1: Create the shallow branch from main**

```bash
git switch main
git switch -c foundation/openempire-v0
```

- [ ] **Step 2: Squash only the clean source branch**

```bash
git merge --squash feat/economy-as-fields
git status --short
git diff --cached --check
git commit -m "feat: snapshot OpenEmpire foundation"
```

Do not squash `archive/economy-as-fields-full-history`; that would import the GPU checkpoint and skill edits into the foundation.

- [ ] **Step 3: Prove that the snapshot tree matches the clean source tree**

```bash
git diff --exit-code feat/economy-as-fields HEAD
git log --oneline --decorate -3
git status --short
```

Expected: no tree diff and an empty status; history contains `main` plus one snapshot commit.

- [ ] **Step 4: Establish the buildable-snapshot gate**

```bash
npx tsc --noEmit
npm run build-prod
```

Expected: both commands exit 0 before any isolation refactor begins.

---

### Task 3: Remove the known test-environment and lint baseline failures

**Files:**

- Modify: `tests/setup.ts`
- Modify: `tests/perf/balance/ShellDeltaProbe.ts:188`
- Test: `tests/UserSettings.test.ts`
- Test: the five client test files reported by the initial `npm test`

**Interfaces:**

- Consumes: Vitest's jsdom `window.localStorage` and Node 25's incomplete `globalThis.localStorage`.
- Produces: `globalThis.localStorage` bound to jsdom storage for every test; lint-clean tile-damage counting.

- [ ] **Step 1: Reproduce the storage failure before changing setup**

```bash
npx vitest tests/UserSettings.test.ts --run
```

Expected: FAIL because the Node-provided global object has no `clear`, `getItem`, or `removeItem` method.

- [ ] **Step 2: Bind the global to jsdom's real Storage object**

Add this immediately after the existing `vitest-canvas-mock` import in `tests/setup.ts`:

```ts
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: window.localStorage,
});
```

Do not add a custom storage mock; jsdom already supplies the required implementation.

- [ ] **Step 3: Verify the focused regression and then all formerly failing files**

```bash
npx vitest tests/UserSettings.test.ts --run
npm test
```

Expected: the focused file passes and the complete suite has zero failures. If the full run identifies the other four historical files by name, rerun those five paths together once after the fix to preserve a concise log.

- [ ] **Step 4: Fix the one lint error without a dummy loop variable**

Replace the counting loop in `tests/perf/balance/ShellDeltaProbe.ts` with:

```ts
const dmgTiles = Array.from(game.tileDamageEntries()).length;
```

- [ ] **Step 5: Verify and commit the repaired baseline**

```bash
npm run lint
git diff --check
git add tests/setup.ts tests/perf/balance/ShellDeltaProbe.ts
git commit -m "test: repair Node 25 browser globals"
```

Expected: lint and whitespace checks exit 0.

---

### Task 4: Give both live games explicit ownership and one shared overlay

**Files:**

- Move: `src/client/lab/systems/openfront/` → `src/client/games/openfront/`
- Move: `src/client/lab/systems/leanfront/` → `src/client/games/leanfront/`
- Create by move: `src/client/games/shared/live-game.wesl`
- Create: `src/client/games/registry.ts`
- Modify: `src/client/games/openfront/system.ts`
- Modify: `src/client/games/leanfront/system.ts`
- Modify: `src/client/GameShellPage.ts`
- Modify: `tests/FieldDynamics.test.ts`
- Create: `tests/LiveGameRegistry.test.ts`

**Interfaces:**

- Consumes: `FieldSystem`, `RulesetID`, `composeTerrain(system)` and the two current live-game system definitions.
- Produces: `LIVE_GAMES`, `getLiveGame(id: string): LiveGameDefinition | undefined`, and one shared WESL source used by both systems.

- [ ] **Step 1: Write the failing registry test**

Create `tests/LiveGameRegistry.test.ts` with these assertions:

```ts
import { describe, expect, test } from "vitest";
import { getLiveGame, LIVE_GAMES } from "../src/client/games/registry";

describe("live-game registry", () => {
  test("contains exactly the two selectable live games", () => {
    expect(LIVE_GAMES.map((entry) => entry.id)).toEqual([
      "openfront",
      "leanfront",
    ]);
    expect(getLiveGame("terrain")).toBeUndefined();
  });

  test("uses one shared view source", () => {
    const open = getLiveGame("openfront")!;
    const lean = getLiveGame("leanfront")!;
    expect(open.system.views[open.view].source).toBe(
      lean.system.views[lean.view].source,
    );
  });
});
```

- [ ] **Step 2: Run the test and observe the missing registry**

```bash
npx vitest tests/LiveGameRegistry.test.ts --run
```

Expected: FAIL because `src/client/games/registry.ts` does not exist.

- [ ] **Step 3: Move only the game-owned systems and centralize the shared view**

```bash
mkdir -p src/client/games/shared
git mv src/client/lab/systems/openfront src/client/games/openfront
git mv src/client/lab/systems/leanfront src/client/games/leanfront
git mv src/client/games/openfront/views/openfront.wesl src/client/games/shared/live-game.wesl
```

Use `apply_patch` to delete `src/client/games/leanfront/views/leanfront.wesl`, remove the two LeanFront-only header comments from the shared file, and leave the OpenFront shader body unchanged. Empty `views` directories need no separate action because Git does not track directories.

- [ ] **Step 4: Make both system definitions consume the shared raw source**

In both `system.ts` files, change the `FieldDynamics` import to `../../webgpu/FieldDynamics`, add:

```ts
import liveGameView from "../shared/live-game.wesl?raw";
```

Keep each existing ID, name, description, parameters, players, layers, and default view name. Replace only the view source:

```ts
views: {
  openfront: { source: liveGameView },
},
```

and:

```ts
views: {
  leanfront: { source: liveGameView },
},
```

- [ ] **Step 5: Add the minimal registry and route the shell through it**

Create `src/client/games/registry.ts` initially with system metadata only:

```ts
import type { RulesetID } from "../../core/game/Rulesets";
import type { FieldSystem } from "../webgpu/FieldDynamics";
import { leanfront } from "./leanfront/system";
import { openfront } from "./openfront/system";

export interface LiveGameDefinition {
  id: RulesetID;
  system: FieldSystem;
  view: string;
}

export const LIVE_GAMES: readonly LiveGameDefinition[] = [
  { id: "openfront", system: openfront, view: "openfront" },
  { id: "leanfront", system: leanfront, view: "leanfront" },
];

export function getLiveGame(id: string): LiveGameDefinition | undefined {
  return LIVE_GAMES.find((game) => game.id === id);
}
```

In `GameShellPage.ts`, remove the direct OpenFront/LeanFront imports, compose `LIVE_GAMES.map(({ system }) => composeTerrain(system))`, default to `LIVE_GAMES[0].id`, and replace the three separate decisions with one lookup:

```ts
private selectedLiveGame(): LiveGameDefinition | undefined {
  return getLiveGame(this.systemId);
}
```

Every boolean gate becomes `this.selectedLiveGame() !== undefined`; view selection uses `.view`; worker initialization uses `.id`. Do not add a new switch or ternary on `leanfront`.

- [ ] **Step 6: Update existing imports and verify both composed systems**

Change `tests/FieldDynamics.test.ts` imports from `src/client/lab/systems/{openfront,leanfront}` to `src/client/games/{openfront,leanfront}`. Then run:

```bash
npx vitest tests/LiveGameRegistry.test.ts tests/FieldDynamics.test.ts --run
npx tsc --noEmit
rg -n 'lab/systems/(openfront|leanfront)|systemId === (openfront|leanfront)' src tests
```

Expected: both tests and TypeScript pass; ripgrep returns no stale import or direct live-game decision.

- [ ] **Step 7: Commit the ownership move**

```bash
git add src/client/games src/client/GameShellPage.ts tests/FieldDynamics.test.ts tests/LiveGameRegistry.test.ts
git diff --cached --check
git commit -m "refactor: isolate live game definitions"
```

---

### Task 5: Isolate per-game worker lifecycles with lazy runtime loading

**Files:**

- Create: `src/client/games/LiveGameRuntime.ts`
- Create: `src/client/games/openfront/runtime.ts`
- Create: `src/client/games/leanfront/runtime.ts`
- Modify: `src/client/games/registry.ts`
- Modify: `src/client/webgpu/ShellSim.worker.ts`
- Modify: `tests/LiveGameRegistry.test.ts`
- Modify: `tests/CoreDependencyBoundary.test.ts`

**Interfaces:**

- Consumes: `Game`, `RulesetID`, the Task 4 registry, and worker tick lifecycle.
- Produces: `LiveGameRuntime`, `createRuntime(game: Game): Promise<LiveGameRuntime>` on each game entry, and `createLiveGameRuntime(id: RulesetID, game: Game): Promise<LiveGameRuntime>`.

- [ ] **Step 1: Add failing lifecycle and boundary tests**

Extend `tests/LiveGameRegistry.test.ts`:

```ts
test("both games expose the same two-method lifecycle", async () => {
  for (const entry of LIVE_GAMES) {
    const runtime = await entry.createRuntime({} as never);
    await expect(runtime.beforeTick()).resolves.toBeUndefined();
    expect(() => runtime.dispose()).not.toThrow();
  }
});
```

Extend `tests/CoreDependencyBoundary.test.ts` with a test that reads files and asserts:

```ts
expect(workerSource).not.toContain('=== "leanfront"');
expect(workerSource).not.toContain("GpuEconomy");
expect(openfrontSource).not.toMatch(/leanfront|GpuEconomy/);
expect(registrySource).toContain('import("./leanfront/runtime")');
```

- [ ] **Step 2: Verify the tests fail before the lifecycle exists**

```bash
npx vitest tests/LiveGameRegistry.test.ts tests/CoreDependencyBoundary.test.ts --run
```

Expected: FAIL on missing `createRuntime` and the current worker's GPU references if the archived WIP somehow leaked in; on the clean snapshot it still fails on the missing lifecycle.

- [ ] **Step 3: Define the exact lifecycle and CPU-only implementations**

Create `src/client/games/LiveGameRuntime.ts`:

```ts
export interface LiveGameRuntime {
  beforeTick(): Promise<void>;
  dispose(): void;
}
```

Create both `openfront/runtime.ts` and `leanfront/runtime.ts` with the same temporary implementation:

```ts
import type { LiveGameRuntime } from "../LiveGameRuntime";

export async function createRuntime(): Promise<LiveGameRuntime> {
  return {
    async beforeTick(): Promise<void> {},
    dispose(): void {},
  };
}
```

The duplicate four-line factory is intentional ownership, not a shared abstraction: Task 10 changes only LeanFront's copy.

- [ ] **Step 4: Add lazy factories to the registry**

Extend `LiveGameDefinition` with:

```ts
createRuntime(game: Game): Promise<LiveGameRuntime>;
```

Add type imports for `Game` and `LiveGameRuntime`, and define entries with dynamic imports:

```ts
{
  id: "openfront",
  system: openfront,
  view: "openfront",
  createRuntime: async () =>
    (await import("./openfront/runtime")).createRuntime(),
},
{
  id: "leanfront",
  system: leanfront,
  view: "leanfront",
  createRuntime: async (game) =>
    (await import("./leanfront/runtime")).createRuntime(game),
},
```

Export the guarded factory:

```ts
export async function createLiveGameRuntime(
  id: RulesetID,
  game: Game,
): Promise<LiveGameRuntime> {
  const selected = getLiveGame(id);
  if (selected === undefined) throw new Error(`unknown live game: ${id}`);
  return selected.createRuntime(game);
}
```

- [ ] **Step 5: Make the worker a game-neutral host**

In `ShellSim.worker.ts`, add one `LiveGameRuntime | null` field. During `init`, call `runtime?.dispose()` before replacing an existing game, then after `game = gr.game` assign:

```ts
runtime = await createLiveGameRuntime(msg.ruleset ?? DEFAULT_RULESET, game);
```

Make `stepAndPost` async if the clean snapshot has not already done so and add exactly one pre-tick line:

```ts
await runtime?.beforeTick();
```

Keep `gr.executeNextTick()` synchronous and keep the existing promise-based loop scheduling. The worker must import only `createLiveGameRuntime` and `LiveGameRuntime`, never either game runtime directly.

- [ ] **Step 6: Verify runtime behavior and import isolation**

```bash
npx vitest tests/LiveGameRegistry.test.ts tests/CoreDependencyBoundary.test.ts tests/Rulesets.test.ts --run
npx tsc --noEmit
rg -n 'GpuEconomy|=== "leanfront"' src/client/webgpu/ShellSim.worker.ts src/client/games/openfront
```

Expected: tests and TypeScript pass; ripgrep returns no matches.

- [ ] **Step 7: Commit the runtime boundary**

```bash
git add src/client/games src/client/webgpu/ShellSim.worker.ts tests/LiveGameRegistry.test.ts tests/CoreDependencyBoundary.test.ts
git diff --cached --check
git commit -m "refactor: isolate live game runtimes"
```

---

### Task 6: Close the focused-border test gaps

**Files:**

- Modify: `tests/FrontLineTroops.test.ts`
- Read only unless a failing test reveals a defect: `src/core/game/AttackImpl.ts`
- Read only unless a failing test reveals a defect: `src/core/execution/AttackExecution.ts`

**Interfaces:**

- Consumes: `Attack.troopsAt`, `spendAt`, `frontTiles`, `reserve`, `FoodConfig.frontSeepFraction`, and the existing long-seam fixture.
- Produces: direct regression coverage for local exhaustion, narrow concentration, zero/nonzero seep, and exact conservation.

- [ ] **Step 1: Add a width parameter to the existing test helper**

Change `pushAt` to accept `half = 5` and return no new abstraction:

```ts
function pushAt(
  game: Game,
  attacker: Player,
  defender: Player,
  y: number,
  troops = 20_000,
  half = 5,
) {
  game.addExecution(
    new AttackExecution(
      troops,
      attacker,
      defender.id(),
      null,
      true,
      stretch(game, SEAM, y, half),
    ),
  );
}
```

- [ ] **Step 2: Write the local-exhaustion regression**

Add a test that starts two far-apart pushes, spends the entire northern front locally through `spendAt`, executes ticks, and asserts the northern attack takes no additional defender tiles while the southern attack remains active and advances. Count ownership only in `y < HEIGHT / 2` versus `y >= HEIGHT / 2`; do not infer behavior from the aggregate troop total.

- [ ] **Step 3: Write the concentration regression**

Run two fresh fixtures with the same `20_000` commitment: one `half = 1`, one `half = 10`. After the same tick count, count captured defender tiles within each aimed band and assert the narrow commitment captures more per seeded front tile than the wide commitment:

```ts
expect(narrowCaptured / 3).toBeGreaterThan(wideCaptured / 21);
```

- [ ] **Step 4: Write the seep and fraction-zero regressions**

For each case, initialize one push, choose adjacent front tiles with positive force, drain the middle tile using `spendAt(middle, troopsAt(middle))`, and record the total. With the default positive seep, one tick must give the middle tile force again. In a separate fixture set `game.config().food().frontSeepFraction = 0` before the push; after one tick the drained tile must remain zero. In both cases assert:

```ts
expect(
  [...attack.frontTiles()].reduce(
    (sum, tile) => sum + attack.troopsAt(tile),
    attack.reserve(),
  ),
).toBeLessThanOrEqual(totalBefore);
```

Use `toBeLessThanOrEqual` because advance can legitimately spend troops; seep itself may not create them.

- [ ] **Step 5: Run the focused test and fix only proven shared defects**

```bash
npx vitest tests/FrontLineTroops.test.ts --run
```

Expected: all distant-counter, local-clash, exhaustion, concentration, seep, rescale, determinism, and conservation tests pass. If a new assertion fails, trace every caller of the failing `Attack` method before editing its shared implementation; do not patch the fixture to hide a real defect.

- [ ] **Step 6: Commit the completed behavior gate**

```bash
git add tests/FrontLineTroops.test.ts src/core/game/AttackImpl.ts src/core/execution/AttackExecution.ts
git diff --cached --check
git commit -m "test: complete focused border coverage"
```

Only stage either source file if the test demonstrated and required a source fix.

---

### Task 7: Certify terrain, maps, nations, burns, and the production flag bundle

**Files:**

- Test: `tests/MapConsistency.test.ts`
- Test: `tests/core/game/GameMapLayers.test.ts`
- Test: `tests/core/game/MapLayers.test.ts`
- Test: `tests/core/game/TerrainMapLoader.test.ts`
- Test: `tests/games/alternative/GeneratorMapExport.test.ts`
- Test: `tests/NationCreation.test.ts`
- Test: `tests/PersistentTilesBurn.test.ts`
- Test: `tests/client/GameBoard.test.ts`
- Test: `tests/FieldDynamics.test.ts`
- Verify: `map-generator/`
- Verify: production `dist/` flag output

**Interfaces:**

- Consumes: existing shared foundation implementations and tests.
- Produces: recorded command evidence that the common layers are frozen from a green state; no new framework or feature.

- [ ] **Step 1: Run the shared deterministic suites**

```bash
npx vitest tests/MapConsistency.test.ts tests/core/game/GameMapLayers.test.ts tests/core/game/MapLayers.test.ts tests/core/game/TerrainMapLoader.test.ts tests/games/alternative/GeneratorMapExport.test.ts tests/NationCreation.test.ts tests/PersistentTilesBurn.test.ts tests/FrontLineTroops.test.ts tests/client/GameBoard.test.ts tests/FieldDynamics.test.ts tests/ShellTransportShips.test.ts --run
```

Expected: zero failures.

- [ ] **Step 2: Verify the Go generator without relying on the user cache**

```bash
GOCACHE=/tmp/openempire-go-build go test ./...
```

Run from `map-generator/`. Expected: all Go packages pass and the command exits 0.

- [ ] **Step 3: Rebuild maps and prove generation is clean**

```bash
npm run gen-maps
git status --short
```

Expected: generation exits 0 and produces no unexplained tracked diff. If generated output changes, inspect and commit only a deterministic generator correction; never accept drift merely to make the tree clean.

- [ ] **Step 4: Build production and verify every manifest flag exists in output**

```bash
npm run build-prod
npx tsx -e 'import fs from "node:fs"; import path from "node:path"; const m=JSON.parse(fs.readFileSync("resources/flags/flags.manifest.json","utf8")); const missing=m.flags.filter((f:{id:string})=>!fs.existsSync(path.join("dist/static/_assets/flags",`${f.id}.svg`))); if(missing.length) throw new Error(`missing ${missing.length} flags`); console.log(`${m.flags.length} flags present`);'
```

Expected: build exits 0 and the verifier reports all 6,168 manifest entries present. If Vite changes the output root, locate the single built `flags` directory with `find dist -type d -name flags` and update only the literal root in the command/documentation.

- [ ] **Step 5: Record this no-code gate**

Do not create an empty commit. Carry the command outputs into Task 9's OpenSpec reconciliation and Task 11's freeze-evidence document.

---

### Task 8: Record OpenFront's repeatable CPU reference and performance smoke

**Files:**

- Create: `docs/OpenFrontLiveReference.md`
- Modify only if results differ because of a defect: shared implementation identified by the failing test

**Interfaces:**

- Consumes: `BalanceRun.ts`, `FullGamePerf.ts`, current `Config.food()` constants, and recorded 4,000-tick hashes.
- Produces: a concise frozen reference with hashes `801065038163313`, `2069060768539590`, and `4964847657180561`, plus present tuning ownership and performance observations.

- [ ] **Step 1: Reproduce both Verdantia reference runs**

```bash
npx tsx tests/perf/balance/BalanceRun.ts --map verdantia --runs 2 --ticks 4000 --bots 40 --nations 20 --seed-prefix base --check-repro --out /tmp/openfront-verdantia-reference.json
```

Expected hashes in order: `801065038163313`, `2069060768539590`; `repro check: IDENTICAL`.

- [ ] **Step 2: Reproduce the SPQR reference run**

```bash
npx tsx tests/perf/balance/BalanceRun.ts --map spqr --runs 1 --ticks 4000 --bots 50 --nations 0 --seed-prefix base --check-repro --out /tmp/openfront-spqr-reference.json
```

Expected hash: `4964847657180561`; `repro check: IDENTICAL`.

If a hash differs, stop: the foundation is not frozen. Diagnose the first divergent tick; do not re-baseline in this task.

- [ ] **Step 3: Run a bounded combat/tick performance smoke**

```bash
npm run perf:game -- --map verdantia --ticks 1000 --bots 40 --seed foundation-perf --no-cpu-profile
```

Expected: no fatal error, a final state hash, and printed tick/execution timing. This is a regression smoke, not a balance or optimization target.

- [ ] **Step 4: Write the frozen reference document**

`docs/OpenFrontLiveReference.md` must state:

- OpenFront Live development is paused at `openempire-foundation-v0`; shared bug fixes remain allowed only with all gates green.
- OpenFront uses the CPU food economy and never initializes the LeanFront GPU runtime.
- The exact two commands and three expected hashes above.
- Verdantia reference metrics: leader share 24.7% / 21.5%, Gini 0.716 / 0.631, first elimination 1053 / 803, alive 19 / 15.
- SPQR reference metrics: leader share 12.8%, Gini 0.312, first elimination 803, alive 15.
- Current tuning is owned by `Config.food()` and is recorded, not rebalanced.
- Shared frozen surfaces: terrain/maps, board/shell/transport, nations/flags, focused-border combat, burn/persistent land use, and deterministic primitives.
- Explicit resumption rule: intentional OpenFront rule changes require a decision to resume OpenFront development.

- [ ] **Step 5: Commit the reference**

```bash
git add docs/OpenFrontLiveReference.md
git diff --cached --check
git commit -m "docs: record OpenFront live reference"
```

---

### Task 9: Complete browser evidence and reconcile the frozen OpenSpec changes

**Files:**

- Modify: `openspec/changes/front-line-troops/tasks.md`
- Modify: `openspec/changes/rework-persistent-tiles-and-burn/tasks.md`
- Modify: `openspec/changes/rework-persistent-tiles-and-burn/balance-notes.md`
- Modify: `openspec/changes/add-nation-flags/tasks.md`
- Modify: `openspec/changes/add-generator-page-map-export/tasks.md`
- Archive after validation: the above changes plus `add-map-layer-sidecars` and `add-rich-terrain-color-sidecar`
- Keep active/parked: `port-economy-to-gpu`, `complete-gpu-economy-cutover`, `leanfront-flow-economy`, `leanfront-gpu-field-sim`

**Interfaces:**

- Consumes: Tasks 6-8 evidence and the existing run-openfront browser scripts.
- Produces: browser screenshots/logs for the user-facing freeze surfaces and strictly valid archived specs; GPU/flow work remains explicitly LeanFront research.

- [ ] **Step 1: Start the existing development server and run the available shell checks**

```bash
npm run dev
```

In another terminal, after `curl -sf http://localhost:9000` succeeds:

```bash
node .claude/skills/run-openfront/burn-persist-check.mjs
node .claude/skills/run-openfront/front-gradient-check.mjs
node .claude/skills/run-openfront/featured-maps-check.mjs
node .claude/skills/run-openfront/game.mjs
```

Expected: no page or console errors; screenshots exist under `/tmp/openfront-run/`; the front script reports more than one front value; the map check loads generated terrain.

- [ ] **Step 2: Perform the real-browser visual gate**

Open `http://localhost:9000/#shell` in a GPU-capable browser and verify all four items in one session:

1. Select OpenFront and confirm generated terrain, water, and seasonal coloring render.
2. Confirm spawn markers and the hover nation chip display deterministic flag images rather than broken assets.
3. Counter one end of a long contested border and confirm the remote push remains visible and active; direct correctness is already enforced by `FrontLineTroops.test.ts`.
4. Conquer a developed tile and time approximately five seconds of flame followed by approximately four seconds of ash; confirm the captured land-use type persists and regrows.

Save one screenshot for terrain/flags, one for the split front, and one each during flame and ash under `/tmp/openfront-run/foundation-freeze/`. Record browser name, date, and observed durations in the relevant OpenSpec task files.

- [ ] **Step 3: Verify normal and turbo shell execution**

In the same OpenFront session, run at normal speed for at least 100 ticks, enable turbo for at least 500 ticks, then return to normal speed. Expected: tick count advances in all three phases, no worker error appears, and the page console has no uncaught exception.

- [ ] **Step 4: Complete the generator-page flow without retaining a test map**

Open `http://localhost:9000/#generator`, export one map, place the downloaded files temporarily under `map-generator/assets/maps/foundation-freeze-check`, run `npm run gen-maps`, select the generated map in the normal picker, and launch OpenFront on it. After recording the successful spawn, terrain overlay, expansion, and combat check, remove only that named temporary asset directory through a recoverable move to `/tmp/openempire-foundation-freeze-check`; rerun `npm run gen-maps` and confirm `git status --short` returns to the pre-check state.

- [ ] **Step 5: Update task status strictly from gathered evidence**

Mark the following only after their evidence exists:

- `front-line-troops`: 7.6, 7.7, 7.8, 8.4, 8.6.
- `rework-persistent-tiles-and-burn`: 6.1 and 6.3; use Task 8's unchanged reference metrics as the post-change recorded baseline and explicitly note that no freeze-time rebalance was performed.
- `add-nation-flags`: 1.8, 6.3, 7.2, 7.3; retain 1.3 as an intentional `[~]` historical curation decision rather than implementing unused `--max-bytes` support.
- `add-generator-page-map-export`: 3.2, 3.3, 3.4.

- [ ] **Step 6: Validate every frozen-area change before archiving**

```bash
openspec validate front-line-troops --strict
openspec validate rework-persistent-tiles-and-burn --strict
openspec validate add-nation-flags --strict
openspec validate add-generator-page-map-export --strict
openspec validate add-map-layer-sidecars --strict
openspec validate add-rich-terrain-color-sidecar --strict
```

Expected: all six validations pass.

- [ ] **Step 7: Archive only completed frozen-area changes**

```bash
openspec archive front-line-troops --yes
openspec archive rework-persistent-tiles-and-burn --yes
openspec archive add-nation-flags --yes
openspec archive add-generator-page-map-export --yes
openspec archive add-map-layer-sidecars --yes
openspec archive add-rich-terrain-color-sidecar --yes
openspec validate --all --strict --no-interactive
```

Expected: archives succeed and the final global validation exits 0. Do not archive any GPU or flow-economy change.

- [ ] **Step 8: Commit the reconciled specification state**

```bash
git add openspec
git diff --cached --check
git commit -m "docs(openspec): freeze shared foundation capabilities"
```

---

### Task 10: Update architecture documentation to match the frozen code

**Files:**

- Modify: `CLAUDE.md:5,78`
- Modify if paths are mentioned: `docs/superpowers/specs/2026-09-04-openempire-foundation-freeze-design.md`
- Create: `docs/OpenEmpireArchitecture.md`

**Interfaces:**

- Consumes: the Task 4-5 physical layout and Task 8 behavior reference.
- Produces: one short ownership map for future work; no duplicate API documentation.

- [ ] **Step 1: Replace stale single-game and Barn-dependent prose**

In `CLAUDE.md`, describe the repository as two selectable games over one shared foundation. Update the food paragraph to match the current seed-based storage/economy actually implemented by `Config.food()` and the current execution utilities; remove the stale claim that Barn capacity governs storage if code inspection confirms it no longer does.

- [ ] **Step 2: Write the minimal architecture map**

Create `docs/OpenEmpireArchitecture.md` with these sections only:

```markdown
# OpenEmpire Architecture

## Shared foundation

## OpenFront Live (paused)

## LeanFront (active)

## Dependency rule

## Branch and tag policy

## Verification commands
```

State the concrete directories from this plan, the dynamic runtime-loading rule, and the one-way dependency diagram from the design spec. Link to `OpenFrontLiveReference.md` for hashes instead of copying them.

- [ ] **Step 3: Verify docs contain no obsolete live-game paths**

```bash
rg -n 'src/client/lab/systems/(openfront|leanfront)|Barn-capped storage|one selectable game' CLAUDE.md docs
```

Expected: no stale matches outside historical plan/spec passages that explicitly describe the old state.

- [ ] **Step 4: Commit the architecture documentation**

```bash
git add CLAUDE.md docs/OpenEmpireArchitecture.md docs/superpowers/specs/2026-09-04-openempire-foundation-freeze-design.md
git diff --cached --check
git commit -m "docs: define shared game foundation"
```

Only stage the design spec if its old checkpoint/path wording required correction.

---

### Task 11: Run the final freeze gate, tag it, and preserve OpenFront

**Files:**

- Verify: entire repository
- Create Git refs: tag `openempire-foundation-v0`, branch `openfront-live`

**Interfaces:**

- Consumes: all foundation commits and evidence.
- Produces: immutable foundation recovery tag and paused OpenFront branch at the same commit.

- [ ] **Step 1: Run the complete automated gate from a clean tree**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build-prod
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Re-run the generator and reference gates**

From `map-generator/`:

```bash
GOCACHE=/tmp/openempire-go-build go test ./...
```

From the repository root:

```bash
npx tsx tests/perf/balance/BalanceRun.ts --map verdantia --runs 2 --ticks 4000 --bots 40 --nations 20 --seed-prefix base --check-repro
npx tsx tests/perf/balance/BalanceRun.ts --map spqr --runs 1 --ticks 4000 --bots 50 --nations 0 --seed-prefix base --check-repro
```

Expected: the three hashes in `docs/OpenFrontLiveReference.md` match exactly and both reproduction checks report `IDENTICAL`.

- [ ] **Step 3: Prove the repository and boundary are clean**

```bash
git status --short
rg -n 'GpuEconomy|=== "leanfront"' src/client/webgpu/ShellSim.worker.ts src/client/games/openfront
rg -n 'from .*games/(openfront|leanfront)' src/core src/client/games/openfront src/client/games/leanfront
```

Expected: status is empty; first boundary scan returns no match; the second returns no cross-game/core dependency. Imports within each game's own files are allowed only when they do not reference the other game.

- [ ] **Step 4: Create the immutable tag and paused branch**

```bash
git tag -a openempire-foundation-v0 -m "OpenEmpire shared foundation v0"
git branch openfront-live
git show-ref --verify refs/tags/openempire-foundation-v0
git show-ref --verify refs/heads/openfront-live
```

Expected: both refs point to the current verified commit. Do not move either ref during LeanFront work.

---

### Task 12: Restore the GPU checkpoint only on the active LeanFront branch

**Files:**

- Move: `src/client/economy/GpuEconomy.ts` → `src/client/games/leanfront/economy/GpuEconomy.ts`
- Move: `src/client/economy/SeamDiff.ts` → `src/client/games/leanfront/economy/SeamDiff.ts`
- Move: `src/client/economy/upload.ts` → `src/client/games/leanfront/economy/upload.ts`
- Move: `src/client/economy/FieldProbe.worker.ts` → `src/client/games/leanfront/economy/FieldProbe.worker.ts`
- Move: `src/client/economy/LedgerProbe.worker.ts` → `src/client/games/leanfront/economy/LedgerProbe.worker.ts`
- Move: `src/client/economy/SupplyInjection.worker.ts` → `src/client/games/leanfront/economy/SupplyInjection.worker.ts`
- Move: `src/client/economy/fields/` → `src/client/games/leanfront/economy/fields/`
- Modify: `src/client/games/leanfront/runtime.ts`
- Keep shared: provider seams under `src/core/execution/utils/` and neutral game interfaces under `src/core/game/`
- Test: `tests/SeamDiff.test.ts`, `tests/FarmTickProvider.test.ts`, `tests/DrawProbe.test.ts`, `tests/LandUseZoning.test.ts`

**Interfaces:**

- Consumes: `archive/gpu-economy-checkpoint`, `LiveGameRuntime`, and `GpuEconomy.create(game)`, `install()`, `dispatch(game, players)`, `dispose()`.
- Produces: branch `leanfront`, where only its runtime creates and drives the GPU economy; OpenFront continues to use its frozen no-op runtime.

- [ ] **Step 1: Branch from the verified foundation tag**

```bash
git switch -c leanfront openempire-foundation-v0
```

- [ ] **Step 2: Transplant exactly the archived game-WIP commit**

```bash
git cherry-pick archive/gpu-economy-checkpoint
```

Expected: conflicts are likely in moved system/worker paths. Resolve them by retaining the foundation registry/runtime host and the checkpoint's GPU/provider implementation. Do not accept the checkpoint's direct `ShellSim.worker.ts` `leanfront` conditional.

- [ ] **Step 3: Relocate all GPU-economy client code under LeanFront ownership**

After resolving the cherry-pick enough for paths to exist:

```bash
mkdir -p src/client/games/leanfront/economy
git mv src/client/economy/GpuEconomy.ts src/client/games/leanfront/economy/GpuEconomy.ts
git mv src/client/economy/SeamDiff.ts src/client/games/leanfront/economy/SeamDiff.ts
git mv src/client/economy/upload.ts src/client/games/leanfront/economy/upload.ts
git mv src/client/economy/FieldProbe.worker.ts src/client/games/leanfront/economy/FieldProbe.worker.ts
git mv src/client/economy/LedgerProbe.worker.ts src/client/games/leanfront/economy/LedgerProbe.worker.ts
git mv src/client/economy/SupplyInjection.worker.ts src/client/games/leanfront/economy/SupplyInjection.worker.ts
git mv src/client/economy/fields src/client/games/leanfront/economy/fields
```

Update imports mechanically; do not move `FieldKernel`, `FieldDynamics`, `ShellSimProtocol`, or provider interfaces out of their shared directories.

- [ ] **Step 4: Make only LeanFront's runtime own the device lifecycle**

Replace `src/client/games/leanfront/runtime.ts` with:

```ts
import type { Game } from "../../../core/game/Game";
import type { LiveGameRuntime } from "../LiveGameRuntime";
import { GpuEconomy } from "./economy/GpuEconomy";

export async function createRuntime(game: Game): Promise<LiveGameRuntime> {
  const economy = await GpuEconomy.create(game);
  if (economy === null) {
    console.warn("leanfront: no GPU economy available; using the CPU path");
    return {
      async beforeTick(): Promise<void> {},
      dispose(): void {},
    };
  }

  economy.install();
  console.log(`leanfront: GPU economy on ${economy.adapter}`);
  return {
    async beforeTick(): Promise<void> {
      await economy.dispatch(
        game,
        game.players().filter((player) => player.isAlive()),
      );
    },
    dispose(): void {
      economy.dispose();
    },
  };
}
```

Do not add GPU diagnostics to the shared runtime interface. Existing counters remain readable from the LeanFront-owned economy/probe code.

- [ ] **Step 5: Add the OpenFront no-load regression**

In `tests/LiveGameRegistry.test.ts`, mock `../src/client/games/leanfront/runtime` before importing the registry, create only the OpenFront runtime, and assert the LeanFront factory was never called. Retain the static source assertions that OpenFront and the worker contain no `GpuEconomy` import.

The behavioral assertion is:

```ts
const runtime = await getLiveGame("openfront")!.createRuntime({} as never);
await runtime.beforeTick();
expect(createLeanRuntime).not.toHaveBeenCalled();
runtime.dispose();
```

- [ ] **Step 6: Verify both CPU fallback and GPU seam tests**

```bash
npx vitest tests/LiveGameRegistry.test.ts tests/CoreDependencyBoundary.test.ts tests/Rulesets.test.ts tests/SeamDiff.test.ts tests/FarmTickProvider.test.ts tests/DrawProbe.test.ts tests/LandUseZoning.test.ts --run
npx tsc --noEmit
npm run lint
```

Expected: all pass. `Rulesets.test.ts` remains bit-identical because this checkpoint ports execution, not game rules.

- [ ] **Step 7: Verify the frozen OpenFront hash again before committing**

```bash
npx tsx tests/perf/balance/BalanceRun.ts --map spqr --runs 1 --ticks 4000 --bots 50 --nations 0 --seed-prefix base --check-repro
```

Expected: `4964847657180561` and `IDENTICAL`. A mismatch blocks the commit; do not update the reference.

- [ ] **Step 8: Commit the isolated LeanFront checkpoint**

```bash
git add src/client/games/leanfront src/client/webgpu/ShellSim.worker.ts src/core openspec/changes/port-economy-to-gpu openspec/changes/complete-gpu-economy-cutover tests .claude/skills/run-openfront
git diff --cached --check
git commit -m "feat(leanfront): restore isolated GPU economy checkpoint"
```

Before committing, `git diff --cached --name-only` must contain no `.claude/skills/openspec-*` or `.codex/skills/openspec-*` path.

---

### Task 13: Validate the active two-game branch and hand it off

**Files:**

- Verify: entire `leanfront` branch
- No foundation-tag mutation

**Interfaces:**

- Consumes: frozen tag plus isolated GPU checkpoint.
- Produces: active LeanFront branch that still ships selectable OpenFront and LeanFront implementations over the same foundation.

- [ ] **Step 1: Run the repository gate on the active branch**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build-prod
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Browser-smoke both picker entries**

Start `npm run dev`, then select OpenFront and LeanFront in `#shell`. For OpenFront, confirm no `leanfront: GPU economy` console message and normal/turbo ticking. For LeanFront, confirm either the GPU adapter message and continued ticking or the explicit CPU fallback warning and continued ticking; neither outcome may produce an uncaught error.

- [ ] **Step 3: Prove the refs and dependency boundary**

```bash
git merge-base --is-ancestor openempire-foundation-v0 openfront-live
git merge-base --is-ancestor openempire-foundation-v0 leanfront
git rev-parse openempire-foundation-v0
git rev-parse openfront-live
rg -n 'GpuEconomy|leanfront' src/client/games/openfront src/client/webgpu/ShellSim.worker.ts
git status --short
```

Expected: both ancestry checks exit 0; tag and `openfront-live` hashes are identical; boundary ripgrep returns no match; status is empty.

- [ ] **Step 4: Record the handoff state without another commit**

Report these three refs to the user:

```text
archive/economy-as-fields-full-history  complete deep history + all preserved edits
openfront-live                         paused game at openempire-foundation-v0
leanfront                              active GPU/economy development branch
```

The next change belongs on `leanfront`. A future economy redesign adds one whole-economy seam at `PlayerExecution.urbanTick` only when LeanFront actually diverges; it is not part of this freeze.
