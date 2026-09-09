# Population-led City Lab · experiment 03

Open **Demos → Population-led City Lab**, or
`http://localhost:9000/simplefront/demos/#city-population`.

This is an independent copy of experiment 02. Its terrain, presets, candidate
selection, per-tile maturation costs, numbered level colours, four-sided upgrade
support, terrain editor, charts and population-shock controls are preserved.
Experiments 01 and 02 and gameplay are unchanged. There are no imports from
either earlier demo into this copy.

The only model additions are a development-to-fertility gradient and
population/housing-driven growth. No food, consumption, logistics, mortality,
age groups, households, migration routes or combat are simulated.

## Tunable fertility gradient

Four controls specify two endpoints. Default lower level is 1, upper level 10,
with respective births-per-woman equivalents 4.5 and 1.5.

```text
D(L) = clamp((L − lowerLevel) / (upperLevel − lowerLevel), 0, 1)
B(L) = lowerLevelBirths + D(L) × (upperLevelBirths − lowerLevelBirths)
```

The boundary levels must be integers with 1 ≤ lower < upper ≤ 100. Birth values
can range from 0 to 10. Equal birth endpoints disable the development effect;
reversed endpoints allow testing an increasing gradient. Values outside the
level boundaries remain at the nearest endpoint. Level-zero wilderness has no
housing, residents or fertility. These bounds do not cap building levels or
housing, and do not change when the city's highest level increases.

The preview updates immediately for draft settings, showing dots at integer
levels and the plateau just beyond the upper boundary (up to level 100).
Hover a dot for its numerical fertility. **Apply settings & restart** applies
all controls together to a new paused run. Invalid boundaries do not replace
the active run. Existing tile colours continue to represent completed levels,
not the adjustable demographic index.

This is an urban-development game proxy, not actual HDI or a real demographic
prediction. Lifetime births per woman are not people per second: the separate
population-speed setting calibrates their game-time effect. Low fertility slows
births; it does not automatically kill residents or remove development.

## Residents and population

Housing remains `H_i = housingPerLevel × L_i`, default 100 per level. The city
starts with one level-one tile and 80 residents. Global population P is allocated
across developed tiles at uniform occupancy:

```text
H = sum(H_i)
P_i = P × H_i / H
meanFertility = sum(P_i × B_i) / P
developmentIndex = sum(P_i × D_i) / P
```

At zero population, both displayed resident-weighted means are zero. Births
come from actual residents, not vacant housing. Uniform occupancy is a deliberate
simplification: adding housing redistributes the resident shares immediately,
without simulating people travelling between tiles. The inspector shows these
estimated residents, development index, fertility, housing and existing support
and maturation progress.

Per simulation second:

```text
vacancyFraction = clamp(1 − P/H, 0, 1)
populationGain = populationSpeed × (P × meanFertility / 3 + 10) × vacancyFraction
P_next = min(H, P + populationGain × 0.25)
```

Default population speed is 0.2; 3 is a fixed game calibration reference, not
replacement fertility. The constant 10 is a small baseline repopulation
allowance separate from births, which allows an emptied city to recover even
with zero fertility. At defaults it can add up to 2 people/s. Setting population
speed to zero stops both births and baseline recovery.

For fixed housing, the resident-dependent term gives slow–fast–slow logistic
replenishment, with baseline recovery enabling a start from zero. Full housing
stops population gain. Construction, terrain and changing fertility mean the
whole city's chart is not forced to follow a single S-curve.

## Housing pressure and shared development

The default target occupancy is 85%, tunable between 50% and 95%.

```text
desiredHousing = P / targetOccupancy
pressure = clamp((P/H − targetOccupancy) / (1 − targetOccupancy), 0, 1)
populationWorkFactor = 0.25 + 0.75 × sqrt(P / 100)
sharedWorkPerSecond = developmentSetting × populationWorkFactor × pressure
selectedTileAllowance = sharedWorkPerSecond × terrainSuitability × 0.25
```

At or below target occupancy, construction pauses while vacancies fill. Above
it, pressure rises smoothly to 100% when housing is full. Thus a full city can
still create housing even though births have paused: there is no full-housing
deadlock. Desired housing is a diagnostic target, not a construction queue or
an additional ceiling.

At full pressure and the default development setting (200), 100 residents
provide 200 work/s; 400 provide 350 work/s. More people increase one shared
budget with diminishing returns, not one new budget per tile. The displayed
work rate is before terrain, candidate availability, and completion limits.

Pressure scales the existing development mechanism, not its choice rules.
The original maturation preference, maturation ramp and terrain selection still
choose between an eligible upgrade and expansion. Each completed new tile or
upgrade adds 100 housing at defaults. All four cardinal neighbours must meet
the current level before an upgrade. A step completes at most one level; a new
tile always enters at level 1. Paid partial work persists through pauses and
population losses. No buildings shrink or disappear when residents are lost.

## Try comparisons

1. Pick any of the original six landscapes; play at 20× or 60×.
2. Compare levels 1–10 with fertility 4.5–1.5 against a flat 3–3 gradient.
3. Try levels 3–15 with fertility 5–2; the midpoint, level 9, is 3.5.
4. Move the occupancy target to compare earlier versus later housing demand.
5. Lose half the population: development stops while the city refills, without
   erasing its levels or paid work. Fill vacancies to see full-pressure growth.
6. Inspect the population gain, housing pressure, desired housing and shared
   work readouts alongside the original charts.

