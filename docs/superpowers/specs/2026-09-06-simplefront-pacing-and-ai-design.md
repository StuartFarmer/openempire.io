# SimpleFront pacing and active AI

Date: 2026-09-06

Status: Approved by the user on 2026-09-06, including this written specification.
Implementation planning follows; this document does not claim gameplay changes
or measured balance results.

## 1. Purpose and scope

Turn the independent SimpleFront painted-economy sandbox into a playable game
with active opponents and a natural 10–15 minute standard match at normal speed.
This is a target for representative matches, not a forced timer or a guarantee
for every map, player strategy, and difficulty.

Preserve manual painting, the complete one-city/one-farm opening kit, global
food, all-people-as-troops, deployed troop accounting, and existing movement and
battle mechanics. No eating, workers, logistics, or autonomous plot growth return.
Only an AI player's explicit paid orders create that player's new plots.

Gameplay, assets, tests, and runtime changes stay inside `simplefront/`. Root
OpenFront Live remains unchanged. Reuse installed dependencies. Preserve the
existing dirty checkout and perform work directly, without subagents or broad
staging. This spec is saved locally, not committed or deployed.

Related baseline: [painted economy design](2026-09-06-simplefront-painted-economy-design.md)
and [implemented sandbox verification](../../../simplefront/docs/painted-economy-verification.md).

## 2. Intended match rhythm

| Simulation time after spawn | Intended experience                                                       |
| --------------------------- | ------------------------------------------------------------------------- |
| 0–1 minute                  | Build immediately, begin expansion within 10–15 seconds, assess neighbors |
| 1–3 minutes                 | First border conflicts and investment-versus-war choices                  |
| 3–8 minutes                 | Sustained development, fighting, and opportunities to recover             |
| 8–15 minutes                | Decisive wars and victory without prolonged cleanup                       |

Aim for a meaningful building or expansion opportunity every 5–15 seconds in
the early game. This describes opportunities, not an automatic action schedule
for humans. First conflict around 60–120 seconds is a calibration target;
geometry can move it earlier or later. Do not introduce a universal peace timer.

## 3. Approved initial economy preset

| Setting                | Value                       |
| ---------------------- | --------------------------- |
| Opening food           | 4000                        |
| Opening troops         | 2000                        |
| Food capacity          | `5000 + 5000 × owned farms` |
| Troop capacity         | `10000 × owned cities`      |
| Farm price             | 1500 food                   |
| City price             | 2000 food                   |
| New land dispatch      | 0.2 food per troop          |
| New transport dispatch | 0.2 food per troop          |

One additional farm and city leave 500 of the opening food, enough to dispatch
2500 troops if available; the opening troop balance itself is only 2000.
Prices remain fixed per tile. Capacity remains linear and implemented separately
from prices and refill. These are the first measured preset, not final balance.

For each resource, let `x` be current stock and `K` be current capacity. Each
100 ms simulation tick grants:

```text
gain(x, K, a, r) = (a × K + r × x) × (1 − x/K)

Food:   a = 0.001,  r = 0.004
Troops: a = 0.0001, r = 0.003
```

The gain is zero when `K <= 0` or `x >= K`. Food uses the global food balance;
troops use idle + active attacks + transport passengers + pending landings.
Recruitment is credited to idle troops. A new plot changes capacity and the
future rate, never grants an instant stock refill.

Compared with the previous `(b + r × x) × (1 − x/K)` rule, the bootstrap term
becomes `b = a × K`. Refill is still S-shaped, but extra capacity now improves
recovery even near empty. At equal fill percentages, a larger economy gains
proportionally more units per tick. Zero farms still leaves food capacity and
generation; zero cities still means no recruitment. Zero territory means no
resource generation.

Keep exact integer milli-food debits, fractional refill credits, one resource
pass per simulation tick, immediate food overflow clamping after capacity loss,
and preservation of over-capacity troops. Captured plots transfer intact capacity
without stocks. No refund is added for committed dispatch fees, and existing
troop retreat/refund behavior stays unchanged.

Name capacity-scaled bootstrap coefficients explicitly in configuration; do not
silently reinterpret an absolute-units field as a fraction. Validate finite,
nonnegative settings, affordable rebuilding from baseline capacity, safe numeric
bounds, and a stable S-shaped curve (`0 < a < r`, `a + r <= 1`). Explicit inert
test fixtures can set both coefficients to zero. Runtime gains, projected HUD
rates, and benchmark calculations must share the same helper.

Formula-only estimates, assuming no subsequent spending or capacity changes:

| Scenario                                                               | Approximate time |
| ---------------------------------------------------------------------- | ---------------- |
| Opening extra farm + city bought; food 500, two farms; reach 1500 food | 5.7 seconds      |
| One farm, empty food; reach farm price                                 | 12.7 seconds     |
| No farms, empty food; reach farm price                                 | 23 seconds       |
| No farms, empty food; reach fee for 1000 troops                        | 3.8 seconds      |
| One city, 2000 total troops; reach 5000 without casualties             | 41.9 seconds     |

