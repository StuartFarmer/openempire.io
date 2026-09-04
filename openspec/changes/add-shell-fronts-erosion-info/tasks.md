# Tasks — #shell fronts, battle damage, richer info box

## 1. Richer tile info box

- [x] 1.1 Refactor the hover into a shared `terrainHoverRows` + a rich
      `openfrontHoverRows` (owner/troops/structure/urban/farm/fertility + terrain).
- [x] 1.2 Add a `damage` row (from `game.tileDamage(tile)`) when present.

## 2. Battle damage ("erosion") conduit

- [x] 2.1 openfront system: a `damage` layer (u32, init-only conduit, like
      `density`).
- [x] 2.2 `GameShellPage`: allocate `damageState` (Uint8) + `damageU32`; capture
      `packedDamageUpdates` in `onSimUpdate`; upload `damage` each `stepSim`.
- [x] 2.3 `views/openfront.wesl`: brown battle-worn wash from `layers::damage`.

## 3. Fronts (force-balance colouring)

- [x] 3.1 openfront system: a `front` layer (u32, init-only conduit) — signed
      balance byte per front tile (128 = even/none).
- [x] 3.2 `GameShellPage`: each `stepSim`, build a per-opponent balance from the
      human's `outgoingAttacks()`/`incomingAttacks()` (attacker vs defender troops,
      localized by `borderSize()`), then mark contested border tiles (from the owner
      buffer) with the encoded balance; upload `front`.
- [x] 3.3 `views/openfront.wesl`: tint front tiles green→white→red by the balance.

## 4. Front labels (+N / -N)

- [x] 4.1 `GameShellPage`: for each human attack, a DOM label at each
      `clusteredPositions()` tile showing the signed troop imbalance, coloured to
      match; track pan/zoom; pooled + culled like the name labels.

## 5. Verify

- [x] 5.1 tsc + lint; `tests/FieldDynamics.test.ts` openfront layer set updated
      (+damage, +front).
- [x] 5.2 Headless: two players fight — the contested border colours by balance,
      front labels show a signed imbalance, and fought-over tiles show the damage
      wash; info box shows the rich readout. Screenshot confirms.
