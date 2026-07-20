# Tasks — Move the OpenFront-live sim into a Web Worker

## 1. The worker + protocol

- [x] 1.1 `ShellSimMessages.ts`: the main↔worker message union (init/running/
      spawn/act/build/foodShare; frame/ready/error) with clone-safe payload shapes.
- [x] 1.2 `ShellSim.worker.ts`: set asset globals from `init`, `createGameRunner`
      (Singleplayer, N bots, randomSpawn:false), self-tick loop (yielding), and
      action handling (act → resolve attack/boat + ratio troops; spawn/build/
      foodShare → intents).
- [x] 1.3 Worker computes per tick: owner delta (from `packedTileUpdates`),
      density/damage/field deltas (sim packed), plot delta (unit diff + field claim),
      front delta (border-walk), player-stats table + new names, `myStats`, front
      labels, name anchors, spawn anchor. Post with the packed buffers transferred.

## 2. Main thread as a pure client

- [x] 2.1 `GameShellPage`: replace in-process `createGameRunner`/`stepSim`/
      `onSimUpdate`/`uploadConduits`/`computeFront`/`computePlot` with worker creation
      (`?worker&inline`, cdnBase + manifest in `init`) and a `frame` handler that
      applies conduit deltas (reuse `markDirty`/`flushDirty` run-merge) and updates
      the shipped state.
- [x] 2.2 HUD/hover/labels read shipped summaries: `myStats`, a `playerBySmallID`
      table (name/troops/tiles/alive), front labels, name anchors, maintained
      per-tile buffers (owner/plot/density/damage/field) for hover.
- [x] 2.3 Input posts actions to the worker (spawn/act/build/foodShare); remove
      the local `canAttack`/`bestTransportShipSpawn`/`canBuild` resolution.
- [x] 2.4 Decouple render: view re-renders on each worker frame; camera blits
      every rAF; throttle the `season` derive to a few times/second.
- [x] 2.5 Lifecycle: destroy/recreate the worker on system/map switch, bot-count
      change, and disconnect; keep spectate-free spawn flow + auto build-tool reset.

## 3. Verify

- [x] 3.1 tsc + lint; FieldDynamics tests pass.
- [x] 3.2 Headless: spawn, expand, build a settlement, food slider, fronts +
      labels, damage wash, names, rich hover — all still work (existing checks).
- [x] 3.3 Profile EarthXL: the main-thread per-frame work is small (sim off-
      thread); the sim no longer blocks rendering. Compare vs in-process.
