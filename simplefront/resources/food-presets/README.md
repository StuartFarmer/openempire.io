# Food presets

Named sets of `FoodConfig` knob overrides. Each file is one configuration:

```json
{
  "name": "flat-a",
  "description": "urban-flatten solution 1/6 — finalGini 0.418",
  "source": "sweep urban-flatten · cell popPerDensity=220,wCong=1.83",
  "overrides": { "wCong": 1.83, "popPerDensity": 220 },
  "metrics": { "mean_finalGini": 0.4181, "mean_finalAlive": 21.5 },
  "run": { "map": "Verdantia", "ticks": 3000, "nations": 25, "bots": 40 }
}
```

Only `name` and `overrides` are required; `metrics` and `run` are provenance
for display and are never applied.

**Written by** the balance sweep driver — every configuration that lands in a
sweep's target band is exported here:

```bash
npx tsx tests/perf/balance/Sweep.ts tests/perf/balance/sweeps/example.yaml
```

**Read by** the in-game tuning panel (and the `#shell` knob panel), whose
preset dropdown applies one through the normal `tune_food_config` intents —
so a swept candidate can be played and judged on feel. Applying a preset also
resets every knob it does not name back to its default, so what you play is
exactly what the sweep measured.

**Also readable by** the harness itself, to re-measure one:

```bash
npx tsx tests/perf/balance/BalanceRun.ts --preset flat-a --runs 3
```

Presets are checked in — they are the record of which configurations were
considered worth playing. The schema lives in
`src/core/configuration/FoodPreset.ts`.
