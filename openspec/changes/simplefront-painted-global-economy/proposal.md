## Why

SimpleFront needs a deliberately simpler foundation: explicitly painted farms/cities, global food as action currency, and a single troop population. Its independent copy currently retains OpenFront's local food distribution, workers, seed awards, autonomous growth, and supply losses, which contradict that model.

## What Changes

- **BREAKING within SimpleFront:** replace the active inherited economy with player-global food and troop capacities, sigmoid replenishment, baseline food recovery, and city-dependent recruitment from zero.
- Keep one free city and one free farm at spawn. Paint subsequent complete tiles for fixed food prices, without seeds, maturity, workforce, upgrades, or autonomous spread.
- Count idle, attacking, transport, and handoff-committed troops toward one capacity. Preserve existing troops above a reduced capacity; clamp food overflow.
- Charge food once when a validated land attack or transport dispatch commits. Remove eating, starvation, aging, and supply-distance attrition; retain movement, battle calculations, and retreat behavior.
- Transfer captured economic plots and capacity intact without transferring local stocks or creating free troops.
- Publish global resource/capacity readouts and deterministic paint-stroke results.
- Provide a clearly labeled passive-opponent sandbox until the separately designed AI adaptation is implemented.

## Capabilities

### New Capabilities

- `simplefront-global-resources`: linear capacities, bootstrapped sigmoid replenishment, accounting, recovery, capture, and deterministic updates.
- `simplefront-tile-painting`: explicit opening plots, legal per-tile purchases, continuous strokes, authoritative feedback, and resource UI.
- `simplefront-paid-dispatch`: transactional food charges for new commitments with retained downstream combat behavior.
- `simplefront-economy-sandbox`: passive-opponent boundary, inactive legacy economy paths, and application isolation.

### Modified Capabilities

None. These capabilities apply to the independent SimpleFront application; existing root OpenFront/LeanFront requirements are not changed.

## Impact

Gameplay implementation is confined to `simplefront/src`, `simplefront/tests`, and necessary SimpleFront documentation/resources. Expected integration points are Config, player/game state, spawning, ownership/unit lifecycle, dispatch executions, the shell worker, and painting/HUD controls. No new dependencies or changes to root launch routing, assets, settings isolation, or root OpenFront gameplay are required.

The accepted planning baseline is [the painted-economy design](../../../docs/superpowers/specs/2026-09-06-simplefront-painted-economy-design.md). Its proposed numerical preset becomes the initial implementation/test preset, subject to later balance work.

## Non-goals

Active AI adaptation, GPU economy work, new military movement or battle formulas, logarithmic capacity implementation, escalating prices, demolition/conversion UI, activating gold infrastructure, and deleting unrelated inherited systems.
