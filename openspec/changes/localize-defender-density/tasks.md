## 1. Configuration knobs

- [x] 1.1 Add `FoodConfig` knobs in `src/core/configuration/FoodConfig.ts`: `garrisonCatchment` (bucket size in tiles, default 4), `garrisonRatioMin` / `garrisonRatioMax` (clamp band), and `combatWeightForce` / `combatWeightLocal` (loss blend weights).
- [x] 1.2 Set the **staging defaults** to an exact no-op: clamp band `[1, 1]`, weights `0.6` / `0.4`. These become `[0.2, 24]` and `0.3` / `0.7` in task 5.1, after the no-op suite passes.
- [x] 1.3 Document each knob in place, matching the existing `FoodConfig` comment style (what it controls and which direction moves the game).

## 2. The garrison field (`local-garrison`)

- [x] 2.1 Add the per-player sparse bucket map beside `_density` in `src/core/game/PlayerImpl.ts` (`Map<bucketIndex, sum>`, bucket = `garrisonCatchment` tiles square).
- [x] 2.2 Maintain it incrementally inside `setDensity()` alongside the existing `_urbanAreaMilli += v - prev` — one O(1) map write, no other call sites. Confirm `GameImpl.conquer()` and `relinquish()` need no change because both already route through `setDensity(tile, 0)`.
- [x] 2.3 Implement `garrisonRatio(tile)` using the integer bilinear sample from design.md D2 (four bucket lookups, weights summing to 64, all-integer arithmetic — no floating-point accumulation, no iteration-order dependence).
- [x] 2.4 Implement the zero-density fallback: when the player's total density is 0, return exactly 1 without dividing by zero.
- [x] 2.5 Apply the configured clamp band to the returned ratio.
- [x] 2.6 Expose `garrisonRatio` through the `Player` / economy interface that `Config` already consumes, so `Config.attackLogic` stays a pure function of its inputs (design.md D8).

## 3. Wire combat to the garrison (`openfront-conquest-game`)

- [x] 3.1 In `Config.attackLogic`, replace `defenderTroopLoss = D / max(1, Td)` with the local garrison `(D / max(1, Td)) · garrisonRatio(tileToConquer)`.
- [x] 3.2 Replace the `altAttackerLoss` global average with the same local garrison.
- [x] 3.3 Replace the hardcoded `0.6` / `0.4` blend with the `combatWeightForce` / `combatWeightLocal` knobs.
- [x] 3.4 In `tilesPerTickUsed`, **multiply** the existing `within(D/(5A), 0.2, 1.5)` factor by the garrison ratio — do not substitute the garrison for `D` (design.md D4: the naive substitution collapses onto the clamp floor and makes conquest uniformly faster).
- [x] 3.5 Leave `attackTilesPerTick` (the front-width tile budget), the `TerraNullius` branch, terrain magnitudes/speeds, defense posts, fallout, traitor, and large-nation modifiers untouched.

## 4. No-op verification gate

- [ ] 4.1 Run `npm test` with the staging defaults from 1.2 and confirm the suite is unchanged against the known-failing baseline in CLAUDE.md — no new failures, no fixed-by-accident tests.
- [ ] 4.2 Run a seeded `BalanceRun.ts` before/after and confirm identical outcomes, proving the wiring is genuinely inert before the band opens.
- [ ] 4.3 Commit this no-op state separately so any later test movement is attributable to the reweight, not the plumbing.

## 5. Activate

- [ ] 5.1 Change the defaults to clamp band `[0.2, 24]` and weights `0.3` / `0.7`.
- [ ] 5.2 Re-run `npm test`; triage every changed result as intended-by-design or a genuine regression.

## 6. Tests (mandatory — `src/core` change)

- [ ] 6.1 `tests/LocalGarrison.test.ts`: a uniformly settled player reports ratio ≈ 1 on every owned tile.
- [ ] 6.2 Same file: a player with a dense metro and empty steppe reports a much higher ratio on metro tiles than steppe tiles, with total troops unchanged.
- [ ] 6.3 Same file: a tile one step outside a metro still reports a substantially elevated ratio (the sidestep guard).
- [ ] 6.4 Same file: two tiles equidistant from a metro but on opposite sides of an internal bucket boundary report approximately equal ratios (the aliasing guard from `local-garrison`).
- [ ] 6.5 Same file: the clamp ceiling binds on an extreme concentration; a `[1, 1]` band yields ratio 1 everywhere.
- [ ] 6.6 Same file: zero total density yields exactly 1 and never a non-finite value.
- [ ] 6.7 Same file: determinism — the same seeded game simulated twice yields identical ratios.
- [ ] 6.8 `tests/LocalGarrisonCombat.test.ts`: with all other modifiers equal, conquering a metro tile costs the attacker substantially more troops than conquering a hinterland tile.
- [ ] 6.9 Same file: conquering dense city tiles inflicts far greater total defender losses than conquering a much larger area of hinterland.
- [ ] 6.10 Same file: advance speed is high across empty territory and drops sharply at the population centre.
- [ ] 6.11 Same file: expansion into `TerraNullius` is unchanged.
- [ ] 6.12 Same file: the balance-neutral configuration (`[1, 1]`, `0.6`/`0.4`) reproduces pre-change attacker loss, defender loss, and speed exactly.
- [ ] 6.13 Same file: a city gets progressively cheaper as its outer tiles fall (the `local-garrison` cracking requirement).
- [ ] 6.14 Confirm the inert-food legacy sim tests are untouched, via the 2.4 fallback.

## 7. Balance

- [ ] 7.1 Harness sweep with `tests/perf/balance/BalanceRun.ts` over the clamp band and blend weights across difficulties; record findings in `balance-notes.md` alongside the change, matching `rework-settlement-ecology`'s format.
- [ ] 7.2 Check bot win-rates and whether `AiAttackBehavior` stalls against heartlands it cannot read (design.md Risks).
- [ ] 7.3 If bots regress materially, fold the garrison ratio into `AttackExecution.addNeighbors`'s conquest priority so fronts flow around dense ground — land it in this change rather than deferring.
- [ ] 7.4 Measure total urban area over a run to check the compounding interaction with `tile-damage` (conquered heartlands staying worthless); record as a balance finding against the damage/heal rates.
- [ ] 7.5 Fix the shipped knob defaults from the sweep and resolve design.md's Open Questions on the band and weights.

## 8. Wrap-up

- [ ] 8.1 `npm run lint` and `npm run format`.
- [ ] 8.2 Play-verify in the shell via the `run-openfront` skill: confirm a front visibly stalls at a population centre and races across open ground.
- [ ] 8.3 Update design.md's Open Questions with the resolved answers (shipped band/weights, whether the conquest priority change landed).
