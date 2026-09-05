# LeanFront Simple Live Runtime Design

> Supersedes the runtime, combat, expansion, and ownership sections of
> `2026-09-04-leanfront-simple-gpu-economy-design.md`. LeanFront Simple remains
> a separate game. The original OpenFront and LeanFront rulesets remain intact.

## Summary

LeanFront Simple will run through the same worker-backed `GameRunner` as
OpenFront Live and original LeanFront. It will use the existing
`AttackExecution`, `AttackImpl`, `RetreatExecution`, ownership rules, neutral
exploration, border generation, nation simulation, and match lifecycle without
copying or translating any of them to shaders.

Only the economy changes. `Settlement` is a player-painted city tile and
`Farmland` is a player-painted farm tile. Their levels provide linearly stacked
capacity. City tiles store and grow idle people; farm tiles store and grow food.
People are the troop resource. People do not eat. Food is globally spendable
energy for building, upgrading, razing, and keeping attacks active.

The CPU worker remains authoritative. A compact WebGPU pass accelerates the
independent per-plot growth calculation, with the same integer CPU calculation
as its fallback and test oracle. This is the same CPU/GPU division already used
by original LeanFront: GPU economy assistance around the real core simulation,
not a second combat implementation.

## Goals

- Make LeanFront Simple a third Live ruleset instead of a field-game fork.
- Guarantee combat and territorial expansion parity by executing the same core
  classes, not by maintaining a similar implementation.
- Keep the simple painted-tile economy: no automatic plot expansion, food
  consumption, logistics, fertility, labor, or separate civilian population.
- Keep whole people and food values at every player-visible boundary.
- Reuse the universal Live startup, spawn, camera, nations, HUD, feedback,
  pause/turbo/restart, statistics/history, and defeat presentation.

## Non-goals

- No GPU port of combat, ownership, AI, pathing, borders, or attack fronts.
- No changes to OpenFront or original LeanFront balancing or economy.
- No new unit hierarchy, generic rules engine, or second game runner.
- No city or farm spreading to adjacent tiles. Only player and nation actions
  create plots.
- No food upkeep for idle people and no starvation or military supply system.

## 1. Runtime and ruleset identity

Add `leanfront-simple` to `RulesetID`, `RULESET_IDS`, and `LIVE_GAMES`.
`ShellSim.worker` constructs its game through `createRulesetConfig` and advances
it through its existing `GameRunner` path. The current field-system registration
for LeanFront Simple is removed from the playable-game path.

The ruleset reuses the shared Live render system and view. Its visual difference
is limited to the city/farm resource overlays and its smaller action set. All
spawn timing, camera flight, mask transition, literal manifest nation spawns,
nation identity, hover/target feedback, borders, and tick scheduling come from
the same worker protocol and shell presentation used by OpenFront Live.

Original `leanfront` remains registered independently and retains its present
GPU economy runtime.

## 2. Exact combat and expansion boundary

`LeanFrontSimpleConfig extends Config`, but it does not override the core combat
knobs or algorithms. In particular, LeanFront Simple uses these existing paths
unchanged:

- `GameRunner` execution ordering and tick cadence;
- `AttackExecution` attack creation, neutral exploration, four-neighbor
  frontier heap, tile priorities, seep, conquest, casualties, and clashes;
- `AttackImpl` integer commitment, reserve, and per-front-tile troop state;
- `RetreatExecution` cancellation delay, return, and applicable malus;
- `PlayerExecution` ownership transfer and disconnected-cluster handling;
- Live border segments, attack targeting, nation attacks, and nation placement.

The implementation must not create a LeanFront Simple attack class, shader
combat pass, ownership pass, or parallel frontier model. With abundant food,
the same initial core state and attack intent must produce the same ownership,
idle troops, active-attack troops, and attack state on every tick in OpenFront
and LeanFront Simple.

Food affordability is the only wrapper around combat. It may limit whether an
attack can begin or remain active, but it does not change how an accepted attack
is executed. Combat parity tests freeze both economy ticks so their different
resource growth cannot obscure the combat comparison.

## 3. Plot model

Reuse existing core units instead of adding new tile types:

- `UnitType.Settlement` is a city plot.
- `UnitType.Farmland` is a farm plot.
- `Unit.level()` is the plot level.

