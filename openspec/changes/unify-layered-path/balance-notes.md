# Balance notes — unify-layered-path difficulty levers

Initial constants (Config.ts `AI_DIFFICULTY`), seeded smoke runs on verdantia
(`--runs 2 --ticks 2000 --nations 15 --bots 20`, 2026-07-14):

| Difficulty | nation pop× | bot pop× | tribe pulse | nation budget | top-k | resourceFocus |
| ---------- | ----------- | -------- | ----------- | ------------- | ----- | ------------- |
| Easy       | 0.5         | 1/3      | 40          | 1             | 4     | 0.25          |
| Medium     | 0.75        | 1/3      | 30          | 2             | 3     | 0.5           |
| Hard       | 1.0         | 1/3      | 25          | 3             | 2     | 0.75          |
| Impossible | 1.25        | 1/3      | 20          | 3             | 1     | 1.0           |

Observed (2 seeds each):

- Easy: alive 8/8, leader ~23%, gini ~0.26 — flat field, slow AIs.
- Impossible: alive 19/10, leader 20–33%, gini ~0.50 — sharper concentration,
  stronger AI snowball. firstElim later than Easy (stronger mutual defense).

The nation population multipliers port the vanilla difficulty ladder
(0.5/0.75/1/1.25); bots keep the vanilla flat ⅓. Cadence/precision values are
first guesses — retune with more seeds/ticks once the earth maps are in
rotation. `BalanceRun.ts --difficulty <D>` selects the ladder.
