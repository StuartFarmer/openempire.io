## 1. Tune the flow model in isolation

The forces interact, and a cellular automaton is far easier to tune outside a
game than inside one.

- [ ] 1.1 A lab system for the flow model: population field, push/gather transport, and the three forces (food attraction, urban tether, crowding repulsion) as tunable params.
- [ ] 1.2 Confirm conservation — total population unchanged by movement alone.
- [ ] 1.3 Tune until migration looks right at one tile per tick, and record what the forces mean in real units.
- [ ] 1.4 Add traffic accumulation and road reinforcement; find a decay/reinforcement ratio that produces a network rather than one trunk or nothing.

## 2. World scale

- [ ] 2.1 Add km/tile (default 10) to the map manifest, and tick = 1 day as a global constant.
- [ ] 2.2 Re-express the surviving knobs in real units, and drop the ones the flow model removes.
- [ ] 2.3 Set per-map km/tile for the real-Earth maps — at 10 km/tile spqr spans 20,480 km, about half Earth's circumference.

## 3. The fields and passes

- [ ] 3.1 Population field with per-tile carry; per-player totals as reductions.
- [ ] 3.2 Per-tile birth draw (design D2), and local death from hunger and age.
- [ ] 3.3 Push/gather transport, shared by people and food.
- [ ] 3.4 Work radius and per-tile production ceiling; retire the food-shed flood for LeanFront.
- [ ] 3.5 Food decay as a per-tile timer; remove storage, capacity and granary state.
- [ ] 3.6 Urban threshold on density; retire the separate housing concept.
- [ ] 3.7 Conquest zeroes the population field.

## 4. Verify and re-baseline

- [ ] 4.1 Conservation and determinism: same seed twice on one device, identical.
- [ ] 4.2 Record LeanFront's own reference set on the GPU sweep host.
- [ ] 4.3 Judge the game on snowball metrics — leader share, gini, alive counts, famine dynamics — not on any comparison with OpenFront, which is not meaningful across this change.
- [ ] 4.4 Check the famine dynamics specifically: removing storage takes away the buffer that currently absorbs a bad season.