These are arithmetic estimates, not game-run results. Quantized core tests must
confirm comparable timings. Having food for dispatch does not imply having troops.

## 4. AI architecture and authority

Implement one small selected-ruleset controller shared by bots and nations.
Continue using existing spawn placement and normal player lifecycle handling.
Attach exactly one controller after successful spawn; do not duplicate it during
rerolls. Stop decisions on defeat or match completion. Restart creates fresh
controller state along with the new game.

Do not reactivate inherited `TribalEconomy`, `AiAttackBehavior`, or nation
structure/weapon planners. They depend on removed economic assumptions and
include behavior such as automatic structure deletion. Existing border,
transport, attack, and purchase primitives can be reused without those planners.

The controller reads authoritative global resource snapshots, owned/legal plot
sites, border ownership, legal targets, and existing deployments. It issues paid
paint, attack, retreat, and transport orders through the same validated core
paths as humans. It never writes balances, creates a free plot, bypasses a fee,
or mutates diplomacy merely because a rejected attack was considered.

The worker remains the simulation owner. Main-thread UI displays snapshots and
sends input only. The benchmark runs this same core/controller, not a second
approximation of combat or AI.

## 5. Initial AI policy

The following thresholds are implementation defaults for calibration, not new
human restrictions. Put them together in a small AI tuning configuration.

### Decision scheduling and memory

Medium difficulty evaluates every 20 ticks (2 seconds), with stable per-player
offsets. Easy evaluates every 30 ticks, Hard every 15, and Impossible every 10.
Each evaluation queues at most one new paid order. Use stable ordering and
game/player-seeded variation; no wall-clock or unseeded randomness.

Keep only bounded strategic memory: current campaign target, recent campaign
progress/loss samples, budget pressure, and scheduling state. Include
decision-affecting state in determinism verification and the selected hash
representation where required; do not use hidden cross-game static counters for
AI scheduling. Failed/stale orders cause a later reassessment, not same-tick
retry loops or optimistic purchases.

### Economy and reserves

1. If no farm remains, save for and purchase one on a legal owned tile.
2. If no city remains, save for and purchase one. If both are missing, rebuild
   the farm first to accelerate the subsequent city purchase.
3. During an immediate threat, prioritize retaining idle defenders and halt
   discretionary expansion. Rebuilding must not depend on reserving a dispatch
   fee for an expedition the player cannot yet support.
4. For normal development, reserve the exact fee for one intended military order.
   A discretionary plot must be affordable without consuming this reserve.
5. Consider a city when total troops reach 75% of capacity. Do not buy cities
   merely because idle troops fell after dispatch: deployed troops count.
6. Consider a farm when expected near-term spending exceeds available food and
   projected refill over a 20-second horizon. The spending estimate covers one
   intended plot and affordable planned dispatches, not an invented unlimited
   queue. Re-evaluate after every purchase to prevent perpetual farm buying.
7. Otherwise expand or pursue the current military plan; waiting is valid when
   no useful safe order is available.

Choose legal interior sites where possible, using a bounded deterministic
candidate search and stable tile tie-breaking. Do not evaluate climate, labor,
maturity, or food distribution. If no plot site is legal, consider expansion
instead of retrying the same blocked tile forever. All final placement legality
and affordability are rechecked by the shared purchase execution.

### Expansion and war

Prefer useful adjacent neutral expansion while land is available, without
ignoring an incoming threat or abandoning a successful war. Start with a 35%
idle reserve relative to total troops. A neutral expedition targets 15% of idle
troops; an enemy expedition targets 30%, each clipped by the reserve and food
budget before an order is submitted. Core execution never silently downsizes an
already submitted request merely to fit food.

Use legal border fronts and existing combat inputs to assess favorable targets;
total national troop count alone is not a reliable estimate of local defense.
Keep one primary enemy campaign at a time. Prefer nearby vulnerable fronts and
economic plots when reachable. Respect existing friendliness and immunity rules;
do not add alliance breaking, coordinated diplomacy, nukes, or warships here.

Reinforce a progressing campaign when resources and reserves permit. Sample it
every 10 seconds; after two samples without territorial progress, or losses that
breach the defensive reserve, stop reinforcing and retreat through the existing
cancel/retreat path when available. Reassess after losing the target, the front,
or legal attack permission. Account for active commitments before ordering more.

When land expansion cannot reach useful territory, consider an affordable legal
transport route to a neutral or suitable enemy coast. Bound candidate searches,
retain existing routing/landing/retreat mechanics, and avoid repeated boat orders
to the same pending destination. A blocked route may lead to waiting or a later
alternative; it must not hang the decision loop or bypass costs.

Small seeded differences in reserve (30–40%) and target preference supply
variety. Difficulty changes cadence and choice quality, not food, capacity, or
recruitment bonuses. Existing combat differences between player types remain
because changing combat is outside this design; do not claim those inherited
mechanics are identical across all player types.

