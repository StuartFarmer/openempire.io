# Design: unify-layered-path

## Context

The layered path was grown behind `game.hasLayers()` so classic maps stayed byte-identical vanilla (a boundary CLAUDE.md still states). That boundary has served its purpose: every shipped map except `world` is layered, the vanilla mode is unreachable from any authored content except `world` and the compact-size fallback, and maintaining two economies, two build UIs, two AI build orders, and two terrain-shading paths taxes every new feature. The mode switch is invisible to players — the map picker gives no hint that "World" is a different game.

Current tiering (from the survey that motivated this change):

| Tier          | Maps                                                                | Sim     | Shading                            |
| ------------- | ------------------------------------------------------------------- | ------- | ---------------------------------- |
| Full legacy   | `world`                                                             | vanilla | procedural                         |
| Half-migrated | `majormenor`                                                        | layered | procedural (no terrain-colors.png) |
| New path      | earth, earthmini, earthxl, estuaria, spqr, pangea001/002, verdantia | layered | sidecar                            |
| Hidden        | any map at compact/4x size                                          | vanilla | procedural                         |

The hidden tier exists because `TerrainMapLoader` only loads `layers.bin` at `GameMapSize.Normal`, and the full-res `terrain-colors.png` fails `TerrainColorSidecar`'s dimension check against a 4x-downscaled map.

## Goals / Non-Goals

**Goals:**

- Exactly one game mode: the layered food-economy sim, on every map, always.
- Exactly one terrain-shading source of truth: the baked `terrain-colors.png` sidecar, with a retained procedural _delta_ encoder for tiles that mutate at runtime.
- Loud failure instead of silent fallback when map data is incomplete.
- Preserve difficulty differentiation for AI opponents, currently carried only by the vanilla `maxTroops` formula.
- Keep the door open for re-added multiplayer (explicit maps, no size variants) and for later ages (dormant gold-economy units).

**Non-Goals:**

- Deleting vanilla _content_: City/Factory/Port/warships/nukes/etc. stay defined (dormant until metal/oil ages give them a payable `costResource`).
- Removing i18n plumbing (`translateText`/en.json stays; pruning orphaned keys for deleted UI is in scope only because the translation test enforces it).
- Any change to the layered economy's balance beyond the new difficulty levers.
- Re-adding multiplayer itself.

## Decisions

### D1: Retrofit `world` and `majormenor` rather than delete them

`derive-layers.ts` already reconstructs the engine's full climate pipeline (elevation → ocean → temperature → precipitation → watermap → irrigation → humidity → biome inputs) from a baked `image.png`. The engine exports `generateWorldEngineBiome(ocean, temperature, humidity)` and `buildWorldEngineTerrainColors(...)`, whose inputs derive-layers already computes — so emitting `terrain-colors.png` is a small extension of the existing tool, not a new pipeline. Alternative considered: dropping `world` outright — rejected for now; its derived resource distribution is synthetic (name-seeded), so its long-term fate is a playtest/balance question, not a code question. If it plays badly it can be removed later by deleting a folder.

### D2: Sidecars are mandatory; the loader throws

`TerrainMapLoader` treats a missing/undecodable `layers.bin` or `terrain-colors.png` (or a manifest without both flags) as a load error, not a fallback. Rationale: every silent fallback in this system produced a hidden game mode; failing loudly turns a data bug into a five-second fix (`derive-layers` + `gen-maps`). `tests/MapConsistency.test.ts` enforces the invariant statically so the failure is caught at test time, not play time.

### D3: Remove `GameMapSize` and the 4x/16x artifacts entirely

Maps load at full resolution only. The size option disappears from the UI and `GameConfig`; the Go baker stops emitting `map16x.bin` and existing ones are deleted. **Amendment (discovered in implementation):** `map4x.bin` is NOT deleted — at Normal size it was already serving as the pathfinding minimap (water/rail A*, `WaterManager`), so it survives with exactly that narrowed role and never carries layers. Alternative considered: bake per-size sidecars — rejected; it multiplies every future sidecar by the size matrix for an option whose only purpose was memory savings on huge multiplayer maps. Smaller battlefields are explicit maps (`earthmini` is the pattern). Multiplayer re-added later is unaffected: map size never touched netcode, only client-side loading.

### D4: Delete the predicates, not just the branches

`Game.hasLayers()` / `GameMap.hasLayers()` / `Player.hasFoodEconomy()` / `GameView.hasLayers()` / `PlayerView.hasFoodEconomy()` are removed along with every branch on them; the layered arm becomes the only code. Alternative considered: keep them returning `true` as a deprecation shim — rejected; a constant-true predicate invites new accidental branching, which is precisely the disease being cured. `GameMap.layer()` drops its "gate on hasLayers() first" throw-guard contract and instead asserts layers at construction.

