## Context

The prior painted economy is implemented and independently tested in
`simplefront/`, but its selected opponents are passive. The user approved the
[pacing and AI design](../../../docs/superpowers/specs/2026-09-06-simplefront-pacing-and-ai-design.md).
Its exact rules and scope govern this change; the
[implementation plan](../../../docs/superpowers/plans/2026-09-06-simplefront-pacing-and-ai.md)
defines contracts, files, tests, and execution checkpoints.

## Goals / Non-Goals

**Goals:** Capacity-scaled sigmoid recovery, meaningful building/dispatch costs,
active deterministic paid-action bots and nations, visible complete matches,
and honest repeatable calibration toward 10–15 minute standard matches.

**Non-Goals:** Changes to root OpenFront, combat, victory threshold, map geometry,
logistics, autonomous city/farm growth, hidden economic bonuses, advanced
diplomacy/weapons, dependencies, deployment, or old-log compatibility.

## Decisions

### Normalize bootstrap against capacity

Use `(a*K + r*x)*(1-x/K)`, with guarded zero/full/over-capacity states and the
existing integer/credit integrator. Rename absolute bootstrap fields explicitly.
Food uses .001/.004; troops .0001/.003. The approved first preset sets prices
1500/2000 and dispatch .2 per troop. Raising only the old constant bootstrap
would shorten recovery but leave additional farms nearly ineffective at low
stock. Runtime, HUD and benchmark share the helper.

### Shared new controller, existing authoritative actions

Attach one selected controller to successfully spawned bots/nations, with
serializable per-player strategic state and stable staggered decisions. Keep
the legacy nation early return and do not attach the old tribe planner. The
controller emits a small decision union, then delegates to existing paint,
attack, retreat and transport executions. No separate AI economy or battle code.
Reusing inherited planners was rejected because they depend on staffing,
food-runway and structure-deletion behavior absent from SimpleFront.

### Bounded choices and explicit reserves

Use a 2-second Medium pulse, finite plot/border/coast candidates, emergency
rebuilding, deployment-aware reserves, finite spending forecasts, one campaign,
and stalled-campaign retreat. Seed initial variation; keep subsequent ordering
stable. Store cursors and campaign state on PlayerImpl and include relevant
state in selected hashing. Difficulty changes cadence/decisions, not resources.
No broad planner framework is required.

### Minimal match flow

Pass a validated next-match difficulty through worker init. Project the actual
core winner and elapsed time into the final frame, publish it before stopping,
then show a restartable result. Keep ambient background behavior separate.
Changing victory to force a duration was rejected: first measure actual play.

### Actual outcomes rather than inferred spend

Use typed observational action updates at the validated purchase/dispatch
boundaries. Do not infer spending from food deltas, which also include refill
and capacity loss. Internal landing handoffs emit no new commitment. The
benchmark reads real captures, action outcomes, controller budget-wait state,
and game winner. The previous balance harness selects legacy Config and cannot
be used as evidence for this economy.

## Risks / Trade-offs

- Capacity-scaled refill can compound rapidly → compare farm-first with expansion
  and military priorities across mirrored seats and retained seed sets.
- Bounded search may miss distant useful routes → cycle candidates across pulses,
  test no-route behavior, and report geography-limited matches.
- AI-only matches can look balanced but feel poor → supplement deterministic
  screening with normal-speed browser playtesting and label evidence precisely.
- Deterministic lockstep or reserve rules can stall → seeded staggering, bounded
  campaign memory, no-site recovery and focused deadlock regressions.
- The current 25 nations + 50 bots may not meet the target → record the shortfall;
  do not silently alter the standard scenario or victory condition.
- Existing type-specific combat differences remain → do not describe this as
  identical combat for all player types; only economic fairness is newly enforced.

## Migration Plan

Work inline in the existing dirty checkout. Baseline before edits, deliver the
eight implementation tasks with red/green checkpoints, then run copied/root
isolation, browser checks and deterministic balance measurements. No deployment
or broad git mutation is included. Keep original verification docs as historical
evidence, update current SimpleFront rules and record actual new results.
Future rollback, if requested, must reverse only this change's known edits,
not reset the independent copy or unrelated user changes.

## Open Questions

No blocking rule choices remain. Final numerical balance is intentionally an
experimental result. If the approved tuning levers cannot meet the measured
target without changing map/population, victory, combat or resource rules,
report evidence and request that new design decision.

## Measured implementation checkpoint — September 7, 2026

The initial preset above was implemented and retained in ten balanced runs plus
thirty rotated-policy runs. None completed within 1200 simulated seconds. The
current candidate keeps food, capacities and prices unchanged, but uses troop
coefficients `.0003/.009`, verified against a roughly 26-second unopposed
2000-to-7500 recruitment band (initially 76.5 seconds).

Policy corrections keep source fronts contiguous, retain campaigns across
partial border scans, return friendly-destination boats, budget enemy as well
as neutral dispatches, cap discretionary construction's expedition reserve at
one third of the farm price, and give available military orders every third
discretionary decision. These address reproduced failures; they do not add free
resources or change combat. The selected UI now defaults to Verdantia.

The matched final ten plus thirty runs remain **unfinished** at the 20-minute
bound. Standard median survivors fell from 42.5 to 7 and median leader share rose
from 14.23% to 36.31%, but the required 10–15 minute duration is not established.
The inherited under-100-tile auto-defeat rule also creates very early knockouts.
Further changes to those rules or endgame resolution require user direction.

See the [full verification and retained evidence](../../../simplefront/docs/painted-pacing-and-ai-verification.md).