## 6. Client and match lifecycle

Remove the selected passive-sandbox notice once active AI is actually wired and
verified. Keep authoritative capacity, gains, counts, dispatch pricing, and
partial painting results visible. Update copied translations and rules docs.

The shell currently hardcodes Medium. Add a selected SimpleFront difficulty
choice passed explicitly through worker initialization; default to Medium and
store it only in SimpleFront's settings namespace. Changing match configuration
applies on a new match, not midway through an existing deterministic simulation.

The core already exposes a winner, but the shell frame does not expose that
result. Add a compact winner projection, a win/loss result with elapsed match
time, and restart access. Publish the final frame before stopping a completed
interactive match. Clear the result on restart. Do not change the FFA victory
rule: more than 80% of non-fallout land. Do not add a 15-minute forced winner.
Ambient background behavior must remain separate from the interactive result UI.

## 7. Calibration and evidence

Start with the existing Verdantia map, its 25 authored nations, 50 bots, Medium,
normal 10-tick-per-second game time, and the existing victory condition. Record
successful spawn count as well as requested count. Do not silently change map
size, remove nations, or relax victory solely to report a target-length match.

Use actual SimpleFront configuration, map bytes, spawn paths, controllers, and
executions. Benchmark a fixed ten-seed set (`simplefront-pace-01` through
`simplefront-pace-10`). Stop a run at victory or 20 simulated minutes; an unfinished
run is reported as unfinished, not assigned a made-up victory time. Separate
simulation time from wall-clock performance. Repeat seeds to verify determinism.

Record first paid build, first neutral dispatch, first successful neutral
capture, first enemy dispatch, first enemy capture, first elimination, winner
time, survivors, land share, food/troop curves, plot counts, spending by category,
rejected orders, and time spent unable to fund an otherwise legal useful order.
Track percentiles and unfinished runs, not just a favorable average.

Compare farm-first, expansion-first, and military-first priorities using the
same AI machinery and mirrored starts/seeds. Farm-first is a measurement policy,
not an extra player-facing mode. Compare at 2, 5, and 10 minutes. Specifically
look for farm investment causing runaway economic dominance, city overbuilding,
idle capped economies, reserve deadlocks, endless neutral expansion, boat spam,
stalemates, and a long interval between decisive advantage and actual victory.

Aim for a median completed standard match of 10–15 minutes, with at least 8 of
10 benchmark runs completing within the 20-minute measurement horizon. Report
the full range and all censored runs. AI-only outcomes are a screening tool, not
proof of human pacing: include browser playtesting of early building/expansion,
combat, a setback, and match completion/restart.

Tuning may adjust the preset's prices, refill coefficients, dispatch fee, and
controller thresholds while retaining the approved rules. Record each tested
preset and its results, including regressions. Material rule changes, difficulty
bonuses, nonlinear prices/capacity, altered combat, changed victory conditions,
or a different standard map/population require a further design decision.
If the target is not reached, report the measured shortfall honestly.

## 8. Verification requirements

- Test the normalized resource formula, zero/full/over-capacity cases, fractional
  credit, invalid configuration, and increased capacity at equal and unequal
  stock fractions. Confirm both real-core and HUD rates use the new helper.
- Preserve recovery, capture, exact charges, rejection atomicity, landing handoff,
  cancellation/refund, painting, and combat regression coverage.
- Test AI attachment exactly once, both player types, spawn-phase inactivity,
  bounded scheduling, same-seed behavior, restart/defeat cleanup, and no inherited
  economy/planner calls in the selected runtime.
- Test missing-farm/city recovery, city headroom using deployed troops, food
  reserves, no-site behavior, blocked orders, neutral expansion, defense,
  campaign reinforcement/retreat, legal transport and no-route cases.
- Replace obsolete selected passive-opponent assertions with active-runtime
  acceptance tests; retain narrow inert fixtures where a test needs isolation.
- Exercise the actual worker and shell for difficulty, prices, active opponents,
  final winner projection, restart, and return to root OpenFront.
- Run copied tests, typecheck, lint, build, independence tests, root picker/runtime
  checks, and browser smoke testing. Verify no root gameplay edits.
- Publish balance results with seed/configuration/command provenance. Do not
  describe formula estimates, a single successful seed, or accelerated browser
  time as demonstrated 10–15 minute human playability.

## 9. Scope boundaries and review

No new logistics, automatic player-owned growth, plot upgrades/conversion,
economic cheats, global anti-leader coordination, diplomacy subsystem, weapons,
map generator, or blanket legacy-code deletion. No external services or model
inference are needed for AI decisions.

This spec adds the minimal difficulty and match-result plumbing needed to make
the proposed opponents and completed matches usable. Detailed files, interfaces,
test fixtures, and implementation order belong in the subsequent plan. The
chat-approved values are distinguished above from initial controller thresholds
and benchmark acceptance details, which are included here for written review.
