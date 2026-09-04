# Age of Food — the 4X vertical slice

## Why

The settlement-ecology model gives us live carrying-capacity fields on real climate: crops, food, and a supportable-population potential that breathe with the seasons. Today that runs as an autonomous ecosystem in the lab. The reframe that turns it into a game: treat those fields as **potentials** — the opportunity map — and let players convert potential into owned, realized population. Fertile land supports more people, more people is labor and army, so the core decision becomes _which land to contest_, answered by the ecology itself. This change builds the first playable age (Age of Food / Exploration) as a lab slice: found settlements, grow into your supplied catchment, hit the ecological cap, mobilize at an economic cost, and push into a rival's fertile valley — discovering you cannot hold what you cannot supply. If that loop is compelling, the later ages (metal, oil) are resource-and-unit reskins on the same machine.

## What Changes

- A new `#lab` FieldDynamics system, `empire`, layering a 4X control model over the settlement ecology. Driven by scripted/brush players (no game-shell UI yet) so the mechanics can be tuned in isolation.
- **Potential vs realized split**: the ecology's carrying capacity becomes `potential` (derived, unowned, seasonal); players own `pop` (settled civilians) and `troops` (mobilized) fields, tagged by an `owner` field.
- **Ecological population cap**: a player's supportable population is the realized potential of their _supplied_ territory — replacing a flat troop cap. Taking fertile land raises the ceiling.
- **Founding & organic growth**: seeding population (a brush/intent) stamps a settlement; population grows toward supplied potential and owned borders bleed into adjacent supplied, unowned tiles (OpenFront-style organic expansion, ecology-gated).
- **Supply as a terrain-weighted diffusion** from settled cores; growth and troop sustainment both require it, and troops attrite beyond its reach.
- **Seasons bite**: winter lowers `potential`; the `food` store banks summer surplus; population beyond capacity with an empty store starves.
- **Mobilize & conquer**: convert `pop → troops` (costs food, shrinks the economy); direct troops toward a target; contested tiles resolve by **deterministic attrition** (larger supplied force wins, both lose, winner claims), with terrain + hysteresis stabilizing frontlines. Staging carrying capacity caps troop density.
- **Age-advance hook**: a per-player development threshold that (in this slice) only flags readiness for Age II — no metal economy yet.

## Capabilities

### New Capabilities

- `settlement-empire`: the owned economy — potential/realized split, settlement founding, supply diffusion, organic growth into the supplied catchment, the ecological population cap, and seasonal food pressure.
- `organic-conquest`: the war layer — mobilization, directed troop flow with supply attrition, deterministic contested-tile combat with stable frontlines, staging-capacity caps, and the age-advance readiness hook.

### Modified Capabilities

<!-- None. This is a new lab slice on top of the settlement ecology; it does not change the core sim's food economy or any shipped game rule. -->

## Impact

- New `src/client/lab/systems/empire/` — manifest (`system.ts`) + one `.wesl` per field (`potential`, `owner`, `pop`, `troops`, `food`, `supply`) + views + a scripted-player driver.
- `src/client/lab/systems/index.ts` — register the `empire` system.
- Reuses the substrate as-is: the players struct-buffer (multi-owner), `avg8` diffusion, brushes, views, scalars (per-player `groupBy`), the seasonal-temperature model, and the settlement-ecology crop/food fields.
- `.claude/skills/run-openfront/` — a verification script driving 2+ scripted players to exercise founding, growth, frontline formation, and combat.
- No `src/core` changes, no shipped-map changes, no game-shell wiring — a lab-only slice by design (graduates to the shell once the loop is proven).
- Combat's stochastic alternative is specified but NOT implemented; it is written down for a later A/B test.