Export/import preserves terrain, seed, centre and all settings, not simulation
state. The version is `city-population-3`; earlier demos' exports are rejected.
This is a controlled sandbox for tuning, not a claim of final game balance.

## Streets & buildings view

The default view now illustrates neighbourhoods with a separate, purely visual
4×4 pixel sprite. Each cell contains only sixteen flat road, building or green-space
pixels; there are no miniature roofs, windows, shadows or trees. **Development levels** and the other diagnostic views remain
available. **Levels** overlays the existing integer numbers on the street view.
Use **Fit city**, **+ / −**, or **Whole map** to frame the city. Drag to pan when
zoomed; clicking without dragging still relocates and restarts the centre.
Terrain painting and tile inspection use the same zoom-aware coordinates.

This is incremental local growth with connectivity constraints, not a physical
transport simulation or a strict synchronous cellular automaton:

- The centre starts with a small connected street. Each new developed tile
  attaches to an already connected neighbour, preferring gentler terrain and
  existing street direction. Water and wilderness never receive streets.
- Shared tile-edge gates match exactly. Local corridor paths link each gate
  to the neighbourhood junction; the network remains connected at microcell
  resolution, not just at the simulation-tile level.
- **Extra street connections** adds joins to nearby branches, making loops.
  Zero keeps the explicit neighbourhood connection graph a tree; higher
  values close more blocks. **Street straightness** varies junction offsets
  and continuation preference. Each neighbourhood has at most one corridor
  toward each neighbour, keeping room for buildings and gardens.
- Building pixels appear beside existing roads. Nearby buildings encourage
  clusters. As levels increase, more available pixels fill in and the building
  palette changes. These pixels are symbols, not an exact census or extra housing.
- Future junction corridors are reserved before homes are placed, so adding
  a connection never demolishes an existing visual house. Existing roads and
  building positions persist through maturation and population loss; muted
  building colours suggest vacancies without deleting structures.

**Redraw streets only** applies the two visual settings to the current city;
it deliberately reconstructs the visual network but never resets or changes
the simulation. Camera, level toggle and street settings are presentation-only
and are not stored in scenario exports. Given the same seed, visual settings
and growth sequence, the layout is repeatable. Redrawing an already-grown city
uses a connected reconstruction rather than replaying its entire growth history.

The layout has its own stateless seeded noise and reads the model without
writing to it. It updates after simulation steps regardless of the selected
view; drawing itself does not evolve the streets. No population, housing,
fertility, food, upgrade, terrain or construction formulas are changed.

### Visual ages and building emphasis

House palettes blend linearly between editable visual level anchors. Defaults:

| Level | Style label                             | Buildings                                                           | Streets                   |
| ----- | --------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| 1     | Village                                 | Dirt, clay and earth browns                                         | Dirt brown                |
| 3     | Middle Ages town                        | Brick reds and weathered shingle browns/greys                       | Same dirt brown           |
| 5     | Classical town · 1300–1600              | Portuguese-style red roofs, blues and ochre                         | Light cobblestone         |
| 8     | Industrial / Victorian town · 1600–1800 | Darker soot, dusty brick and desaturated slate                      | Dark, dirty grey          |
| 12    | Modern town · 1800–1950                 | Sleek silver metal, Art Deco limestone, patinated copper and bronze | Car-oriented dark asphalt |
| 16+   | Post-modern town · 1950–future          | Cyberpunk neon cyan, magenta, violet and acid yellow                | Near-black blue-grey      |

These are requested art-direction labels, not historical period definitions or
a simulated calendar. Level 2 is halfway between Village and Middle Ages;
levels above 16 retain the final palette with the default settings. Each house has a stable seeded palette
slot, so neighbouring buildings can differ in colour without flickering as the
city grows. Vacancies mute each house's own colour rather than replacing all
vacant buildings with one uniform colour. The legend shows all six age palettes;
the inspector reports the hovered tile's age and blend percentage. Integer level
colours remain unchanged in the diagnostic view.

The **Age ranges** panel sets the full-colour level for each of the six eras.
Anchors must be strictly increasing whole numbers from 1 to 100. Colours blend
between adjacent anchors, remain Village below the first, and retain the final
palette above the last. For example, Village at 2 and Middle Ages at 6 give a
50% blend at level 4. Valid edits immediately update buildings, roads, ground,
legend and inspector without restarting or rebuilding the street layout.
Invalid drafts keep the last valid palette; **Restore default ages** resets
all six inputs. These visual preferences survive scenario restarts and preset
changes in the current demo, but are not saved in scenario exports or across
leaving/reloading the demo. They do not affect fertility or any growth rules.

Road colours now follow the era's materials: dirt, light cobblestone, industrial
grime, asphalt and very dark futuristic streets. Ground colours also blend toward
a darker urban backdrop in the cyberpunk era. These are flat sprite colours,
not extra texture, geometry, lighting or pixel detail. The default extra-connection
preference remains at 20% to keep more room for buildings.
Junction offsets prefer a common interior alignment at the default straightness,
reducing needless bends and reserved road pixels on the tiny 4×4 sprite. Lower
straightness still permits offset junctions. Building infill targets `1 + 2 × level`
pixels, constrained by actual road frontage and reserved corridors; a supported
four-way neighbourhood can contain eight building pixels against seven street
pixels. No sprite gains additional pixels, shading details or simulation capacity.
