# Proposal: add-war-razing-and-spoilage

## Why

Playtest meta: deep granaries + minimal farming + serial blitzes dominate, because conquest hands over captured districts intact (free income) and spoilage is too weak to tax hoarding (~12%/10min). Wars should be paid for by your own economy; grain mountains should rot.

## What Changes

- **War razes infrastructure**: each tribal plot on conquered territory has a configured chance (default 100%) to be destroyed instead of captured — farms trampled, barns torched. Conquest yields scorched land, never a turnkey economy. Deterministic (hash-based roll, identical on every client).
- **Fire animation**: a razed plot burns — a short 2×2 in-tile flame animation over the tile as it's destroyed (any violent plot removal shows fire).
- **Real spoilage**: storage decay raised to ~25%/minute (decayDenom 5000 → 2000) — war chests are built close to when they're spent; sustained campaigns need farm income.

## Capabilities

### Modified Capabilities

- `food-economy`: spoilage rate.
- `tribal-buildings`: capture-raze rule + burn visual.

## Impact

Core: PlayerExecution structure-capture sweep (raze roll), FoodConfig (razeChance, decayDenom). Client: fire animation in the plot render path. Tests: raze determinism/proportion, spoilage math (knob-driven tests adjust automatically). Harness: expect farm-to-barn ratios to shift toward farms and blitz-snowballing to soften.
