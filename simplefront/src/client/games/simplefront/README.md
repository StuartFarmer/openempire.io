# SimpleFront

Select **SimpleFront (live)** in the game picker on `#shell` (`npm run dev`).
This starts with OpenFront Live's current CPU simulation and gameplay.

- `system.ts` and `layers/` are independent copies of OpenFront's render setup.
- `runtime.ts` is the copied CPU runtime, ready for SimpleFront-specific hooks.
- `src/core/configuration/Config.ts` owns the copied game rules. All files in
  this application are independent of the parent OpenFront app.

The engine, maps, shell, and `shared/live-game.wesl` are also physical copies
inside `simplefront/`. You can change them without changing OpenFront Live.
