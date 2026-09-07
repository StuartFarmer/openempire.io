# Demand-led City Lab Implementation Plan

**Goal:** Add a second, independently selectable demo of the approved population-driven city mechanism, preserving the original demo and all gameplay.

**Architecture:** A pure TypeScript model owns persistent housing, global population and one construction budget. A separate Lit page renders the model with Canvas and reuses only the existing terrain utilities, colour palette and demo stylesheet.

**Tech Stack:** TypeScript, Lit, Canvas 2D, Vitest, existing Vite demo entry.

**Spec:** Approved conversation design: development 1–100, housing derived from tiles, no city ceiling, vacancies survive casualties, rate-limited demand-driven construction, terrain-led spread versus density.

## Constraints and decisions

- Work inline in the existing user checkout; no commits, agents or gameplay changes.
- Keep `#urban-growth`; add `#city-demand` and a second gallery card.
- Internal development is fractional; housing = development², max 10,000 per tile. Starting centre level 10 houses 100, initially 80 occupied.
- Population is global, capped by existing housing. Replenishment has a bounded sigmoid-shaped rate with a small recovery baseline, including at zero population. No food, worker or deployment systems.
- Demand begins above 85% occupancy. Vacancies fill first; casualties never lower housing/development.
- Spend a fixed city-wide construction work allowance per simulated second. Construction costs rise with density, slope and connected route distance. New neighbourhoods require paid foundations. Water is impassable. No city ceiling or radius limit.
- Four schematic terrain presets: open plain, island, valley and coastal hills. Same economic settings enable comparison. Sliders change rates/costs live; terrain/centre changes explicitly restart.
- Include Play/Pause/Step/Restart, speeds, population add/loss controls, development/occupancy/elevation views, tile inspector, population/housing history, homepage and gallery links. Pause on hidden tab and disconnect.

## Tasks

- [x] Model: first write tests for persistent housing after casualties, vacancy-first recovery, bounded shared work and population rates, island constraint versus plain sprawl, deterministic terrain, and validation. Run red, implement `simplefront/src/demos/city-demand/model.ts` and `presets.ts`, run green.
  - `new CityModel(terrain, centre, config)` exposes `step()`, `changePopulation(delta)`, `configure(config)`, `stats()`, `level(tile)` and per-tile `capacity`.
  - Assert capacity is identical immediately after 50% casualties, empty housing stays intact during recovery, population never exceeds housing, and spent work never exceeds `rate * elapsed`.
- [x] UI: first test real rendered controls and gallery selection; implement `CityDemandDemo.ts`, `render.ts`, gallery card and route. Run tests and test navigation in browser.
  - Assert Step advances .25s, casualties lower population but not housing, controls apply safely, presets restart paused, and removal stops the animation.
- [x] Verification/docs: run full copied tests, typecheck/build, scoped lint and browser checks at desktop/mobile. Exercise long growth, casualties/refill, presets and both return links. Write exact formulas and usage in `simplefront/docs/city-demand-lab.md`.

## Results

231 tests passed across 34 suites. Typecheck, production build, scoped lint and
desktop/mobile browser checks passed. The build reports the existing large-game
chunk warning; the independent demo entry builds successfully. The full root
tracked diff is unchanged from this task's starting state. Existing gameplay
bundles retain their prior content hashes.
