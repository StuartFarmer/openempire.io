# Demand-led City Lab

Open **Homepage → Demos → Demand-led City Lab**, or
**http://localhost:9000/simplefront/demos/#city-demand**.

Experiment 02 is rebuilt from a copy of the original Urban Growth Lab with
focused changes. Experiment 01, OpenFront Live and SimpleFront gameplay are
unchanged.

## Preserved from the first demo

- All six 64×64 presets: plain, hillside, valley, coast, pass and rolling terrain.
- Terrain brushes, relief, seeds, centre placement, overlays and charts.
- Terrain suitability, uphill resistance, water attraction, neighbourhood
  influence, distance weighting and seeded organic variation.
- The centre-to-outskirts maturity targets; housing now uses a linear formula.
- Interleaved growth: an unfinished rural tile does not block maturation of
  existing tiles on other steps.
- Draft controls: **Apply settings & restart** applies settings. Terrain edits
  likewise use Apply/Cancel.

## Focused changes

1. **No city-wide housing ceiling or ceiling-related slowdown.** A shared
   development rate limits speed; more tiles do not create more growth engines.
2. **No hard radius.** The distance control remains a density/selection falloff
   scale. The dashed circle is a reference, not an expansion boundary.
3. **Integer development levels.** Wilderness is level 0; completed rural
   establishment is level 1. Each completed maturation adds one level, up to 100.
   Each tile follows its own slow–fast–slow maturation curve. Paid unfinished
   work is separate and awards no partial levels. A simulation step can complete
   at most one level, regardless of the work-rate setting.
4. **Population and vacancies.** Construction pauses at or below 85% occupancy.
   Losing people never removes development or paid progress; population fills
   existing vacancies before construction resumes.
5. **Four-sided upgrade support.** A level-L tile can mature only if its north,
   south, east and west neighbours are each level L or higher. Higher-level
   neighbours count; diagonals do not. Water, wilderness and missing map-edge
   neighbours block maturation. The percentage slider chooses among eligible
   upgrades; if none qualify, development expands instead.
6. **Linear housing.** Housing per tile is 100 × level at the default settings.
   A new tile and each completed +1 upgrade both add 100 housing places. The
   advanced Housing per level control adjusts that common increment.

Local density targets and finite land remain constraints. Removing the city-wide
ceiling does not make every tile target level 100 or permit growth after all
reachable land has exhausted its local development opportunities.

## Try it

1. Choose a preset, select 20× or 60×, and press Play. The demo starts paused.
2. Read each developed cell's level number and distinct level colour. Colours
   stay fixed as the city grows; the legend shows levels currently present.
   The city centre is outlined so its number stays visible. Wilderness has no
   number. Hover for paid upgrade progress and the four-sided support check.
3. Adjust **Maturation preference**, then apply settings and restart. Higher
   preference directs more growth steps into existing cells.
4. Inspect **Upgrade support · N/S/E/W** to see how many of the four sides meet
   the tile's current level requirement. Even at 100% upgrade preference, a lone
   centre must expand until all four sides support it.
5. Press **Lose 50% population** or **Empty city**. Buildings remain as people
   refill them. **Fill vacancies** changes population without creating housing.
6. Edit terrain and apply it; inspect the suitability and candidate overlays.
7. Export a scenario to retain terrain, settings, seed and centre. Import starts
   a fresh paused run, not a saved city. The separate JSON version tag is
   `city-demand-2`; experiment 01 exports are rejected.

Home returns to the homepage; All demos returns to the gallery. Leaving the
experiment or hiding the tab pauses playback.

## Formulas

The simulation advances in 0.25-second steps.

### Housing and completed maturation

For a developed tile at integer level L:

```text
maturity = (L - 1) / 99
housing = housingPerLevel × L     // default housingPerLevel = 100
```

At defaults, level 1 provides 100 places, level 2 provides 200, level 5 provides
500, and level 100 would provide 10,000. Wilderness provides zero. The centre
starts at level 1 with 80 people. The nonlinear housing-exponent control has
been removed; importing an older scenario ignores its saved exponent.

Work costs are separate from housing gains. Let T be the tile's current local
target level, computed from the original terrain/neighbourhood maturity target:

```text
T = 1 + floor(targetMaturity × 99)
phase = (L - 0.5) / (T - 1)       // midpoint of the next discrete level
speed = 0.1 + 0.9 × 4 × phase × (1 - phase)
maturationWork = (workReference - housingPerLevel) / 99 / speed
establishmentWork = housingPerLevel / 0.1
```

The work reference stays at 2,000 by default, preserving maturation costs and
timing. It is no longer a housing maximum. Scenario JSON retains the existing
keys: `ruralCapacity` means housing per level and `urbanCapacity` means work
reference, so older exports remain importable.

Work accumulates on the selected cell until one whole level is paid. Only that
level completes; unused step allowance cannot buy more levels. A new tile must
complete its establishment at level 1 before later steps can mature it. Default
establishment costs 1,000 work and awards 100 housing places. This includes the
slow opening phase instead of making expansion a cheap bypass around maturation.
Paid progress survives vacancy pauses and population losses.

