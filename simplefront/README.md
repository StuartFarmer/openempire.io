# SimpleFront

An independent source and asset copy of OpenFront Live. Everything under this
directory belongs to SimpleFront: simulation, economy, AI, controls, UI, worker,
renderers, shaders, maps, assets, configuration, and build output. There are no
source imports, symlinks, or configuration inheritance from the parent game.

From the repository root:

```sh
npm run dev
```

Open the game picker and select **SimpleFront (live)**. It opens at
`http://localhost:9000/simplefront/#shell` on the same server. Select
**OpenFront (live)** to return. Each page loads its own source, worker, and assets;
SimpleFront uses prefixed browser-storage keys to keep saved settings separate.

The parent build also builds this app separately into `static/simplefront/`.

The independent app can still be run directly on port 9010:

```sh
cd simplefront
npm ci --ignore-scripts # optional here if the parent's dependencies are installed
npm run dev
npm test
npm run build # writes only simplefront/static/
```

The directory can also be moved out of this repository and installed using its
own package.json and package-lock.json. npm packages may currently resolve from
the parent's node_modules; application code and assets are physical copies.

## Where to simplify

- `src/core/configuration/PaintedEconomyConfig.ts`: active resource formulas, capacities, prices, and starting balances.
- `src/core/execution/utils/PaintedEconomy.ts`: global ledger, recruitment, capacity changes, and dispatch charging.
- `src/core/configuration/Config.ts` and `FoodConfig.ts`: retained combat/damage tuning and dormant legacy-economy settings.
- `src/core/execution/`: economy, growth, combat, spawning, and AI.
- `src/core/game/`: state, players, units, and maps.
- `src/client/webgpu/ShellSim.worker.ts`: simulation worker and commands.
- `src/client/GameShellPage.ts`: controls, HUD, and game presentation.
- `src/client/games/simplefront/`: runtime, render setup, and render layers.
- `src/client/games/shared/live-game.wesl`: main view shader, local to this copy.
- `resources/` and `proprietary/`: copied maps, text, graphics, and sounds.

Only SimpleFront is registered as playable. The broader client and experimental
source were copied too, so existing dependencies remain intact while you trim
them. Original filenames and license notices are retained for provenance.

Tests cover the copied economy, growth, border mechanics, deterministic random
generator, shader compilation, and the boundary that prevents source imports
from escaping this application.

## Painted economy and active AI

SimpleFront selects its own painted global economy and paid-action AI. Bots and
nations paint, expand, defend, run campaigns, retreat, and use transports through
the same purchase and military executions as the player. Verdantia is the
playable default, with 25 authored nations and 50 bots.

- Start with one complete city and farm, 4000 food, and 2000 troops.
- Food capacity: `5000 + 5000 × farms`. Troop capacity: `10000 × cities`.
- Every 100 ms simulation tick, refill is `(a × capacity + r × current) × (1 - current / capacity)` below capacity and zero otherwise. Food uses `(a,r)=(0.001,0.004)`; troops use `(0.0003,0.009)`. Fractional gains accumulate. This is capacity-scaled S-shaped replenishment, not logarithmic growth.
- Food is global action currency. Troops never eat; there are no workers, distributed food stores, supply losses, or autonomous city/farm growth.
- Paint Farm costs 1500 food per tile; Paint City costs 2000. Drag previews a one-tile-wide stroke, release buys it, and pointer cancellation discards it. Invalid cells are skipped; the first unaffordable purchase stops the stroke permanently. The limit is 4096 cells.
- Land and transport dispatch each cost 0.2 food per new troop committed. Rejected orders cost nothing; committed fees are not refunded. Landings, merges, and retreats do not charge existing troops again.
- Idle, attacking, and boat passengers all count toward troop capacity, including queued landings. Recruitment enters the idle pool. Existing movement and combat rules remain.
- Captured plots transfer capacity intact, not food or troops. Food above a reduced capacity is immediately discarded; excess troops survive but recruitment pauses.
- Without farms, baseline food still recovers toward 5000 while territory remains. A city permits recruitment from zero. No cities means no recruitment; no territory means no recovery.
- Damage blocks new painting until healed but does not disable an existing plot's capacity. Upgrades and demolition/conversion controls are not part of this first interface.

Difficulty applies to the next match: Easy / Medium / Hard / Impossible give
AI decision intervals of 3 / 2 / 1.5 / 1 seconds. There are no added AI economic
bonuses. Existing combat-type modifiers are retained. The actual core winner
(over 80% of playable land in FFA) produces a result panel and stops the match;
Restart clears the result and pending input. There is no forced 15-minute winner.

These defaults are a measured playtesting preset, **not achieved 10–15 minute
balance**. The latest ten standard AI simulations all remained unfinished after
20 simulated minutes, despite much faster consolidation than the initial preset.
See [pacing and AI verification](docs/painted-pacing-and-ai-verification.md).
Capacity
functions are separate from prices and replenishment so nonlinear capacity can
be introduced later. Old SimpleFront turn logs are not promised to reproduce
under these changed rules. Legacy economy source/tests remain available under
explicitly non-painted configs; they are not the selected SimpleFront runtime.

The earlier `docs/painted-economy-verification.md` is historical evidence for the
passive-opponent version, not the current rules.

## Reproduce the balance checks

```sh
npm run balance:painted -- --out docs/balance-runs/my-run.json.gz
npm run balance:painted -- --compare-policies --rotation 0 --out docs/balance-runs/my-policies.json.gz
```

Defaults: seeds `simplefront-pace-01` through `10`, 12000 post-spawn ticks,
Medium, Verdantia, 25 nations, 50 bots, and the same controller operating a human
slot. `--seed`, `--ticks`, and `--rotation 0|1|2` narrow a run. Existing outputs
are never overwritten. JSON encodes exact milli-food amounts as decimal strings.
If the local sandbox blocks tsx's IPC pipe, the equivalent command is
`node --import tsx scripts/painted-balance.ts ...`.

Compressed raw traces remain local and are git-ignored because of their size.
`docs/balance-runs/summary.json` is the compact comparison; its regeneration
command is in the verification document.
