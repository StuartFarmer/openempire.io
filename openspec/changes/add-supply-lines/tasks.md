# Tasks: add-supply-lines

- [x] 1.1 FoodConfig knobs: supplyRadius (30), supplyDecayPower (3), supplyRefreshTicks (10), warSupplyPenalty (1.0)
- [x] 1.2 SupplyField (execution/utils): bounded multi-source BFS from completed Settlements/Barns over owned passable land; qualityAt(tile); lazy cadence refresh from foodTick + immediate refresh on node-count change
- [x] 1.3 FoodEconomy: farm production × qualityAt(farm tile); fighting consumption × (1 + (1−frontQuality) × penalty) using AttackImpl.frontTile (set in the conquer loop); probeDistance reconnects fronts conquered since last refresh
- [x] 1.4 Tests: quality curve (0.5 at radius), pocket isolation (~0), farm falloff, overextended-army premium, determinism, immediate node refresh, probe reconnection (tests/SupplyLines.test.ts, 9 tests; FoodEconomy tests updated — farms now need a supply node)
- [x] 2.1 Client supply overlay: SupplyOverlayPass (R8 quality texture over a map quad) + SupplyOverlayComputer (client-side BFS mirror) + BuildBar "Supply" toggle → ToggleSupplyOverlayEvent → ViewModeController; verified in-game (toggle works, green wash over supplied territory; screenshots in /tmp/openfront-run/supply-\*.png)
- [x] 3.1 Harness A/B (same seeds, supply neutralized vs on): leader 15.3%→13.8%, gini 0.62→0.58, alive 30–33→39–40, starved ×5.7 — blitz taxed, games stay multipolar (balance-notes v5). Gates: tsc clean, lint clean, vitest at the 5-file baseline (SupplyLines 9 tests + FoodEconomy 30 green)
