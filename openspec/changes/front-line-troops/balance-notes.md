# Balance notes: front-line-troops

Harness: `BalanceRun.ts --map verdantia --runs 3 --nations 25` (3000 ticks,
40 bots), with the 20% `maxWarShare` cap in place.

## Baseline

The run immediately before this change (war cap only, scalar attack troops):

|          | alive (r0/r1/r2) | leader share | gini  | starved |
| -------- | ---------------- | ------------ | ----- | ------- |
| baseline | 10 / 14 / 13     | 0.262        | 0.496 | 208 765 |

## A scale bug found by the harness, not by tests

The first implementation passed every unit test and nearly froze the game:
23–25 of 25 nations survived and leader share halved. Cause: `attackLogic`
weighs `defender.troops()` — the defender's **whole army** — against
`attackTroops`. Making that second term a single tile's force compares a
national army to a squad, so `within(defender/attacker, 0.6, 2)` pinned at the
2x cost ceiling on every tile and nothing could advance.

Sweeping `frontSeepFraction` over {0, 0.1, 0.3, 0.6} moved nothing (alive
21–26 throughout) — which is what proved the problem was scale, not cohesion.

Fix (D4a): scale the tile's force by `frontReferenceWidth`, so an attack spread
over exactly that many tiles reproduces the old behaviour and width becomes the
lever. **The lesson is the same one `localize-defender-density` taught: when
localizing one side of a ratio, the other side has to be brought to the same
scale or the clamp eats the whole mechanic.**

## Reference-width sweep

| `frontReferenceWidth` | alive (r0/r1/r2) | leader share | gini  | starved |
| --------------------- | ---------------- | ------------ | ----- | ------- |
| 8                     | 18 / 23 / 25     | 0.172        | 0.613 | 257 195 |
| **16 (shipped)**      | 14 / 19 / 20     | 0.181        | 0.540 | 265 944 |
| 32                    | 15 / 23 / 19     | 0.191        | 0.601 | 227 350 |

16 restores conquest (14–20 alive) without returning to the old snowball —
leader share sits at 0.181 against the baseline's 0.262, and gini at 0.540
against 0.496.

## Findings

- **Conquest is slower and less concentrated than before.** Fewer eliminations,
  lower leader share. Some of that is intended (a wide front is genuinely weaker
  now), some may be over-correction — 3 seeds cannot separate them.
- **Cohesion (`frontSeepFraction`) is a weak lever** across 0–0.6. Shipped at
  0.1 mostly so a stalled stretch can recover at all; it is not a balance knob.
- **`scalingExponent` moved 1.37 → 1.51** (R² 0.969). Territory shape genuinely
  changed — fronts advance in narrower fingers rather than broad sweeps, which
  is the visible signature of the change working.

## Confidence

**Low.** 3 seeds, one map, one difficulty. `frontReferenceWidth` interacts with
the AI's segment width (`max(8, contact/3)`, unswept and hardcoded) — together
they set how thin a typical AI push is, and only their combination is really
tuned. Wants >=10 seeds and a difficulty sweep before it is trusted.

## Not swept

- The AI's segment width (hardcoded in `AiAttackBehavior.attackSegment`).
- `frontSeepFraction` beyond 0.6.
- Difficulty; any map other than verdantia.
