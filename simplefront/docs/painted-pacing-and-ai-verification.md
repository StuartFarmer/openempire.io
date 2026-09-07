# SimpleFront pacing and AI — implementation and measured limits

Implemented September 6–7, 2026, directly in the existing checkout. No commits,
deployment, dependency installation, or dev-server restart. Root OpenFront Live
gameplay remains untouched.

## Outcome

Active paid-action AI, capacity-scaled refill, cheaper painting, difficulty
selection, real winner/results, restart isolation, and a reproducible benchmark
are implemented. **The 10–15 minute target is not achieved.**

Both the initial and final balanced ten-seed sets had **0/10 wins by 1200 simulated
seconds**. A timeout is recorded as unfinished, never converted into a winner.
Consequently, median completed-game duration is undefined, not 20 minutes.

| Standard ten-seed result               | Initial | Current candidate |
| -------------------------------------- | ------: | ----------------: |
| Completed by 20 minutes                |    0/10 |              0/10 |
| Median survivors at 20 minutes         |    42.5 |                 7 |
| Median leader land share at 20 minutes |  14.23% |            36.31% |
| Median first enemy capture             |  24.0 s |            13.6 s |
| Median first elimination               | 487.1 s |           47.55 s |

The current candidate consolidates much faster, but still leaves entrenched
late-game opponents. It can also eliminate small starts too quickly: the first
elimination in balanced seed 02 occurred at 9.7 seconds. These results are not a
claim that the game is balanced or that automated opponents establish human fun.

## Current rules and cadence

- Start: one complete city, one complete farm, 4000 food, 2000 troops.
- Food capacity: `5000 + 5000 * farms`; troop capacity: `10000 * cities`.
- Every 100 ms tick, below capacity: `gain = (a*K + r*x) * (1-x/K)`.
  Food `(a,r)=(0.001,0.004)`; troops `(0.0003,0.009)`.
- Fractional credit is retained. Deployed armies and pending landings count in
  troop fill. Over-capacity troops survive; recruitment stops until below cap.
- Farm 1500 food; city 2000; new land/boat dispatch 0.2 food per troop.
- Prices and capacities are linear/fixed, not exponential. No consumption,
  distributed supplies, workers, autonomous plot growth, or free AI purchases.
- Without farms, an alive territorial player regenerates food toward 5000.
  Measured rebuild-to-1500 is about 23 seconds. A city still enables recruitment.
- Unopposed 2000-to-7500 recruitment with one city takes about 26 seconds in
  the current candidate, versus 76.5 seconds before the recruitment adjustment.
- Buying a farm and city from 4000 leaves 500 food; the next farm is fundable
  in approximately 5.5–6 seconds with the resulting two farms.
- Easy/Medium/Hard/Impossible decisions occur every 30/20/15/10 ticks.
  Reserve fraction is seeded within 30–40%, with desired neutral/enemy dispatch
  shares of 15%/30% of idle troops, clipped to food and defensive reserves.
- Rebuild essential plots first. Consider city capacity at 75% total fill and
  farms against a finite 200-tick expense/refill forecast. Discretionary building
  preserves up to 500 food for dispatch. Every third discretionary decision
  gives an available military order priority, preventing endless city painting.
- Local tile windows inspect at most 256 candidates per pulse. Orders seed a
  contiguous front of up to eight owned source tiles. Coast search rotates
  within radius 96, with at most four failed route checks per pulse.
- A campaign samples progress every 100 ticks and retreats after two stalled
  samples or a reserve breach. Friendly destinations trigger boat retreat.
- AI uses the existing attack, retreat, transport, landing, damage, and purchase
  executions. No new difficulty bonuses were introduced.

The candidate preserves the original food coefficients, prices and capacities.
Only troop refill coefficients were tripled during numerical calibration.
Controller changes also fixed disconnected source fronts, premature campaign
forgetting, food-reserve investment deadlock, omitted hostile-front budgets,
and construction starving military decisions. Focused reproductions failed
before their corresponding fixes.

## Reproducible setup and evidence

