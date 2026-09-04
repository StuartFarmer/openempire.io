# OpenEmpire Foundation Freeze and Game Isolation Design

## Purpose

Create a shallow, buildable development line where OpenFront Live is a finished
reference game, LeanFront can evolve independently, and both use one tested
foundation for terrain, the board, nations, focused-border combat, and burn
presentation.

"Frozen" means OpenFront Live receives no intentional feature development for
now. It does not prohibit fixes to shared components. A shared change is safe
only when OpenFront's reference behavior remains intact.

## Current State

The deep `feat/economy-as-fields` branch contains the complete playable game and
177 commits beyond `main`. Its clean committed checkpoint is `0c3c412a0`. The
working tree also contains an active, uncommitted GPU-economy cutover: LeanFront
constructs `GpuEconomy`, dispatches it before core ticks, and currently serves
the farm CA and district ledger while other per-tile consumers remain on the
CPU.

OpenFront Live and LeanFront already share `GameShellPage`, `CameraRenderer`,
terrain composition, `ShellSimProtocol`, and the core simulation. Their
selection is currently spread across `GameShellPage`, `ShellSim.worker.ts`, and
`Rulesets.ts`; the two overlay shaders are copies.

## Ownership Boundary

The dependency direction is one-way:

```text
OpenFront Live ──uses──▶ shared foundation ◀──uses── LeanFront
OpenFront Live ────────────────X──────────────────▶ LeanFront
LeanFront ─────────────────────X──────────────────▶ OpenFront Live
```

LeanFront may initially reuse frozen OpenFront rule functions explicitly.
LeanFront changes must not add `if (ruleset === "leanfront")` branches inside
OpenFront-owned code. When a reused rule needs to diverge, extract or copy only
that rule behind the smallest seam that supports the real difference.

### Shared foundation

The shared foundation owns:

- Map formats, sidecar loaders, generated-map registry, and map validation.
- Terrain generation, runtime derivation, climate controls, seasons, and water.
- Board rendering, camera, input, common shell chrome, and worker transport
  primitives.
- Nation identity, spawning, names, and flags.
- Focused-border combat: segment selection, per-front troop location, local
  clashes, local spending, and troop conservation.
- Burn events, persistent land-use semantics, and fire/ash presentation.
- Deterministic game-state primitives used by both games.

### OpenFront Live

OpenFront Live owns its current CPU food economy, AI behavior, tuning, and
reference outcomes. Its runtime deliberately performs no GPU-economy setup.
After the freeze gate passes, development on these rules pauses.

### LeanFront

LeanFront owns its GPU economy, uploader, economy shaders, experimental provider
seams, future simplified economy rules, and any LeanFront-specific tuning or
presentation. It may be incomplete on its active branch without weakening the
OpenFront reference or shared-foundation checks.

## Approaches Considered

### Selected: shared platform with separate live-game runtimes

Reuse the existing `FieldSystem`, ruleset, shell worker, and economy seams. Add
one small registry and one runtime lifecycle. This isolates the two games
without duplicating the deterministic engine or inventing a general plugin
system.

### Rejected: duplicate the entire simulation

This provides strong physical isolation but immediately duplicates thousands of
lines. Common fixes would drift, and focused-border combat would cease to be a
single shared mechanism.

### Rejected: generic game-plugin framework

There are only two live games and one concrete runtime difference. A plugin API
would predict future requirements instead of serving current ones.

## Runtime Structure

Existing shared directories stay where they are. Moving working common code for
organizational symmetry would add risk without improving isolation. Only
game-specific entry points and LeanFront GPU code move under explicit ownership.

```text
src/client/
├── board/                         shared board component
├── shell/                         shared camera, fire, and terrain presentation
├── webgpu/                        shared FieldDynamics and worker protocol
└── games/
    ├── registry.ts                only game-ID-to-implementation switch
    ├── shared/
    │   └── live-game.wesl         initially shared territory/mask view
    ├── openfront/
    │   ├── system.ts              picker metadata and shared view
    │   └── runtime.ts             CPU runtime; no GPU setup
    └── leanfront/
        ├── system.ts              picker metadata
        ├── runtime.ts             GPU lifecycle and pre-tick dispatch
        └── economy/               GPU economy, uploader, and WESL passes
```

The common worker host depends on this lifecycle:

```ts
interface LiveGameRuntime {
  beforeTick(): Promise<void>;
  dispose(): void;
}
```

