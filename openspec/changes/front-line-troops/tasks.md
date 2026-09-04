## 1. The per-tile field

- [x] 1.1 In `src/core/game/AttackImpl.ts`, replace `_troops: number` with `_troopsAt: Map<TileRef, number>` plus a maintained integer sum.
- [x] 1.2 Keep `troops()` returning that sum so every existing reader (HUD, AI, stats, retreat, boats) is unaffected.
- [x] 1.3 Add `troopsAt(tile)`, `addTroopsAt(tile, n)`, `spendAt(tile, n)` and a `frontTiles()` iterator; all integer, all maintaining the sum.
- [x] 1.4 Implement `setTroops(n)` as a proportional rescale of the field (design.md D6), falling back to an even spread over the current front when the field is empty.
- [x] 1.5 `removeBorderTile(tile)` redistributes that tile's troops to its remaining front neighbours rather than discarding them.
- [x] 1.6 Extend `Attack` in `src/core/game/Game.ts` with the new accessors.

## 2. Seeding a commitment

- [x] 2.1 In `AttackExecution.init()`, after the front is seeded from `sourceTiles` (or the whole border), distribute `startTroops` evenly across the seeded tiles, handing the integer remainder out in tile order so the sum is exact and deterministic.
- [x] 2.2 Newly added front tiles (`addNeighbors` during the advance) start at zero troops and are fed by seep.

## 3. Local clash (the reported bug)

- [x] 3.1 Delete the global annihilation loop in `AttackExecution.init()` (`for (const incoming of this._owner.incomingAttacks())`).
- [x] 3.2 Replace it with a per-tick local clash: for each 4-adjacent pair `(a, b)` with `a` in this attack's front and `b` in the opposing attack's front, annihilate `min(troopsAt(a), troopsAt(b))` from both.
- [x] 3.3 Iterate pairs in ascending tile order so the result is deterministic.
- [x] 3.4 Delete an attack only when its total reaches zero, never because another attack is numerically larger.

## 4. Local advance

- [x] 4.1 Pass the attack's force at `tileToConquer` into `Config.attackLogic` in place of the global total.
- [x] 4.2 Subtract the returned attacker loss from that tile's entry.
- [x] 4.3 If the local force is insufficient, skip the tile and re-queue it behind the rest of the front; do not stop the whole attack.
- [x] 4.4 Leave `attackTilesPerTick` (front-width tile budget), terrain, defense posts, fallout, traitor and large-nation modifiers untouched.

## 5. Seep

- [x] 5.1 Add `frontSeepFraction` to `FoodConfig` with a documented default and direction-of-effect comment.
- [x] 5.2 Each tick, share that fraction of every front tile's troops with its front-adjacent neighbours, computed from a start-of-tick snapshot (design.md D5).
- [x] 5.3 Integer arithmetic only; conserve the total exactly (no leaks, no creation).

## 6. AI

- [x] 6.1 `AiAttackBehavior` picks a border segment facing its target and passes it as `sourceTiles`, instead of taking the whole-border path.
- [x] 6.2 Check bot/nation win-rates in the harness; widen the AI's segment if they collapse.

## 7. Tests (mandatory — `src/core`)

- [x] 7.1 `tests/FrontLineTroops.test.ts`: an attack's reported total equals the sum of its field, and equals what it was created with.
- [x] 7.2 Committing at a stretch places troops only on that stretch's frontier.
- [x] 7.3 **The reported bug:** an enemy pushing at one end of a long border is completely unaffected — same troops, still advancing — when the defender counters at the far end.
- [x] 7.4 Countering onto the stretch actually being pressed annihilates both sides locally, bounded by the smaller local force.
- [x] 7.5 A counter far larger than the incoming push reduces only the portion of it that its front touches.
- [ ] (not written — covered indirectly by 7.11 conservation) 7.6 A stretch that exhausts its troops stops taking tiles while other stretches keep advancing.
- [ ] (not written) 7.7 Concentration: the same total committed narrowly takes tiles at a lower per-tile cost than committed wide.
- [ ] (not written) 7.8 Seep: an exhausted stretch regains troops from neighbours over subsequent ticks; at fraction 0 the field does not redistribute.
- [x] 7.9 Determinism: the same seeded game yields an identical field at every tick.
- [x] 7.10 `setTroops` rescales rather than collapsing the distribution (retreat/merge path).
- [x] 7.11 Total conservation: seep, clash and advance never create or leak troops.

## 8. Balance and verification

- [x] 8.1 Full suite green against the known-failing baseline in CLAUDE.md (the five client files).
- [x] 8.2 Harness sweep over `frontSeepFraction`; record in `balance-notes.md`.
- [x] 8.3 Check conquest pace and `firstElim` against the pre-change baseline; front stalling into stalemate is the risk to watch.
- [ ] (not run) 8.4 `tests/perf` — confirm the per-tile bookkeeping and seep pass have not regressed tick time.
- [x] 8.5 `npm run lint` and `npm run format`.
- [ ] (not run) 8.6 Play-verify in the shell: counter one end of a contested border and confirm the enemy push at the other end is untouched.