All full runs use the actual `createGameRunner(..., "simplefront")`, actual
Verdantia terrain/layers, Singleplayer FFA, Medium, 25 authored nations, 50 bots,
and a deterministic human-slot stand-in controlled by the same AI. All 76 seats
spawned in the recorded runs. Opponents receive 100 spawn-phase ticks before a
bounded deterministic legal human spawn. The budget is 12000 ticks after spawn;
samples are every ten ticks. Timestamps exclude the spawn phase.

The harness records per-player resources, capacity, ownership, total/deployed
troops, hashes, food-blocked intervals, purchases/dispatches/rejections, first
captures and eliminations. Capture counts are per-tick net ownership changes.
Food-spend telemetry comes from successful purchases and dispatch debits, not
food-stock differences: losing capacity is not spending and landing is not a
second troop purchase. Wall time is reported separately from simulation time.

Raw runs are gzip-compressed JSON under `docs/balance-runs/`; these large local
artifacts are ignored by git but preserved on disk. `gunzip -c FILE.json.gz`
recovers the exact JSON. The small [summary](balance-runs/summary.json) is kept
separately. Files are not overwritten by either CLI.

- `initial-balanced.json.gz`: ten initial-preset seeds.
- `initial-policies-{0,1,2}.json.gz`: ten seeds per rotation of farm-first,
  expansion-first and military-first priority variants over the same controller.
- `reviewed-seed-01.json.gz`: contiguous fronts/campaign and transport fixes,
  original recruitment coefficients; unfinished at 20 minutes.
- `refill-3x-seed-01.json.gz`: tripled recruitment; unfinished, seven survivors.
- `investment-seed-01.json.gz`: farm-investment/reserve fix; unfinished.
- `calibrated-balanced.json.gz`: final ten-seed candidate.
- `calibrated-policies-{0,1,2}.json.gz`: matched final rotations, all unfinished.
- `calibrated-replay-01.json.gz`: full 12000-tick rerun of candidate seed 01.
  All 1201 samples and 10991 events match exactly; final hash `1074031429`.

Each of the three policy variants receives every stable seat across rotations:
760 seat observations per policy at each checkpoint. At ten minutes in the
current rotations, military-first survival is 16.32%, expansion-first 8.68%, and
farm-first 6.97%; their mean shares of total land are 2.16%, 0.95%, and 0.80%.
Military-first has an advantage here; this is not proof of universally optimal
play. Seats within a match are dependent and the inherited bot/nation combat
differences remain. Early policy-run eliminations are discussed below.

Commands run from `simplefront/` (the node form avoids sandbox-denied tsx IPC):

```sh
node --import tsx scripts/painted-balance.ts --seed simplefront-pace-01 --ticks 300
node --import tsx scripts/painted-balance.ts --out docs/balance-runs/initial-balanced.json
node --import tsx scripts/painted-balance.ts --compare-policies --rotation 0 --out docs/balance-runs/initial-policies-0.json
# Repeat rotations 1 and 2. Initial JSON was then losslessly gzip-compressed.
node --import tsx scripts/painted-balance.ts --out docs/balance-runs/calibrated-balanced.json.gz
node --import tsx scripts/painted-balance.ts --compare-policies --rotation 0 --out docs/balance-runs/calibrated-policies-0.json.gz
# Repeat rotations 1 and 2.
node --import tsx scripts/summarize-painted-balance.ts --out docs/balance-runs/NEW-summary.json docs/balance-runs/initial-*.json.gz docs/balance-runs/calibrated-balanced.json.gz docs/balance-runs/calibrated-policies-*.json.gz
```

Invalid `--ticks` and existing-output cases fail before running simulations.
The full candidate replay was also compared using Node deep equality for
`samples` and `events`, not just the summary hash.

Selected SHA-256 provenance:

```text
Verdantia map.bin: f1b1a85f8bbf61e278e3a721f0c538268715a4abdc89d0b38bf512ff5defc8d2
Verdantia layers.bin: 1eabcb9c43c9345cc5c0651de1e4fbca5f31b4db4dfabe663289dd65560410f3
PaintedAI.ts: cf5a46bb0fd7068e05f70b05d200189e6b6369ba186beda8561b6e30d6790200
PaintedEconomyConfig.ts: 93293244c5276ee834762ede8afe263a8c6bb8e7362edbeb5ac23d3306ec1289
```

