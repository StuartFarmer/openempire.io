# LeanFront Simple GPU Economy Design

## Summary

LeanFront becomes a standalone GPU field game derived from the existing
`conquest` system. It keeps that system's ownership, terrain combat, neutral
exploration, attack controls, and razing, while replacing the economy with two
player-painted plot types: cities that grow people and farms that grow food.

People and troops are the same resource. Food is energy: people do not consume
it, and every post-spawn player action costs it. Both resources live on tiles,
grow toward level-scaled capacity with the same Gompertz law, and are aggregated
per player only for action budgeting, UI, and AI.

The current LeanFront CPU/GPU economy mirror and the planned district economy
are superseded. OpenFront remains unchanged.

## Goals

- Keep all authoritative per-tile simulation state on the GPU.
- Make the economy legible from the map: cities contain people; farms contain
  food.
- Let players create economic geography by painting and upgrading individual
  tiles.
- Preserve the existing GPU conquest game's combat, exploration, and razing
  behavior, adding food costs without redesigning those mechanics.
- Use one small ruleset that is cheap to simulate, tune, and learn.

## Non-goals

- People do not eat and cannot starve.
- Plots never spread, migrate, auto-zone, or expand into adjacent tiles.
- There is no fertility, climate yield, maturation, tenure, labor, food shed,
  supply, spoilage, allocation, district, or local-logistics system.
- There are no separate civilian and military populations.
- There is no CPU-authoritative tile state or routine per-tile GPU readback.
- OpenFront's rules and reference behavior do not change.

## Chosen approach

Fork the working `src/client/lab/systems/conquest/` field game into LeanFront and
add only the economy fields and passes described here.

Two alternatives were rejected:

1. Completing the current LeanFront GPU economy port before simplifying it
   would retain sheds, districts, maturity, tenure, labor, supply, and mirroring
   work only to delete them.
2. Keeping the CPU game authoritative and mirroring its economy onto the GPU
   repeats an architecture already measured as slower and prone to state drift.

## State model

### Persistent per-tile fields

| Field       | Type  | Meaning                                       |
| ----------- | ----- | --------------------------------------------- |
| `owner`     | `u32` | Player id; zero is neutral.                   |
| `troops`    | `f32` | People/manpower currently on the tile.        |
| `cityLevel` | `u32` | City level; zero when the tile is not a city. |
| `farmLevel` | `u32` | Farm level; zero when the tile is not a farm. |
| `food`      | `f32` | Food stored on a farm tile; zero elsewhere.   |

`plotType` and `level` remain the semantic model exposed to players. On the
GPU they are encoded by the mutually exclusive `cityLevel` and `farmLevel`
fields: both zero means empty, otherwise the nonzero field supplies both type
and level. This keeps the persistent state at five fields and makes per-player
city/farm-level reductions direct, avoiding another conditional reduction pass.

The existing transient `incursion` field remains for combat. The existing
`pop` field is removed: `troops` is the single people/manpower resource.

Ordinary owned tiles may hold moving or defending troops but produce nothing.
Only city tiles grow troops, and only farm tiles grow food.

### Per-player aggregates

The GPU reduces the fields to these small values after each tick:

- total food;
- total people;
- tiles owned;
- total city levels;
- total farm levels.

The aggregates drive the next tick's budget, the HUD, and AI decisions. They are
not a second authoritative copy of tile state.

## Plot construction and upgrades

Only player or AI intents change a tile's derived `plotType` or `level`:

```text
Empty   --paint city--> City level 1
Empty   --paint farm--> Farm level 1
City n  --paint city--> City level n+1
Farm n  --paint farm--> Farm level n+1
Any plot --raze-------> Empty
```

- Construction requires owned, passable land.
- Painting the opposite plot type is invalid; the existing plot must be razed
  first.
- Each added city level has one flat city-level food cost.
- Each added farm level has one flat farm-level food cost.
- There is initially no gameplay level cap. A level increment that would
  overflow its `u32` representation or make capacity non-finite in the stock
  representation is rejected.
- Building creates only the selected tile. It never changes a neighbor.

`cityLevel` and `farmLevel` may not both be nonzero; a non-farm tile always has
zero food. Intent validation preserves these invariants.

Flat per-level costs make a level exactly one tile-equivalent of added economy.
Expansion buys distributed production; upgrading buys compact, defensible
production. Neither receives a hidden efficiency discount.

## Resource growth

Cities and farms use the same Gompertz form with type-specific parameters:

```text
capacity = capacityPerLevel[type] * level
growth   = growthRate[type] * stock * ln(capacity / stock)
next     = min(capacity, stock + growth)
```

For a city, `stock` is the tile's `troops`. For a farm, it is the tile's `food`.
At an equal fill ratio, increasing the level scales both capacity and production
linearly.

A new plot starts at `seedFraction * capacityPerLevel[type]`. This nonzero seed
is required because Gompertz growth cannot start from zero. `seedFraction`
applies only when a plot is created or a captured farm is restarted. An upgrade
preserves the existing stock and adds empty capacity; it does not grant another
seed.

Growth changes only stock inside an existing painted plot. It never expands a
plot, paints land, moves people, or alters ownership.