### D5: Keep `encodeTerrainTile` as the runtime _mutation_ palette

The full-map procedural bake (`buildTerrainRGBA` fallback in `buildBoardMapTerrainRGBA`, the no-colorizer branch) is deleted, but `encodeTerrainTile` and the `terrain` color block in `render-settings.json` survive with a narrowed contract: they color tiles whose terrain _changes at runtime_ (water nukes today; planned land-modification features next). A static baked sidecar can never answer "what color is this tile now that it became ocean/land," so a procedural per-tile encoder must exist as long as terrain can mutate. `TerrainPass.applyTerrainDelta` keeps using it unchanged.

### D6: Difficulty scaling moves to AI behavior + a population multiplier

The vanilla formula carried all difficulty/type scaling (bot ×⅓, nation ×0.5–1.25). The layered replacement uses three levers, all config-driven from `Config.food()` / a new `Config.aiDifficulty()` surface:

1. **Population multiplier** — a per-(playerType, difficulty) factor applied in the layered `maxTroops` (carrying-capacity) formula, defaulting to 1 for humans.
2. **AI cadence** — the `TribeExecution` economy pulse interval and `NationStructureBehavior` build frequency stretch on lower difficulties (slower AI).
3. **AI precision** — economy/attack target selection (Farmland/Settlement placement via `TribalEconomy`, the resource-targeting bias in `AttackExecution`) degrades on lower difficulties by choosing uniformly from the top-k candidates instead of the argmax (k grows as difficulty drops).

Rationale: cadence and precision are cheap, deterministic (seeded PRNG), and shape _feel_ without distorting the economy's math; the population multiplier is the blunt fallback lever the balance harness can tune. All three are verified with `BalanceRun.ts` seeded runs per difficulty.

### D7: Tests default to layered

`tests/util/Setup.ts` synthesizes layer planes for every test game (the existing `layersFill` machinery becomes the default rather than opt-in), so the sim under test is the shipped sim. Tests that specifically exercised the vanilla arms are deleted with the arms; procedural-shading tests are rewritten against the sidecar path plus the retained delta encoder.

## Risks / Trade-offs

- [`world`'s derived layers are synthetic — crop/metal/oil placement may play badly] → Playtest via the balance harness after retrofit; the map is a folder-delete away from removal if it fails. Its terrain _colors_ are safe (derived from real reconstructed climate, same as majormenor's layers were).
- [Deleting `GameMapSize` touches serialized `GameConfig`/records] → Singleplayer-only fork with no persisted cross-version saves; schema change is acceptable. Verify `Schemas.ts` zod parsing has no lingering size field consumers.
- [AI gets uniformly weaker/stronger once vanilla type multipliers vanish, before D6 lands] → Sequence difficulty scaling in the same change (it is a task, not a follow-up), and gate merge on balance-harness runs at each difficulty.
- [Water-nuke recoloring on sidecar maps was already wrong-ish (procedural water over baked land colors)] → Accepted; the delta encoder is the defined mutation palette and visual coherence of mutated tiles is a future land-modification concern.
- [Retired CLAUDE.md boundary ("byte-identical vanilla") was also a regression-safety net] → Replaced by a stronger invariant: one path, fully covered by the always-layered test suite; MapConsistency enforces data completeness.

## Migration Plan

1. **Data first** (no code behavior change): extend derive-layers, retrofit `world` + `majormenor`, `gen-maps`, land MapConsistency enforcement.
2. **Remove sizes**: baker + loader + UI + `GameMapSize` plumbing; all maps still load both paths' data correctly at Normal.
3. **Collapse the gate**: loader hard-requires sidecars; delete predicates and vanilla arms (sim → config → AI → client UI → rendering), keeping the delta encoder.
4. **Difficulty levers**: population multiplier + cadence + precision, tuned with the balance harness.
5. **Tests + docs**: Setup.ts default-layered, rewrite/delete affected tests, prune en.json keys for deleted UI, rewrite the CLAUDE.md boundary section.

Rollback: the change is a straight-line deletion on top of stable data additions; reverting the code commits restores the dual path (the added sidecars are harmless to vanilla loading).

## Open Questions

- Does `world` stay shipped after playtesting its derived resource maps? (Owner decision post-balance-runs; default: keep.)
- Exact per-difficulty constants for the three D6 levers — to be found empirically with `BalanceRun.ts`, recorded in balance-notes like prior food-economy work.
