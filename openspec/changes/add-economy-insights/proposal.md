# Proposal: add-economy-insights

## Why

Playtest: AIs "make a few farmland plots but nothing substantial" — plain bots (`PlayerType.Bot`, TribeExecution) build nothing at all beyond the starter kit, and nations place at most one plot per AI pulse, capping them at ~35 plots/game regardless of budget. And the player flies blind economically: no way to see food production over time, whether the bottleneck is consumption (build farms) or storage overflow (build barns).

## What Changes

- **Shared tribal economy brain**: extract the plot-building policy into one module used by nations *and* tribe bots. Policy shifts from survival-reactive to **maximizing**: farm toward feeding the population *cap* (not the current population), settle ahead of demand, barn when the stock nears the ceiling. Multiple plots per AI pulse.
- **Econ panel (client)**: a toggleable HUD box charting the player's food over time — stock line against a y-axis scaled to the **current maximum food capacity among all players** (dynamic competitive scale), production/consumption context, and the player's live food **rank** for competitive pressure. Built as a reusable resource-chart component so metal/oil panels later are configuration, not new code.

## Capabilities

### Modified Capabilities

- `tribal-buildings`: bot build policy (maximizing, multi-plot, tribes included).

### New Capabilities

- `econ-panel`: time-series economic HUD with dynamic competitive scaling and rank.

## Impact

- Core: new `execution/utils/TribalEconomy.ts`; `NationStructureBehavior` delegates; `TribeExecution` gains an economy pulse.
- Client: new EconPanel HUD layer (canvas chart, ring-buffer samples from PlayerViews), toggle button; reusable across resources.
- Tests: bot-economy scale assertions (nations AND tribes build substantially); harness census. Panel logic unit-tested where practical.