## Food and action budgeting

Food is physically stored on farm tiles but globally available to their owner.
There are no local budgets or transport rules.

Every post-spawn action costs food:

- city construction or upgrade: flat cost per level;
- farm construction or upgrade: flat cost per level;
- razing: flat cost per affected tile;
- combat and neutral exploration: cost per committed person per active tick.

Discrete commands are considered in submission order. An invalid or
unaffordable discrete command is rejected without changing state. After those
commands reserve their costs, the remaining food limits the effective attack
commitment. An attack scales down to the affordable commitment instead of
creating debt.

Accepted spending is removed proportionally from every owned farm's stored food.
This keeps the economy global while retaining tile-local stores: losing or
razing a farm still removes its contribution. The deterministic reduction and
debit passes must not use floating-point atomics. Their fixed-point conversion
may leave less than one `1 / 256` quantum per contributing farm because each
tile is quantized independently. A strict single-global-quantum bound would
require a prefix/apportionment pipeline, which is deliberately excluded from
this simple model. Food is never allowed to become negative.

## Tick order

One GPU dispatch advances a tick in this order:

1. Validate and price queued construction, upgrade, and raze intents against the
   previous tick's fresh aggregates.
2. Limit attack commitment to what remains affordable.
3. Debit accepted spending proportionally from owned farms.
4. Apply accepted construction, upgrades, and razing.
5. Run the existing incursion, neutral exploration, ownership, and combat
   passes.
6. Apply capture resets.
7. Grow food on surviving farms and people on surviving cities.
8. Reduce per-player aggregates for the next tick, HUD, and AI.

This order gives each action one consistent budget, prevents debt, and means a
new plot first contributes to the following tick's available budget.

## Conquest and razing

- Ordinary land changes owner under the existing conquest rule.
- A captured city keeps its type and level. Combat determines its surviving
  people/garrison.
- A captured farm keeps its type and level, loses all stored food, and restarts
  from the seed amount.
- Razing clears the plot type, level, and stored resource.
- Raze targeting and ownership eligibility otherwise retain the existing game
  behavior.
- Neutral exploration uses the same conquest path with neutral defense and a
  food-limited attack commitment.
- Terrain affects combat exactly as it does in the existing GPU conquest game;
  it does not affect economic yield.

## GPU boundary

The CPU sends only:

- the standard per-player attack intent (`alive`, `attacking`, `commit`, target
  coordinates);
- a bounded ordered command buffer containing paint, upgrade, and raze intents.

The GPU returns only per-player aggregates and compact command result codes for
UI feedback. It never returns whole tile fields during normal play. Rendering
reads the resident GPU fields directly.

Invalid, unaffordable, opposite-type, non-land, and non-owned paint intents are
no-ops with a result code. If the bounded command buffer fills, remaining brush
commands stay queued on the CPU for a later tick; the CPU does not predict or
apply their consequences.

## Opening state

Each player receives one free spawn kit:

- a small owned territory;
- one level-1 city seeded with people;
- one level-1 farm seeded with food.

There is no separate starting wallet. The spawn kit is the sole exception to
food-priced actions and prevents the zero-food construction deadlock.

## Controls and presentation

- City paint tool.
- Farm paint tool.
- Raze tool.
- Existing attack target and commitment controls.
- Tile hover showing plot type, level, stock, capacity, and current growth.
- HUD totals for people, food, and current food spending.

## Tuning surface

The new economy adds only these parameters:

```text
cityCapacityPerLevel
farmCapacityPerLevel
cityGrowthRate
farmGrowthRate
seedFraction
cityLevelCost
farmLevelCost
razeCost
attackCostPerPerson
```

The existing conquest combat parameters remain. Initial numeric values are a
balance choice, not a rules dependency, and will be selected with the existing
GPU balance harness before release.

## AI

AI uses the same attack and plot command interfaces as a human. Its first
version has three economic rules:

1. Build or upgrade farms when expected food income cannot support its desired
   action rate.
2. Otherwise build or upgrade cities.
3. Attack when stored food can sustain its chosen commitment.

No separate planner, district model, or simulated economy is introduced.

## Verification

Automated checks shall establish that:

- Gompertz growth is monotonic, bounded, and level-linear at equal fill ratios.
- Zero stock is handled safely and new plots begin at the configured seed.
- Upgrading preserves stock and adds exactly one base capacity.
- Growth never changes neighboring plot types or levels.
- A proportional global debit removes the accepted cost without making a farm
  negative, with aggregate error strictly below one `1 / 256` quantum per
  contributing farm.
- Invalid and unaffordable discrete intents change no gameplay field.
- Attack commitment never exceeds the affordable amount.
- Capture and raze obey the specified resource lifecycle.
- The same seed and intent stream produce the same result twice on one GPU.
- The normal tick performs no CPU tile mirror or whole-field readback.
- OpenFront's reference hashes and behavior remain unchanged.

## Migration

Implement the new field game alongside the existing path until its invariant and
GPU replay checks pass. Then switch LeanFront to it and retire the obsolete
LeanFront economy uploader, provider seams, probes, shed/district passes, and
other CPU/GPU synchronization scaffolding. OpenFront is never switched.
