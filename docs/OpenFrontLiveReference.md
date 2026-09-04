# OpenFront Live reference

OpenFront Live is paused at `openempire-foundation-v0`. Shared bug fixes remain
allowed only while all foundation gates are green. Intentional OpenFront rule
changes require an explicit decision to resume OpenFront development.

OpenFront uses the CPU food economy and never initializes the LeanFront GPU
runtime. Current food tuning is owned by `Config.food()`; these values are
recorded here, not rebalanced.

## Deterministic 4,000-tick reference

```bash
npx tsx tests/perf/balance/BalanceRun.ts --map verdantia --runs 2 --ticks 4000 --bots 40 --nations 20 --seed-prefix base --check-repro --out /tmp/openfront-verdantia-reference.json
```

| Map/run | Hash | Leader share | Gini | First elimination | Alive |
| --- | ---: | ---: | ---: | ---: | ---: |
| Verdantia `base-0` | `801065038163313` | 24.7% | 0.716 | 1053 | 19 |
| Verdantia `base-1` | `2069060768539590` | 21.5% | 0.631 | 803 | 15 |

`--check-repro` must report `repro check: IDENTICAL`.

```bash
npx tsx tests/perf/balance/BalanceRun.ts --map spqr --runs 1 --ticks 4000 --bots 50 --nations 0 --seed-prefix base --check-repro --out /tmp/openfront-spqr-reference.json
```

| Map/run | Hash | Leader share | Gini | First elimination | Alive |
| --- | ---: | ---: | ---: | ---: | ---: |
| SPQR `base-0` | `4964847657180561` | 12.8% | 0.312 | 803 | 15 |

`--check-repro` must report `repro check: IDENTICAL`. A changed hash is a
foundation failure: diagnose the first divergent tick; do not re-baseline it.

## CPU performance smoke

```bash
npm run perf:game -- --map verdantia --ticks 1000 --bots 40 --seed foundation-perf --no-cpu-profile
```

This is a regression smoke, not a balance or optimization target. The recorded
run completed with final hash `808788263195142` at tick 1300 (after 302 spawn
ticks): 1,234 ms for 1,000 game ticks, 1.23 ms mean, 1.11 ms p50, 1.94 ms p95,
3.27 ms p99, 13.7 ms max, and 0 ticks over the 100 ms budget.

## Frozen shared surface

Terrain/maps, board/shell/transport, nations/flags, focused-border combat,
burn and persistent land use, and deterministic primitives are shared frozen
surfaces. They may receive only shared bug fixes that keep every foundation
gate green.
