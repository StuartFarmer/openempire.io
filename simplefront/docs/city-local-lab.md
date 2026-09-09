# Demo 4: Local development lab

An independent copy of Demo 3 for testing tile-local development. The user approved
this behaviour for SimpleFront integration on September 8, 2026. Demo 3 and
OpenFront live remain unchanged; actual-game integration is tracked separately.

## Open it

Home → Demos → **Experiment 04 · Local development lab**.

- Host development server: <http://localhost:9000/simplefront/demos/#city-local>
- Standalone SimpleFront server: <http://localhost:9010/demos/#city-local>

## Try the rules

Choose a terrain preset and an arrangement: one settlement, two players with a
shared border, or two disconnected neighbourhoods belonging to one player.

Both players simulate simultaneously. Selecting A or B changes the displayed
metrics and the player affected by population controls and map tools.

Select **Capture/claim** and click a developed tile to transfer that tile only.
Capture the original founding tile to confirm that surrounding development does
not transfer or stop growing. The tile inspector shows ownership and the four
neighbours used for upgrade eligibility. Coordinates and **Apply to tile** provide
an alternative to clicking. Use the territory overlay to inspect borders.

Use the founding tool on owned wilderness to test disconnected neighbourhoods.
Additional seeds add housing, not another construction budget or free population.
Only a player's first founding supplies an opening population equal to 80% of
that tile's housing. Capture does not grant an opening population.

The original terrain, fertility gradient, housing-pressure, maturation preference,
per-tile maturation curve, level numbers, 4×4 streets and editable age palettes
remain available. Drag to pan when zoomed. Ordinary inspection does not reset the
simulation; restarting at a chosen tile is an explicit tool.

### Live age palettes

In the Streets view, the age legend beneath the map includes colour pickers for
each age's four building variants, roads and ground. Edits repaint already-built
tiles immediately, including while paused, and retain the gradients between ages.
They do not change levels, population, street layout or the age boundaries.
**Reset palettes** restores the user's approved palette saved in
[`city-local-palette.json`](city-local-palette.json), which is also the initial
palette after loading the page. Colour edits persist through
simulation restarts on this page, but are not saved across page reloads or included
in scenario exports.

## Physical development and ownership

- Wilderness always becomes level 1 first. Upgrades are discrete +1 steps, up to
  level 100.
- A level-L tile may upgrade only when all four cardinal neighbours have level
  L or higher. Enemy-owned and unclaimed developed neighbours count: their
  buildings still exist.
- Players construct only on their own dry land. Expansion needs an adjacent
  developed tile, but that supporting tile need not belong to the same player.
- The original seed is historical only. It has no capture authority, growth
  radius or distance-based density ceiling.
- Terrain and local neighbours affect placement and speed, not a separate final
  city-size ceiling.
- Ownership changes preserve level, unfinished work and street layout. Housing
  moves to the new owner; population does not move or disappear.
- Population losses leave buildings intact. Over-capacity population is retained;
  births wait for vacancies while housing pressure encourages construction.

## Population and construction

Each player has one population pool and one construction budget shared across all
their developed territory, including disconnected neighbourhoods.

With population `P`, owned housing `H`, housing-weighted fertility `F`, and the
configured target occupancy `T`:

```text
housing per tile = housingPerLevel × level        (default: 100 × level)
vacancy factor   = clamp(1 − P / H, 0, 1)
births / second  = populationRate × (P × F / 3 + 10) × vacancy factor
housing pressure = clamp((P / H − T) / (1 − T), 0, 1)
work / second    = rate × (0.25 + 0.75 × sqrt(P / 100)) × housing pressure
```

With no housing, births are zero; surviving population produces full housing
pressure. With no population, housing pressure is zero. Fertility interpolates
between the configurable lower/upper development levels and birth equivalents.

Terrain and the retained per-tile slow–fast–slow maturation curve determine how
work advances a candidate tile. Each player can complete at most one level per
0.25-second step; unused allowance is not banked for an explosive later burst.
Only one wilderness establishment site per player is actively worked at a time.
Captured unfinished sites keep their progress and resume in original start order.

## Deliberate demo boundaries

Founding and capture are free editor operations, not combat or food purchases.
There is no food, military movement or AI decision-making in this lab. Scenario
export saves the initial terrain, arrangement and growth settings, not the live
capture history or simulation state. Behaviour is approved for gameplay integration;
the worker, presentation, AI and release checks are tracked in the
[integration plan](../../docs/superpowers/plans/2026-09-07-simplefront-organic-city-integration.md).

## Validation

- SimpleFront suite: 432 tests passed across 49 files, including 24 Demo 4 tests.
- Type checking and production build passed; the existing large-chunk warning
  remains. Scoped ESLint passed.
- Headless browser checks passed for gallery routing, both-player setup, capture,
  population preservation, five simulated minutes of growth, playback, mobile
  width and navigation back to Demo 3, with no page errors.
- Palette checks exercised all 36 colour inputs while paused, verified unchanged
  simulation and street layout, and confirmed that Reset palettes restores the
  original map pixels exactly, including at fractional zoom.
- Source fingerprints confirmed Demo 3, SimpleFront's core and OpenFront's
  original source were unchanged.
