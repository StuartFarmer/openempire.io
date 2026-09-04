# Tasks — rework-ai-war-strategy

## 1. War intelligence foundations

- [x] 1.1 Create `src/core/execution/utils/WarIntel.ts` with `totalPower`, `committedShare`, `foodRunwayTicks`, and `effectiveMaxTroops` (D1/D2), documented against the design
- [x] 1.2 Add `warShareLeanScale`, `warShareRichScale`, `warShareRichRunwayTicks`, `campaignPopFloor`, `campaignMaxStalls`, `threatPowerRatio`, `threatDriftPerPass`, `starvingRunwayTicks`, `surgeGrowthFactor` to `FoodConfig` (interface + `FOOD_DEFAULTS`) with doc comments
- [x] 1.3 Scale `deployableTroops` in `EconomyModel.ts` by food runway (D8)
- [x] 1.4 Unit tests: `effectiveMaxTroops` clamping, `foodRunwayTicks` edge cases (zero consumption), war-share scaling endpoints and legacy-equivalence at scales = 1

## 2. Readiness gates and send caps

- [x] 2.1 Switch `hasReserveRatioTroops`, `hasTriggerRatioTroops`, `calculateAttackTroops`' reserve target, and `donateTroops`' keep-reserve to `effectiveMaxTroops` (D1)
- [x] 2.2 Switch `troopSendCap`'s strongest-neighbor scan to `totalPower` (D2)
- [x] 2.3 Tests: food-bound nation passes gates it previously failed; committed neighbor still counts at full strength in the send cap

## 3. Campaign persistence

- [x] 3.1 Add campaign state to `AiAttackBehavior`; open on successful player-target `sendAttack`, tick through in `maybeAttack` after the reserve gate (reinforce / stall / close per D3)
- [x] 3.2 Tests: reinforcement bypasses the trigger lottery while gaining tiles with stable population; campaign closes on population drop below `campaignPopFloor`; campaign closes after `campaignMaxStalls` stalls; campaign closes on target death

## 4. Target-selection strategies

- [x] 4.1 Implement `joinWar` (dogpile, D4) and insert into Medium/Hard/Impossible strategy orders
- [x] 4.2 Implement threat drift in `maybeAttack` (D5)
- [x] 4.3 Implement `starving` strategy with `resourceFocus`-scaled chance (D6.1) and insert into Medium/Hard/Impossible orders
- [x] 4.4 Implement trend memory + `isSurging` veto in `weakest`/`starving`; extend `findVictim` with the committed-share window (D2/D7)
- [x] 4.5 Tests: dogpile fires on third-party wars only; threat drift reaches Hostile under sustained differential and leaves comparable neighbors alone; starving strategy respects runway threshold and FFA guard; surging veto skips a fast grower; victim accepts a committed, declining enemy

## 5. Attack-front aiming

- [x] 5.1 Weight `attackSegment`'s aim-tile draw toward enemy Farmland/Settlement proximity by `resourceFocus` (D6.2), keeping TerraNullius uniform
- [x] 5.2 Test: with resourceFocus 1 and a farmland cluster near one end of the front, aim tiles near the cluster are drawn proportionally more often (seeded statistical assertion)

## 6. Verification

- [x] 6.1 Full test suite green (minus the known-failing baseline); update any existing AI-behavior test expectations broken by the new gates
- [x] 6.2 Balance harness sanity: `BalanceRun.ts` on verdantia across difficulties — nations expand, fight, and do not starve themselves; note before/after territory + population curves in the change

### 6.2 results (2026-07-30, verdantia, 25 nations, 40 bots, 3000 ticks, 2 seeds each)

- **Hard**: 23–25/25 nations alive, first elimination tick 753–853, mean final leader share 14.9%, mean gini 0.60, top population ~380–510k, totalStarved ~60k (modest vs population — no war-driven famine collapse). Area∝Pop^1.43 (R²=0.97).
- **Medium**: 23–25/25 alive, firstElim 853, mean leader share 17.2%, gini 0.64, totalStarved ~62k.
- Reading: wars now actually happen (eliminations by tick ~800, gini 0.6+ shows real differentiation) while the demographic guard holds — starvation stays a small fraction of the living population and no nation self-exhausts. The war-share cap's collapse mode did not reappear.
