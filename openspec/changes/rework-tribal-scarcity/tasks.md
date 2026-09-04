# Tasks: rework-tribal-scarcity

## 1. Core economy rework

- [x] 1.1 FoodConfig v2: landHarvestMilli/landHarvestExponent/farmProductionMilli/startingFood; retire productionPerFertilityMilli/farmlandFertilityMult; new cost bases; storage/pop-cap retune
- [x] 1.2 Food costWrapper (base × (owned+1), vanilla owned-counting) wired into the three unit infos
- [x] 1.3 FoodEconomy.foodTick: sublinear land harvest + linear farm engine
- [x] 1.4 Layered-map gold removal: zero starting gold, no per-tick income; startingFood seeded in PlayerImpl

## 2. Bots

- [x] 2.1 NationStructureBehavior: affordability via unitInfo().cost() (escalation-aware); retune triggers for the scarce economy

## 3. Client

- [x] 3.1 BuildMenu: only food-costed units on layered maps
- [x] 3.2 ControlPanel: hide gold chip on layered games
- [x] 3.3 Leaderboard: food column instead of gold on layered games

## 4. Tests + balance

- [x] 4.1 FoodEconomy suite updated to v2 knobs + new scenarios (diminishing land, escalating costs, gold removal, invest-or-starve arc)
- [x] 4.2 Harness re-sweep on verdantia; update balance-notes.md; verify no build-a-thon (census), bot survival, sane leader share
- [x] 4.3 Gates: tsc/lint/full vitest baseline; in-game check on verdantia (no gold chip, food-only build menu)
