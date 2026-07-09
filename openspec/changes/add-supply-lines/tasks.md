# Tasks: add-supply-lines

- [x] 1.1 FoodConfig knobs: supplyRadius (30), supplyDecayPower (3), supplyRefreshTicks (10), warSupplyPenalty (1.0)
- [x] 1.2 SupplyField (execution/utils): bounded multi-source BFS from completed Settlements/Barns over owned passable land; qualityAt(tile); lazy cadence refresh from foodTick + immediate refresh on node-count change
- [x] 1.3 FoodEconomy: farm production × qualityAt(farm tile); fighting consumption × (1 + (1−frontQuality) × penalty) using AttackImpl.frontTile (set in the conquer loop); probeDistance reconnects fronts conquered since last refresh
- [x] 1.4 Tests: quality curve (0.5 at radius), pocket isolation (~0), farm falloff, overextended-army premium, determinism, immediate node refresh, probe reconnection (tests/SupplyLines.test.ts, 9 tests; FoodEconomy tests updated — farms now need a supply node)
- [ ] 2.1 Client supply overlay: toggleable view shading owned tiles by client-recomputed quality; in-game verify + screenshot
- [ ] 3.1 Harness run + balance-notes entry; full gates
