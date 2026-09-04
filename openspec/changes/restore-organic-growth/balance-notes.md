# Balance notes — restore-organic-growth

## Ignition chain (2026-07-20, verdantia, 3000 ticks, 40 bots + 25 nations)

Getting the organic world to ignite took four fixes, found by probe + harness:

1. **Follower contraction (mechanic fix)**: with `housing = base + tiles·ppd`
   and the AI difficulty multiplier < 1, the city-follows-population loop had
   a fixed point near `mult·base/(1−mult)` ≈ 1000 for bots — below the first
   ladder rung, so the seed economy never started. Cities now target
   `ceil(pop / (mult·popPerDensity))` tiles: housing exceeds population by
   `mult·housingBase` permanently, and the ceiling binds only when suitable
   OWNED land runs out (spec amended).
2. **Day-one famine (mechanic fix)**: a 1-tile starter field means spawn
   capacity ≈ 100 → the population crashed to ~150 before the field could
   grow (the old model's task-11.1 bug, reborn). The spawn kit's farm now
   pre-grows its field until it feeds `startPopulation`.
3. **Tribes deleted their own farms (bug, present in the OLD model too)**:
   `TribeExecution.deleteNextStructure` — the vanilla purge of captured
   structures — deleted the tribe's own kit Farmland on cooldown (probe: farm
   died at t671, capacity → 0, husk). Tribal structures are now exempt. This
   was likely a hidden contributor to the old model's chronic bot stalls.
4. **Combat cost double vanilla (knob sweep)**: the continuous terrain factor
   averages ~1.75 on verdantia, so `baseCombatMag 90` ≈ effective 158 (vanilla
   band: 80–120) — war burn ate all growth. Adopted `baseCombatMag 50`,
   `baseCombatSpeed 12` (effective ≈ 88/21). And `popGrowthRate 0.005` lost
   to per-tile conquest losses even then — adopted 0.02 (decline 0.05).

## Harness at adopted defaults (2 runs)

| Metric                               | stalled (pre-fixes) | adopted    |
| ------------------------------------ | ------------------- | ---------- |
| alive (of 65)                        | 65                  | 34–39      |
| first elimination                    | never               | t1353–1853 |
| mean leader share                    | 1.9%                | 6.4%       |
| mean gini                            | 0.07                | 0.38       |
| top population                       | ~700                | 13.7k–16k  |
| top pairs placed (settlements/farms) | 0                   | 4–5        |
| top city tiles                       | 2                   | 21–27      |

Reads healthy and _organic_: the ladder paces founding (4–5 pairs by t3000 vs
the purchase model's 138 settlements), fields and cities grow visibly, and
leader share sits below the simplify baseline's 10.9% — slower, tenser
worlds. Watch in play: whether 6.4% leader share feels too static (levers:
`baseCombatMag` down or `popGrowthRate` up), and whether human-vs-bot pacing
feels fair given bots build 3× city tiles per person (Easy/Medium multiplier
folding into city size).

## In-browser playtest (2026-07-20, #shell, verdantia, 50 bots, turbo to t7200)

Human pop 2000 → 5000, first pair banked at rung 4000 ("next pair at 8000"
in the build bar), fields visibly spreading as tilled soil across every
nation, borders irregular and terrain-following (valley corridors, ridge
stalls — no circles), suitability plane shipped to the hover readout, and
the idle human was properly ELIMINATED by bots around week 40 — the world
is aggressive again. Zero page errors.
