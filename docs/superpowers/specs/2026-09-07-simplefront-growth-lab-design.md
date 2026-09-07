# SimpleFront Demos and Urban Growth Lab

Approved conversational design, September 7, 2026. The user's final navigation
instruction supersedes the earlier toolbar-link proposal: gameplay remains
unchanged; demos have their own entirely separate gallery.

## Scope

Create `/simplefront/demos/` on the existing root dev server (standalone copied
server: `/demos/`). The gallery selects experiments; initially it offers one real
experiment, Urban Growth. No placeholders for unimplemented demos. No game
toolbar, picker, economy, combat, root gameplay or runtime changes. No additional
dependencies, server, workers, commits or deployment. Execute inline in the
existing checkout, preserving unrelated work.

The growth lab is a 64×64 CPU/Canvas simulation with one centre and all land
available. No food, troops, farms, logistics, ownership or capture simulation.
Its numbers measure housing/population **capacity**, not actual residents.

## Model

- Fixed 0.25-second simulation steps and seeded choices, independent of rendering.
- Developed tiles store capacity. Maturity is its inverse under
  `capacity = ruralCapacity + (urbanCapacity-ruralCapacity)*maturity^densityExponent`.
- New rural tiles cost their full capacity from a shared development allowance;
  incomplete expansion stores credit, never creating free housing.
- Existing tiles mature toward a location-dependent density ceiling. Centre
  distance lowers preferred density; terrain and neighbours influence it.
- One city-wide allowance per step:
  `rate * localSuitability * (1 - (capacity+pendingCredit)/cityCeiling) * dt`.
  No per-neighbourhood reproduction of this allowance.
- Choose expansion versus densification using the preference parameter and
  seeded weighted legal candidates. Expansion is four-connected, dry, and within
  maximum centre reach. No detached satellites, water crossing or new centres.
- Suitability favours water proximity, gentle slopes and modest downhill over
  uphill. Steep slopes cost in either direction. Weights are game abstractions,
  not hydrology or real-world urban predictions.
- Finite tile density, city capacity and reach. Remaining capacity under one unit
  may snap to the ceiling only when a legal tile can receive it. If no legal
  candidates remain, report terrain-constrained rather than mature.
- Configuration changes apply through explicit Apply & restart, never silently
  retroactively changing capacity. Zero speed/rate and extreme valid settings
  must remain finite and responsive.

## Presets and interaction

Six complete named scenarios: plain, hillside, river valley, coastal basin,
mountain pass, rolling hills. Each includes deterministic terrain parameters,
city location and full growth settings. Start paused with the suggested city;
click another dry tile to relocate and restart. Play/pause, one-step, speeds
1×/5×/20×, same-scenario restart, seed change and reset defaults.

Raise/lower/smooth/water/dry brushes edit a paused terrain draft. Applying terrain
clears development, recalculates slopes and water distances, and retains the
centre only if still dry. Cancel restores the unmodified scenario. Actual edited
heights and water mask are included in exported JSON alongside complete settings,
seed and centre. Import validates version, dimensions, finite bounded values,
settings relationships and dry centre before changing any state. Import starts
the scenario paused, not a saved simulation timeline.

Canvas views: combined terrain/development, elevation, suitability, density and
candidate choices. Show centre and reach; density legend; tile inspector with
height, slope, water distance, maturity, capacity, target and score factors.
Charts show footprint separately from capacity/mean density. Status explains
the last growth action. Export/import via local JSON, no network persistence.

## Variables / defaults

City ceiling 20000; reach 20 tiles; rate 200 capacity/s; densify preference .65;
rural capacity 100; urban tile capacity 2000; density exponent 2; centre falloff
.75; slope penalty 8; uphill penalty 12; water bonus .5; neighbour attraction
1.2; irregularity .15. Heights normalized 0–1; water reach 5 tiles. Terrain
controls include preset, seed, relief and editing radius/strength. All values are
experimental and preset-specific, not changes to SimpleFront's playable balance.

## Calibration detail

The base densification preference rises toward 1 as capacity fills:
`1-(1-densify)*(1-capacity/ceiling)^2`. Densification candidate weights multiply
by `(.2+maturity)^2`. These make established neighbourhoods fill in and prevent
late growth being dominated by low-density sprawl. A pending expansion reserves
its full rural capacity but shares subsequent steps with densification. Both
effects were verified against a failing density-growth regression. This replaces
the initial prototype's constant category preference and blocking construction.

## Verification

Real deterministic model tests: formula, density without area expansion, shared
rate, cap/reach/connectivity/water, terrain speed/direction, blocking, replay.
Scenario tests: all presets runnable; edits; JSON roundtrip and rejection without
mutation. Real UI event tests: gallery, presets, play/step/reset, settings, editing,
import/export and timer cleanup. Browser checks on normal root server, responsive
layout, error-free Canvas, controls, charts and selection. Fresh copied suite,
typecheck, scoped lint, build, root isolation and unchanged root diff evidence.
