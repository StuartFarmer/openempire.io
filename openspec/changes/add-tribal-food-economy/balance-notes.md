# Balance notes — initial knob sweep (task 6.4)

First sweep with the BalanceRun harness. Setup: map `verdantia` (512×256,
seed 42), 25 procedural nations + 10 bots, 3000 ticks (~5 min of game),
3 seeds per config, defaults except the named override. Signal = final
leader territory share (of owned tiles) / territory Gini across alive
players / total starvation deaths.

| Config                      | mean leader | max leader | Gini | starved |
| --------------------------- | ----------- | ---------- | ---- | ------- |
| **defaults**                | 28.3%       | 44.7%      | 0.55 | 61k     |
| starvationDeathFraction .005| 27.9%       | 31.7%      | 0.40 | 16k     |
| starvationDeathFraction .05 | 17.7%       | 19.9%      | 0.42 | 151k    |
| farmlandFertilityMult 100   | 28.2%       | 35.1%      | 0.55 | 61k     |
| farmlandFertilityMult 800   | 25.4%       | 35.3%      | 0.50 | 61k     |
| populationPerSettlement 5k  | 12.0%       | 15.3%      | 0.32 | 61k     |
| populationPerSettlement 50k | 44.1%       | 53.2%      | 0.51 | 61k     |
| decayDenom 500 (fast decay) | 24.9%       | 26.6%      | 0.43 | 61k     |
| decayDenom 20000 (slow)     | 26.5%       | 40.1%      | 0.47 | 61k     |

## Findings

1. **`populationPerSettlement` is the primary snowball lever** — leader share
   scales 12% → 28% → 44% across 5k/25k/50k. This is the designed dampener
   working: conquered land grants production, not population, so housing
   throttles how fast a lead converts to armies. Lower it to flatten games.
2. **`starvationDeathFraction` punishes overreach** — at 0.05 the mean leader
   share drops to 17.7% (armies that outrun their food die), at the cost of
   2.5× total starvation deaths (harsher for everyone).
3. Farmland multiplier and storage decay are secondary (≤3-point effects) —
   fine-tuning knobs, not structural ones.
4. No runaway detected at defaults: max leader share 44.7% after 3000 ticks
   in the worst seed, and eliminations start ~tick 950 — competitive but
   decisive. Acceptance posture: keep defaults; if games feel too
   winner-takes-all in playtesting, first move `populationPerSettlement`
   toward 15k, then starvation toward 0.03.

## Repro

```bash
npx tsx tests/perf/balance/BalanceRun.ts --map verdantia --runs 3 \
    --ticks 3000 --bots 10 --nations 25 [--override key=value]
```

Same seed + config ⇒ identical output (`--check-repro`).
