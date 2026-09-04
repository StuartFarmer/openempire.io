# Tasks: add-food-allocation

- [x] 1.1 FoodConfig knob defaultPopulationShare (0.7); PlayerImpl share + Player interface accessors; player-update field (layered only)
- [x] 1.2 Schemas: food_allocation intent (share 0..1); FoodAllocationExecution; Executor case
- [x] 1.3 FoodEconomy loop rework: split → bank → overflow rebate → feed/grow-or-starve; surplus not banked
- [x] 1.4 (tests/FoodAllocation.test.ts, 6 tests; FoodEconomy/SupplyLines suites green unchanged) Tests: split banks steadily while growing, overflow rebate, all-storage starvation with production, intent clamps + applies, default knob; existing FoodEconomy suite updated where semantics moved
- [x] 2.1 (ControlPanel row 3 slider, desktop+mobile; verified in-game: slider → intent → sim share 0.7→0.3) Client: SendFoodAllocationIntentEvent → Transport; ControlPanel allocation slider (layered maps); en.json; in-game verify
- [x] 3.1 (balance-notes v6: leader 12.5%, starvation halved at default 0.7; gates green) Harness re-run + balance-notes entry; full gates