A plot occupies exactly its unit tile. Placing a city or farm on an owned,
passable, plot-empty tile creates one level-one unit. Selecting the same plot
type on the same tile upgrades it by one level. Selecting the opposite type is
rejected until the existing plot is razed. Construction and upgrades complete
immediately.

LeanFront Simple disables the seed-award gate for these two units and assigns
flat food costs per added level. This is a narrow ruleset check in the existing
build validation path; OpenFront and LeanFront retain seed awards and their
current non-upgradable plot rules.

Razing deletes the selected owned plot after a flat food debit. It does not
change ownership. Captured plots retain their type and level. A captured city
starts with zero idle people, while a captured farm discards the previous
owner's stored food and restarts at its seed stock.

Spawn gives every player one free level-one city and one free level-one farm on
the same deterministic legal sites selected by the shared spawn-kit logic.

## 4. Compact economy state

The core game remains authoritative for players, ownership, plot units, and
attacks. The LeanFront Simple runtime owns two integer stocks keyed by the
existing plot unit id:

- city stock: idle people currently stored on that city plot;
- farm stock: food currently stored on that farm plot.

There is no full-map economy buffer and no duplicate ownership model. Each tick
the runtime builds a compact list of current Settlement and Farmland units with
their owner, level, and stock. Deleted and captured units are reconciled by unit
identity and owner before growth.

Player aggregates are derived from the plot records:

- available people = sum of owned city stocks;
- available food = sum of owned farm stocks;
- capacity = sum of `capacityPerLevel * level` for the relevant plot type.

Before growth, the runtime reconciles core changes back into plot storage:

- a core decrease in `player.troops()` is removed proportionally from that
  player's city stocks;
- returned survivors or any other core increase are added proportionally to
  owned city capacity;
- food spent by core actions is removed proportionally from owned farm stocks.

Remainders are assigned by ascending unit id, keeping results deterministic and
integer exact. If a player temporarily owns no city, returned survivors remain
in the core troop balance without growth until the player owns a city again.
If a return puts city stock above capacity, the people are preserved and growth
stops until stock is below capacity; capacity never kills people.

After reconciliation and growth, the runtime writes the aggregate idle-people
and food balances back to the existing player values used by `AttackExecution`,
build validation, the HUD, and nation AI. Active attack troops remain solely in
`AttackImpl`; the economy does not copy or simulate their front state.

## 5. Growth and integer rules

Each plot grows independently using the approved Gompertz equation:

```text
capacity = capacityPerLevel[type] * level
rawGrowth = growthRate[type] * stock * ln(capacity / stock)
growth = stock < capacity ? max(1, floor(rawGrowth)) : 0
nextStock = min(capacity, stock + growth)
```

A newly created or captured plot starts at:

```text
seed = floor(seedFraction * capacityPerLevel[type])
```

An upgrade preserves stock and adds empty capacity; it does not grant a second
seed. All stored stocks, aggregate balances, costs, commitments, and displayed
values are integers. The minimum-one rule lets a nearly full plot reach capacity
without exposing fractional resources.

Initial constants use the already-approved ratios at a scale compatible with
the Live combat engine:

| Parameter               |                           Initial value |
| ----------------------- | --------------------------------------: |
| city capacity per level |                           20,000 people |
| farm capacity per level |                             20,000 food |
| city seed fraction      |                                    0.10 |
| farm seed fraction      |                                    0.10 |
| city growth rate        |                           0.03 per tick |
| farm growth rate        |                           0.06 per tick |
| city level cost         |                              4,000 food |
| farm level cost         |                              3,000 food |
| raze cost               |                              1,000 food |
| active attack cost      | 0.04 food per committed person per tick |

The build and raze costs remain flat across levels. Constants stay together in
the LeanFront Simple config/runtime so later tuning does not change algorithms.

## 6. Food action rules

Food is stored across all owned farm plots and spent as one global balance.
People do not consume it.

- City placement or upgrade costs one city-level price.
- Farm placement or upgrade costs one farm-level price.
- Razing costs one raze price.
- Starting and maintaining an attack costs food according to its current
  committed people. The initial rate matches the existing Live fight-consumption
  rate, but LeanFront Simple does not enable the rest of Live's food/supply
  economy.

Discrete commands are validated and debited in `GameRunner` submission order.
An unaffordable build, upgrade, or raze is rejected without mutation. The
existing `AttackExecution` creates an attack normally; before its first combat
tick, the runtime caps it to the affordable whole-person commitment and returns
any excess people to the player.

