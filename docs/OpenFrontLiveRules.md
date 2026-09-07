# OpenFront Live — rules, formulas, and complexity reference

Snapshot: **6 September 2026**, working tree based on commit `a195261e3`.

This describes **OpenFront Live in this repository**, selected as `openfront`, using the root `src/core` CPU simulation. It is not a description of the current public OpenFront.io website, LeanFront's GPU economy, or the independent `simplefront/` copy. Defaults below are the actual numeric literals and executed branches in this checkout; comments and historical design documents sometimes describe older rules.

Purpose: make the existing game understandable before deciding what to keep, simplify, or replace in SimpleFront. This is a source-based reference, not a balance verdict or a proposal to change OpenFront. No gameplay code was changed to create it.

## Reading guide

Start with the complexity overview and opening rules. Then read the economy and combat sections together: people are also soldiers, so military decisions directly affect food production and population recovery. The inherited-system appendix is separate because its presence in the code does not mean it operates in an ordinary Live match.

The final sections contain a complete inventory of the 73 `FoodConfig` defaults and a simplification worksheet. Formulas use plain-text mathematical notation for easy searching and editing. Source links are relative to this document; their line anchors refer to this snapshot.

- [Complexity overview](#complexity-overview)
- [Scope, defaults, time, and arithmetic](#scope-defaults-time-and-arithmetic)
- [Map and opening rules](#map-and-opening-rules)
- [Survival, encirclement, and victory](#survival-encirclement-and-victory)
- [Food, population, farms, and urban land](#cpu-food-population-farms-and-urban-land)
- [Combat, supply, and transports](#combat-territory-logistics-and-transports-current-root-openfront-live)
- [AI and diplomacy](#cpu-opponents-and-diplomacy)
- [Inherited systems and their activation gates](#legacy-mechanics-retained-definitions-and-reachability)
- [All 73 tuning defaults](#tuning-reference-every-foodconfig-default)
- [SimpleFront simplification worksheet](#simplefront-simplification-worksheet)

## Complexity overview

The game does not have one population-growth equation and one attack equation. It has several coupled spatial systems:

| System            | State it remembers                                                        | Main dependencies                                                    |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Population        | Idle people, deployed people, boats, fractional birth credit              | Food delivered locally, deaths, combat, transport                    |
| Farming           | Farm nuclei, per-tile maturity, field membership, expansion credit        | Climate, available labor, urban occupation, damage                   |
| Food distribution | Nearest-farm territories, connected regions, households, rural labor      | Ownership, nuclei, distance, city footprint                          |
| Storage           | Camp stock and individual farm granaries                                  | Maturity, tile tenure, production, allocation, spoilage, requisition |
| Urban growth      | Housing/density footprint, nuclei, growth choices, persistent land use    | Living people, local food access, supply, water, crowding, damage    |
| Stability         | Per-tile tenure                                                           | Occupancy/maturity, abandonment, capture                             |
| Military          | Front-tile troop allocations, queues, retreat state, boats                | Commitment, frontage, opposition, terrain, food, supply              |
| AI                | Relationships, campaign history, threat estimates, seed-placement choices | Almost all of the above                                              |

New feedback loop:

```text
spend energy → city tile → increases max population capacity
spend energy → farm tile → increases max food/energy capacity

population → follows logrithmic growth curve to max capacity
food/energy → follows logrithmic growth curve to max capacity
```

There are **73 food/economy/AI/frontage tuning entries**, plus attack formulas, terrain coefficients, placement gates, AI thresholds, diplomacy timers, and the inherited unit catalog outside that configuration. This is a count of configuration entries, not 73 independent active mechanics: some entries are legacy or only affect planning/display.

## Scope, defaults, time, and arithmetic

### Which implementation runs

`createRulesetConfig("openfront")` constructs the ordinary `Config`. The OpenFront runtime supplies a no-op `beforeTick`; it does not replace the CPU urban tick with a GPU economy. `PlayerExecution` calls `urbanTick`, which runs the food, seed-award, tenure, and urban-footprint rules described below. Sources: [rulesets](../src/core/game/Rulesets.ts), [runtime registry](../src/client/games/registry.ts#L17), [OpenFront runtime](../src/client/games/openfront/runtime.ts#L3), [player tick](../src/core/execution/PlayerExecution.ts#L89), [urban tick](../src/core/execution/utils/UrbanGrowth.ts#L80).

The shell creates this match configuration:

| Setting                             | Live shell value                                                 |
| ----------------------------------- | ---------------------------------------------------------------- |
| Mode                                | Singleplayer, free-for-all                                       |
| Difficulty                          | Medium                                                           |
| Human players                       | One, named `You`                                                 |
| Bots                                | Initially 50; shell control clamps to 0–400                      |
| Nations                             | All authored nations for the selected map (`nations: "default"`) |
| Random human spawn                  | Off; click to choose                                             |
| Gold/troop donation                 | Off                                                              |
| Infinite gold/troops, instant build | Off                                                              |
| Human attack commitment             | Initially 25% of idle troops                                     |
| Ordinary tick duration              | 100 ms: 10 ticks per simulated second                            |

The page constructor starts non-ambient sessions on SPQR; choosing a system or map can replace that selection. The current SPQR manifest is 2048 × 1024 with 55 authored nations; Verdantia is 512 × 256 with 25. Bot count is **additional** to nations, not another name for them. A requested participant can still fail to find a legal spawn. Sources: [worker configuration](../src/client/webgpu/ShellSim.worker.ts#L139), [shell defaults](../src/client/GameShellPage.ts#L371), [map initialization](../src/client/GameShellPage.ts#L434), [nation creation](../src/core/game/NationCreation.ts#L48), [SPQR manifest](../resources/maps/spqr/manifest.json), [Verdantia manifest](../resources/maps/verdantia/manifest.json).

### Tick order matters

For each core tick:

1. Existing active executions run in their stored order. During spawning, only executions explicitly allowed in that phase run.
2. Newly queued executions are initialized. They generally do not receive their first `tick()` until a subsequent tick; one-shot actions may act in `init()` itself.
3. Inactive executions are removed and initialized ones are appended.
4. Player updates are collected; a state hash is emitted every 10 ticks.
5. Pending water changes are processed, combat damage heals, unrenewed tenure decays, and the tick counter increments.

Thus this is not a simultaneous mathematical update of every player. A capture or AI action can affect what a later execution sees in the same tick. Per-player economic order is separately described below. Sources: [core tick](../src/core/game/GameImpl.ts#L452), [turn runner](../src/core/GameRunner.ts#L135).

Normal wall-clock scheduling waits `max(0, 100 − timeSpentThisTick)` milliseconds. Turbo uses zero delay, not bigger formula time steps. A slow machine runs fewer simulated ticks per real second. The decorative ambient game adds a spawn timer and prewarms 220 ticks; do not mistake that older background state for a fresh human match. Sources: [worker timing](../src/client/webgpu/ShellSim.worker.ts#L47), [ambient setup](../src/client/webgpu/ShellSim.worker.ts#L107), [worker loop](../src/client/webgpu/ShellSim.worker.ts#L667).

### Notation and precision

Unless explicitly stated otherwise, a rate is **per simulation tick**.

- `floor(x)`: round downward. `round(x)`: JavaScript `Math.round`.
- `clamp(x,a,b) = min(b,max(a,x))`.
- `Σ`: sum over the indicated tiles, units, farms, or attacks.
- Food uses **1,000 milli-food = 1 displayed food**.
- Layer bytes are 0–255; normalized values divide by 255.
- Maturity and combat damage commonly use 0–1,000 internally.
- A tile is a grid cell, not automatically one square kilometre.

Troop balances and camp food use integer/BigInt storage, but many intermediate calculations, per-front forces, growth weights, and demographic credits use JavaScript floating-point numbers. Do not infer that every equation is integer-only from older architecture prose. `toInt(x)` is `BigInt(floor(x))`, with explicit finite sentinels for infinities. Sources: [conversion](../src/core/Util.ts#L327), [player state](../src/core/game/PlayerImpl.ts#L205).

Random choices use seeded `PseudoRandom` streams: splitmix32 seeds an sfc32 generator, warmed up 12 times. `nextInt(a,b)` floors both endpoints and samples with an exclusive upper bound; `chance(n)` means a 1-in-`floor(n)` integer draw for ordinary positive integer odds, **not** probability `n`. Simulation results depend on seeds, turn inputs, iteration order, and the number of draws. The shell generates a fresh game ID, so fresh sessions are not automatically the same seeded experiment. Source: [PRNG](../src/core/PseudoRandom.ts#L1).

## Map and opening rules

### Terrain and resources

Coordinates are integer `(x,y)`, tile index `t = y × width + x`. Most expansion and path-distance rules use four neighbors (north/east/south/west); some border-cluster logic uses eight. Manhattan distance is `|dx| + |dy|`; Euclidean distance is `sqrt(dx² + dy²)`. Do not substitute one for another in formulas.

The terrain byte contains land, shoreline, and ocean flags plus a 5-bit magnitude:

| Land magnitude | Terrain class |
| -------------- | ------------- |
| 0–9            | Plains        |
| 10–19          | Highland      |
| 20–30          | Mountain      |
| 31             | Impassable    |

Impassable land rejects spawning, farm/town placement, and ordinary land conquest. Non-land is classified as ocean by `terrainType`, although the map separately tracks water connectivity and ocean flags. Sources: [terrain decoding](../src/core/game/GameMap.ts#L275), [terrain classification](../src/core/game/GameMap.ts#L427).

Every playable map must supply `layers.bin` and a terrain-color sidecar. The six layer planes are crop, metal, oil, temperature, humidity, and water. The active food formulas use crop, temperature, humidity, and water; there is no active metal/oil mining or spending economy. The separate low-resolution map is for pathfinding, not a different playable ruleset. Sources: [map loader](../src/core/game/TerrainMapLoader.ts#L92), [layer format](../src/core/game/MapLayers.ts).

**Visible climate is not necessarily simulation climate.** The shell can re-derive colors and seasonal terrain on the GPU, but the CPU economy reads the loaded layer bytes. Its farm climate suitability is not a seasonal temperature simulation. Visual climate sliders, elevation, hydro, and seasonal rendering should not be confused with `FoodConfig` gameplay overrides. Sources: [worker's layer readout](../src/client/webgpu/ShellSim.worker.ts#L190), [terrain derivation](../src/client/GameShellPage.ts#L1711), [farm climate formula](../src/core/execution/utils/FarmGrowth.ts).

### Spawn area

For a requested center `(cx,cy)`, candidate spawn cells satisfy:

```text
(x − (cx − 0.5))² + (y − (cy − 0.5))² ≤ 4²
```

An unobstructed interior spawn has **52 tiles**. Manual spawning keeps the legal, unowned, passable land cells in that footprint; a partially obstructed footprint can be smaller. Random spawning tries at most 1,000 centers, requires the entire returned footprint to be legal, and keeps the center at least 30 Manhattan tiles from other recorded spawns. The 30-tile test belongs to random placement, not the manual footprint filter. Sources: [spawn footprint](../src/core/execution/Util.ts#L152), [half-cell disk](../src/core/game/GameMap.ts#L600), [spawn selection](../src/core/execution/SpawnExecution.ts#L211).

Every player type starts with **2,000 idle people**. Player construction sets gold to **zero directly**, and camp food to 4,000 displayed units. A successful spawn establishes:

- A core marker and one full urban-density tile of 10,000 housing units. This is housing, **not** 10,000 starting people.
- One free farm nucleus at 1,000 maturity, if a legal candidate offset exists. Preferred offsets are `(±3,0)`, `(0,±3)`, `(±2,±2)`, then cardinal adjacent cells. The candidate with highest climate suitability wins; ties preserve candidate order.
- Food reset to 4,000. The free kit bypasses ordinary seed affordability checks.

The generic nearest-legal-tile farm fallback in `SpawnExecution` is inside the **simple-plot** branch, not OpenFront's branch. An unusually cramped OpenFront spawn can therefore lack its kit farm. Re-spawning clears old owned territory, the old density field, and tribal plots before re-founding; random-spawn mode prevents a second spawn. Sources: [initial population](../src/core/game/GameImpl.ts#L668), [player balances](../src/core/game/PlayerImpl.ts#L205), [founding kit](../src/core/execution/SpawnExecution.ts#L111).

In human singleplayer, spawn phase ends when the human selects a location. The ordinary singleplayer runner does not start a countdown. The configured spawn duration is 100 ticks for singleplayer, 150 for random multiplayer, and 300 otherwise; `SpawnTimerExecution`, when installed, ends spawning only when `ticks > duration`. Sources: [runner initialization](../src/core/GameRunner.ts#L100), [human spawn](../src/core/execution/SpawnExecution.ts#L84), [timer](../src/core/execution/SpawnTimerExecution.ts), [durations](../src/core/configuration/Config.ts#L704).

Default human and nation immunity lasts through spawn phase and the first **50 ticks after spawn ends** (5 simulated seconds). The human duration can be overridden; nation immunity remains separately configured. This is a global start-relative timer, not a fresh 50-tick clock per player. Importantly, AI attackers bypass immunity in the attack-eligibility logic, and Bots have no immunity; see the combat section for the exact attacker/target distinction. Sources: [immunity defaults](../src/core/configuration/Config.ts#L233), [global timer](../src/core/game/GameImpl.ts#L1034), [attack eligibility](../src/core/game/PlayerImpl.ts#L1974).

### Placement, deletion, and action access

Ordinary construction checks the unit is enabled, the player is alive, and its price is affordable. In OpenFront, Settlement and Farmland additionally need their respective awarded seed. Both have zero food price; that does **not** mean unlimited placements. AI and human actions pass through these core gates. The shell's build mode sends `build_unit` directly. Sources: [build gates](../src/core/game/PlayerImpl.ts#L1532), [shell build input](../src/client/GameShellPage.ts#L1515).

A tribal plot anchor must be your own passable land, have no existing plot, have no remaining combat damage, and not already be a claimed field tile. A new Farmland also cannot occupy a full urban-density tile. Barn has a defined enum/config entry but is explicitly refused by the unit placement switch. These are placement checks; the growth automata add further land-use restrictions described below. Source: [placement switch and plot gate](../src/core/game/PlayerImpl.ts#L1675).

Settlement and Farmland have no construction duration. For timed legacy structures, construction creates the unit, marks it under construction, initializes the countdown, then completes on a later tick when the countdown is already zero; the displayed configured duration is not the entire intent-to-completion latency. Source: [construction](../src/core/execution/ConstructionExecution.ts#L44).

Voluntary deletion checks ownership of both unit and tile, land, life/active state, and the player deletion cooldown. The default cooldown is 300 ticks; deletion is marked for `currentTick + 300` and becomes overdue only when the current tick is **greater** than that mark. It is not an instant clear-ground operation. OpenFront has no Simple-plot raze-food charge. Sources: [deletion execution](../src/core/execution/DeleteUnitExecution.ts#L28), [deletion timestamp](../src/core/game/UnitImpl.ts#L270), [timer defaults](../src/core/configuration/Config.ts#L651).

## Survival, encirclement, and victory

### What counts as alive

`isAlive = ownedTileCount > 0`. Separately, the food tick relinquishes all land when total surviving population (idle + attacks + transport passengers) reaches zero. Having zero **idle** troops while soldiers remain deployed does not trigger that population-extinction rule. On a dead player's next player execution, the simulation removes its gold, non-nuclear units, and alliances, marks that execution inactive, and records the death. Already flying nuclear units are exceptions to unit cleanup. Sources: [alive predicate](../src/core/game/PlayerImpl.ts#L675), [population extinction](../src/core/execution/utils/FoodEconomy.ts#L438), [death handling](../src/core/execution/PlayerExecution.ts#L437).

### Automatic pocket capture

Ownership can change through encirclement checks, not only through an attack buying each tile. The player execution rechecks changed borders approximately every 20 ticks (strict `ticks − lastCalc > 20`, with an initial player-specific phase); players below 100 tiles bypass that time gate. It clusters border tiles using eight-neighbor connectivity, then uses four-neighbor territorial flood fills for the actual transfer.

- The largest border cluster is considered surrounded when there is one surrounding enemy, no unowned adjacent gap, no ocean-shore/map-edge escape, and the enemy's bounding box encloses it.
- Other border clusters use a looser enemy-bounding-box enclosure test and are exempt at any shore or map edge. This is a geometric heuristic, not a formal all-paths blockade test.
- The recipient is the neighboring enemy with the largest outgoing attack against the victim; if none has such an attack, it is the enemy with the largest counted shared border.
- A connected territory pocket is flood-filled and transferred. If it is the victim's entire remaining territory, the player-conquest callback also runs.

Sources: [cluster scheduling](../src/core/execution/PlayerExecution.ts#L111), [encirclement and recipient selection](../src/core/execution/PlayerExecution.ts#L159), [bounding-box test](../src/core/Util.ts#L216).

### Winning

Victory is checked every 10 core ticks outside spawn phase. Let:

```text
eligibleLand = mapLandTiles − falloutTiles
territoryPercent = 100 × ownedTiles / eligibleLand
```

Free-for-all requires **strictly more than 80%**, not merely 80%. Teams require strictly more than 95%, summing team members' tiles. A configured minute timer or the 170-minute hard simulated-time limit instead awards the current land leader; the special bot team is not awarded a team victory. The core also retains a ranked 1v1 condition for one remaining connected human, but the Live shell does not select ranked mode. Exact ties in sorted territory retain input order rather than invoking a special tiebreak formula. Sources: [win checks](../src/core/execution/WinCheckExecution.ts#L32), [thresholds](../src/core/configuration/Config.ts#L689).

Elapsed game time is `(ticks − spawnEndTick) / 10`, clamped to zero before the start. Thus turbo accelerates a time-limit victory in real time. A winner being recorded does not itself remove all game executions; inherited code explicitly supports some after-game actions. Source: [elapsed time](../src/core/game/GameImpl.ts#L1041).

## CPU food, population, farms, and urban land

This section describes the root `src/core` CPU economy. It excludes `simplefront/`, LeanFront, and provider replacements. Executable expressions and literal defaults take precedence over historical comments. The economy calls `urbanTick` for every living player handled by `PlayerExecution`; the call itself does not check for layered maps, despite older file comments. A whole-tick provider can replace it, but the rules below are the ordinary CPU path. Sources: [player tick](../src/core/execution/PlayerExecution.ts#L48), [urban tick](../src/core/execution/utils/UrbanGrowth.ts#L79), [default configuration](../src/core/configuration/Config.ts#L895).

### Units, state, and update order

One tick is nominally 100 ms, or 10 ticks per second. Food production and consumption use milli-food: 1,000 milli-food = 1 displayed food. Farm maturity is an integer from 0 to 1,000. Tenure uses milli-ticks: an increment of 1,000 represents one tick of tenure. Map climate/crop layers are bytes normalized by division by 255. `density(tile)` is stored housing, not the tile's actual living headcount; ordinary city growth fills it with `popPerDensity` or clears it to zero. Living people are idle troops plus outgoing-attack troops plus TransportShip troops. Sources: [tick duration](../src/core/configuration/Config.ts#L261), [density setter](../src/core/game/PlayerImpl.ts#L1297), [maturity setter](../src/core/game/PlayerImpl.ts#L1356), [food ledger](../src/core/execution/utils/FoodEconomy.ts#L76).

Per-player sequence:

1. Reconcile structures with their tile owners. Captured structures transfer; DefensePosts are destroyed. Dead players stop here.
2. Obtain military supply and food-shed caches, refreshing if due.
3. Advance farm maturity and attempt field expansion.
4. Sum current tilled-tile production and storage capacity.
5. Apply supply attrition to outgoing attacks, then calculate military food need from surviving attack troops and boat troops.
6. Feed civilian food regions, then civilians outside all sheds (the camp).
7. Feed deployed troops from the remaining camp stock and field stores.
8. Apply old age, civilian starvation, military starvation, and births; publish food/population counters. Zero total population relinquishes all land.
9. Ratchet seed awards using the resulting population.
10. If a core exists, accrue tenure/recalculate its housing bonus, grow city tiles, then remove excess city tiles.
11. At the end of the overall game tick, heal tile damage, perform cadence-based vacancy tenure decay, and increment the tick counter.

This order matters: this tick's new tenure affects next tick's food-storage calculation; farm growth reads the current shed snapshot, while food production reads maturity after farm growth; the shed's source maturity and workers may remain stale until its next refresh. Sources: [urban tick](../src/core/execution/utils/UrbanGrowth.ts#L79), [food tick](../src/core/execution/utils/FoodEconomy.ts#L76), [game tick](../src/core/game/GameImpl.ts#L452).

### Literal defaults used by these formulas

These are base defaults, before food presets or live overrides. [FOOD_DEFAULTS](../src/core/configuration/FoodConfig.ts#L365) is the authority; `Config.food()` merges live overrides over it.

| Group                  | Default values                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eating                 | `idleConsumptionMilli=10`, `moveConsumptionMilli=20`, `fightConsumptionMilli=40` per person/tick                                                      |
| Natural harvest        | `landHarvestMilli=0`, `landHarvestExponent=0.5`                                                                                                       |
| Population and storage | `basePopulation=100`, `startPopulation=2000`, `baseStorage=5000` food, `startingFood=4000` food, `defaultPopulationShare=0.7`                         |
| Decay and demographics | `decayNumer=1`, `decayDenom=2000`; `avgLifespanTicks=100`, `baseBirthRate=0.02`, `birthSurplusCap=2`, `minFedForLife=0.05`                            |
| Farm growth            | `farmGrowthRate=0.08`, `farmSenesceRate=0.05`, `farmSeedMilli=50`, `fieldClaimMilli=300`                                                              |
| Climate                | temperature breakpoints `0.15, 0.45, 0.75, 0.95`; `waterWiltN=0.1`, `waterFullN=0.55`, `humidityWeight=0.5`                                           |
| Worked field           | `farmersPerFieldTile=200`, `fieldTileYieldMilli=20000`, `fieldTileStorageMilli=500000`; patch cost `50000`, patch drive cap `3000`, `wFieldWater=0.8` |
| Food shed              | `foodShedRadius=18`, `foodShedPower=3`, `wFoodShed=1.5`; shares `supplyRefreshTicks=10` with military supply                                          |
| City placement         | `urbanGrowthRate=0.1`, `popPerDensity=10000`; `wFood=1`, `wWater=0.8`, `wShore=0.5`, `wLogi=1`, `wCong=1.8`                                           |
| Tenure                 | `tenureCapMultMax=3`, `tenureHalfTicks=1200`, `tenureSaturationRatio=0.9`, `tenureDecayMilli=100`, `wNucleusTenure=0.5`                               |
| Founding ladder        | `scalingExponent=1.26`, `settlementLadderBasePop=4000`, `settlementLadderTaper=2`                                                                     |
| Damage/supply          | `combatTileDamageMilli=400`, `tileDamageHealMilli=4`, `supplyRadius=10`, `supplyDecayPower=3`, `warSupplyAttrition=0.05`                              |
| Display scale          | `tileKm=20`: one tile reports 400 km²; this conversion does not change food, labor, or distance calculations                                          |
| Dormant legacy knobs   | `farmProductionMilli=80`, `populationPerSettlement=3000`, `capturedPlotRazeChance=0.5` have no active root CPU economy consumer                       |

The food tuning allowlist includes every default key, including dormant ones. Being exposed in the tuning panel does not establish that a knob affects the current simulation. [Allowlist](../src/core/configuration/FoodConfig.ts#L520), [override handling](../src/core/configuration/Config.ts#L901), [area conversion](../src/core/configuration/Config.ts#L938).

### Climate, maturation, and field expansion

Let `T`, `H`, `W`, and `C` be temperature, humidity, water, and crop bytes divided by 255. Temperature suitability is zero for `T <= tempBaseN` or `T >= tempMaxN`, rises linearly from zero to one between the base and optimal-low temperatures, equals one through the optimal-high temperature, then falls linearly to zero at the maximum. Moisture is `humidityWeight*H + (1-humidityWeight)*W`. Water suitability is zero through `waterWiltN`, one at or above `waterFullN`, and linear between. Overall climate suitability is:

```text
S = min(temperatureSuitability, waterSuitability, C)
```

Thus good soil cannot compensate for cold or drought. Crop appears again in production, so soil-limited steady production is approximately quadratic in crop: when `S=C`, yield is proportional to `C²`. [Climate calculation](../src/core/execution/utils/FarmGrowth.ts#L62), [temperature factor](../src/core/execution/utils/FarmGrowth.ts#L30), [water factor](../src/core/execution/utils/FarmGrowth.ts#L49).

Each completed Farmland nucleus with zero maturity is initialized to 50. For a healed, staffed tile, let `M = maturityMilli/1000`:

```text
if S >= M:
    candidate = min(S, M + farmGrowthRate*M*ln(1/M))
else:
    candidate = max(S, M + farmSenesceRate*(S-M))
nextMilli = round(1000*candidate), clamped to [0,1000]
```

The Gompertz slope is defined as zero at `M<=0` or `M>=1`. Climate is a ceiling, not an extra multiplicative growth-rate factor. A tile already claimed or permanently Field-zoned has an additional floor of `farmSeedMilli`. An unstaffed ranked field instead sets maturity to `max(seed, round(milli-max(1,senesceRate*milli)))`. Damaged tiles skip maturation and senescence entirely. A positive sub-claim tile without a Farmland nucleus or Field zone remains inert. [Farm tick](../src/core/execution/utils/FarmGrowth.ts#L149).

Reaching 300 maturity permanently marks a tile `Field`. Fallow fields retain this zone and settle no lower than 50; they regrow in place when staffed. Urban land similarly keeps its Urban zone when housing disappears. Consequently the two growth processes do not normally convert each other's developed ground. This supersedes older comments about fields dying below the threshold and reverting to wild. [Maturity and zoning](../src/core/game/PlayerImpl.ts#L1356), [field authority](../src/core/game/PlayerImpl.ts#L1389).

Each nucleus also has a process-local patch-credit counter. During maturation, the code collects that cell's healed, non-fallow field tiles based on their pre-maturation membership. It then sums their **post-maturation** maturity if tilled or not yet ranked, caps the increment at 3,000, and adds it to credit. A below-threshold nucleus cannot supply patch credit until its field membership is recognized on a later tick. Once credit reaches 50,000, expansion requires the cell's refresh-time residents to satisfy:

```text
residents >= (collectedFieldTileCount + 1)*farmersPerFieldTile
```

This is residence-based; redistributed workers in `laborByFarm` do not satisfy the expansion gate. If there are insufficient residents or no eligible site, credit waits at exactly the patch cost. Otherwise one tile is placed, the cost is subtracted, and any remaining credit is retained. There is at most one placement per nucleus per tick. Eligibility: a 4-neighbor of a collected field tile; owned, passable land; no density, Urban zone, plot, damage, positive maturity, or old shed ranking; climate suitability at least 0.3. Candidate weight is:

```text
S * (1 + wFieldWater*(W + wShore*shore))
```

`shore=1` for shoreline or ocean-shore tiles. Selection uses a PRNG seeded by player ID, tick, and nucleus tile. The patch begins at maturity 300 and is one **1×1** tile, despite an obsolete “2×2” phase comment. [Patch placement](../src/core/execution/utils/FarmGrowth.ts#L280).

Numerical examples: on viable soil a seeded farm's first step is `50 -> 62` milli-maturity. A fully mature single-tile field accrues approximately 1,000 credit/tick, hence about 50 ticks per patch; at the 3,000 cap it takes about 17 ticks. With 2,000 local residents the nominal staffing/expansion limit is ten field tiles. Integer maturity changes the asymptote: iterating the exact default recurrence from 50 with `S=1` settles at **994**, because the next fractional increment rounds away. It does not naturally reach 1,000. This is especially relevant to the tenure eligibility test below; the example is an evaluation of the formula, not a claim that every map's farms have `S=1`.

### Food sheds, residence, and labor coverage

Completed, owned Farmland nuclei are the food-shed sources. CPU multi-source BFS walks owned, passable land through 4-neighbors to `ceil(3*foodShedRadius)` steps: 54 by default. Each tile belongs to the nearest nucleus; equal-distance ties go to the lower nucleus tile reference. It inherits that source's maturity at refresh time. Food potential is:

```text
potential(tile) = sourceMaturity / (1 + (distance/foodShedRadius)^foodShedPower)
```

A mature nucleus gives potential 1 at its tile, 0.5 at 18 steps, and 1/28 at 54 steps. Potential is the nearest source's contribution, not a sum of every nearby farm. Touching flood waves are joined into connected feeding regions; transitive chains of farms can connect a region much larger than a single 54-step catchment. Cells remain distinct for residence/coverage bookkeeping. Sources: [decay](../src/core/execution/utils/FoodShed.ts#L242), [shed recomputation](../src/core/execution/utils/FoodShed.ts#L296).

Sheds refresh on first use or when `tick-lastCalcTick >= max(1,supplyRefreshTicks)`. The recorded time is staggered by player ID: `max(0,tick-((tick+smallID)%period))`. Ordinary period is ten ticks. Source ownership and maturity, headcount allocation, rankings, and region connectivity therefore use a cadence snapshot. `peekFoodShed` is the observer accessor that does not refresh. Shared per-tile planes are tagged by player ID: when another player's refreshed flood overwrites a captured tile, the loser's accessor stops reporting it. Ownership alone is not explicitly checked by `cellAt`/`cellIndexAt`; do not assume every capture instantly invalidates every cached result. [Cache accessor](../src/core/execution/utils/FoodShed.ts#L269), [cell lookup](../src/core/execution/utils/FoodShed.ts#L174), [observer accessor](../src/core/execution/utils/FoodShed.ts#L265).

At refresh, total housing `Htot` is the sum of all stored density. Urban civilians are `min(idle,Htot)` and occupancy is `urbanCivilians/Htot` (zero if no housing). Every reached housing tile contributes `floor(density*occupancy)` residents to its nearest farm. Rural civilians are `max(0,idle-urbanCivilians)` and split evenly across **all** nuclei, with the division remainder going to the lowest-ref farm. Thus rural people have no location constraint; fully housed people outside all sheds enter the camp cohort. This rural allocation plus unconditional staffing of every nucleus provides a bootstrap, but there is no protected minimum population: a nation can still die out.

The initial pool is copied into `peopleByFarm` for feeding and expansion. Labor then follows a separate allocation:

1. A field's staffing need is `(1 + numberOfClaimedOrFieldZonedSpreadTiles)*200`.
2. Cap overstaffed cells at their need, collect excess workers, and hand them to underfilled cells in tile-ref order.
3. Every nucleus is tilled even with zero workers. Rank its spread tiles by descending maturity then ascending tile reference; staff up to `max(0,floor(laborPool/200)-1)` of them.
4. Ranked but unstaffed tiles are fallow. Newly claimed, not-yet-ranked tiles have a grace period: they can ripen/contribute patch credit, but are absent from the actual tilled-yield set until refreshed.

There is **no feeding-region filter on the surplus-worker redistribution loop**. Despite the “same shed network” comment, surplus from one region can staff a farm in a disconnected region if the source population was inside some shed. The nearby-field test proves nearby redistribution but does not establish a distance limit. [Recompute and allocation](../src/core/execution/utils/FoodShed.ts#L296), [fallow definition](../src/core/execution/utils/FoodShed.ts#L203), [labor tests](../tests/FarmLabor.test.ts#L53).

### Food production, allocation, and stores

Every tile in the current tilled set that still resolves to a shed cell contributes:

```text
yieldMilli = round((maturityMilli/1000)*(cropByte/255)*fieldTileYieldMilli)
storageCapacityMilli = round(fieldTileStorageMilli*g(tileTenureMilli))
g(t) = t/(t + tenureHalfTicks*1000), with g(0)=0
```

The CPU sums these per-tile integers by dense farm-cell index in Int32Arrays. Capacity is counted even if maturity is zero. There is no farm-level multiplier, worker-efficiency multiplier, district bonus, or damage factor in this yield loop. Damage freezes farm development but does not itself switch off existing tilled production. Capture changes maturity/ownership separately. Natural land harvest is `floor(fertilitySum^landHarvestExponent * landHarvestMilli)` and goes to camp; fertilitySum is the sum of owned crop **bytes**, not normalized crop. It is zero production by default. [Ledger](../src/core/execution/utils/FoodEconomy.ts#L76), [fertility accounting](../src/core/game/GameImpl.ts#L864).

At default rates a tile at maturity 1 and crop 255 yields 20 food/tick, enough for 2,000 idle people. A soil-limited tile with crop 128 and settled maturity 502 yields `round(.502*(128/255)*20000)=5040` milli-food/tick: roughly 504 idle people. One idle person eats 0.01 food/tick, a boat passenger 0.02, and an attacker 0.04.

Civilian headcounts are rescaled each food tick to current idle people. With `headScale=idle/idleAtRefresh` when the denominator is positive, each cell gets `floor(peopleAtRefresh*headScale)`. The code preserves the refresh-time camp fraction, then assigns per-cell rounding dust to the first feeding region. Each connected region sums all its cells' people, production, capacity, and stored food. Distant regions cannot share their field production/stores for civilian meals, but all regions can draw national camp stock as a last resort.

For each region, with production `P`, need `N=people*idleRate`, share `a`, starting stock `S`, and capacity `K`:

```text
offered = floor(P*a)
stock = S + (P-offered)
if stock > K:
    offered += stock-K
    stock = K
if offered < N:
    draw min(stock,N-offered), then national camp stock if needed
fed = 1 when N=0; otherwise max(0,1-unpaidNeed/N)
stock *= (1-decayNumer/decayDenom)
```

Remaining stock is placed into member granaries in ascending tile order, filling each to its individual capacity before the next. The same fed ratio is written to every cell in the region and later used to order urban recession. Regions are processed sequentially, so access to scarce camp reserves depends on deterministic region insertion order. Granaries belonging to a disappeared nucleus are swept once it is absent from both `peopleByFarm` and the shed's coverage check; cached stale cells can keep old stock drawable until refresh. [Food tick](../src/core/execution/utils/FoodEconomy.ts#L76), [lost-stock regression](../tests/LocalFood.test.ts#L174).

There is no additional rebanking step for **unused offered food**. If offered food exceeds mouths, that part disappears after this tick; capacity overflow is offered to civilians, not retained for later military requisition. The slider therefore controls how much production attempts to enter storage. It is not a hard civilian ration: with share zero, food goes into stock and can immediately be withdrawn to feed civilians; with no capacity, overflow feeds them. Defaults offer 70% and bank 30% before these corrections. [Allocation clamp](../src/core/game/PlayerImpl.ts#L1276), [allocation regressions](../tests/FoodAllocation.test.ts#L78).

Example: a region producing 20 food/tick, feeding 1,000 civilians (10 food), share 0.7, and spare storage capacity offers 14 and banks 6. The unused 4 offered food is not added back. An army can requisition the remaining roughly 5.997 food after spoilage, plus preexisting stocks. With zero storage capacity, the 6 overflows to civilians and the army receives no newly banked stock even though total production exceeds civilian consumption.

Camp civilians then apply the same share/bank/overflow/withdrawal logic to natural harvest and `_foodMilli`, capped at `baseStorage*1000`; their food need comes after other regions have had access to the camp. Camp storage uses bigint and floors spoilage through integer division. Regional storage uses floating-point Numbers and subtracts `stock*decayNumer/decayDenom` without flooring, so regional stocks become fractional milli-food. The “all food arithmetic is integer” comments only hold for yield contributions, not the entire ledger. The default fractional decay factor is 0.9995 per tick (approximately 26% lost over 600 ticks without other flows).

After civilians and spoilage, military requisition first draws the camp stock, then granaries sorted by descending remaining stock and ascending tile reference for ties. It can draw across regions. `warFed=clamp(paid/need,0,1)` (one when no need). There is no initial proportional tax on farm production; that file-header description is obsolete. `food()` reports the truncated sum of camp plus granary stocks in displayed food, whereas generic `addFood`/`removeFood` only mutate camp stock. [Stock API](../src/core/game/PlayerImpl.ts#L1239), [ledger](../src/core/execution/utils/FoodEconomy.ts#L76).

### Demographics, housing, and death

Before meals, each outgoing attack loses `floor(troops*(1-frontSupplyQuality)*warSupplyAttrition)` troops; TransportShips are not included in this attrition loop. Military need uses the surviving attack troops. At default zero supply this removes 5% of an attack per tick before starvation or combat losses. Food demography then uses these pre-demography counts: `I=idle`, `F=fighting`, `B=boat troops`, `P=I+F+B`.

```text
baseDeathFraction = 1/avgLifespanTicks
extraStarvationFraction(fed) = min(1,
    baseDeathFraction*(1/max(minFedForLife,fed)-1))
foodCapacity = floor(totalProductionMilli/idleConsumptionMilli)
surplusRatio = totalProductionMilli/max(1,totalCivilianNeed+militaryNeed)
expectedBirths = P*baseBirthRate*clamp(surplusRatio,0,birthSurplusCap)
```

Four separate fractional-credit accumulators retain rounding remainders for births, old age, civilian starvation, and military starvation. Add expected counts, floor accumulated credits, and subtract the integer result. Old age contributes `I*baseDeathFraction` and affects only idle people. Civilian starvation expectation sums `regionPeople*extraStarvationFraction(regionFed)`, plus the camp. Military starvation expectation is `(F+B)*extraStarvationFraction(warFed)`. The civilian old-age and famine requests are separately capped at original idle count, then troop removal clamps to remaining troops. Deployed famine losses are split across attacks/boats by independently rounded proportions; the sum of actual per-unit cuts can differ from the aggregate `warStarved` counter. The integer birth count is capped to `max(0,foodCapacity-P)` **before deaths are applied**, and residual birth credit is reset when headroom truncates births. Births go into the idle pool after deaths. Sources: [food tick](../src/core/execution/utils/FoodEconomy.ts#L76), [troop mutation](../src/core/game/PlayerImpl.ts#L1430).

Storage can prevent starvation but does not increase the birth capacity or surplus ratio, which depend on current production. Births use total population including soldiers, though only civilians age. At perfect feeding, default old-age mortality is 1% of idle people/tick. At 50% feeding, extra famine mortality is another 1%; at <=5% feeding it is 19% extra, for approximately 20% total civilian mortality per tick before births/rounding. A fully unfed deployed cohort has 19% famine loss and no old-age loss. This is much faster turnover than the older “6,000-tick lifespan” comment suggests.

With 1,000 idle people, zero deployment, and 20 food/tick production: need is 10 food, surplus ratio is 2, births accrue 40 and old age 10, producing 1,030 people if headroom permits. With a food capacity of exactly 2,000 and an initial population of 2,000, birth headroom is zero, so 20 old-age deaths produce 1,980. On the next comparable tick headroom permits 20 births while about 19 people die; the implementation approaches/oscillates near a food ceiling rather than holding every tick exactly at it.

`maxTroops` is a separate reported housing/power quantity:

```text
(basePopulation + urbanArea*popPerDensity + tenureCapacityBonus)
    * difficultyPopulationMultiplier
```

There is an infinite-troops human override. **This is not a clamp in `foodTick` or `addTroops`.** Population can outgrow housing and becomes rural for shed allocation. The food-derived capacity is an all-idle-equivalent production ceiling; it does not discount ongoing military consumption or local disconnection. National births can therefore coexist with one region's starvation. [Housing calculation](../src/core/configuration/Config.ts#L943), [birth and starvation regression](../tests/FoodEconomy.test.ts#L338).

The flow exposed to UI/stats floors production and total food need separately to whole displayed food; `starvedTroops` counts civilian plus military starvation, excluding old age and supply attrition. `population` is recalculated from actual survivors plus births. When this total reaches zero and the player has spawned and still owns land, all its territory is relinquished.

### Tenure and urban footprint

The tenure curve is `g=t/(t+1200000)` at defaults. A full city tile's housing multiplier is `1+2*g`; its bonus is `floor((multiplier-1)*10000)`. At 1,200 ticks of tenure it provides 10,000 extra housing (20,000 total); the asymptotic maximum is 30,000. The current core's growth-pace multiplier is `1+0.5*g`, or 1.25 at half-saturation and approaching 1.5. [Tenure curve](../src/core/execution/utils/TileTenure.ts#L33), [capacity multiplier](../src/core/execution/utils/TileTenure.ts#L40), [pace multiplier](../src/core/execution/utils/TileTenure.ts#L112).

After food/population updates, full city tiles accrue 1,000 tenure milli-ticks only if healed and national population is at least 90% of `basePopulation + round(urbanArea)*popPerDensity + previousTenureBonus`. Underfilled city tiles do not accrue. Existing tenure holds when demand falls. The housing bonus is then recomputed from all full city tiles. Farms accrue 1,000 tenure milli-ticks when completed, healed, positive in maturity, and `maturityMilli >= round(S*1000) > 0`.

Crucially, that farm tenure loop iterates **Farmland units only**. Ordinary spread field tiles do not receive tenure from the CPU path, although their tenure is included in the storage sum if some other mechanism sets it. Also, the default `S=1` rounding plateau at maturity 994 fails the `>=1000` tenure test. Therefore “every mature tilled tile grows 500 food of eventual storage” describes a formula potential, not ordinary guaranteed storage behavior. A nucleus that does accrue tenure has capacity 250 food at 1,200 tenure ticks and approaches 500; a normal newly spread field tile remains at zero tenure/capacity. [Tenure tick](../src/core/execution/utils/TileTenure.ts#L64).

Vacancy decay runs at game ticks divisible by `max(1,supplyRefreshTicks)`: subtract `tenureDecayMilli*period` from a healed tile unless it has positive owner density or a Farmland unit on it. At defaults this subtracts one tick of tenure every ten ticks. Field spread maturity/zoning does not count as occupancy for this test. Ownership transfer or relinquishment deletes tenure immediately. [Vacancy decay](../src/core/game/GameImpl.ts#L838).

The urban target is based on living population, not production:

```text
A = round(urbanArea)
peoplePerTargetTile = popPerDensity + (A>0 ? tenureCapacityBonus/A : 0)
target = max(numberOfDistinctCoreAndCompletedSettlementNuclei,
             floor(livingPopulation/peoplePerTargetTile))
```

A founding nucleus contributes a one-tile national target floor even when population is small. The floor does not guarantee that a tile actually gets placed at each individual town. If `urbanGrowthRate>0`, growth requests `min(gap,max(1,floor(gap*urbanGrowthRate*corePaceBoost)))` whole tiles. Contraction uses the same expression without the core boost. `urbanGrowthRate=0` freezes both. This is gap-closing pacing, not the logistic `rate*A*(1-A/K)` in old comments. [Target](../src/core/execution/utils/UrbanGrowth.ts#L121), [growth](../src/core/execution/utils/UrbanGrowth.ts#L149), [contraction](../src/core/execution/utils/UrbanGrowth.ts#L322).

Candidates lie inside the current military supply field and must still be owned/passable, not already full city, not field/Field-zoned, and undamaged. Let `Dlocal` be average four-neighbor density normalized by `popPerDensity` (map-edge average uses available neighbors). Placement weight is:

```text
base = wFood*C + wWater*(W+wShore*shore) + wLogi*supplyQuality - wCong*Dlocal
weight = base * min(1,wFoodShed*foodPotential)
```

Both base and weighted score must be positive. Candidate weights are calculated before deposits and remain fixed during that tick's placement loop. The frontier initially touches an existing full city, a core, or a completed Settlement (including nucleus tiles themselves). Weighted random selection sorts frontier tiles by tile reference before each draw; new deposits open their eligible neighbors. A city tile receives 10,000 housing and clears sub-claim crop maturity. Maximum loop guard is 4,096 deposits per player/tick. [Suitability](../src/core/execution/utils/UrbanGrowth.ts#L58), [placement](../src/core/execution/utils/UrbanGrowth.ts#L171).

Contraction sorts existing density entries by rounded feeding percentage (lowest first), then number of full city neighbors (fewest first), then tile reference. Tiles outside all food districts receive feeding rank 100, so they are not preferentially removed as starving. Only the living core tile is explicitly protected; individual Settlement tiles are not protected, despite the national nucleus-count target floor. Removed tiles retain Urban zoning. [Contraction](../src/core/execution/utils/UrbanGrowth.ts#L322).

### Capture, fire, and persistent land

Conquest transfers Field/Urban zoning, clears the old owner's density/maturity, resets tenure, and initializes captured Field ground to seed maturity (50); captured Urban ground remains an empty Urban lot. Relinquishment instead removes zones and returns land to wild. Combat damage is applied by attack code rather than by every call to `conquer`. Damage stacks to 1,000, heals by four per game tick, and emits burn visuals. One 400-damage hit takes 100 healing steps; a fully damaged tile takes 250. Damage blocks new patches/city placement and pauses maturation/tenure accrual. Captured standing tribal plots transfer to their captor; `capturedPlotRazeChance` is dormant. DefensePosts are the structure exception and are destroyed. Sources: [conquest](../src/core/game/GameImpl.ts#L864), [relinquish](../src/core/game/GameImpl.ts#L915), [damage](../src/core/game/GameImpl.ts#L758), [healing](../src/core/game/GameImpl.ts#L783), [capture reconciliation](../src/core/execution/PlayerExecution.ts#L48), [persistent-ground regressions](../tests/PersistentTilesBurn.test.ts#L57).

### Founding seeds and AI economic valuation

Each post-food tick updates peak population. The nth founding threshold is:

```text
round(settlementLadderBasePop*n^(scalingExponent*settlementLadderTaper))
= round(4000*n^2.52) at defaults
```

The first four thresholds are 4,000; 22,943; 63,739; and 131,599 people. Each newly crossed threshold banks one Settlement seed and one Farmland seed. A while-loop grants multiple crossed thresholds in one tick. Falling population does not remove seeds; recovering below a previously awarded peak earns nothing. Territory earns no seeds. Default seed banks start at zero; actual building decrements the corresponding bank with a floor at zero so preplaced starter plots can exist without awards. Normal build validation requires a seed; the separate simple-plot mode bypass is outside this CPU-rich economy. [Threshold](../src/core/execution/utils/SeedAwards.ts#L26), [award tick](../src/core/execution/utils/SeedAwards.ts#L39), [build and spending](../src/core/game/PlayerImpl.ts#L1453), [build gate](../src/core/game/PlayerImpl.ts#L1532).

`EconomyModel` is a planner heuristic, not a second authoritative population simulation. It scores candidates in population-ticks:

| Calculation           | Actual expression / rule                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Farm ramp             | With `m0=seed/1000`, `target=min(S,0.95)`: zero if target<=m0, otherwise `ln(ln(m0)/ln(target))/farmGrowthRate`                                                                                             |
| Planning horizon      | `round(2*farmRampTicks(S=1))`; defaults approximately 102 ticks                                                                                                                                             |
| Food value            | `milliFood/idleConsumptionMilli` population-ticks                                                                                                                                                           |
| Steady tile yield     | `S*C*fieldTileYieldMilli`, before simulation rounding                                                                                                                                                       |
| Field scout           | 7×7 Chebyshev-radius-3 window; count owned/passable, non-density, non-field, plot-free, climate-claim-viable tiles, including site if eligible                                                              |
| Labor scout           | Sum stored density in radius-6 square; subtract commitments of farm nuclei within that same Chebyshev radius; clamp to zero                                                                                 |
| Farm district score   | `min(roomYield,(residents/farmersPerFieldTile)*(roomYield/roomTiles))/idleRate * max(0,horizon-ramp)`                                                                                                       |
| Border discount       | Nearest other player's land within Chebyshev radius 5 gives `distance/6`; no other player in that window gives 1. Neutral land does not discount                                                            |
| Existing commitments  | Count maturity>=claim per shed cell; per nucleus use `min(residents,((count ?? 1)+1)*farmersPerFieldTile)`                                                                                                  |
| Town labor relief     | Farm score with `residents+popPerDensity` minus farm score with current residents                                                                                                                           |
| Room deficit          | `max(0,floor(foodCapacity/popPerDensity)-eligibleUnbuiltSupplyTiles)`                                                                                                                                       |
| Settlement room value | Count extra owned/passable/non-city/non-Farmland-nucleus tiles outside current supply inside Manhattan radius `ceil(supplyRadius)`; value `min(deficit,newRoom)*popPerDensity*horizon - costMilli/idleRate` |

Sources: [horizon](../src/core/execution/utils/EconomyModel.ts#L41), [ramp](../src/core/execution/utils/EconomyModel.ts#L57), [field room](../src/core/execution/utils/EconomyModel.ts#L113), [district score](../src/core/execution/utils/EconomyModel.ts#L168), [border discount](../src/core/execution/utils/EconomyModel.ts#L193), [labor relief](../src/core/execution/utils/EconomyModel.ts#L221), [commitments](../src/core/execution/utils/EconomyModel.ts#L297), [free residents](../src/core/execution/utils/EconomyModel.ts#L323), [urban room](../src/core/execution/utils/EconomyModel.ts#L357), [settlement score](../src/core/execution/utils/EconomyModel.ts#L391).

Planner approximations matter when assessing complexity. The ODE ramp is not an exact integer-tick prediction (its regression permits 30% or eight ticks of error). Labor scouts count housing without occupancy and omit rural people. Field-room scouting does not reproduce persistent Urban zoning, damage, or reachable patch-front constraints. Urban-room scoring uses food capacity instead of the actual living-population target, ignores field-spread/zoning/damage/food-shed eligibility, and tests congestion at zero. Settlement scouting is a geometric approximation to a path flood. Town labor relief assumes one town's full `popPerDensity` housing is additional workers, although real Settlement construction does not create that many people. The source header's claim that model and simulation “can never disagree” is therefore too strong. [Ramp comparison test](../tests/EconomyModel.test.ts#L136).

`TribalEconomy.tryBuild(budget)` repeatedly chooses a positive candidate, queuing ConstructionExecutions and locally reserving seeds until those builds initialize. One chosen pair counts as one placement action even though it queues two plots. Lone-farm scores are district score times border discount. Lone-Settlement score is urban-room relief plus nearby farm-labor relief, discounted for rival proximity. With both seeds, it samples at most ten town anchors and six farm offsets per anchor in a Chebyshev standoff of two to four tiles. Paired farm value assumes `effectiveResidents+popPerDensity`; the pair must add value over the same farm alone. Pair score is `(townValue+pairedFarmValue)*min(townDiscount,farmDiscount)`. Sort candidates descending and pick uniformly among the difficulty's top K. Sources: [planner](../src/core/execution/utils/TribalEconomy.ts#L70), [candidate selection](../src/core/execution/utils/TribalEconomy.ts#L83), [pair partner](../src/core/execution/utils/TribalEconomy.ts#L216).

Ordinary sampling makes 40 attempts: alternate near an existing same-type plot (spread radius 7) and owned border (radius 6). Town attempts alternate near farms outside military supply or with labor relief, and borders, within radius 4. Candidates are rechecked with `canBuild`. Economic activity requires a living player and all tribal structure types enabled. [Farm-site sampling](../src/core/execution/utils/TribalEconomy.ts#L263), [town-site sampling](../src/core/execution/utils/TribalEconomy.ts#L293), [activity gate](../src/core/execution/utils/TribalEconomy.ts#L340).

The same economic model exposes army constraints: staffing reserve is `tilledTileCount*farmersPerFieldTile`. Food runway uses truncated displayed total stock divided by last tick's displayed consumption; it is infinity when displayed consumption is zero. The permitted war share interpolates from `maxWarShare*warShareLeanScale` to `maxWarShare*warShareRichScale` as runway rises to `warShareRichRunwayTicks`; defaults are 10% at zero runway and 35% at 500 ticks. Additional deployable troops are `max(0,floor(livingPopulation*scaledShare)-alreadyDeployed)`. These are AI decision inputs, not hard player restrictions imposed by `foodTick`. [Staffing need](../src/core/execution/utils/EconomyModel.ts#L244), [scaled share](../src/core/execution/utils/EconomyModel.ts#L268), [deployable count](../src/core/execution/utils/EconomyModel.ts#L280), [runway](../src/core/execution/utils/WarIntel.ts#L41).

### Complexity and possible simplification boundaries

The feedback chain is climate -> maturity and permanent land use -> shed assignment and worker coverage -> regional production/stores -> civilian/military feeding -> national births and local famine -> housing/urban placement -> worker geography -> farm expansion. Tenure adds a second feedback loop through housing and storage; seed awards and AI valuations consume the resulting population and geography. Refresh-time workers, live headcount scaling, current maturity, cached housing bonus, and persistent zones operate on different clocks.

The largest conceptual complications are three different population measures (living people, housing, food capacity), three distribution rules (cell residence, globally redistributed labor, connected-region civilian food), separate military requisition, multiple integer/float rounding conventions, and planner approximations of the same systems. The broad per-tile cost comes from shed flooding/ranking, farm maturation, tilled production, and supply-wide urban candidate scans; region bookkeeping and demographics are mostly per-farm/per-player.

Possible independent simplification seams, offered as options rather than changes:

- Choose whether crop is both a maturity ceiling and yield multiplier, and whether Gompertz timing materially improves play over a fixed ramp.
- Choose one coherent spatial pooling boundary for residents, work, and meals, or explicitly retain the current distinct meanings.
- Decide whether housing is a cap, a visual consequence of people, or an AI power estimate; the current code uses it in different ways.
- Decide whether storage should age only nuclei or every worked tile, and whether strict ceiling attainment should govern accrual given integer maturity.
- Make offered-but-uneaten production and storage overflow an explicit rule before changing the allocation slider or army supply.
- Keep permanent land-use zoning as a standalone mechanic while simplifying maturation, vacancy, and tenure.
- Derive planner inputs from authoritative placement/pool summaries where exact prediction is wanted; keep the remaining geometric heuristics explicit.
- Remove or label dormant knobs and obsolete comments before balancing, so measurements correspond to active mechanics.

Evidence inspected includes FoodEconomy, FoodAllocation, LocalFood, FarmGrowth, FarmLabor, FoodShed, UrbanGrowth, TileTenure, SeedAwards, EconomyModel, and PersistentTilesBurn tests. Those tests support particular behaviors under their own overridden fixtures; they do not make historical comments authoritative or prove that all literal-default interactions above have dedicated coverage. No gameplay changes are part of this documentation.

## Combat, territory, logistics, and transports (current root OpenFront Live)

These rules describe the executable root `src/core` combat used by OpenFront Live. A tick is 100 ms of simulated time; replay speed changes wall time, not these formulas. Below `clamp(x,a,b)=min(max(x,a),b)`, `floor` rounds down, `A` is the remaining committed attack force including reserve, `a` is force stationed at the particular candidate tile, `D` is the defender's **idle** troop pool, and `N_a,N_d` are the players' owned tile counts. The numerical combat formulas do not read defender density at the contested tile. [Tick duration](../src/core/configuration/Config.ts#L261), [idle pool](../src/core/game/PlayerImpl.ts#L1426), [clamp](../src/core/Util.ts#L37).

### Commitment and legal targets

- Live's human attack slider starts at 25%. On a click the worker requests `max(1,round(idleTroops × sliderRatio))`, checks land attack eligibility first, and otherwise tries a transport. A land click seeds a border segment nearest the click; the clicked tile is not an explicit final destination for the resulting attack. These supplied amounts supersede Config's fallback amount. [Live slider](../src/client/GameShellPage.ts#L384), [Live intent construction](../src/client/webgpu/ShellSim.worker.ts#L731).
- If the intent omits troops, ordinary attacks default to `idle/20` for Bots and `idle/5` for everyone else; boats default to `floor(idle/5)`. Starting a normal attack clips the request to available idle troops, removes that quantity from idle, and puts `max(0,floor(request))` into attack reserve. Removal/addition of idle troops uses `BigInt(floor(value))`; an ordinary fractional request therefore removes and deploys the same integer. Boats store their constructor troop parameter as a number, so legacy fractional boat requests can differ from the floored idle deduction; Live's rounded request avoids that case. [Defaults](../src/core/configuration/Config.ts#L863), [attack initialization](../src/core/execution/AttackExecution.ts#L124), [attack reserve](../src/core/game/AttackImpl.ts#L40), [idle rounding](../src/core/game/PlayerImpl.ts#L1430), [integer conversion](../src/core/Util.ts#L327), [boat constructor](../src/core/game/UnitImpl.ts#L62).
- Land eligibility excludes self, water, impassable ground, and prohibited player targets. An owned enemy tile is eligible if the players share a border anywhere. A neutral tile must connect to one's territory through passable unowned land within a Manhattan-distance-200 search from that tile. Human attackers respect the target's immunity; Nation and Bot attackers ignore immunity but still respect friendship. Humans use global human spawn immunity, Nations use nation immunity, Bots are never immune. [Eligibility](../src/core/game/PlayerImpl.ts#L1974).
- Friendship means same team or alliance, **except that a disconnected other player is not friendly by default**. Therefore disconnected teammates can be conquered; their special zero-combat-loss branch is reachable. Attack initialization independently rejects friends; a new alliance during an attack returns survivors without retreat penalty. [Friendship](../src/core/game/PlayerImpl.ts#L1215), [initial checks](../src/core/execution/AttackExecution.ts#L95), [mid-attack alliance](../src/core/execution/AttackExecution.ts#L276).
- Human/Nation-versus-Human/Nation attack initialization causes a temporary defensive embargo and rejection of an incoming alliance request from that target; relation changes are −60/−70/−80/−100 for Easy/Medium/Hard/Impossible. An embargo can be added before the later immunity rejection. [Initialization order](../src/core/execution/AttackExecution.ts#L107), [relations](../src/core/execution/AttackExecution.ts#L181).

### Aiming a segment and representing the force

For `B` supplied border tiles, choose the one nearest the cursor by Manhattan distance `d`, breaking ties by the lowest tile reference. Width is `max(2,min(B,round(2+(B−2)exp(−d/8))))`. Rank all supplied border tiles by Manhattan distance from that center, again tie-breaking by tile reference, and take the first `width`. On the border, this requests the entire border; at distance 8 a 100-tile border requests 38 tiles, at 24 it requests 7, and at 40 it requests 3. With only one border tile the reported width is 2 but the slice returns only one source. Geometric proximity does **not** prove the selected sources form one connected stretch. Live supplies all player border tiles, not only tiles bordering the clicked target, so the usable seeded enemy front can be smaller. [Segment algorithm](../src/core/execution/utils/BorderSegment.ts#L39), [Live caller](../src/client/webgpu/ShellSim.worker.ts#L742).

The attack's front consists of **target-owned candidate tiles**, rather than attacker-owned tiles. Each owned source seeds its four-neighbor passable target tiles. A boat seeds neighbors of its landing tile. A whole-border attack seeds neighbors of every owned border tile. The border is a unique set; the priority queue can contain repeated entries for one tile. Newly seeded candidate tiles start with no troops. [Seeding](../src/core/execution/AttackExecution.ts#L138), [neighbor admission](../src/core/execution/AttackExecution.ts#L475), [heap insertion](../src/core/execution/utils/FlatBinaryHeap.ts#L29).

`attack.troops = sum(troopsAtTile) + reserve`. At initialization and the beginning of each active attack tick, reserve is split evenly over the entire current border: each gets `floor(reserve/B)` and the remaining individual troops go to ascending tile references. Contrary to the method's comment, the remainder is distributed, not retained when a border exists. Removing a candidate from the front moves its survivors to reserve; newly captured tiles' survivors therefore cannot reinforce the new front until the next reserve flush. Clearing/rebuilding a front returns every stationed troop to reserve. [Distribution and exact remainder](../src/core/game/AttackImpl.ts#L135), [front removal](../src/core/game/AttackImpl.ts#L229).

Changing the attack's total to `T` clamps/floors it, scales each stationed amount to `floor(oldTile × T/oldTotal)`, and puts the remainder into reserve. Setting zero clears the field; scaling from zero puts all new troops in reserve. This is how merging, attrition, starvation, and external damage affect the field. [Rescaling](../src/core/game/AttackImpl.ts#L65).

A newly started whole-border attack with no boat source merges **every older outgoing attack against the same target** into its own total and deletes those older attacks. A new segment or boat attack does not perform merging. The condition checks only the **new** attack's source/segment flags, so an older segment or boat attack can be absorbed by a later whole-border attack despite the preservation comment. The new attack's distribution is scaled; older troop locations are discarded. [Merge condition](../src/core/execution/AttackExecution.ts#L164).

### One attack tick: seep, collision, and advancement

1. Resolve completed manual retreat; pause an ordered retreat; stop deleted attacks; return survivors if the target has become friendly.
2. Flush reserve. Then each front tile shares `floor(snapshotForce × 0.1)` with its four-neighbor tracked front tiles, evenly with ascending-reference remainder allocation. Giving amounts are from a start-of-pass snapshot; actual transfers occur in ascending tile order. No front neighbor means no transfer. Zero-force entries left by spending remain eligible to receive seep; rescaling can remove zero entries. Seep conserves troops and does not pass troops across nonadjacent stretches. [Tick order](../src/core/execution/AttackExecution.ts#L250), [seep](../src/core/execution/AttackExecution.ts#L441), [default fraction](../src/core/configuration/FoodConfig.ts#L391).
3. For every incoming counterattack from this opponent, visit our stationed tiles in ascending reference order. For each four-adjacent enemy front tile, kill `min(oursHere,theirsHere)` on **both** sides. There are no terrain, supply, traitor, or combat-ratio modifiers in this collision. Incoming force below one is deleted. Counterattacks at distant front segments do not subtract from this force. The opposing attack's own turn and execution order can also matter. [Local collision](../src/core/execution/AttackExecution.ts#L409).
4. With current total `A` and unique front size `B`, roll `r∈{0,1,2,3,4}`. Set the work budget to `clamp(10A/D,0.01,0.5) × (B+r) × 3` against a player, or `2(B+r)` against neutral land. For positive `A` and zero `D`, the player multiplier clamps Infinity to 0.5. This is a **work budget**, not a direct tile count. [Budget](../src/core/execution/AttackExecution.ts#L293), [budget formula](../src/core/configuration/Config.ts#L846).
5. Pop the lowest-priority candidate while budget is positive. Discard candidates that changed owner, no longer have an attacker-owned four-neighbor, or are water/impassable. Price combat using `effectiveAttackTroops = a × 16`, where `a` is force at that candidate. If `a<1` or `a<unroundedAttackerLoss`, skip it without consuming work budget. Stop after 64 unaffordable pops; skipped tiles are requeued at priority `currentTick+1` after the loop. [Per-tile checks](../src/core/execution/AttackExecution.ts#L320), [local strength and affordability](../src/core/execution/AttackExecution.ts#L342).
6. On a paid conquest, seed its neighbors before changing ownership; subtract its work cost; spend `floor(attackerLoss)` locally; return its remaining force to reserve; remove `floor(defenderLoss)` from defender idle; conquer; apply combat scar if the target is a player; remember this tile as `frontTile`; check defender collapse. A positive budget permits the next conquest even if that tile's cost exceeds the remaining budget, so budget can overshoot below zero. An empty queue causes a rebuild **and then immediate free retreat**, rather than continuing on the rebuilt queue. [Conquest sequence](../src/core/execution/AttackExecution.ts#L307), [cost application](../src/core/execution/AttackExecution.ts#L370), [spend rounding](../src/core/game/AttackImpl.ts#L113).

Candidate priority is `tick + (10+k)(1−0.5n+m/2) − 1,000,000×resourceFocus` for a Farmland/Settlement plot, without the final subtraction otherwise. Here `k∈{0,…,6}`, `n` counts attacker-owned four-neighbors at enqueue time, and terrain `m` is 1/1.5/2 for Plains/Highland/Mountain. The priority is stored as float32; equal keys follow heap mechanics rather than a stated tile tie-break. Resource focus is the attacker's AI-difficulty multiplier (humans use their configured human multiplier). This queue preference reaches only already discovered neighbors, not arbitrary distant resources. Every attack starts its own deterministic PRNG at seed 123; integer random upper limits are exclusive. [Priority](../src/core/execution/AttackExecution.ts#L501), [PRNG seed](../src/core/execution/AttackExecution.ts#L31), [random interval](../src/core/PseudoRandom.ts#L45), [float32 queue](../src/core/execution/utils/FlatBinaryHeap.ts#L8).

### Combat price formulas

Start with these terrain coefficients:

| Terrain    |      Magnitude `M` | Work coefficient `S` |
| ---------- | -----------------: | -------------------: |
| Plains     |                 80 |                 16.5 |
| Highland   |                100 |                   20 |
| Mountain   |                120 |                   25 |
| Impassable | Cannot be attacked |   Cannot be attacked |

For player defenders, any one defender-owned Defense Post within radius 30 multiplies `M` by 5 and `S` by 3; posts do not stack. The check itself does not exclude an under-construction post. Fallout multiplies **both** by `5−2F`, where `F=falloutTiles/landTiles`. The comment's alleged range `[5,2.5]` is stale: for `F∈[0,1]` the formula gives `[5,3]`. A disconnected same-team defender sets `M=0`; Human/Nation attackers against Bots multiply `M` by 0.7. [Terrain/modifier order](../src/core/configuration/Config.ts#L728), [post defaults and fallout](../src/core/configuration/Config.ts#L256).

For a player defender, define:

```text
E = 16a
q = 1 − 1/(1+exp(−(ln(2)/50000)(N_d−150000)))
L = 0.7 + 0.3q
H_loss = N_a > 100000 ? (100000/N_a)^0.35 : 1
H_work = N_a > 100000 ? (100000/N_a)^0.6 : 1
traitorLoss = defenderIsTraitor ? 0.5 : 1
traitorWork = defenderIsTraitor ? 0.8 : 1
densityLoss = D/max(1,N_d)
currentLoss = clamp(D/E,0.6,2) × M × 0.8 × L × H_loss × traitorLoss
alternateLoss = 1.3 × densityLoss × (M/100) × traitorLoss
attackerLoss = 0.6currentLoss + 0.4alternateLoss
defenderLoss = densityLoss
workCost = clamp(D/(5E),0.2,1.5) × S × L × H_work × traitorWork
```

Both casualty quantities are floored by their respective mutation methods, but the affordability test uses the unrounded attacker loss. Defender idle density below one thus produces **zero defender casualties per captured tile**. `L` is 0.85 at 150,000 defender tiles and approaches 0.7 for huge defenders. Large-attacker bonuses reduce only the `currentLoss` part, not `alternateLoss`, and reduce work cost; calling these coefficients penalties would reverse their practical effect. Increasing a player's deployed force removes it from `D`, so a counterattack both creates a local clash field and reduces idle defense globally. [Full player formula](../src/core/configuration/Config.ts#L783), [sigmoid constants](../src/core/configuration/Config.ts#L97), [sigmoid](../src/core/Util.ts#L404).

Against neutral land:

```text
attackerLoss = attackerType == Bot ? M/10 : M/5
defenderLoss = 0
workCost = clamp(2000 × max(10,S)/(16a),5,100)
```

Thus a Human/Nation takes 16/20/24 losses per neutral Plains/Highland/Mountain tile before fallout; Bots take 8/10/12. Neutral work has a hard floor of 5 and ceiling of 100. These formulas do not multiply losses by troop quality: supply is a separate attrition event. [Neutral formula](../src/core/configuration/Config.ts#L832).

Worked price example, excluding other events during the tick: on Plains, an attacker under 100,000 tiles places 1,000 troops on the candidate (`E=16,000`), facing 20,000 idle defenders on 10,000 tiles. With no post/fallout/traitor, `L≈0.962332`; `densityLoss=2`, `currentLoss≈76.9866`, `alternateLoss=2.08`, giving unrounded attacker cost `≈47.0240`, actual attacker deaths 47, defender deaths 2, and work `≈3.96962`. With a 16-tile front, 16,000 total force and `r=0`, budget is 24, but this does **not** guarantee `floor(24/3.96962)` conquests: prices change as troops/territory change, the final cost can overshoot budget, and new front cells await reserve. On neutral Plains the same `a=1000` costs 16 troops and 5 work; neutral `B=16,r=0` gives budget 32, allowing at most seven paid 5-work conquests if eligible funded candidates persist.

### Supply and retreat

Military supply is a multi-source four-neighbor breadth-first distance over owned passable land. **Actual sources are the player's core plus completed Settlements. Barns and Roads are not sources in this implementation**, despite comments. With default radius 10 and power 3:

```text
quality(d) = finite(d) ? 1/(1+(d/10)^3) : 0
BFS cutoff = ceil(3×10) = 30 steps
```

At distance 0/10/20/30 quality is 1, 0.5, 1/9, 1/28; beyond cutoff it is normally zero. The field refreshes on first use, after 10 ticks, or when the **Settlement unit count** changes. Its stored timestamp is backdated to `max(0,t−((t+smallID)%period))` to stagger players; construction completion, core movement, and ownership-path changes alone do not necessarily force an immediate count-based refresh. An injected provider can replace the BFS, but the root CPU path is the fallback. [Supply lifecycle](../src/core/execution/utils/SupplyField.ts#L73), [actual sources and cutoff](../src/core/execution/utils/SupplyField.ts#L160), [defaults](../src/core/configuration/FoodConfig.ts#L414).

A new unmapped front tile probes up to 16 owned-neighbor layers for the existing field and returns the smallest `knownDistance+probeSteps` found on the **first reconnecting layer**, not necessarily the global shortest distance. A known cached distance is returned without checking current ownership, so a recently severed route/front may retain supply until refresh. The probe checks owner equality while traversing, rather than rerunning the BFS land/passability predicate. [Probe details](../src/core/execution/utils/SupplyField.ts#L120).

Each economy tick, each outgoing attack loses `floor(A × (1−quality) × 0.05)`. Critically, the quality is sampled at the attack's **single last-conquered `frontTile`**, and `null` (no conquest yet) means zero quality. It is not averaged across the per-tile combat field or sampled at every border cell. Surviving forces are rescaled proportionally. This applies to attacks on neutral land and attacks paused for retreat as well. Boats contribute to war food consumption/starvation but do not receive this attack-specific supply attrition. At `A=1000`, supply deaths are 0 at a node, 25 at distance 10, 44 at distance 20, 48 at distance 30, and 50 off supply. With no other effects, repeated full supply losses follow `A_next=A−floor(0.05A)`, including an eventual below-20 rounding floor; they do not follow an exact continuous exponential. [Supply attrition and boat cohort](../src/core/execution/utils/FoodEconomy.ts#L149).

War-food starvation is additional: the economy accumulates a fractional starvation credit for surviving fighting+moving troops, floors a total casualty target, then independently rounds each attack/boat's proportional cut. Independent rounding can make applied total differ slightly from the target. Deployed forces do not pay ordinary civilian old-age mortality. The food/economy section specifies requisition and the starvation-rate curve. [War mortality application](../src/core/execution/utils/FoodEconomy.ts#L361).

A manual land retreat is ordered on its retreat execution's first tick and resolves once `currentTick>=retreatInitTick+20` (2 simulated seconds), after which the attack execution refunds surviving force. During the delay its own advancing/seeping stops, but supply, famine, and opposing executions can still damage it. Against players the refund is `floor(0.75×remainingForce)`; against neutral land it is all remaining force. Losing contact/empty queue or becoming friendly gives a free refund. A special `removeTroops=false` nonboat execution subtracts the initial synthetic force before refund to avoid creating troops; boat landing attacks are exempt because passengers were deducted at departure. [Delay](../src/core/execution/RetreatExecution.ts#L3), [pause/refund](../src/core/execution/AttackExecution.ts#L216).

### Ownership, scars, structures, and collapse

Conquest removes the tile from the old owner, clears old density and farm maturity, resets tenure, moves ownership/fertility/border accounting, and clears fallout. It preserves a Field or Urban zoning identity: captured Fields restart at configured `farmSeedMilli`; captured Urban tiles restart at zero density as empty lots. Wilderness stays raw. Conquest does not transfer the former tile's local people to attacker idle troops. [Ownership transfer](../src/core/game/GameImpl.ts#L864).

Only the ordinary paid player-combat path explicitly adds `400` milli damage, capped at `1000`. Damage heals by `4` per simulation tick: a fresh single 400-point scar requires 100 healing steps; a full scar requires 250. Damaged ground blocks farm/urban growth and tenure accrual (and pauses tenure decay) until damage is exactly zero. Repeat fighting stacks. Neutral paid expansion has no scar. Boat landing and the collapse cleanup call `conquer` directly and do not themselves add this combat scar. [Scar addition](../src/core/execution/AttackExecution.ts#L379), [scar storage/healing](../src/core/game/GameImpl.ts#L758), [healing cadence](../src/core/game/GameImpl.ts#L497), [urban blocker](../src/core/execution/utils/UrbanGrowth.ts#L212), [farm blocker](../src/core/execution/utils/FarmGrowth.ts#L173), [tenure blocker](../src/core/execution/utils/TileTenure.ts#L80).

On player execution, structures whose tile is neutral are deleted. Captured Defense Posts are destroyed; other structures transfer to the current tile owner. The defined `capturedPlotRazeChance=0.5` is dormant: there is no current 50% capture/burn roll. The attack queue's comment still describes that obsolete roll. [Current structure capture](../src/core/execution/PlayerExecution.ts#L48), [dormant default](../src/core/configuration/FoodConfig.ts#L383).

After a paid conquest, a player defender with **fewer than 100 owned tiles** triggers `conquerPlayer` and ten passes over remaining tiles. A tile bordering the attacking player goes to that attacker; otherwise it can go to the first neighboring player hostile to the defender. Each pass sees earlier mutations, so cleanup can propagate during a pass. Disconnected remnants with no eligible neighboring captor can survive; actual `isAlive()` is simply `tileCount>0`, so the callback is not itself an unconditional elimination. Cleanup does not pay combat troop/work costs. [Collapse](../src/core/execution/AttackExecution.ts#L541), [alive definition](../src/core/game/PlayerImpl.ts#L675).

The callback transfers disconnected same-team ships. Gold is skipped entirely for a conquered Human who never sent an attack; otherwise the captor receives all Bot/Nation gold or integer half Human gold, while all victim gold is removed. Kill/event accounting is also recorded. These legacy gold branches have little ordinary impact in the root age that does not generate gold. [Conquer-player callback](../src/core/game/GameImpl.ts#L1454), [capture gold](../src/core/configuration/Config.ts#L601).

### Transport deployment and landing

Transports cost zero gold and consume passenger troops, with at most three concurrent ships (zero if the type is disabled). Dispatch rejects self/friendly/immune player targets, finds a same-owner land shore near the clicked tile (nearest search maximum Manhattan 50, ignoring terrain barriers), and finds one of the attacker's shore border tiles connected to the same water component using water pathfinding. No Port building is required. Source selection additionally refines long paths among shores within Manhattan 20 of the initial source, looking toward a 50–200-step waypoint with bounded A\*. This path refinement is navigation implementation complexity, not a transport cost modifier. [Boat cap](../src/core/configuration/Config.ts#L698), [cost](../src/core/configuration/Config.ts#L407), [dispatch](../src/core/execution/TransportShipExecution.ts#L55), [shore search](../src/core/pathfinding/spatial/SpatialQuery.ts#L29), [source refinement](../src/core/pathfinding/spatial/SpatialQuery.ts#L112).

Passengers are clipped to available idle troops and deducted during `buildUnit`; the ship attempts one path step per tick. Supply attrition does not directly apply afloat, but moving consumption, food starvation, and hostile naval/nuclear effects still can. Transport troop setters clamp at zero without integer flooring. [Departure](../src/core/execution/TransportShipExecution.ts#L104), [troop deduction](../src/core/game/PlayerImpl.ts#L1483), [movement](../src/core/execution/TransportShipExecution.ts#L181), [ship rounding](../src/core/game/UnitImpl.ts#L177).

At path completion, arrival at a tile currently owned by the attacker returns **75%** of passengers even if that ownership change was not an explicit retreat. Otherwise it directly conquers the destination tile at no ordinary per-tile combat cost or scar, then either refunds passengers if the original target is now friendly or starts a new `AttackExecution(passengers, originalTarget, landingTile, removeTroops=false)`. This makes the first beach tile special and subsequent inland captures use ordinary combat. The target identity is retained from dispatch; destination ownership can change while sailing. [Landing behavior](../src/core/execution/TransportShipExecution.ts#L236).

Manual boat retreat sets a flag; the transport chooses a reachable owned shore from its current position. A destination turned to water also triggers retreat. If no return shore exists, or the pathfinder reports no path, all passengers are immediately refunded with **no** 25% penalty. A successful arrival at home incurs the 25% penalty. Destruction of an active boat ends its execution without this refund. [Retreat command](../src/core/execution/BoatRetreatExecution.ts#L12), [return routing/refund exceptions](../src/core/execution/TransportShipExecution.ts#L202), [path failure refund](../src/core/execution/TransportShipExecution.ts#L286).

### Complexity review seams and evidence limits

The major coupled systems are (1) global idle defense plus local committed strength scaled by 16, (2) width-based work budget plus per-cell cost plus reserve/seep, (3) last-captured-tile logistics plus a completely separate local force field, (4) geometry/priority choosing which economic tiles burn, and (5) ordinary paid conquest versus free landing/collapse conquest. Each is a distinct candidate boundary for simplification; removing one requires deciding which observable effect to keep, rather than merely deleting a tuning constant. The two military supply distances (cached BFS plus probe) and the food-shed distance system are separate state, even though they share a refresh cadence.

Executable tests cover local front accounting/counterattacks/seep and concentration ([FrontLineTroops](../tests/FrontLineTroops.test.ts#L98), [SegmentAttack](../tests/SegmentAttack.test.ts#L52)), aim width ([BorderSegment](../tests/BorderSegment.test.ts#L27)), logistics/probe/no-front attrition ([SupplyLines](../tests/SupplyLines.test.ts#L75)), and immunity/boat retreat ([Attack tests](../tests/Attack.test.ts#L143)). These files were inspected as supporting examples, not treated as definitions or reported as passing. Some tests/comments still name removed Barn supply or drag gestures; fixtures use large artificial forces and may override normal economy/config. The formulas above come from the current implementation and defaults, with special/legacy branches called out explicitly.

## CPU opponents and diplomacy

This section describes the root CPU simulation, not SimpleFront or LeanFront. An AI “nation” is `PlayerType.Nation`; a small tribe is `PlayerType.Bot`. All integer random ranges below include the lower endpoint and exclude the upper endpoint. `chance(n)` means probability `1/n`, using the seeded deterministic PRNG. [PseudoRandom](../src/core/PseudoRandom.ts#L48)

### Difficulty and scheduling

| Lever                                           |  Easy | Medium (normal default) |  Hard | Impossible |
| ----------------------------------------------- | ----: | ----------------------: | ----: | ---------: |
| Nation housing-capacity multiplier              |   0.5 |                    0.75 |     1 |       1.25 |
| Tribe housing-capacity multiplier               |   1/3 |                     1/3 |   1/3 |        1/3 |
| Tribe economy pulse, ticks                      |    40 |                      30 |    25 |         20 |
| Nation economy candidate budget per call        |     1 |                       2 |     3 |          3 |
| Economy selection: uniform among top K          |     4 |                       3 |     2 |          1 |
| Resource focus                                  |  0.25 |                     0.5 |  0.75 |          1 |
| Nation attack interval, randomly selected ticks | 65–99 |                   55–69 | 45–59 |      30–49 |
| Nation parallel tribe-target attempts           |     1 |  1 or 2, equally likely |     3 |        100 |

Humans always receive capacity multiplier 1 and economy precision K=1. Capacity is `(basePopulation + urbanArea × popPerDensity + tenureCapacityBonus) × multiplier`; this is a multiplier on housing, not a guarantee of that many actual people. Tribe attack intervals are 40–79 ticks on every difficulty. Each AI selects a fixed phase within its interval. Both types select trigger ratio 0.50–0.59, reserve ratio 0.30–0.39, and expansion ratio 0.10–0.19 in steps of 0.01. A tick is nominally 0.1 seconds. [Config difficulty](../src/core/configuration/Config.ts#L159), [capacity](../src/core/configuration/Config.ts#L920), [NationExecution](../src/core/execution/NationExecution.ts#L60), [TribeExecution](../src/core/execution/TribeExecution.ts#L24)

Nation behavior is an ordered pipeline, so an early successful action can prevent later choices in the same pass:

1. On its first post-spawn initialization it queues a wilderness attack requesting half its home troops. This special `forceSendAttack` bypasses the ordinary AI sizing checks; the attack execution still applies its own validation and deployment rules.
2. On normal decision ticks: casual emoji → embargo relation updates → respond to alliance requests → respond to alliance extensions → consider MIRV → handle construction → maybe build warship → update outgoing embargoes → land/boat attack decision → counter warship infestation → consider nuke.
3. Construction gets two additional calls at approximately one-third and two-thirds of the attack interval. Thus Medium has three economy calls per 55–69 ticks, with a budget of two candidates each, subject to available seeds and positive placement scores.
4. Non-Easy nations that have constructed a port and have warships enabled also track ships and retaliation each tick. The hook remains, even though ordinary food-age play supplies no ports.

Tribes pulse their economy separately, use the ordinary `sendAttack` for their first wilderness attack, then on each attack pass accept all incoming alliances/extensions, consider deleting one structure, try a nearby traitor (1/3 chance; the friendly 1/6 branch is effectively excluded by the traitor selector), prefer wilderness while their cached “has wilderness neighbor” flag remains true, then attack a shuffled neighbor. Random targeting requires the trigger ratio, prioritizes retaliation and a 1/3 traitor attempt, skips each human/nation neighbor with probability 1/2, and otherwise takes the first viable nonfriendly target. Once the cached wilderness flag becomes false, this special wilderness preference does not reset. **The structure-deletion hook includes farms and settlements:** `Structures` incorporates `TribalStructures`. A tribe can mark its own first unmarked plot for deletion when the 300-tick cooldown allows it; deletion executes after the 300-tick mark, without the Simple-mode raze cost. Thus this old cleanup behavior competes with the new tribe economy. [Nation tick](../src/core/execution/NationExecution.ts#L98), [tribe tick](../src/core/execution/TribeExecution.ts#L44), [random attack](../src/core/execution/utils/AiAttackBehavior.ts#L877), [structure group](../src/core/game/Game.ts#L221), [deletion](../src/core/execution/DeleteUnitExecution.ts#L68)

### AI economic placement

Both opponent types use `TribalEconomy`. Its budget counts chosen candidates, not individual buildings: one founding-pair candidate queues both a settlement and a farm, so a budget of two can queue four plots. It reserves queued seeds within the current pulse. Each candidate must pass `canBuild`, have a positive score, and ultimately pass construction validation when executed. Candidate sampling uses 40 attempts, at most 10 settlement anchors for joint pairs, and six random farm-partner attempts per anchor within Chebyshev distance 2–4. [TribalEconomy](../src/core/execution/utils/TribalEconomy.ts#L18)

- Farm value: `farmDistrictScore(site, uncommittedResidents) × hostileBorderDiscount(site)`.
- Settlement value: `(room-deficit relief if deficit > 0 + sum of nearby existing-farm labor relief) × hostileBorderDiscount(site)`.
- Pair farm is valued with `uncommittedResidents + popPerDensity`, representing labor added by its settlement. Require `townValue + pairedFarmValue − loneFarmValue > 0`; score is `(townValue + pairedFarmValue) × min(townDiscount, farmDiscount)`.
- Sort positive candidates descending and select uniformly among the first K. These scores depend on the food/economy formulas elsewhere in this catalog; the planner is not simply “build a farm whenever food is low.”

### AI war intelligence, readiness, and force sizing

Let `H` be home troops, `D` the sum of outgoing-attack troops plus transport troops, and `P=H+D`. The AI has perfect access to simulation state; it does not estimate hidden forces. [WarIntel](../src/core/execution/utils/WarIntel.ts#L19)

```text
committedShare = D / P                         (0 if P < 1)
foodRunway = food / lastFoodFlow.consumption   (Infinity if consumption <= 0)
achievableCap = max(1, min(max(foodCapacity, P), housingCap))
  use housingCap instead of foodCapacity if foodCapacity is nonfinite
readiness = H / achievableCap

runwayFraction = min(foodRunway, 500) / 500
warShare = 0.2 × (0.5 + (1.75 − 0.5) × runwayFraction)
additionalDeployment = max(0, floor(P × warShare) − D)
```

The default deployment share is 10% at empty stores, rising to 35% at 500 ticks of runway. It remains enforced while under attack. Existing deployments count toward it. `fieldStaffingNeed = tilledFieldTileCount × farmersPerFieldTile`. For ordinary land attacks, troops available before final caps are `H − max(achievableCap × chosenReserveRatio, fieldStaffingNeed)`. Staffing floor is zero when any incoming attack exists; the deployment-share cap is not zeroed or suspended. Chosen reserve is the expansion ratio for wilderness or a tribe owning any `Structures` member (including a farm/settlement), otherwise the normal reserve ratio. [EconomyModel](../src/core/execution/utils/EconomyModel.ts#L244), [attack sizing](../src/core/execution/utils/AiAttackBehavior.ts#L1228), [defaults](../src/core/configuration/FoodConfig.ts#L425)

For a nation attacking a tribe on Medium or above, desired troops are `4 × tribeHomeTroops`, bounded by available reserve surplus; if surplus is below `2 × tribeHomeTroops`, request zero. Easy uses the entire reserve surplus. Parallel tribe attempts maintain a separate sent counter. The counter is updated before the later send caps, so it records the preliminary requested amount, not necessarily the final deployed amount. Land/boat requests are later bounded by `additionalDeployment`; values below 1 are rejected. [tribe attack sizing](../src/core/execution/utils/AiAttackBehavior.ts#L1373)

Additional Hard/Impossible nation gates in FFA only:

- Let `N` be the greatest total power `H+D` among nearby nonfriendly non-tribe players. Keep `ceil(0.75N)` at home on Hard, `ceil(0.9N)` on Impossible; send cap is `max(0, H − retained)`. No eligible neighbor means no such cap. With incoming attacks, raise this cap to at least total incoming troops. The food/deployment cap still binds.
- Reject attacks sending less than 20% of target home troops, unless currently under attack. Tribes and team games are exempt from these two gates.

These Hard/Impossible gates do not apply to Medium. At every difficulty, normal nation attacks on nontraitor humans also pass a reluctance draw: Easy permits 1/4, Medium permits 3/4, Hard/Impossible permit all. Retaliation uses `force=true` and bypasses this reluctance. Tribes and Humans-vs-Nations are exempt. [send caps](../src/core/execution/utils/AiAttackBehavior.ts#L1119)

### Nation targeting and campaigns

Every nation attack pass combines direct land-border neighbors with `nearby()` neighbors, sorts players by increasing home troops, updates strength trends and threat relations, and tries nonfallout wilderness first. With no enemy neighbors, there is a 1/5 random-boat attempt; with enemies, a 1/10 random-boat attempt consumes the pass even if it fails. Otherwise the nation may send alliance requests before its target strategies. [attack-pass preparation](../src/core/execution/utils/AiAttackBehavior.ts#L76)

A neighbor is “surging” when current total power exceeds previous-pass total power ×1.1, and “declining” when it is lower. A nonfriendly non-tribe neighbor with at least twice our total power causes −10 relation per attack pass. No previous reading means neither trend. The lists are rebuilt each pass. [trend/threat](../src/core/execution/utils/AiAttackBehavior.ts#L138)

Before normal strategies: tribes with structures (including farms/settlements) may be attacked before reserve checks; otherwise require readiness ≥ reserve. Then try an existing campaign. If none reinforces, require readiness ≥ trigger, with a 1/10 chance to ignore only this trigger gate. A successful player attack by a nation opens/refreshes a campaign. Its next passes reinforce the same target when own territory grew and total power stayed at least 97% of the preceding snapshot. A larger power loss ends the campaign immediately; two stalled passes without net tile gain end it. Campaigns stop for dead/friendly targets and use ordinary force caps. [campaign](../src/core/execution/utils/AiAttackBehavior.ts#L185), [strategy gates](../src/core/execution/utils/AiAttackBehavior.ts#L354)

| Difficulty | First successful strategy wins, left to right                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Easy       | nuked wilderness, tribes, retaliation, ally assistance, betrayal, hated, weakest                                                                               |
| Medium     | tribes, nuked wilderness, retaliation, ally assistance, betrayal, hated, AFK, traitor, join existing war, starving, weakest, island, donate                    |
| Hard       | tribes, retaliation, ally assistance, betrayal, nuked wilderness, traitor, AFK, hated, very weak, starving, victim, join existing war, weakest, island, donate |
| Impossible | retaliation, tribes, very weak, starving, join existing war, ally assistance, traitor, AFK, betrayal, victim, nuked wilderness, hated, weakest, island, donate |

Strategy definitions use these exact tests. [strategy definitions](../src/core/execution/utils/AiAttackBehavior.ts#L388)

- Tribes: structure owners first (including farms/settlements), then increasing density `homeTroops / territoryTiles`; attempt the difficulty-limited prefix.
- Retaliation: largest current incoming attack from a nonfriendly player; nations ignore incoming tribe attacks for this selection.
- Assistance: requires alliances enabled, ally relation Friendly, a marked target other than self/nonfriendly, and successful send. Successful help subtracts 20 from our relation toward the requesting ally.
- Hated: explicitly stored relations at Hostile, in increasing numeric relation order. In FFA require target home troops ≤3× ours. AFK similarly requires `<3×` ours.
- Traitor: weakest eligible traitor, `<1.2×` our home troops in FFA.
- Join war: enemy has fewer home troops than us and has an incoming attack from a nonfriendly third party or an outgoing attack against a third party.
- Starving: attempted with probability `1 / max(1, round(1/resourceFocus))` (Medium 1/2; Hard 1; Impossible 1). Require runway <200 ticks; in FFA also target home troops `<1.2×` ours and not surging.
- Victim: in FFA exclude home troops `>1.2×` ours. Require incoming attack sum `>0.5× targetHome`, or committed share >0.5 and declining total power.
- Very weak: home troops `<0.15× achievableCap`, also `<1.2×` ours in FFA.
- Weakest: lowest-home-troop nonfriendly neighbor; in FFA skip surging candidates and require strictly fewer home troops than ours.
- Island: only with no bordering enemies; try enemies ordered by Manhattan distance between territory bounding-box centers, find up to two with viable shore transport routes, choose second with probability 1/3 when present.
- Donate: team games only, not public games, enabled donations, no winner, and a teammate in combat who passes donation checks. Attempt probability Easy=0, Medium=1/4, Hard=1/2, Impossible=1. Choose lowest `homeTroops / max(housingCap,1)` and offer `H − achievableCap × reserveRatio`.

AI fronts use contact tiles and choose a bounded border segment with `maxWidth=max(8,floor(contactCount/3))`. Against a player, each contact tile within Chebyshev radius 4 of a target farm/settlement has draw weight `1+round(3×resourceFocus)`; other tiles weight 1 (Medium 3:1). Wilderness aim is uniform. [front aim](../src/core/execution/utils/AiAttackBehavior.ts#L936)

Transports are zero-gold units and remain usable. Random boats request `min(H/5, applicableNeighborCap, additionalDeployment)`, with a hard maximum of three active transport ships. Search makes up to 500 coordinate attempts in a 300×300 window around a random owned shore tile, first favoring unowned/tribe land, then other nonfriendly players. FFA excludes stronger-at-home opponents and explicitly excludes listed bordering enemies. Targeted boats choose the closest shore pair and request H/5 through normal attack caps; that callback does not itself subtract the calculated staffing/reserve floor. River wilderness search samples every tenth shore tile and checks a destination exactly five tiles in a cardinal direction, requiring the first step to be water and final tile to be viable unowned nonfallout land; path validation remains authoritative. [boats](../src/core/execution/utils/AiAttackBehavior.ts#L230), [river crossing](../src/core/execution/utils/AiAttackBehavior.ts#L1075), [targeted boats](../src/core/execution/utils/AiAttackBehavior.ts#L1337)

### Relations, alliances, betrayal, embargoes

Relation is a directional value clamped to [−100,100], initially 0: Hostile `<−50`; Distrustful `[−50,0)`; Neutral `[0,50)`; Friendly `≥50`. Every nonspawn player tick moves stored relation 0.05 toward zero and snaps to zero when absolute value <0.1. That is approximately 0.5 points/second at nominal speed. An alliance is a separate state; a Friendly numeric relation is not by itself an alliance. [relations](../src/core/game/PlayerImpl.ts#L863), [tick](../src/core/execution/PlayerExecution.ts#L48)

Starting an attack lowers defender's relation toward attacker by 60/70/80/100 points on Easy/Medium/Hard/Impossible. Marking a target lowers its relation toward the requestor by 40. A successful troop donation raises recipient relation by 50. Successful ally assistance costs the helper 20 relation toward requester. A nation applies −20 once when someone embargos it and restores +20 once when that embargo disappears. [attack relation](../src/core/execution/AttackExecution.ts#L181), [target](../src/core/execution/TargetPlayerExecution.ts#L26), [donation](../src/core/execution/DonateTroopExecution.ts#L65), [embargo relation](../src/core/execution/NationExecution.ts#L250)

Directed emojis also have gameplay effects when the recipient is a nation and can reply under its emoji cooldown: middle finger causes −100 relation, clown −10, and dove/white-flag/heart/loving-face/applause +15 only on Easy. Broadcasts and non-nation recipients skip this response policy. Thus some seemingly cosmetic diplomacy events can alter subsequent alliance/attack choices. [emoji response](../src/core/execution/nation/NationEmojiBehavior.ts#L279)

Nations process alliance decisions in this order:

1. Confusion probability Easy=1/10, Medium=1/20, Hard=1/40, Impossible=0; if confused, return a fair random yes/no immediately.
2. Reject traitor with 90% probability. Hard rejects candidates allied to at least half of living non-tribe players; Impossible uses one-quarter.
3. Accept a threatening candidate before relation checks: Medium needs candidate home troops >2.5× own; Hard needs greater home troops and >2× housing; Impossible needs >1.5× home troops, or greater home troops plus >1.5× housing or >1.5× territory. Easy has no threat acceptance.
4. In team games, reject with 25/50/75/100% probability. Reject relation below Neutral.
5. Friendly relation accepts always on Easy/Medium, 83% Hard, 67% Impossible.
6. Alliance count limit: Easy none; Medium random threshold 4–5. Hard/Impossible avoid allying the last remaining nonfriendly neighbor when there are at least two non-tribe neighbors; otherwise random limit Hard 3–4, Impossible 2–3.
7. Early-game acceptance: Easy 90% before spawn-end+3000 ticks; Medium 70% before +1800; Hard 50% before +1800; Impossible 30% before +600.
8. Otherwise accept if candidate `home+outgoingAttack` exceeds a sampled share of ours, or candidate territory exceeds a sampled share of ours AND its `home+outgoingAttack >0.5× ours`. Troop percent sample ranges: [60,70), [70,80), [75,85), [80,90); territory ranges [70,80), [80,90), [85,95), [90,100). This particular strength comparison omits transport troops.

Outgoing nation alliance requests attempt each enemy with probability 1/30 and normal request validation; only Easy proposes alliances to tribes. Nations reject requests created at or before `spawnTicks+1`; tribes accept their incoming requests without this nation-specific policy. [NationAllianceBehavior](../src/core/execution/nation/NationAllianceBehavior.ts#L29)

Betrayal: Hard/Impossible may betray an ally with home+outgoing troops <20% of housing and fewer home troops than us. Easy/Medium instead use own home troops ≥10× ally's, except Easy does not do this to humans. Non-Easy also betrays a traitor weaker than 1.2× us, or its only bordering player if own troops >3× theirs. Breaking an alliance marks the breaker a traitor for 300 ticks unless the other party is already a traitor or disconnected. The explicit break-alliance execution additionally sets recipient relation −100 and nearby eligible players' relation −40; AI betrayal calls `Player.breakAlliance` directly and does not automatically receive those extra execution-level relation changes. Traitordom defines defense ×0.5 and speed ×0.8 modifiers, whose actual combat application depends on the relevant combat branch. [betrayal policy](../src/core/execution/nation/NationAllianceBehavior.ts#L369), [core break](../src/core/game/GameImpl.ts#L975), [explicit break action](../src/core/execution/alliance/BreakAllianceExecution.ts#L38), [traitor constants](../src/core/configuration/Config.ts#L209)

Nations start embargoes at Hostile. Easy/Medium stop at Neutral, Hard at Friendly, Impossible never auto-stops through this policy. Hard/Impossible team nations embargo all non-tribe opponents outside their own team. Trade is allowed only if neither party embargos the other and they are different players; alliance membership is not required. Embargoes continue to change relations even with no trade ships. [nation embargo policy](../src/core/execution/NationExecution.ts#L274), [trade eligibility](../src/core/game/PlayerImpl.ts#L1143)

| Timer                                                              |     Ticks | Nominal time |
| ------------------------------------------------------------------ | --------: | -----------: |
| Alliance request lifetime                                          |       200 |         20 s |
| Alliance request cooldown                                          |       300 |         30 s |
| Alliance duration; agreed extension resets expiry to now plus this |      3000 |        5 min |
| Temporary embargo lifetime                                         |      3000 |        5 min |
| Embargo-all cooldown                                               |       100 |         10 s |
| Donation cooldown                                                  |       100 |         10 s |
| Traitor duration                                                   |       300 |         30 s |
| Target duration / cooldown                                         | 100 / 150 |    10 / 15 s |
| Emoji duration / cooldown                                          |   50 / 50 |      5 / 5 s |
| Quick-chat cooldown                                                |        30 |          3 s |
| Unit deletion mark / deletion cooldown                             | 300 / 300 |    30 / 30 s |
| Silo / SAM reload                                                  |   90 / 90 |      9 / 9 s |

These are configuration durations; actual handlers can quantize processing to their own decision passes or use strict `>` checks. [timers](../src/core/configuration/Config.ts#L641), [alliance extension](../src/core/game/AllianceImpl.ts#L87)

## Legacy mechanics: retained definitions and reachability

The normal root food-age simulation has no passive gold income: `PlayerExecution` calls `urbanTick`, and `Config.simplePlotEconomy()` is null. Player construction directly initializes every player's gold to zero; the retained Config starting-gold accessor does not fund that constructor. See the opening rules above. Critically, zero gold does not disable all units: transports, settlements, and farms remain reachable. Settlements/farms have zero food cost but require awarded seeds; Barn has zero food cost in metadata but is refused by plot placement. Other units use gold when `costResource` is absent. The default nation construction method exclusively calls `TribalEconomy`; the old city/port/factory/SAM/silo selection helpers are still defined beneath it but are not its build order. Defense-post construction remains a separate live hook, gated by at least one prior successful structure call, threat conditions, and gold. Thus ordinary zero-gold food-age matches cannot bootstrap the gold infrastructure through this AI path. Hooks for ships/nukes continue to run and could act if structures/resources are introduced through a different scenario, custom settings, capture, or legacy actions. [PlayerExecution](../src/core/execution/PlayerExecution.ts#L89), [cost currency/seed gates](../src/core/game/PlayerImpl.ts#L1516), [nation construction switch](../src/core/execution/nation/NationStructureBehavior.ts#L423)

### Retained prices and building times

Let `n(type)=min(unitsOwned(type),unitsConstructed(type))`; combined port/factory price sums n for both types. These counts are the source methods' counts, not simply “currently visible buildings.” Prices are bigint gold unless stated otherwise. `instantBuild` changes construction durations to zero. The infinite-gold cheat returns zero costs only for Human players in this wrapper. [unitInfo](../src/core/configuration/Config.ts#L399), [costWrapper](../src/core/configuration/Config.ts#L621)

| Unit                                                    | Price                                          | Construction ticks / upgrade      |
| ------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| Transport                                               | 0                                              | no construction duration          |
| Warship                                                 | `min(1,000,000, (n+1)×250,000)`                | HP=1000                           |
| Port / Factory                                          | `min(1,000,000, 2^(nPort+nFactory)×125,000)`   | 50 / 20; upgradeable              |
| City                                                    | `min(1,000,000, 2^nCity×125,000)`              | 20; upgradeable                   |
| Defense post                                            | `min(250,000,(n+1)×50,000)`                    | 50; not upgradeable               |
| SAM launcher                                            | `min(3,000,000,(n+1)×1,500,000)`               | 300; upgradeable                  |
| Missile silo                                            | 1,000,000                                      | 100; upgradeable                  |
| Atom bomb                                               | 750,000                                        | launched unit                     |
| Hydrogen bomb                                           | 5,000,000                                      | launched unit                     |
| MIRV                                                    | `25,000,000 + 15,000,000×allGameMIRVsLaunched` | launched unit                     |
| Trade ship / train / shell / SAM missile / MIRV warhead | 0                                              | generated by their infrastructure |
| Settlement / farmland                                   | 0 food plus seed                               | no upgrade                        |
| Barn                                                    | metadata 0 food                                | placement refused                 |

Capturing a defeated tribe/nation defines a gold reward equal to its entire treasury; defeating a human defines half its treasury (bigint division). Gold donation relation bonus is `min(100,5×floor(goldSent / round(baseChunk×(1+ticks/(3000+spawnTicks)))))`, where baseChunk is 2500/5000/12500/25000 by difficulty. There is no passive city-gold formula in the current Config. [capture/start gold](../src/core/configuration/Config.ts#L601), [donation](../src/core/execution/DonateGoldExecution.ts#L91)

### Trade ships, factories, and trains

These require legacy infrastructure absent from the ordinary initial food-age state. If ports exist, each completed port checks every ten ticks. Let `S` be global trade-ship count, `r` this port's rejection count, and `sigmoid(x,k,m)=1/(1+exp(−k(x−m)))`:

```text
baseSpawnRate = 1 − sigmoid(S, ln(2)/50, 400)
chanceDenominator = floor(100 / ((r+1) × baseSpawnRate))
```

Each port level gets an independent `chance(denominator)` attempt per check. Denominator is calculated once for the check; each failure increments r and a success resets it to zero. Target ports must belong to trade-eligible other players and share a water component. Weight starts at destination level, adds that level again if distance ≥300 and in the nearest `within(portCount/3,4,portCount)` ports, and again if distance ≥300 and friendly. A completed normal trade pays both port owners the same reward:

`floor((75000/(1+exp(−0.03×(distanceTravelled−300))) + 50×distanceTravelled) × goldMultiplier)`.

A captured trade ship pays only its current owner. [Config trade math](../src/core/configuration/Config.ts#L375), [PortExecution](../src/core/execution/PortExecution.ts#L42), [trade payout](../src/core/execution/TradeShipExecution.ts#L175)

Factories create train stations for themselves and nearby City/Port/Factory units. Station connection min/max ranges are 15/110, maximum rail length is `110×1.4142`. Factory train spawn denominator is `15×(ownedFactoryCount+10)`, one draw per factory level after a minimum ten-tick interspawn cooldown and valid destination checks. A train has five carriages plus front/tail engines, travels at speed 2 with spacing 2. City/port stops pay `max(5000, B−5000×max(0,visitedStops−9))×goldMultiplier` converted to integer; B is 10,000 self, 35,000 allied, 25,000 teammate/other. The train owner receives the payout and a different station owner receives the same payout. Factory stops pay nothing. [train generation](../src/core/execution/TrainStationExecution.ts#L10), [Config train math](../src/core/configuration/Config.ts#L335), [stop payouts](../src/core/game/TrainStation.ts#L15)

### Defense posts, warships, and shell combat

Defense posts define radius 30, defense bonus 5, speed bonus 3. Their maritime shooting target/dispatch block is commented out: the retained shell rate 100 does not cause `DefensePostExecution` to shoot. The nation builder still considers posts when total incoming **land** troops/home troops ≥0.35; Medium tries with 1/2 probability and allows one nearby front post, Hard/Impossible allow `ceil(incomingRatio/0.4)`; Easy never does this. It requires gold, and may block normal food building when the defense-post-needed branch returns true even if a post cannot be afforded. [defense constants](../src/core/configuration/Config.ts#L271), [dormant shooting](../src/core/execution/DefensePostExecution.ts#L63), [AI defense hook](../src/core/execution/nation/NationStructureBehavior.ts#L151)

Warships prioritize repair, transport targets, enemy warships, then trade ships. Patrol radius=100, targeting radius=130; shell cooldown=20 ticks (transport attacks bypass the reload constraint). A shell takes three path steps per tick; its 50-tick expiry timer starts only when the firing unit is no longer active, rather than at shell launch. Base shell damage is a uniform draw from 200,225,250,275,300: `roll∈[1,6)`, `damage=(roll−1)×25+200`. Multiply that integer by `(100+20×veterancy)/100`, floor, then multiply by configured base shell damage/250 and round. [shell movement/damage](../src/core/execution/ShellExecution.ts#L44), [warship behavior](../src/core/execution/WarshipExecution.ts#L90), [constants](../src/core/configuration/Config.ts#L1030)

Veterancy is capped at 3; max HP scales base HP by `1+0.2×level`. Killing a warship grants one level and resets partial progress. Ten transport kills or 25 trade captures (or an equivalent mix) grant a level: 250 points per level, +25 per transport, +10 per trade capture. Retreat threshold is 75% of veteran max HP. Manual movement temporarily suppresses retreat for 50 ticks. Passive healing is 1 while within the defined 150 range of an eligible port; docking radius=5, port healing pool is `5×portLevel` divided among docked ships with fractional remainder retained. A substantially closer port can replace the retreat target at distance <0.75×current distance. [veterancy](../src/core/game/UnitImpl.ts#L567), [repair](../src/core/execution/WarshipExecution.ts#L165), [healing pool](../src/core/execution/WarshipExecution.ts#L519)

Nation warship spawn has a 1/50 attempt per normal nation pass, needs a port, no currently owned warship, and gold strictly greater than price. Separate retaliation/infestation handlers can request further warships if the prerequisites exist. They remain invoked but normally have no enabling gold/ports. [NationWarshipBehavior](../src/core/execution/nation/NationWarshipBehavior.ts#L36)

### Nuclear weapons and SAMs

| Weapon       | Inner / outer blast radius |
| ------------ | -------------------------: |
| MIRV warhead |                    12 / 18 |
| Atom         |                    12 / 30 |
| Hydrogen     |                   80 / 100 |

Nuke speed defaults to 10, targetable range=150. Silo and SAM reload each fired queue slot after 90 ticks; a unit is in cooldown when fired-queue length equals its level, so levels allow simultaneous shots. Blast traversal excludes impassable tiles. In ordinary non-water-nukes mode the BFS admits all inner-radius neighbors and outer-ring neighbors with probability 1/2, making the actual reached blast shape traversal-dependent. Water-nukes mode generates 16 angular squared radii between inner² and outer², smooths with weights 0.2/0.6/0.2, and interpolates a continuous radial boundary. Explosion calls `queueWaterConversion` for affected land; that method sets fallout when water-nukes is off, or queues actual water conversion when on. [blast](../src/core/execution/NukeExecution.ts#L54), [conversion gate](../src/core/game/GameImpl.ts#L301), [missile queue](../src/core/game/UnitImpl.ts#L465)

For each impacted owned tile, the victim loses troops from its home pool, every outgoing attack, and every transport pool separately. Ordinary atom/hydrogen per-tile loss is `5×poolTroops/max(1,remainingTerritoryBeforeThisTile)`, recomputed after prior losses. MIRV-warhead per-tile loss is `500×(1−exp(−2×max(0,poolTroops−0.03×maxTroops)/maxTroops))`. All nonmissile/SAM-missile units within strict outer radius are deleted even outside the randomly selected terrain blast tiles. [death factors](../src/core/configuration/Config.ts#L1010), [explosion application](../src/core/execution/NukeExecution.ts#L374)

MIRV carrier range=1500, minimum spread=55, nominal warhead count=350. Warhead speed is `15+floor(i/350×5)` and delay sampled [0,15). There are bounded searches for valid target tiles, so “350” is an attempt budget rather than a promise of 350 viable hits. [MIRVExecution](../src/core/execution/MIRVExecution.ts#L25)

SAM radius is `150−480/(level+5)` (70 at level 1, 102 at level 5), missile speed=12, detection radius=300. Ordinary interception checks trajectory targetability, Euclidean range, and `ceil(ManhattanDistance/12)` arrival time; hydrogen targets take priority. MIRV protection is separate: scan warheads within radius 400 whose destination is Manhattan distance <50 from the SAM, then delete the matching batch using one launch/reload slot. [SAM targeting](../src/core/execution/SAMLauncherExecution.ts#L76), [MIRV interception](../src/core/execution/SAMLauncherExecution.ts#L283)

Nation nuclear decisions remain defined but need silo/gold. One-third of nations prefer hydrogen and only use atoms under heavy attack; perceived prices start at actual prices, then atom ×1.5 and hydrogen ×1.25 per send (bigint truncation). Perceived-price escalation is bypassed with only two players, MIRV disabled, certain team/high-treasury conditions, or heavy attack on Hard/Impossible. Heavy attack means incoming sum ≥home troops. Nuke-site structure values per level are city 25,000; defense post 5000; silo 50,000; port/factory 15,000. Medium rejects sites with a SAM within 50. Impossible hydrogen gives an extra 100,000×SAM level to SAMs under level 5 inside blast range but outside interception range. Final site score is `max(0.2×baseValue, baseValue−30×distanceToNearestSilo) −1,000,000×recentOverlaps`; recent sites persist 600 ticks. Hard/Impossible additionally check trajectory interception; all difficulties reject impassable trajectories. [nuke policy](../src/core/execution/nation/NationNukeBehavior.ts#L57), [cost](../src/core/execution/nation/NationNukeBehavior.ts#L437), [site score](../src/core/execution/nation/NationNukeBehavior.ts#L679)

Nation MIRV priorities: counter incoming MIRV → deny a leading player's/team's territory victory → stop city-count steamroll. Hesitation probabilities are 1/2,1/4,1/8,1/16. Individual territory trigger shares are 75/65/55/40%; team shares 90/80/70/60%. Steamroll city-gap multipliers are 2/1.5/1.25/1.15; the leader must have strictly more than 20/10/10/8 cities respectively and at least the multiplier times second place's count. A shared recent-target map enforces 300 ticks between MIRVs aimed at one player. This retained policy values legacy City units, not the urban density field. [NationMIRVBehavior](../src/core/execution/nation/NationMIRVBehavior.ts#L23)

### Optional Doomsday Clock

This is off by default, not automatically a food mechanic. If enabled, it checks once per ten ticks, ignores tribes, and evaluates individuals in FFA or whole teams otherwise. The leading side is exempt, first in stable order breaking ties; fewer than two sides clears danger. Eligible land is total land minus fallout tiles. [DoomsdayClockExecution](../src/core/execution/DoomsdayClockExecution.ts#L39)

Target share levels are 3%,5%,10%,20%,30%,55%. All use a grace followed by repeated linear ramps and 30-second holds: slow grace/ramp=390/330 seconds; normal=330/270; fast=270/170; veryfast=180/120. For elapsed time beyond grace, `i=floor((elapsed−grace)/(ramp+30))`, `into=(elapsed−grace)−i×(ramp+30)`, and basis points are `previousLevel + floor((targetLevel−previousLevel)×min(into,ramp)/ramp)`, clamped at final level. Required tiles are `floor(basisPoints×eligibleLand/10000)`; team requirement is `min(eligibleLand,baseRequired×max(1,teamSize))`.

A side below threshold gets ten seconds warning. Each subsequent second, each member loses `max(1,floor(housingCap×pct/100))` home troops capped at current troops, where `pct=2+floor(4×secondsAfterWarning/50)` until 50 seconds, then 6. This is a stepwise integer approximation to the comment's “linear drain”; it uses housing capacity, not current troops or total power. Recovery above threshold clears danger. [threshold and drain formulas](../src/core/game/DoomsdayClock.ts#L43)

### Coverage limits and retained-code cautions

This appendix records the principal retained gameplay prices, timers, combat/economic formulas, and activation gates. It is not a proof that every legacy helper is unreachable from every replay, test, custom configuration, or forged/legacy intent. Nuclear trajectory geometry/pathfinding, the full legacy nation structure-siting and naval-retaliation decision trees, and every rail-network routing detail remain source-level subalgorithms rather than fully expanded equations here. In particular, dormant legacy AI helpers still reference “cities increase max troops,” whereas current `maxTroops` uses urban density/tenure; and comments describing fallout defense as [5,2.5] disagree with the actual `5−2×falloutRatio` formula, which yields [5,3]. Treat executable branches as authoritative.

## Tuning reference: every FoodConfig default

These 73 values were extracted from the literal `FOOD_DEFAULTS` object in this checkout. This inventory deliberately retains inactive entries so you can identify dead controls as well as active complexity. The formulas above explain their interactions; changing one value need not produce an immediate or monotonic gameplay effect.

| Knob                                                                      | Default | Meaning in this implementation                                   |
| ------------------------------------------------------------------------- | ------: | ---------------------------------------------------------------- |
| [`idleConsumptionMilli`](../src/core/configuration/FoodConfig.ts#L366)    |      10 | Milli-food per idle person per tick                              |
| [`moveConsumptionMilli`](../src/core/configuration/FoodConfig.ts#L367)    |      20 | Milli-food per transport passenger per tick                      |
| [`fightConsumptionMilli`](../src/core/configuration/FoodConfig.ts#L368)   |      40 | Milli-food per deployed land attacker per tick                   |
| [`landHarvestMilli`](../src/core/configuration/FoodConfig.ts#L369)        |       0 | Optional camp harvest coefficient; zero disables natural harvest |
| [`landHarvestExponent`](../src/core/configuration/FoodConfig.ts#L370)     |     0.5 | Power applied to total owned crop bytes for natural harvest      |
| [`farmProductionMilli`](../src/core/configuration/FoodConfig.ts#L371)     |      80 | Legacy; not used by the current CPU field-yield ledger           |
| [`basePopulation`](../src/core/configuration/FoodConfig.ts#L375)          |     100 | Base reported housing capacity                                   |
| [`startPopulation`](../src/core/configuration/FoodConfig.ts#L378)         |    2000 | Initial idle people, every player type                           |
| [`populationPerSettlement`](../src/core/configuration/FoodConfig.ts#L379) |    3000 | Legacy; not used by current urban housing formula                |
| [`baseStorage`](../src/core/configuration/FoodConfig.ts#L380)             |    5000 | Camp capacity, displayed food                                    |
| [`decayNumer`](../src/core/configuration/FoodConfig.ts#L381)              |       1 | Stored-food spoilage numerator                                   |
| [`decayDenom`](../src/core/configuration/FoodConfig.ts#L382)              |    2000 | Stored-food spoilage denominator                                 |
| [`capturedPlotRazeChance`](../src/core/configuration/FoodConfig.ts#L383)  |     0.5 | Dormant; current capture transfers tribal plots instead          |
| [`combatTileDamageMilli`](../src/core/configuration/FoodConfig.ts#L386)   |     400 | Damage added by a paid capture from another player               |
| [`tileDamageHealMilli`](../src/core/configuration/FoodConfig.ts#L387)     |       4 | Damage removed per game tick                                     |
| [`frontSeepFraction`](../src/core/configuration/FoodConfig.ts#L391)       |     0.1 | Local front-force fraction shared per tick                       |
| [`frontReferenceWidth`](../src/core/configuration/FoodConfig.ts#L392)     |      16 | Multiplier on per-candidate attack strength                      |
| [`tenureCapMultMax`](../src/core/configuration/FoodConfig.ts#L396)        |       3 | Asymptotic city housing multiplier                               |
| [`tenureHalfTicks`](../src/core/configuration/FoodConfig.ts#L397)         |    1200 | Tenure at half saturation                                        |
| [`tenureSaturationRatio`](../src/core/configuration/FoodConfig.ts#L398)   |     0.9 | Population/housing gate for urban tenure accrual                 |
| [`tenureDecayMilli`](../src/core/configuration/FoodConfig.ts#L399)        |     100 | Vacant-tile tenure decay per tick equivalent                     |
| [`wNucleusTenure`](../src/core/configuration/FoodConfig.ts#L400)          |     0.5 | Core tenure contribution to urban growth pace                    |
| [`scalingExponent`](../src/core/configuration/FoodConfig.ts#L401)         |    1.26 | Base exponent in paired-seed award ladder                        |
| [`settlementLadderBasePop`](../src/core/configuration/FoodConfig.ts#L406) |    4000 | First paired-seed population threshold                           |
| [`settlementLadderTaper`](../src/core/configuration/FoodConfig.ts#L407)   |       2 | Multiplier on ladder exponent                                    |
| [`farmersPerFieldTile`](../src/core/configuration/FoodConfig.ts#L411)     |     200 | Workers needed per staffed field tile                            |
| [`startingFood`](../src/core/configuration/FoodConfig.ts#L412)            |    4000 | Initial displayed camp food                                      |
| [`defaultPopulationShare`](../src/core/configuration/FoodConfig.ts#L413)  |     0.7 | Initial production share offered to civilians                    |
| [`supplyRadius`](../src/core/configuration/FoodConfig.ts#L414)            |      10 | Military supply half-quality distance                            |
| [`supplyDecayPower`](../src/core/configuration/FoodConfig.ts#L415)        |       3 | Military supply falloff power                                    |
| [`supplyRefreshTicks`](../src/core/configuration/FoodConfig.ts#L416)      |      10 | Shared supply/shed refresh and vacancy-decay cadence             |
| [`warSupplyAttrition`](../src/core/configuration/FoodConfig.ts#L422)      |    0.05 | Maximum attack supply loss fraction per tick                     |
| [`maxWarShare`](../src/core/configuration/FoodConfig.ts#L425)             |     0.2 | Base AI deployment-share coefficient                             |
| [`warShareLeanScale`](../src/core/configuration/FoodConfig.ts#L429)       |     0.5 | AI share multiplier with empty reserves                          |
| [`warShareRichScale`](../src/core/configuration/FoodConfig.ts#L430)       |    1.75 | AI share multiplier at rich food runway                          |
| [`warShareRichRunwayTicks`](../src/core/configuration/FoodConfig.ts#L431) |     500 | Runway at maximum AI deployment share                            |
| [`campaignPopFloor`](../src/core/configuration/FoodConfig.ts#L434)        |    0.97 | Minimum retained total power for campaign continuation           |
| [`campaignMaxStalls`](../src/core/configuration/FoodConfig.ts#L435)       |       2 | Stalled campaign passes tolerated                                |
| [`threatPowerRatio`](../src/core/configuration/FoodConfig.ts#L438)        |       2 | Neighbor/own total-power threat threshold                        |
| [`threatDriftPerPass`](../src/core/configuration/FoodConfig.ts#L439)      |      10 | Relation penalty for persistent superior threat                  |
| [`starvingRunwayTicks`](../src/core/configuration/FoodConfig.ts#L441)     |     200 | AI starvation-target runway threshold                            |
| [`surgeGrowthFactor`](../src/core/configuration/FoodConfig.ts#L443)       |     1.1 | Neighbor power growth classified as a surge                      |
| [`urbanGrowthRate`](../src/core/configuration/FoodConfig.ts#L447)         |     0.1 | Urban footprint gap-closing rate                                 |
| [`popPerDensity`](../src/core/configuration/FoodConfig.ts#L451)           |   10000 | Housing represented by one full city tile                        |
| [`avgLifespanTicks`](../src/core/configuration/FoodConfig.ts#L459)        |     100 | Inverse base civilian death fraction                             |
| [`baseBirthRate`](../src/core/configuration/FoodConfig.ts#L466)           |    0.02 | Base expected births per total person per tick                   |
| [`birthSurplusCap`](../src/core/configuration/FoodConfig.ts#L467)         |       2 | Maximum birth food-surplus multiplier                            |
| [`minFedForLife`](../src/core/configuration/FoodConfig.ts#L468)           |    0.05 | Minimum fed fraction used in starvation formula                  |
| [`wFood`](../src/core/configuration/FoodConfig.ts#L469)                   |       1 | Crop term in urban placement weight                              |
| [`wWater`](../src/core/configuration/FoodConfig.ts#L470)                  |     0.8 | Freshwater/shore term in urban placement weight                  |
| [`wShore`](../src/core/configuration/FoodConfig.ts#L471)                  |     0.5 | Shore premium inside water-sensitive weights                     |
| [`wLogi`](../src/core/configuration/FoodConfig.ts#L472)                   |       1 | Supply-quality term in urban placement weight                    |
| [`wCong`](../src/core/configuration/FoodConfig.ts#L473)                   |     1.8 | Local crowding penalty in urban placement                        |
| [`farmGrowthRate`](../src/core/configuration/FoodConfig.ts#L476)          |    0.08 | Gompertz maturity growth coefficient                             |
| [`farmSenesceRate`](../src/core/configuration/FoodConfig.ts#L477)         |    0.05 | Maturity decline / fallow coefficient                            |
| [`farmSeedMilli`](../src/core/configuration/FoodConfig.ts#L478)           |      50 | Farm founding/capture maturity and fallow floor                  |
| [`tempBaseN`](../src/core/configuration/FoodConfig.ts#L479)               |    0.15 | Zero-growth lower temperature endpoint                           |
| [`tempOptLoN`](../src/core/configuration/FoodConfig.ts#L480)              |    0.45 | Start of ideal-temperature plateau                               |
| [`tempOptHiN`](../src/core/configuration/FoodConfig.ts#L481)              |    0.75 | End of ideal-temperature plateau                                 |
| [`tempMaxN`](../src/core/configuration/FoodConfig.ts#L482)                |    0.95 | Zero-growth upper temperature endpoint                           |
| [`waterWiltN`](../src/core/configuration/FoodConfig.ts#L483)              |     0.1 | Zero moisture suitability endpoint                               |
| [`waterFullN`](../src/core/configuration/FoodConfig.ts#L484)              |    0.55 | Full moisture suitability endpoint                               |
| [`humidityWeight`](../src/core/configuration/FoodConfig.ts#L485)          |     0.5 | Humidity share in moisture; remainder is freshwater              |
| [`fieldTileYieldMilli`](../src/core/configuration/FoodConfig.ts#L491)     |   20000 | Mature perfect-crop tilled-tile production                       |
| [`fieldTileStorageMilli`](../src/core/configuration/FoodConfig.ts#L495)   |  500000 | Per-tilled-tile storage asymptote if tenure accrues              |
| [`fieldClaimMilli`](../src/core/configuration/FoodConfig.ts#L499)         |     300 | Maturity threshold for permanent field claim                     |
| [`fieldPatchCostMilli`](../src/core/configuration/FoodConfig.ts#L504)     |   50000 | Credit required for one field-spread tile                        |
| [`fieldPatchDriveCapMilli`](../src/core/configuration/FoodConfig.ts#L505) |    3000 | Maximum patch-credit income per nucleus per tick                 |
| [`wFieldWater`](../src/core/configuration/FoodConfig.ts#L506)             |     0.8 | Water premium in field patch placement                           |
| [`foodShedRadius`](../src/core/configuration/FoodConfig.ts#L510)          |      18 | Food-potential half-quality distance                             |
| [`foodShedPower`](../src/core/configuration/FoodConfig.ts#L511)           |       3 | Food-potential falloff power                                     |
| [`wFoodShed`](../src/core/configuration/FoodConfig.ts#L512)               |     1.5 | Food-access multiplier in urban placement                        |
| [`tileKm`](../src/core/configuration/FoodConfig.ts#L513)                  |      20 | Display scale: one tile is tileKm² square kilometres             |

### Live tuning is a simulation input

The food tuning UI sends a `tune_food_config` intent after a 300 ms input debounce. The execution accepts finite, nonnegative values and sets an override on the current game's Config; setting the literal default removes that override. Keys come from the complete default allowlist. This differs from the renderer's climate controls.

The food-allocation action separately clamps a player's requested share to [0,1]. Neither action retroactively reconstructs a game as though it had always used the new setting. Existing caches, stocks, integer credits, structures, and past seed awards remain historical state. Some values affect only the next spawn, some take effect on the next periodic refresh, and unit metadata is cached. A new match is the clearest baseline comparison. Sources: [tuning execution](../src/core/execution/TuneFoodConfigExecution.ts#L12), [merged configuration](../src/core/configuration/Config.ts#L895), [tuning UI](../src/client/GameShellPage.ts#L3313), [allocation action](../src/core/execution/FoodAllocationExecution.ts#L11).

Nonnegative does not mean every value is safe or meaningful: zero lifespan, zero consumption, zero denominators, or extreme coefficients can invalidate arithmetic assumptions. The table records defaults, not validated recommended ranges for arbitrary experiments.

## SimpleFront simplification worksheet

These are choices for you, not changes already made. “Remove” means remove or replace that behavior **in SimpleFront's independent code**, while leaving the root OpenFront implementation unchanged.

| Decision                           | Current rule / complication                                                            | Simpler direction to consider                                    | What must also be reconsidered                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Are people also soldiers?          | Idle people farm, eat, breed, defend, and become attackers                             | Separate population and army, or keep a single pool deliberately | Births, labor, attack costs, AI power, defeat                  |
| What limits population?            | Food limits birth headroom; housing is another estimate, not a cap                     | One explicit carrying capacity                                   | Rural workers, urban visuals, AI readiness                     |
| How local is food?                 | Farm cells, connected meal regions, cross-region labor, national army requisition      | One national pool, or one consistent local district system       | Famine, camp stock, supply raids, planner scores               |
| How does a farm grow?              | Climate-limited Gompertz maturation plus credit-based tile spread                      | Fixed yield per farm, fixed ramp, or fixed-radius field          | Labor, food access, granary capacity, land use                 |
| How should climate matter?         | Crop limits maturity and multiplies yield again                                        | One fertility coefficient                                        | Poor-soil balance, site previews, AI valuation                 |
| What happens to spare food?        | Offer/bank split, wasted offered surplus, capacity overflow, civilian-first withdrawal | Feed first, bank all surplus, then provision armies explicitly   | Allocation UI, runaway stores, campaign duration               |
| Why does storage grow?             | Tenure on eligible farm nuclei; strict rounded climate ceiling                         | Fixed storage per farm or national cap                           | Captures, famine recovery, military runway                     |
| Why does housing age?              | Demand-gated tenure boosts density and core growth pace                                | Fixed housing per tile or settlement                             | Footprint contraction, settlement value, difficulty            |
| What is a front?                   | Local force map, reserve, seep, collision, queue, work budget                          | One pool per attack or fixed-width front                         | Aiming, reinforcements, counterattacks, performance            |
| How is defense calculated?         | Global idle density plus local attacker force, sigmoid and size modifiers              | One readable attack/defense ratio and terrain multiplier         | Snowballing, small states, troop rounding                      |
| What does military supply measure? | Cached node BFS plus probe; single last-captured tile drives attrition                 | Fixed range, average front distance, or food-only upkeep         | Fast advances, retreat, new attacks, disconnected pockets      |
| How does territory change hands?   | Paid tile combat plus free beachhead, collapse, and enclosure transfers                | One capture pathway with explicit exceptions                     | Endgame cleanup, transport value, pockets                      |
| What earns another town/farm?      | Paired peak-population ladder, exponent 2.52, permanent seed ratchet                   | Fixed cost, interval, or simple milestone                        | AI expansion, comeback opportunities, city/farm coupling       |
| How clever should opponents be?    | Difficulty-specific ordered strategies and approximate economic scoring                | A small transparent priority list                                | Challenge, personality, decision cost                          |
| Do inherited systems belong?       | Dormant gold/naval/nuclear/rail code plus some active cross-system hooks               | Keep disabled for future use, or remove deliberately             | Unit groups, AI deletion/target priority, schemas, replays, UI |
| Should developed land persist?     | Empty Urban/Field zones survive famine and transfer on capture                         | Keep persistence, or allow land to revert                        | Rebuilding, farm/town competition, visual history              |

A practical order for deciding, before editing formulas:

1. Define the intended player experience: territory game, population-management game, logistics game, or some explicit mix.
2. Choose the meanings of **population, army, capacity, and food**. These decisions determine most of the downstream mechanics.
3. Choose one food-pooling rule and one capture rule. Then simplify growth/tenure/front mechanics to support those choices.
4. Update the AI to reason about the new rules rather than preserving estimates of removed systems.
5. Compare fixed-seed runs and the same human opening. Change one conceptual system at a time so its effect is attributable.

Likely edit locations in the independent copy: [SimpleFront food configuration](../simplefront/src/core/configuration/FoodConfig.ts), [food ledger](../simplefront/src/core/execution/utils/FoodEconomy.ts), [farm growth](../simplefront/src/core/execution/utils/FarmGrowth.ts), [urban growth](../simplefront/src/core/execution/utils/UrbanGrowth.ts), [combat configuration](../simplefront/src/core/configuration/Config.ts), [attack execution](../simplefront/src/core/execution/AttackExecution.ts), [AI decisions](../simplefront/src/core/execution/utils/AiAttackBehavior.ts). These links identify the copy to work on; this document's rule citations point to the original baseline.

## Evidence and limits

This is a static audit of the current source and relevant test fixtures, with independent numerical checks of selected worked examples. Existing tests were read for context; this document does not claim a fresh full test-suite or long-run balance result.

Coverage includes the active CPU economy, population, farming, urbanization, seeds, combat, logistics, transport, AI, diplomacy, spawning, elimination, victory, tuning, and principal retained unit-system formulas. The legacy appendix explicitly names navigation/trajectory/AI subalgorithms not fully expanded into equations. Renderer shading, map-generation noise and baking, UI layout, serialization, and infrastructure implementation are not game-rule formulas and are outside this catalog.

Several apparent inconsistencies are intentionally preserved as observations, not silently corrected: comments disagreeing with literal defaults, strict rounding preventing some maturity thresholds, broad `Structures` membership affecting tribe deletion/targeting, and AI models approximating rather than reproducing simulation rules. Source links let you distinguish the actual baseline from a future intended design. Once SimpleFront diverges, keep this as the OpenFront baseline and record SimpleFront's changed rules separately.
