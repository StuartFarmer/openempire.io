## Context

LeanFront Simple is currently registered as a standalone WebGPU field game. Its shader pressure/diffusion model resembles conquest but cannot be behaviorally identical to the worker-backed Live simulation because it does not execute `GameRunner`, `AttackExecution`, or `AttackImpl`. The shell work that made startup and presentation common exposed this deeper backend divergence.

The approved architecture is documented in `docs/superpowers/specs/2026-09-05-leanfront-simple-live-runtime-design.md`. Core code must remain deterministic and client-independent, OpenFront reference behavior must remain frozen, and the original `leanfront` runtime must remain available.

## Goals / Non-Goals

**Goals:**

- Execute LeanFront Simple combat, neutral expansion, retreats, ownership, nations, and ticks through the existing Live core classes.
- Replace only the economy with integer stocks on manually placed Settlement and Farmland plots.
- Use WebGPU to accelerate compact independent plot growth with an equivalent CPU fallback.
- Preserve the common Live match lifecycle and visuals.

**Non-Goals:**

- Porting or approximating combat on the GPU.
- Changing OpenFront or original LeanFront rules.
- Adding logistics, food consumption, starvation, fertility, labor, or automatic plot spread.
- Introducing a generic runtime framework or new dependency.

## Decisions

### D1 — LeanFront Simple is a Live ruleset

Add `leanfront-simple` to the existing `RulesetID` and `LIVE_GAMES` seams. The worker creates its `Config`, runtime, and `GameRunner` exactly as it does for OpenFront and original LeanFront. Remove LeanFront Simple from the field-game registry after command and frame parity is in place.

This is smaller and safer than translating the mature core combat algorithm to shaders. It guarantees parity by code reuse.

### D2 — Combat classes remain unchanged

Do not subclass, branch inside, or copy `AttackExecution`, `AttackImpl`, or `RetreatExecution`. The Simple ruleset may gate an attack before enqueue and may force an active attack to end when energy is exhausted, but accepted attacks execute the same code and config knobs as OpenFront.

An abundant-food parity test is the contract: with both economy ticks frozen, identical initial state plus identical intents must have identical ownership, idle troop, attack troop, target, and retreat state on every tick. Freezing only the economy isolates the shared combat code being tested.

### D3 — Existing plot units represent the economy

Reuse `UnitType.Settlement`, `UnitType.Farmland`, and `Unit.level()`. `LeanFrontSimpleConfig` changes only their cost resource, flat costs, instant construction, upgrade eligibility, and seed-gate behavior. It does not change combat knobs.

Build validation remains in the existing player/construction path. A same-type unit on the selected tile upgrades; an empty valid tile builds; an opposite plot rejects. No action paints neighboring tiles.

### D4 — One scoped economy provider replaces `urbanTick`

Add a provider seam at the `PlayerExecution` economy call. Its default is the existing `urbanTick`. The LeanFront Simple runtime installs one provider for its worker lifetime and disposes it on restart. The provider skips the rich food, seed-award, tenure, supply, starvation, maturity, and urban-spread systems only in this ruleset.

This follows the existing LeanFront provider lifecycle without putting client imports in core or scattering ruleset predicates through economy modules.

### D5 — Compact integer plot state is authoritative

`SimpleEconomy` stores city people and farm food in integer maps keyed by existing unit id. The core remains authoritative for ownership, unit identity/level, players, and attacks. Before growth, `SimpleEconomy` reconciles core troop/food debits and returns proportionally across current plot records; ascending unit id receives division remainders.

Active troops remain only in `AttackImpl`. Returned troops are redistributed to owned cities and may overflow capacity without being destroyed. A player with no city keeps returned core troops dormant until a city exists.

On capture, type and level remain. City stock resets to zero; farm stock resets to the level-one seed amount. On raze/deletion, its stock is deleted.

### D6 — Integer Gompertz growth

For each plot:

```text
C = capacityPerLevel[type] * level
delta = stock < C ? max(1, floor(rate[type] * stock * ln(C / stock))) : 0
next = min(C, stock + delta)
```

Creation seed is `floor(seedFraction * capacityPerLevel[type])`; upgrade preserves stock. Initial capacities are 20,000 per level, seed fractions are 0.10, and rates are 0.03 for city and 0.06 for farm. City, farm, and raze costs are 4,000, 3,000, and 1,000 food. Costs stay flat across levels.

### D7 — Food is a global integer action budget

All farm stocks sum to the player's spendable food. People do not consume food. Build/upgrade/raze commands debit the existing player food balance in submission order, then the next reconciliation removes that exact integer debit proportionally from farm stocks.

Attack energy uses the existing Live fight rate of 40 milli-food per active person per tick:

```text
charge = ceil(activePeople * 40 / 1000)
maxAffordablePeople = floor(food * 1000 / 40)
```

The unchanged `AttackExecution` creates an attack normally. Before that attack's first combat tick, the runtime caps it to a whole-person affordable commitment, returns any excess people, and charges the affordable force. If a later full charge cannot be paid, the runtime ends the attack and returns survivors without the voluntary-retreat casualty malus. Tracking newly seen attack ids keeps this lifecycle outside the combat implementation and also covers nation attacks that enqueue `AttackExecution` directly.

### D8 — GPU accelerates only compact growth

The CPU `growSimplePlot` function is the normative implementation and fallback. The GPU receives compact plot records and returns integer next stocks; it never receives or computes ownership, borders, attacks, or nation behavior. Any initialization or dispatch error selects the CPU path for the rest of that match. CPU/GPU parity tests cover boundary values.

### D9 — Reuse the Live protocol and presentation

Extend the worker protocol only with city, farm, and raze commands plus compact integer plot-hover data and bounded rejection feedback. Existing spawn, act, retreat, running, frame, nation-spawn, border, statistics, and camera paths remain shared. Rendering uses the existing Settlement/Farmland plot values and shared Live sprites, color, mask, and highlight paths.

## Risks / Trade-offs

- **Global provider leakage** → install and clear the provider through runtime lifecycle tests; keep the default path unchanged.
- **Plot/core balance drift** → reconcile every tick by stable unit id and assert integer aggregate equality in tests.
- **GPU rounding drift** → use the CPU integer calculator as oracle and permanently fall back after any mismatch/error.
- **Dirty migration leaves two playable simulations** → switch the registry atomically and delete only code with no remaining import.
- **Ruleset changes alter OpenFront** → retain reference-hash tests and an explicit config-difference test limited to economy/build knobs.

## Migration Plan

1. Add failing ruleset/combat-parity tests and the third Live registration.
2. Add the scoped CPU economy provider and core plot rules with tests.
3. Add attack-energy handling, worker plot commands, and compact frame data.
4. Add the compact GPU growth accelerator and CPU/GPU parity tests.
5. Switch shell registration/presentation, then remove the obsolete field backend and its tests.
6. Run focused tests, OpenFront references, the full non-baseline suite, lint, typecheck, build, and strict OpenSpec validation.

Rollback is the inverse registry switch: keep the worker implementation isolated until validation passes, then remove the old field registration in the same final commit.

## Open Questions

None. Balance constants remain intentionally tunable after the mechanically correct mode is playable.
