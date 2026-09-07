# Demos / Urban Growth Lab

Click **Demos** on the homepage, then select **Urban Growth Lab**. You can also open
**http://localhost:9000/simplefront/demos/** on the normal root `npm run dev`
server. The standalone copied dev server serves the
same gallery at `http://localhost:9010/demos/`.

Use **← Home** to return to the homepage from the gallery, lab or game shell.
This leaves the current game or experiment. **← All demos** returns from the lab
to the gallery.

This is an entirely separate page and entry bundle. There is no demo link or
experimental control in the gameplay picker or toolbar. OpenFront Live and
SimpleFront's playable rules are unchanged. The gallery currently contains one
original experiment, alongside the newer **Demand-led City Lab**. See
`city-demand-lab.md` for the population-driven version without a city ceiling.

## Try it

1. Load a preset and press Play. Each of the six presets includes all settings,
   a deterministic seed and a suggested dry-land centre. They start paused.
2. Use 20× speed to observe several simulated minutes in seconds. Pause or Step
   to inspect individual decisions. Click another dry tile to relocate/restart.
3. Compare **land occupied** with **capacity and average density**. A city can
   keep increasing capacity without occupying additional tiles.
4. Change sliders, then **Apply settings & restart**. Sliders are a draft until
   applied. Invalid combinations produce an error and preserve the current run.
5. Use **Edit terrain** to raise, lower, smooth, paint water or restore dry land.
   Applying edits restarts development; Cancel leaves the terrain untouched.
   Submerging the centre clears it: click dry land to establish another city.
6. Export a scenario to keep the actual edited height/water arrays, full settings,
   seed and centre. Import starts that scenario from the beginning, paused. It
   is not a saved simulation timeline. Import rejects malformed or oversized files.

Preset relief rebuilding replaces the terrain draft, including brush edits.
Regenerate uses the entered seed, current growth settings and relief; Preset
defaults restores that preset's entire setup. Water masks are explicit rather
than inferred from an adjustable sea level.

## Presets

| Preset        | Purpose                                                | Seed | Suggested centre |
| ------------- | ------------------------------------------------------ | ---: | ---------------- |
| Open plain    | Control case: no terrain resistance                    |   42 | 32,32            |
| Hillside      | Compare downhill and uphill                            |   61 | 32,32            |
| River valley  | Water attraction without river crossing                |   19 | 24,32            |
| Coastal basin | Accessible waterfront, higher densification preference |   86 | 32,23            |
| Mountain pass | Development through a saddle versus steep ridge        |   12 | 27,32            |
| Rolling hills | Irregular terrain and reproducible variation           |   73 | 32,32            |

All maps are 64×64. Heights are normalized to 0–1. Terrain presets are schematic
experiments, not real-world hydrological or urban forecasts.

## Variables

The complete settings and allowed ranges live in `src/demos/urban-growth/config.ts`.

| Variable          |   Base default | Meaning                                             |
| ----------------- | -------------: | --------------------------------------------------- |
| `ceiling`         |         20,000 | City-wide housing capacity limit                    |
| `reach`           |       20 tiles | Maximum Euclidean distance from the original centre |
| `rate`            | 200 capacity/s | Shared development rate before local modifiers      |
| `densify`         |           0.65 | Starting preference for improving existing tiles    |
| `ruralCapacity`   |            100 | Capacity required to establish a new tile           |
| `urbanCapacity`   |          2,000 | Fully mature tile capacity                          |
| `densityExponent` |              2 | Nonlinear maturity-to-capacity relationship         |
| `centreFalloff`   |           0.75 | Preferred density falls toward the outskirts        |
| `slopePenalty`    |              8 | Resistance to steepness in either direction         |
| `uphillPenalty`   |             12 | Additional uphill resistance                        |
| `waterBonus`      |            0.5 | Water attraction and local speed bonus              |
| `neighbourWeight` |            1.2 | Attraction toward established neighbourhoods        |
| `irregularity`    |           0.15 | Stable seeded local variation                       |

Individual presets override some of these settings. The demo exposes all values;
the current SimpleFront game does not consume them.

## Exact prototype rules

### Capacity and maturity

For a developed tile with maturity `d` in [0,1]:

```text
tileCapacity(d) = ruralCapacity + (urbanCapacity-ruralCapacity) × d^densityExponent
cityCapacity = sum(developed tile capacities)
meanDensity = cityCapacity / developedTileCount
```

The model stores capacity and derives maturity using the inverse of this formula.
At the defaults, maturity 0/.5/1 means capacity 100/575/2000. Display bands are
rural below .3, suburban .3–.7, urban from .7 upward. Capacity is not actual
population; no residents, troops, food, workers or consumption are simulated.

### Terrain suitability

```text
waterEffect = waterBonus × exp(-waterDistance / 5)
suitability = clamp((1+waterEffect) × exp(-slopePenalty×slope-uphillPenalty×uphill), .1, 2)
```