Before each later tick, the runtime debits each active attack's energy. If the
full integer charge cannot be paid, the runtime orders that attack to end and
returns its survivors without the voluntary-retreat casualty malus. This forced
energy stop is variant-specific lifecycle handling around `AttackImpl`; combat
resolution itself is unchanged.

## 7. Economy execution seam

Add one ruleset-scoped economy hook at the current `urbanTick` call site.
OpenFront and LeanFront continue calling their existing urban/food economy.
LeanFront Simple calls its `SimpleEconomy` tick and skips `foodTick`, seed
awards, tenure, city-area spreading/recession, farm maturity, supply,
starvation, and food-shed calculations.

The CPU implementation of `SimpleEconomy` is the normative calculator and
fallback. When WebGPU is available, the runtime uploads only the compact plot
records, runs the independent Gompertz calculations, and reads back the compact
integer results. GPU initialization or dispatch failure permanently selects the
CPU calculator for that match. The ruleset has one authoritative state and one
algorithm; WebGPU is an accelerator, not another simulation.

The hook is installed and removed by the runtime lifecycle, following the
existing LeanFront provider pattern. It must not leak into another ruleset or
test game.

## 8. Commands and presentation

The common shell continues to send standard Live spawn, attack, retreat,
pause, turbo, restart, and statistics commands. LeanFront Simple adds only
three worker commands:

- city: build or upgrade a Settlement at the exact selected tile;
- farm: build or upgrade a Farmland at the exact selected tile;
- raze: remove the owned plot at the exact selected tile.

The worker response extends the shared frame with integer people, food, plot
stock/capacity/level for hover, and the latest bounded action rejection. It
does not expose a second map state. Rendering uses the existing Settlement and
Farmland sprites and Live ownership/border/highlight colors.

## 9. Nation behavior

Nation count, literal manifest spawn centers, colors, names, flags, diplomacy,
attack selection, commitment, and combat remain the shared Live behavior.
Nation placement is a map property and is not filtered or relocated by ruleset.

Existing nation structure decisions submit Settlement and Farmland builds
through the same ruleset-specific costs and validation as the human player.
No separate LeanFront Simple bot simulation is added.

## 10. Validation

The implementation must leave these runnable checks:

1. A combat-parity test starts OpenFront and LeanFront Simple from the same
   deterministic core state with abundant food, submits the same attack, and
   compares ownership, idle troops, active attack troops, targets, and retreat
   state tick by tick.
2. Ruleset tests prove both modes instantiate the existing `GameRunner`,
   `AttackExecution`, and `AttackImpl` paths and that OpenFront reference hashes
   remain unchanged.
3. Economy tests cover integer Gompertz growth, caps, level stacking, seeding,
   proportional integer debits, no food consumption, no automatic plot
   creation, capture, raze, and insufficient-food attack termination.
4. GPU/CPU parity tests compare the compact plot calculator over zero, seed,
   near-capacity, upgraded, captured, and large integer cases.
5. Shell tests prove LeanFront Simple selects the worker backend and shares
   spawn timing, camera target, manifest nations, sprites, borders, highlights,
   and commands with Live.
6. The full unit suite, lint, typecheck, build, and strict OpenSpec validation
   pass.

## 11. Migration

This change is implemented under a new OpenSpec change because it alters core
ruleset behavior. Migration is atomic:

1. add the ruleset and economy seam with tests;
2. move LeanFront Simple registration to the Live worker backend;
3. route its city, farm, raze, and attack-energy commands;
4. remove its obsolete field-game pressure/diffusion path from the playable
   registry and delete code that has no remaining caller.

Git history is the archive for the discarded GPU combat experiment. The
original `leanfront` mode is not renamed, replaced, or deleted.

## Risks and controls

- **Ruleset leakage:** install the economy hook only for the runtime lifetime;
  dispose it on restart and verify OpenFront hashes.
- **CPU/GPU drift:** keep one integer CPU oracle and require parity before the
  GPU result is accepted.
- **Plot/core desynchronization:** reconcile by stable unit id and assert that
  every stock belongs to a current plot of the matching type and owner.
- **Accidental combat fork:** source and behavior tests reject a
  LeanFront-Simple-specific attack or ownership implementation.
- **Unplayable scale:** use Live-scale integer opening values and keep only the
  constants tunable; do not add adaptive balancing machinery.