## Verification

Environment: local macOS arm64, Node 25.2.1, installed TypeScript/Vitest/Vite/
Playwright dependencies. No packages downloaded.

- Fresh pre-change copied baseline: 142 tests in 20 suites, plus typecheck.
- Current full copied regression: 181 tests in 28 suites, passing.
- Typecheck, scoped `eslint src tests scripts`, and production build passed.
  Build retains the existing large-chunk warning; it is not a runtime failure.
- Root picker/runtime isolation: 35 tests in two suites passed.
- `openspec validate simplefront-pacing-and-ai --strict` passed.
- Root tracked changes still match the eight-file baseline, 74 insertions and
  one deletion. `git diff -- src/core src/client/games/openfront` is empty.
- New regressions use real selected core/config/executions. Worker tests replace
  external map fetching only, including a tiny legal map whose real victory
  checker ends a match; the final frame appears before stopping, resume is
  refused, and a fresh match starts. UI tests cover pending difficulty storage,
  win/loss/time presentation, ghost-stroke cancellation and ambient separation.
- A retained mutable-map cache caused the second seeded runner to inherit the
  previous game's owners and fail. Copied map loading now creates a fresh mutable
  map per match; restart and replay checks pass. Root map loading was not changed.
- Expected asynchronous races can log that a retreating attack/boat has already
  ended, or that a coast changed before execution. The core rejects these; the
  benchmark propagates actual runner errors instead of treating them as wins.

## Browser evidence and remaining limits

The existing port-9000 server was used; no user server was restarted. Isolated
Chromium selected SimpleFront through the root picker, changed next-match
difficulty, restarted, spawned, painted and submitted food-funded attacks.
The clean normal-speed Verdantia run lasted 600 wall-clock seconds, reaching
tick 5800 (approximately 580 simulated seconds). The human slot held 31853 of
66369 land tiles (about 48%), 83 farms, 145 cities, approximately 193517 food and
1442439 total troops. Its territory fell from 32890 tiles near the end as an AI
counterattacked. The match was still active, with no winner reported.

Restart then returned to the spawn phase with zero cities and no stale result;
returning to the root OpenFront shell succeeded. No page errors were reported.
The final screenshot is retained locally at
`/private/tmp/simplefront-paced-browser.png`. Inputs were automated through the
page's painting/gesture methods and paid attack intents, so this is integration
and pacing evidence, not a human playability study.

Dev-server reloads interrupted earlier runs; those do not count as completed
games. The clean run blocked WebSockets only in its isolated browser context to
disable hot reload; the selected game's Worker continued normally and the user
server was unchanged. Full last-farm/city loss and rebuilding, and a completed
match/result flow, were not observed in the browser. Recovery, actual worker
victory and result presentation have automated test coverage as described above.

Two inherited rules matter when choosing the next simplification:

1. `AttackExecution.handleDeadDefender` conquers a defender once it has fewer
   than 100 tiles after a capture. Starting footprints are around 52 tiles.
   Bots have no spawn immunity, so aggressive policies can eliminate a nearby
   bot on their first successful capture, even while that bot has troops.
   In rotated policy seed 01, one such elimination occurs at 1.4 seconds. This
   rule was preserved, not introduced or weakened for the benchmark.
2. Late games accumulate large defending armies and multiple surviving powers.
   The final candidate's largest leader share in the standard set is only 51.6%
   at 20 minutes, below the unchanged >80% victory condition. Faster early
   recruitment alone does not resolve this. Food, army size, repeated investment,
   frontier geometry and existing combat all interact; the evidence does not
   prove that any single rule alone causes every stalemate.

Changing small-territory auto-defeat, adding an early protected phase, introducing
diminishing city returns/prices, changing late-game resolution, or changing the
standard map/player count needs a new design decision. None was silently added
to force the duration target. The current build is available for playtesting;
full 10–15 minute balance and a full browser match/recovery/result flow remain
unverified.