OpenFront's implementation is a no-op before the existing synchronous core
tick. LeanFront creates and owns `GpuEconomy`, awaits its dispatch in
`beforeTick`, and disposes its providers when the game ends. Runtime selection
occurs in the game registry/factory; `ShellSim.worker.ts` contains no
LeanFront-specific branch.

`GameShellPage.ts` reads one registry entry for the selected system, view,
ruleset, and worker game ID. It no longer separately implements
`isLiveGame`, `liveGameView`, and `liveGameRuleset` decisions.

Both games initially reference the same shared WESL territory/mask view.
LeanFront receives its own copy only when its presentation genuinely diverges.

## Future Economy Divergence

The freeze does not create a generic rules framework. The current provider seams
are sufficient for LeanFront's active GPU port of the same rules.

If LeanFront later replaces the CPU economy algorithm, introduce one narrow
whole-economy seam at the `PlayerExecution.urbanTick` boundary. OpenFront keeps
calling its frozen CPU implementation; LeanFront supplies its replacement.
Avoid adding more per-pass hooks in anticipation of that change.

## Freeze Gates

### Shared foundation

- Every shipped map passes terrain, sidecar, and manifest consistency checks.
- Generator export and Go map-baker tests pass.
- Shared board, camera, FieldDynamics, and worker protocol compile.
- Focused-border tests directly cover distant counters, local exhaustion,
  concentration, seep, and exact troop conservation.
- Burn-event, persistent-land-use, nation-creation, and deterministic-flag tests
  pass.
- A real-browser smoke check covers terrain, nation flags, a far-end
  counterattack, and the five-second fire plus four-second ash effect.
- The production build contains every flag referenced by the flag manifest.

### OpenFront Live

- Selecting OpenFront never constructs or imports the LeanFront GPU runtime.
- The CPU economy remains authoritative.
- Recorded seeded reference hashes repeat exactly.
- A seeded game runs in normal and turbo modes without runtime errors.
- Current tuning is recorded but not rebalanced during the freeze.
- OpenFront-owned modules contain no LeanFront imports or ruleset branches.
- A concise reference document states the behavior being paused.

### Repository

- TypeScript, production build, lint, `git diff --check`, and the complete test
  suite pass.
- The existing test-environment `localStorage` failure is fixed rather than
  carried as a permanent five-file exception.
- Near-complete terrain, fire, nation-flag, and focused-border OpenSpec changes
  are reconciled and archived after their remaining checks pass.
- GPU-economy and flow-economy changes are explicitly recorded as active or
  parked LeanFront research, not OpenFront work.
- Architecture documentation matches the current seed-based economy and the
  two-game runtime.

Large balance sweeps are excluded. LeanFront's economy will change, so balancing
the current economy would be disposable work. The freeze records OpenFront's
present constants and uses only a combat performance smoke check.

## Shallow-History Migration

No experimental work is discarded.

```text
main
  │
  ├─ snapshot: OpenEmpire through 0c3c412a0
  ├─ refactor: isolate shared/OpenFront/LeanFront runtimes
  ├─ chore: pass foundation freeze gates
  │    └─ tag: openempire-foundation-v0
  └─ feat(leanfront): restore GPU economy checkpoint
       └─ active LeanFront development
```

1. On the deep branch, commit the current GPU working tree to
   `archive/economy-as-fields-full-history`. Keep unrelated Codex/Claude skill
   edits in a separate commit.
2. Create a shallow development branch from `main`.
3. Squash the clean tree through `0c3c412a0` into one buildable snapshot commit.
4. Apply runtime isolation as a second independently buildable commit.
5. Complete the freeze checks and documentation in a third commit.
6. Tag that commit `openempire-foundation-v0` and leave an `openfront-live`
   branch pointing to it.
7. Create the active `leanfront` branch from the tag.
8. Transplant the archived GPU checkpoint, moving its implementation into the
   LeanFront-owned directory while resolving conflicts.
9. Continue shipping both selectable games from the active LeanFront branch.
   OpenFront remains the frozen reference inside the same application.

## Change Policy After the Freeze

- Common fixes must pass both games' shared suites and OpenFront reference
  hashes.
- OpenFront changes require an explicit decision to resume its development;
  they are not incidental parts of LeanFront work.
- LeanFront failures may not be hidden by changing common or OpenFront behavior.
- The foundation tag is immutable and remains the recovery point.
- GPU optimization resumes only on the LeanFront branch.

## Explicit Non-Goals

- No full simulation fork.
- No plugin framework.
- No mass relocation of stable shared code.
- No economy redesign during the freeze.
- No large balance sweep before LeanFront's simpler economy is chosen.
- No deletion of the GPU or flow research.
