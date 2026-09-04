# Tasks — Port OpenFront conquest to a terrain game

## 1. The conquest combat (game lib)

- [x] 1.1 `conquest/lib/conquest.wesl`: `terrainMag(elevation) -> f32` (Plains/Highland/Mountain from OpenFront thresholds → 80/100/120, normalized); `terrainSpeed(elevation)` (16.5/20/25); `defenseOf(troops, terrainMag, isNeutral, …)`; `attackerLoss(attackTroops, defenderTroops, mag)` (the `within(def/atk, 0.6, 2)·mag` shape); `conquers(...)`; the attacker+pressure `u32` packing (from `shared::pack`).

## 2. The game layers

- [x] 2.1 `owner.wesl` (u32) — flips to the strongest incursion when it beats the terrain-typed defense.
- [x] 2.2 `incursion.wesl` (u32 packed) — per-tile attack pressure summed from neighbors' troops × commit × target direction.
- [x] 2.3 `troops.wesl` (f32) — mobilize from population toward capacity; lose to pressure per the ratio; conquered tiles garrison from the winning pressure. Same phase + conquest rule as owner.
- [x] 2.4 `pop.wesl` (f32) — grow toward the terrain climate capacity (warmth × moisture × fertility from `layers::temperature`/`water`/`humidity`/`crop`); neutral reverts.

## 3. Manifest + overlay + shell

- [x] 3.1 `conquest/system.ts`: params (the conquest/economy knobs), `players: playerIntent(5)`, `ai: nearestEnemyAI`, `phases` (incursion → owner/troops), scalars (tilesOwned/totalTroops per owner), spawn brushes.
- [x] 3.2 `views/conquest.wesl`: an overlay (`fn color`) — ownership washed over the rendered terrain (`layers::tint`), population brightening, borders flaring.
- [x] 3.3 Register `composeTerrain(conquest)` in the `#shell` game list.

## 4. Verify

- [x] 4.1 tsc + lint; FieldDynamics compile test (conquest composes on terrain). `#shell`: pick Conquest, paint spawns, play — empires expand faster over plains than mountains, fields bigger armies on fertile land; overlay renders over terrain; no page errors.
