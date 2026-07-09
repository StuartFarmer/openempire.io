# Tasks: add-economy-insights

## 1. Bot economy

- [x] 1.1 Extract `TribalEconomy` (triggers + placement scoring + budgeted tryBuild) from NationStructureBehavior; maximizing farm trigger (feed the cap × farmTargetFactor); settlement at 0.75 cap; barn at 0.85 ceiling
- [x] 1.2 NationStructureBehavior delegates (budget 3); TribeExecution pulses the economy (budget 1, ~25-tick cadence)
- [x] 1.3 Tests: nations industrialize (production approaches cap consumption), tribes farm beyond the kit; harness census shows substantially more plots per nation

## 2. Econ panel (client)

- [ ] 2.1 `ResourceChart` component (canvas, ring buffer, dynamic y-max = leader capacity, own-capacity line, rank badge) + food EconPanel instance with HUD toggle
- [ ] 2.2 In-game verify on verdantia: panel toggles, line moves, y-scale tracks leader capacity, rank shown; screenshot

## 3. Gates

- [ ] 3.1 tsc/lint/full vitest baseline; balance-notes entry with new census