This is a discrete, regularized sigmoid-shaped progression in **tile levels**,
not a pure logistic equation. It accelerates through intermediate levels and
slows near the local target, including targets below 100. A higher target from
neighbourhood development allows further maturation without resetting the tile.
Selection frequency, terrain and demand pauses also affect elapsed time.

The work curve applies only while the tile is eligible. An isolated tile cannot
mature at all; waiting does not accumulate maturation credit without support.
Higher work rates are limited by the one-level-per-step rule, which can flatten
the fastest part of the curve.
There is no separate work generator for each tile and no imposed city-wide
S-curve: the aggregate city chart can still have approximately linear stretches.

### Shared rate and maturation preference

```text
allowance = developmentRate × selectedTileSuitability × 0.25
```

There is one city-wide selection per step, using the original candidate weights.
Terrain affects selection and speed. If the chosen category has no candidates,
the other category is used. Unsupported tiles are removed from the maturation
candidate list before this choice, so no percentage setting bypasses the rule.

The first demo increasingly favours maturation as housing develops. That ramp
is retained separately from the removed ceiling:

```text
r = clamp(cityHousing / maturationScale, 0, 1)
maturationChance = 1 - (1 - sliderPreference) × (1 - r)²
```

The default reference is 20,000 housing places. It is **not a housing limit or
rate taper**. Above it, eligible maturation is favoured; expansion continues when
no maturation is available. Set the advanced **Maturation ramp · housing
reference** to zero to use the slider percentage directly throughout the run.

The percentage describes growth-step choices, not an exact share of housing or
construction time.

### Terrain and neighbourhoods

Selection scores and local density targets are copied from experiment 01.
Water is impassable. Uphill is the smallest positive climb from an adjacent
developed tile; distance is Euclidean distance from the centre.

```text
waterEffect = waterBonus × exp(-waterDistance / 5)
suitability = clamp(
  (1 + waterEffect) × exp(-slopePenalty × slope - uphillPenalty × uphill),
  0.1, 2
)
nearbyDensity = sum(adjacent developed maturity) / 4
targetMaturity = clamp(
  1 - centreFalloff × (distance / max(1, reach))^0.8
    + 0.12 × (suitability - 1) + 0.15 × nearbyDensity,
  0.08, 1
)
```

The centre targets maturity 1. Other cells mature only when the next whole level
fits the local target **and** all four sides support the current level:

```text
upgradeAllowed = L >= 1 and L < 100
              and all four cardinal neighbours exist on dry land
              and min(northLevel, southLevel, eastLevel, westLevel) >= L
              and nextLevelHousing <= localTargetHousing
```

The centre has no exception. Mature neighbours can raise the terrain-derived
target over time, but never bypass four-sided support. A 5×5 dry plot can form
layers of 1, 2 and 3; it cannot build a level-100 tower. On the current 64×64
maps, the geometric maximum is level 32, with water and other constraints often
lowering it. At the default linear housing increment, level 32 would provide
3,200 places. Four-sided support still limits achievable density independently
of the housing gained per level.
The settlement and Development levels views now use discrete level colours,
not the old density gradient. Elevation, suitability and candidate views retain
their diagnostic colours while also displaying developed cells' level numbers.

```text
score = suitability²
      × exp(-2 × distance / max(1, reach))
      × (1 + neighbourWeight × developedNeighbourCount / 4)
      × (1 + irregularity × (2 × seededNoise - 1) × 0.9)
```

Developed candidates additionally multiply score by `(0.2 + maturity)²`.

### Population

Let H be housing, P population, and x = P/H:

```text
P = min(H, P + populationRate × [0.1 + 0.9 × 4x(1-x)] × 0.25)
vacancies = H - P
constructionAllowed = P/H > 0.85
```

This modified sigmoid-shaped refill is fastest around half occupancy. The 10%
rate floor permits recovery from zero. A zero population rate disables all
replenishment. Its maximum rate does not automatically multiply with city size.
A completed level or rural tile can create enough vacancies to pause construction
until population catches up.

No food, logistics, ownership, combat or household simulation is included.

## Four-sided growth check — September 7, 2026

After 1,200 simulated seconds at each preset's defaults:

| Preset   | Developed tiles | Highest level | Housing |
| -------- | --------------: | ------------: | ------: |
| Plain    |             195 |             8 |  49,700 |
| Hillside |             161 |             6 |  34,800 |
| Valley   |             194 |             6 |  44,800 |
| Coast    |             205 |             7 |  52,300 |
| Pass     |             127 |             4 |  22,900 |
| Rolling  |             150 |             6 |  32,500 |

Initial terrain scores and local density targets still match experiment 01.
Footprint comparisons from earlier revisions no longer apply: four-sided
support deliberately forces outward development before higher levels unlock.

Regression tests cover terrain-score comparisons, shared work limits, integer completion,
partial progress, interleaved rural establishment, growth beyond the old ceiling,
four-sided support at every upgrade, higher-level neighbours, water/edge blockers,
vacancy-first recovery, controls and scenario validation. Browser checks cover
matched-preset rendering, real-time growth, population loss/recovery, the integer
inspector, overlays, terrain brushes, export/import, mobile layout and navigation.

These are prototype mechanics, not real-city predictions or final game balance.
