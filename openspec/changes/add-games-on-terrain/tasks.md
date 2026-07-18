# Tasks — Games on a shared terrain base

## 1. Compiler: exposed derive fields + named terrain uniform

- [x] 1.1 `FieldDerivedSpec.exposed?: boolean`. Exposed derive fields join the per-tick layer registry as read-only inputs (`layers::<name>` resolves to the derive buffer; ping-pong fields read `.read`). Writing an exposed field (layer/brush/init target) is a compile diagnostic. Test: a system with a derive field marked exposed + a layer reading it links; a layer writing it errors.
- [x] 1.2 `FieldDeriveSpec.uniform.name?` (default `"P"`). The kernel carries both the named terrain uniform and the generated `P` when a system has params + a named derive uniform. Test: a system with params + a `TP`-named derive uniform compiles both.

## 2. The shared terrain base

- [x] 2.1 Extract `TERRAIN_DERIVE` (the terrain derive block) into a reusable spec: uniform `name: "TP"`; mark `temperature`/`precipitation`/`humidity`/`water`/`fill`/`flags` (+ raw inputs) `exposed`.
- [x] 2.2 `composeTerrain(game): FieldSystem` — merge `TERRAIN_DERIVE` into a game manifest (derive stage + exposed fields + `TP` uniform + modules + inputs/prepare). Name collisions error. `composeTerrain({})` = terrain alone. Test: composed grazing compiles; a game layer named `temperature` errors.

## 3. Viewer: terrain always-on, game picker

- [ ] 3.1 `GameShellPage`: the picker lists games (world/none + grazing/settlement/empire/…); mount `composeTerrain(selectedGame)`; always derive terrain.
- [ ] 3.2 Write `TP` (worldgen Params, climate knobs + season tier) and `P` (game params) independently; terrain derivation tiers (full/recolor/season) on `TP`, game tick on `P`.
- [ ] 3.3 Terrain views + the game's views/overlays over the same camera; game brushes/ai/input as today.

## 4. Recreate the games on terrain

- [x] 4.1 `grazing`: grass growth reads `layers::temperature`/`layers::crop`; drop any re-derived climate. Verify herds spread on real fertile land.
- [x] 4.2 `settlement`: crops/pop read `layers::temperature` + `layers::water` + `layers::humidity`; delete `temp`/`gdd` crude layers. Verify life pools in fertile, watered, frost-free regions.
- [x] 4.3 `empire`: `potential` reads terrain `temperature`(seasonal)/`water`(drainage)/`humidity`; delete `temp.wesl` (fake swing). pop/troops/owner/combat unchanged. Verify empires grow over the real opportunity map + AI/combat still run.

## 5. Verify + clean up

- [ ] 5.1 Full tsc + lint; FieldDynamics tests. `#shell`: terrain-only, then each game composed on terrain (climate-driven), no page errors.
- [ ] 5.2 Remove the deleted crude-climate layers + any now-dead re-derivation; update `docs/FieldDynamics.md` (terrain base + games).
