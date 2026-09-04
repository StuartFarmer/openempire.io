# OpenEmpire Architecture

## Shared foundation

`src/core/` owns deterministic simulation and map data. `src/client/board/`,
`src/client/shell/`, and `src/client/webgpu/` own the reusable board, shell,
terrain presentation, worker protocol, and worker host. `src/client/GameShellPage.ts`
selects a registered game without owning its rules.

## OpenFront Live (paused)

`src/client/games/openfront/` owns OpenFront's picker system and CPU runtime.
Its runtime is dynamically loaded by `src/client/games/registry.ts`; it must not
import or initialize LeanFront code. Frozen behavior and reference hashes live
in [OpenFrontLiveReference.md](OpenFrontLiveReference.md).

## LeanFront (active)

`src/client/games/leanfront/` owns LeanFront's picker system, runtime, and layer
modules. Its runtime is dynamically loaded only when LeanFront is selected.
Future LeanFront economy work belongs there, behind `LiveGameRuntime`, rather
than in the shared worker host or OpenFront directory.

## Dependency rule

```text
OpenFront Live ──uses──▶ shared foundation ◀──uses── LeanFront
OpenFront Live ────────────────X──────────────────▶ LeanFront
LeanFront ─────────────────────X──────────────────▶ OpenFront Live
```

`src/client/games/registry.ts` is the only game-ID-to-implementation switch.
The registry dynamically imports the selected runtime; `ShellSim.worker.ts`
stays generic and contains no LeanFront-specific branch.

## Branch and tag policy

After the foundation gates pass, `openempire-foundation-v0` is immutable and
`openfront-live` points to it. Active LeanFront development starts from that
tag; shared fixes require the foundation gates and OpenFront reference checks.

## Verification commands

Run the deterministic reference and CPU smoke commands in
[OpenFrontLiveReference.md](OpenFrontLiveReference.md), then run:

```bash
npm test
npm run lint
npm run build-prod
```
