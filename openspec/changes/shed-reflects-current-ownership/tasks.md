## 1. The plane conversion (implemented)

- [x] 1.1 Replace `PlayerFoodShed.potential` and `.cellOf` with module-level shared planes (`potentialPlane`, `cellPlane`) plus a `shedOwnerPlane` tag carrying the smallID of the shed that wrote each entry.
- [x] 1.2 Give each shed the list of tiles it wrote (`tiles`, the BFS visit list) and clear only that slice on refresh, skipping tiles whose tag has since changed (design D2).
- [x] 1.3 Reset the tags when `ensurePlanes` sees a different `Game` (design D3), so a restarted match or the next test does not inherit the previous game's shed.
- [x] 1.4 Add `cellAt` / `hasCell` accessors that answer only for the shed's own player, and point `foodShedPotential` at the plane.
- [x] 1.5 Move the call sites off the Maps: `FoodEconomy.ts` (63, 217), `FarmGrowth.ts` (160), `UrbanGrowth.ts` (314), `EconomyModel.ts` (307).

## 2. Tests

- [x] 2.1 Existing shed/farm/urban/economy suites pass unchanged (59 tests).
- [x] 2.2 `tests/FoodShed.test.ts`: a tile that changes hands leaves the previous owner's shed as soon as the new owner's shed is recomputed — `hasCell` is false for the loser and true for the winner.
- [x] 2.3 `tests/LocalFood.test.ts`: coverage of lost ground is given up at once, and its stock released by the losing player's next refresh. **Writing this found the spec overstated the change**: `hasCell` flips immediately (tick 12), but the sweep is also gated on `peopleByFarm`, which is sampled on the player's own cadence, so the stock survives to tick 20 and stays drawable until then. The requirement now states the shipped rule and `design.md` logs the tightening as an open question.
- [x] 2.4 `tests/FoodShed.test.ts`: two games in one process do not share shed state (design D3) — build a game, refresh a shed, build a second game, and assert the new game's shed is empty where the old one had potential.
- [x] 2.5 Run the full suite; only the CLAUDE.md known-failing baseline may be red.

## 3. Re-baseline determinism

- [x] 3.1 Confirm the change is invisible at the old horizons (verdantia 1500, spqr 3000) and only appears on longer runs — this is why it initially passed unnoticed.
- [x] 3.2 Record the new reference hashes at 4000 ticks (design, Migration step 2).
- [x] 3.3 Add the 4000-tick horizon to `balance-notes.md` as the standard for anything touching the shed or supply field, with a note that 1200-tick checks are insufficient.
- [x] 3.4 Note in `balance-notes.md` that sweep rows and presets recorded before this change are not comparable. (Both landed in `openspec/changes/rework-settlement-ecology/balance-notes.md`, the active economy's living notes — the repo keeps per-change notes and that is the one balance work reads.)

## 4. Balance check

- [x] 4.1 Balance harness re-run at 4000 ticks, seed-prefix `base`. All three reference hashes reproduce EXACTLY on the current build — verdantia `801065038163313`, `2069060768539590`; spqr `4964847657180561` — so the recorded metrics stand: verdantia leader 24.7% / 21.5%, gini 0.716 / 0.631, firstElim 1053 / 803, alive 19 / 15; spqr leader 12.8%, gini 0.312, firstElim 803, alive 15.

  Against the pre-change numbers recorded in `order-independent-shed-tiebreak` 5.1 (leader 21.9→24.7% and 20.8→21.5%, gini 0.698→0.716 and 0.642→0.631): the leader shift is +2.8pp and −0.7pp, against a BETWEEN-SEED spread of 3.2pp in the same two runs. At n=2 that is not distinguishable from seed noise — which is the honest statement, weaker than "within seed noise" and all two seeds can support. Those pre/post pairs also bundle all three shed/economy changes; no snowball baseline was recorded for this change alone.

- [x] 4.2 Fresh `ShellDeltaProbe --map spqr --ticks 4400`: 10.7 / 23.2 / 34.7 ms at ticks 1802 / 2802 / 3802. The win holds directionally — 34.7 against 40.0 pre-change — but an earlier run on this same build gave 32.5 ms at the same point, and the probe is already documented as unable to resolve differences under ~10%. So the defensible claim is "no regression, and the pre-change 40.0 sits outside the noise band", NOT the ~21% originally recorded.
