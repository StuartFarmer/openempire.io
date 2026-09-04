# Rework AI War Strategy

## Why

Nations feel passive in play (notably on crowded maps like SPQR): their attack gates still measure readiness against vanilla housing capacity (`maxTroops`), which a food-bound population never approaches, so they idle in a 90%-skip lottery; every push is a fire-and-forget one-shot with no follow-up; and they ignore strategic information they already have (enemy commitments, food runway, power trends). The AI is omniscient but acts myopically and timidly.

## What Changes

- **Readiness rebased on achievable population**: reserve/trigger ratio gates divide by the food-supported population (`foodFlow().capacity`), clamped to housing, instead of raw `maxTroops` housing capacity.
- **Effective home strength**: target evaluation (weakest-sort, too-weak checks, send caps, victim detection) uses `troops − outgoing commitments`, not the raw troop reading — a player mid-push elsewhere is thin at home.
- **Campaign persistence with +EV pacing**: a nation that attacked keeps a war-goal state; while it is gaining tiles and its population is not declining (free-tiles +EV), it reinforces the same target on every pass, bypassing the trigger lottery (reserve, staffing floor, and war share still bind). Campaigns end on stall, population decline, or target death.
- **Dogpiling**: a new strategy joins an existing war — attack a bordering non-friendly enemy already in combat with a third party when our effective strength beats their effective home strength.
- **Threat response by local power differential**: each pass, a bordering non-friendly player whose effective power greatly exceeds ours drifts our relation toward Hostile (feeding the existing `hated` strategy and embargo machinery). Anti-snowball emerges from neighbors reacting locally — no global leader tracking.
- **Famine warfare**: among comparable targets, prefer the one with the shortest food runway (stock ÷ consumption); attack-front aim points are weighted toward enemy Farmland/Settlement clusters, scaled by the existing `aiDifficulty().resourceFocus` lever.
- **Strength trend memory**: per-neighbor troop history across passes; a declining neighbor is favored as a target, a fast-growing one is avoided (FFA).
- **Dynamic war share**: `deployableTroops` scales `maxWarShare` by food runway — full barns fight bigger wars (up to ~35% of population), empty barns pull the share down (~10%). New `FoodConfig` knobs (sweepable/tunable like every food knob; setting both scales to 1 recovers today's flat 20%).
- **Send-cap sanity**: `troopSendCap`'s retain fractions evaluate against the strongest neighbor's _effective_ strength, so Hard/Impossible nations stop being paralyzed by nominally strong but over-committed neighbors.

## Capabilities

### New Capabilities

- `ai-war-strategy`: how nation AIs decide when to fight, whom to fight, how hard to push, and when to stop — readiness gates, target selection heuristics, campaign persistence, threat drift, and the food-economy coupling of war effort.

### Modified Capabilities

<!-- none: existing OpenSpec changes in this repo have no synced main specs covering AI attack behavior -->

## Impact

- `src/core/execution/utils/AiAttackBehavior.ts` — gates, strategies, campaign state, famine/trend weighting.
- `src/core/execution/utils/EconomyModel.ts` — `deployableTroops` war-share scaling; new effective-strength / runway helpers.
- `src/core/execution/NationExecution.ts` — threat-drift pass wiring, campaign tick-through.
- `src/core/configuration/FoodConfig.ts` — new war-share scaling knobs (defaults preserve current 0.2 baseline at empty stock).
- Tests: new `tests/AiWarStrategy.test.ts`; existing `tests/AiAttackBehavior*` expectations may need updating.
- Balance: verified via `tests/perf/balance/BalanceRun.ts --difficulty` that aggressive nations do not starve themselves (the failure mode the war-share cap exists to prevent).
