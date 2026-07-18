# Design — Age of Food

## Context

The settlement ecology (`src/client/lab/systems/settlement/`) already produces, on real climate, the fields a 4X economy needs: seasonal temperature, growing-degree-days, crop biomass, a food store, and a food-driven population density. Run autonomously it is an ecosystem. This change turns it into a game by splitting **potential** (what the land can support — derived, unowned, seasonal) from **realized** (what actually lives there and whose it is — owned, player-controlled), and adding the minimum control layer to found, grow, and fight over that potential.

Constraints: the WESL/FieldDynamics substrate is field-native (per-tile fields, `avg8` diffusion, a players struct-buffer, brushes, views, per-player `groupBy` scalars). The slice runs in `#lab` with scripted/brush players — no game-shell UI, no `src/core` changes, no shipped-map changes. Game rules that later graduate to the real game will go through their own OpenSpec change; this one proves the mechanics.

## Goals / Non-Goals

**Goals:**

- Prove the core loop in one age: found → grow into supplied catchment → hit the ecological cap → mobilize (hurting the economy) → push into a rival's fertile land → fail to hold it without supply.
- Make the ecology *legible as strategy*: fertile valleys are worth wars, deserts are barriers, the frost line and growing season gate campaigns.
- Keep everything field-native and GPU-resident; multi-player via the existing players buffer.

**Non-Goals:**

- No metal or oil economy, no tech tree, no unit roster — Age II/III are later changes. The age-advance is a readiness flag only.
- No game-shell UI, no real player intents, no bots — scripted/brush players drive it.
- No discrete settlement/city objects — settlements are emergent (population peaks that act as supply sources). Named cities/buildings are a later addition.
- No change to the core sim's food economy or `Config.food()`.

## Decisions

1. **Potential vs realized split.** `potential` is the settlement-ecology food-carrying-capacity, computed exactly as the `settlement` system does (soil × warmth × moisture-gate × GDD → sustainable population), left unowned and seasonal. Players own `pop` and `troops` fields; an `owner` field (u32, 0 = neutral) tags every tile. This is the single idea that makes an ecology a game.

2. **Organic-flow control (chosen over directed armies).** Territory grows OpenFront-style: owned borders bleed into adjacent *supplied, unowned* tiles automatically, at a rate gated by supply and remaining potential. The player directs *where* expansion and attacks push (a target/gradient), and population flows there as a field — few clicks, the map does the work, native to the substrate. Directed discrete army groups were considered and rejected for this slice (heavier, needs discrete units over the fields; revisit if organic flow proves too coarse).

3. **Ecological population cap (replaces flat maxTroops).** A player's supportable people = the sum of realized `potential` over their supplied territory. `pop + troops` cannot exceed it; overshoot starves. Fertile, supplied land raises the ceiling — the mechanical statement of "leverage the ecosystem."

4. **Supply as terrain-weighted diffusion.** `supply` diffuses from settled cores (tiles whose `pop` clears a settlement threshold), decaying with distance and terrain cost — cheap along rivers/coasts, expensive over mountains/desert. Age I range is short (footpaths); roads (Age II) will multiply it. Growth requires supply; troops beyond supply attrite. This is the "can't hold what you can't supply" spine, and it is one diffusion field.

5. **Deterministic attrition combat now; stochastic documented for later.** At a contested tile the larger *supplied* force wins predictably: both sides lose troops proportional to the smaller force, the winner claims the tile, and a defense bonus (terrain) plus a capture-margin hysteresis keep frontlines from oscillating. Readable and balanceable. A **stochastic alternative** (probabilistic capture weighted by the force ratio, à la the `territory` prototype) is written into the spec as a NON-implemented requirement so we can A/B it later without re-deriving the design.

6. **Seasons as tempo.** `potential` falls in winter (via the seasonal temperature already in the model) and the frost zone drops to ~0; the `food` store banks summer surplus. Overextended or over-mobilized players get culled in winter. No new system — it falls out of the substrate.

7. **Lab-first with scripted players.** Two or more players are seeded and driven by scripted brush actions (found here, expand toward there, mobilize, attack) so frontlines actually form. This isolates the mechanics from game-shell plumbing; graduation to real intents is a later change.

## Field model

Per tile (all f32 unless noted), on land only:

| field | meaning | update sketch |
| --- | --- | --- |
| `potential` | food carrying capacity (unowned, seasonal) | from the settlement ecology (soil × warmth × moisture × GDD) |
| `owner` (u32) | player holding the tile (0 = neutral) | set by expansion / combat capture |
| `supply` | reach from settled cores | `source(pop > settleThresh)` then terrain-weighted diffuse + decay |
| `pop` | settled civilians | `pop += grow · supply · (potential − pop)`; starve when `pop+troops > potential` and `food = 0` |
| `troops` | mobilized army | `+= mobilize·pop − demob`; flows toward target along supply; attrites where `supply` low |
| `food` | local store (winter buffer) | `+= harvest·crops·gdd − eat·(pop+troops) − decay·food` |

Expansion (organic): an owned tile pushes into an adjacent neutral tile `n` when `supply(n) > 0` and `potential(n) > 0`, transferring a little `pop` and setting `owner(n)`; rate scales with the pusher's surplus and the target's potential.

## Combat resolution

Deterministic attrition at a border tile `i` contested by attacker `A` (troops massed on adjacent owned tiles) vs defender `D` (`troops(i)` + a militia fraction of `pop(i)` + terrain defense):

```
attack   = massedTroops(A, i) · supplyFactor(A)
defense  = troops(i) + militiaFrac · pop(i) + terrainDefense(i)
loss     = min(attack, defense) · attritionRate      // both sides lose ~the smaller force
if attack > defense · captureMargin:                  // hysteresis, no oscillation
    owner(i) = A;  troops(i) = (attack − loss)         // survivors occupy
else:
    troops(i) -= loss·(attack/defense)                 // repelled, defender bled
```

`massedTroops` is capped by the staging tiles' carrying capacity (no unsupported doomstacks). `supplyFactor` degrades an attack pressed beyond supply range.

**Stochastic alternative (documented, not built):** instead of the deterministic threshold, capture tile `i` with probability `p = flipChance · smoothstep(attack/defense)` using a deterministic per-tick `sim::rand` shared across the owner/troops passes (the `territory` prototype's method). Same inputs, messier frontlines, harder to balance — a later toggle.

## Risks / Trade-offs

- [Organic flow too coarse for satisfying war] → the directed-army model is the fallback (Decision 2); the field/ownership representation is unchanged if we add discrete groups later.
- [Deterministic combat feels flat] → the stochastic alternative is spec'd and shares all inputs; swapping is a single pass rewrite.
- [Multi-player field ownership at scale] → the players buffer + `groupBy` scalars already exist (Phase 1 substrate); `owner` is one u32 field like the `territory` prototype's.
- [Balance is unknown] → this is the point of the lab slice: every rate is a slider, tuned interactively; verification asserts the *loop* occurs (growth, cap, frontline, capture), not specific numbers.

## Migration / first-slice scope

Purely additive: a new lab system + a verification script. No core, map, or shell changes. Rollback = delete the folder and the registry line. Graduation to the real game (player intents, UI, bots) and the later ages are separate future changes.

## Open Questions

- Whether `supply` should also carry *food logistics* in Age I (surplus flowing from breadbasket to frontier) or defer that to the Age II road network — leaning defer, keeping Age I supply purely about reach/attrition.
- Exact militia fraction and terrain-defense table — decided during tuning, not spec'd to numbers.