Water tiles have suitability zero and cannot develop. `waterDistance` is a
four-neighbour tile distance, not watershed access. `slope` is the maximum
absolute adjacent dry-land height difference. `uphill` is the smallest positive
climb from an adjacent developed tile (zero at the centre). Steep downhill still
incurs the slope penalty. The .1 floor prevents legal steep sites having zero speed.

### Location-dependent density

```text
nearbyDensity = sum(adjacent developed tile maturities) / 4
preferredMaturity = clamp(
  1 - centreFalloff×(distance/max(1,reach))^.8
  + .12×(suitability-1) + .15×nearbyDensity,
  .08, 1)
```

The centre's preferred maturity is 1. A tile does not lose existing development
if its preferred value changes; it simply cannot densify further until its target
exceeds its current capacity. Candidate targets are recalculated as the city fills in.

### Choice and shared budget

Each fixed .25-second step considers existing tiles below their local capacity
target and four-connected dry frontier tiles within reach. Frontier tiles do not
become new centres and cannot cross water or grow detached satellites.

```text
densifyChance = 1 - (1-densify) × (1-cityCapacity/ceiling)^2
candidateWeight = suitability² × exp(-2×distance/max(1,reach))
  × (1+neighbourWeight×developedNeighbours/4)
  × (1+irregularity×(seededTileNoise×2-1)×.9)
```

Densification weights additionally multiply by `(.2+tileMaturity)^2`, favouring
established neighbourhoods. The inspector shows this actual candidate weight.
Choose a category using `densifyChance`, then a seeded weighted candidate in that
category. If one category is unavailable, use the other. As the city develops,
fill-in increasingly replaces sprawl. Rendering/inspection does not draw randomness.

```text
allowance = rate × chosenSuitability
  × (1-(cityCapacity+pendingConstructionCredit)/ceiling) × .25
```

This is one city-wide allowance, never one allowance per neighbourhood. Expansion
accumulates `ruralCapacity` before a tile appears. One pending expansion reserves
its full eventual capacity, but existing tiles may mature between construction
steps. Densification is clipped to the tile target and unreserved city capacity.
Unused allowance is not banked, except for that pending rural construction credit.

Within one capacity unit of the city ceiling, a legal final densification or final
pending expansion can complete the remaining fraction. This is the only rounding
exception to the per-step allowance. Otherwise city/tile ceilings are never exceeded.

No legal candidates means **constrained**, not mature. Zero rate reports that
development is stopped. A browser run pauses on constrained/mature/zero-rate status,
when the tab is hidden, or when returning to the gallery. Existing development is
not destroyed just because it reaches a limit.

## Observations and verification — September 7, 2026

The first prototype exposed an allocation defect: pending expansion monopolized
later steps, producing many rural tiles and declining mean density. A failing
regression reproduced it. The corrected model shares work, favours established
neighbourhoods and shifts toward densification with maturity.

Selected fixed-seed observations (not gameplay balance claims):

| Scenario / simulated age | Footprint | Capacity | Mean capacity/tile |
| ------------------------ | --------: | -------: | -----------------: |
| Plain, 60 s              |        15 |    8,506 |                567 |
| Plain, 300 s             |        20 |   18,483 |                924 |
| Plain, 600 s             |        20 |   19,848 |                992 |
| Valley, 60 s             |        21 |    8,737 |                416 |
| Valley, 300 s            |        24 |   18,694 |                779 |
| Valley, 600 s            |        24 |   19,860 |                827 |

- Fresh copied baseline: 181 tests / 28 suites.
- Current copied suite: 205 tests / 31 suites; 24 new model/scenario/UI tests.
- Typecheck, scoped lint and copied production build pass; existing game chunk-size
  warning remains. The demo has its own small JS/CSS entry, with no game bootstrap.
- Root picker/runtime-isolation suite: 35 tests / 2 suites pass.
- Root tracked diff remains the pre-existing 8 files, 74 insertions, 1 deletion.
- Browser coverage: separate gallery, all six presets, actual timed growth,
  overlays, inspector, terrain brush/apply, settings restart, zero-rate behaviour,
  JSON export/import roundtrip, gallery return and 390-pixel layout. No page errors
  in either complete pass. The final post-calibration river-valley run reached
  300.25 simulated seconds, 24 tiles, 18,697 capacity and 779 capacity/tile. It
  then passed terrain editing, settings, file roundtrip and gallery return.
  Local screenshots: `/private/tmp/simplefront-growth-lab-desktop.png`,
  `/private/tmp/simplefront-growth-lab-mobile.png`, and
  `/private/tmp/simplefront-demos-gallery.png`.

No game-balance claims, ownership/capture implementation, quarries, oil, farms or
watershed model are included. This lab is the place to settle those growth choices
before integrating them into SimpleFront.
