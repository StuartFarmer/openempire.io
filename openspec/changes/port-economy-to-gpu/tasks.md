## 0. Park the redesign

- [x] 0.1 Remove `flow` from the shell picker so there are two games again, the CPU original and the GPU fork. Keep the system folder — it is a coherent design and may be wanted later as its own game.
- [x] 0.2 Note in `leanfront-flow-economy` that it is parked and why: the objective was a port and it became a different game.

## 1. Complete the per-tile passes

Everything here is verified in ISOLATION against the CPU before anything
switches. That is the only cheap place to catch bugs, because the cutover
(section 3) moves the whole economy at once by necessity.

Already done and verified:

- [x] 1.1 Supply flood — exact on 19,789/19,789 tiles.
- [x] 1.2 Food-shed flood — 100% cell agreement, 0 differing tiles.
- [x] 1.3 Crop CA ripen/senesce — bit-identical.
- [x] 1.4 Nucleus seeding — folded into `farm_ripen`.
- [x] 1.5 District ledger — 0 of 57 districts off; totals identical at ticks 902 and 3102.
- [x] 1.6 Patch credit stream and acreage — 0 of 57 districts off.

Remaining:

- [x] 1.8a CANONICALISE the patch draw on the CPU, because D2's premise was only
      HALF true. The city draw already sorts its frontier ascending
      (`UrbanGrowth.addCityTiles`); the patch draw never did — its candidates
      come out in the order `placePatch` walks `fieldTiles`, which is the
      INSERTION HISTORY of the player's farm-maturity Map. The weighted walk
      accumulates until it passes the draw, so that history decided which plot a
      field grew: two identical fields built in a different sequence expand
      differently, and nothing the GPU can see reconstructs it. Sorted by tile
      ref, as the city draw is, so the serial pass in 1.8 has an order to
      reproduce.
- [x] 1.8b MEASURE whether an f32 draw can pick a different tile, before writing
      a shader that assumes either answer. `DrawProbe.ts` (a seam like the
      provider seams, inert unless a probe installs an observer) plus
      `tests/perf/balance/DrawPrecision.ts` record every draw's MARGIN: the
      distance from the draw value to the nearer edge of the winner's interval,
      as a fraction of the pool's total weight. A perturbation under the margin
      cannot change the outcome; one over it can. Over ~9,800 draws on two maps
      at 3000 ticks:

      | | draws | tightest margin | below 1e-6 |
      |---|---|---|---|
      | verdantia urban | 55 | 1.0e-3 | 0 |
      | verdantia patch | 2,776 | 5.2e-6 | 0 |
      | spqr urban | 457 | 3.9e-5 | 0 |
      | spqr patch | 6,993 | 3.2e-6 | 0 |

      The margin alone was NOT the answer, and reading it as one was an error
      worth recording. From the tail (8.1% below 1e-3, 0.70% below 1e-4, 0.086%
      below 1e-5 — a clean decade per decade) it extrapolates to P(margin <
      1e-7) ~ 8.6e-6 per draw, which at ~12k patch draws per game reads as ~0.1
      flips per game and a binary gate that cannot hold. That reasoning assumes
      an error moves a cumulative boundary by `rel x total`. It does not: f32
      errors are effectively random-signed per weight, so they partly cancel in
      the cumulative sum and move a boundary by roughly `rel x total / sqrt(N)`.
      The margin is an upper bound on risk, not an estimate of it.

      So the probe re-runs each draw with the weights actually perturbed, at a
      ladder of ulp multiples, and counts the ones that name a DIFFERENT tile:

      | perturbation | verdantia patch (2,776) | spqr patch (6,993) |
      |---|---|---|
      | 1 ulp (6e-8) | 0 | 0 |
      | 16 ulp (1e-6) | 0 | 0 |
      | 1024 ulp (6e-5) | 0 | 0 |
      | 4096 ulp (2.5e-4) | 1 | 1 |
      | 65536 ulp (3.9e-3) | 9 | 15 |

      Zero flips in 10,226 draws below 1024 ulp, and the urban draws never flip
      at any tested perturbation. The first flip needs ~4,000x the f32 ulp, so
      the draw carries a safety factor of 1,000-4,000x over transcribing the
      expression into f32.

      CONCLUSION: f32 is sound for the draw and the weights stay as they are.
      D2 holds as originally written, 4.2 stays a contingency rather than a
      plan, and the integerisation this task briefly called for is NOT done —
      it would have been a large rewrite of the sim's suitability math, plus a
      second re-baseline, bought on an extrapolation that measurement does not
      support.

- [x] 1.8d The draw's INPUTS, which had to be right before the draw could be:

      - The PRNG. `rand.wesl` transcribes `PseudoRandom` — sfc32 seeded by four
        splitmix32 rounds and twelve steps of warm-up — and the CPU uploads the
        seeds, because they hash the player's STRING id (`playerSeed` per
        player, `slotSeed` per district). Verified against `PseudoRandom`
        itself: 512 draws, worst |cpu-gpu| 2.96e-8, none beyond one f32 ulp.
        The difference is the f64/f32 division and nothing else.
      - The city draw's WEIGHT, which no pass computed. `urban_pick` weighted by
        `suitability`, and that is only the BASE term — the CPU's weight is base
        times a food-shed gate, so the race was sampling the right pool with the
        wrong probabilities all along. `shed_potential.wesl` +
        `city_weight.wesl` now produce it (split because the two together need
        ten storage buffers against a cap of eight). Verified tile-for-tile
        against the CPU's own `suit` map, built by calling `urbanSuitability`
        and `foodShedPotential` rather than transcribing them twice: 9,210 tiles
        on verdantia and 168,314 on spqr, ZERO missing and ZERO genuine
        predicate disagreements on both.
      - An uploader bug it caught: `FLAG_DAMAGED` was only ever set on tiles
        carrying crop, which was enough while the crop CA was its only consumer
        and wrong the moment a consumer asked about bare ground.

- [x] 1.14 FLOOD CADENCE — measured, and the answer is that it barely matters
      next to what the measurement turned up. `runDerive(frame, "consumers")`
      now runs every pass EXCEPT the two floods and the potential field they
      feed, so the two ends can be timed on the same board.

      spqr, tick 9102, 100 bots, apple/metal-3 — the late-game board every
      correctness check above ran against:

      | | cost |
      |---|---|
      | full dispatch (floods every tick) | **10.0 ms** |
      | consumers only | **1.8 ms** |
      | 10-tick flood cadence, averaged | **2.6 ms** |

      So the floods are 8.2 ms of 10.1 — 81% of the dispatch, close to the 84
      of ~101 grid passes the structure predicted. Cadencing them is worth 3.7x.

      DECISION: keep flooding EVERY TICK for now. 10.1 ms against a CPU economy
      of ~26 ms mean and ~118 ms at the worst tick is already the win the port
      exists for, it is the better game under D9, and the cadence is a dial that
      can be turned later without touching a shader — the tier split is built.
      Spending correctness on 7 ms while a 229 ms problem sits next to it would
      be optimising the wrong end (see 1.16).

- [x] 1.16 THE UPLOADER WAS THE BOTTLENECK — 229 ms against a 10 ms dispatch,
      larger than the 138 ms CPU tick the port set out to kill. Now 18.1 ms.
      Two bugs, and the profile named both; the guess ("the O(grid) owner scan
      dominates") was wrong, and it was 3.2 ms.

      | | before | after |
      |---|---|---|
      | gpu write | 113.0 ms | **0.8 ms** |
      | per-player walk | 68.4 ms | **7.3 ms** |
      | owner scan | 3.2 ms | 3.2 ms |
      | game-wide | 3.4 ms | 3.3 ms |
      | slots + seeds | 0.3 ms | 2.3 ms |
      | TOTAL | ~193 ms | **18.1 ms** |

      THE WRITES. The mirrors were CLEARED and rebuilt every refresh, so every
      tile was dirtied twice whether or not its value moved — the delta upload
      degraded to "resend the whole plane" on four of the eight planes and cost
      113 ms on a board where nothing had changed. Now the walk writes into the
      mirror only on a difference, and stale entries are retired afterwards from
      the sparse lists. One trap on the way, worth recording because it produced
      a beautifully plausible wrong answer: the first version used a single
      `seen` mark shared by all planes, and a nucleus carries BOTH maturity and
      tenure, so maturity's retire pass cleared the mark before tenure's read it
      — 586 nuclei silently lost their tenure and the city weight picked up
      6,452 phantom tiles. One bit per plane fixes it.

      THE WALK. It iterated `p.tiles()` — every owned tile, ~2M at full conquest
      — doing two `landUse` lookups (the same one, twice) and three set lookups
      each, to set four flags. Every one of those flags has a SPARSE source: the
      zones live in a Map and `ranked`/`tilled` are the shed's own Sets. Walking
      those instead is 9.4x cheaper and needs one ownership check per entry.
      Added `Player.landUseEntries()` for it, with tests.

      WHAT REMAINS, if it is ever worth it: the owner scan (3.2 ms) is O(grid)
      and could fold in the sim's `packedTileUpdates`; the rest largely vanishes
      with the cutover, since under GPU ownership maturity, tenure and the
      derived flags have only one copy (D8).

- [x] 1.8 DROPPED by D9. The serial draw existed only to pick the SAME tile as
      the CPU; with identity no longer the contract, the exponential race
      already on the GPU reproduces the distribution, runs fully parallel, and
      costs none of the single-lane serialisation D2 had to flag as a risk.
      What 1.8's work produced and keeps: the PRNG in WESL (the race needs its
      own seeds), and `shed_potential` + `city_weight`, which are a BUG FIX
      rather than a fidelity nicety — see 1.8d.
- [x] 1.7 Patch APPLICATION — `farm_patch_apply.wesl`, the last pass with no GPU
      twin. One thread per district slot, not per tile: the reductions it needs
      (`driveAccum`, `acreAccum`) and the tile the draw picked (`patchTile`) are
      already computed, so what remained was per-district arithmetic and one
      scattered write.

      CREDIT is mirrored on the CPU keyed by nucleus TILE and re-uploaded in
      slot order each refresh. It cannot live only on the GPU: slots are
      renumbered in ascending tile order whenever the farm set changes, so one
      farm dying shifts every slot after it and would hand a district's savings
      to its neighbour. RESIDENTS come from `shed.peopleByFarm` for the same
      reason population does — D1.

      Verified over 24 repeated dispatches, which is the only way to reach the
      branch that matters: a district banks at most 3,000 per dispatch against a
      cost of 50,000, so a single-dispatch probe can never place anything. All
      four branches exercised — saving 1,132, labour-blocked 12, no-frontier 8,
      PLACED 24 — and every placement landed at the claim threshold in the
      maturity plane the rest of the dispatch reads (0 missed), which also
      proves `maturity.read!` binds the current ping-pong facet rather than the
      stale one.

- [x] 1.15 THE ACCUMULATORS WERE NEVER RESET, and it hid two bugs of opposite
      kinds. `reset_cells.wesl` + `reset_players.wesl` now run first.

      The reductions (`prodAccum`, `capAccum`, `driveAccum`, `acreAccum`,
      `acresAccum`, `roomCount`) are `atomicAdd` targets. A fresh WebGPU buffer
      is zeroed, so every single-dispatch isolation probe got the right answer —
      and in a per-tick loop they would have accumulated across the whole game,
      without bound. The port would have failed at the cutover for a reason no
      probe in section 1 could see. Now checked directly: production total is
      identical across 24 consecutive dispatches (4,812,253 -> 4,812,253).

      Worse, and wrong even at one dispatch: `patchKey` and `pickKey` are
      `atomicMin` targets, so they must START at the maximum. Starting at zero
      means no key is ever smaller, the minimum never moves, and the claim pass's
      `key == atomicLoad(...)` is never true. BOTH PLACEMENT RACES HAD NEVER
      NAMED A WINNER. They do now: 41 districts and 34 players on verdantia at
      tick 1002, 362 and 41 on spqr at 9000.

- [x] 1.9 Tenure aging — farms age at their climate ceiling. `farm_tenure.wesl`,
      placed AFTER `district_yield` because `tenureTick` runs after `foodTick`
      and the ledger must read the tenure this tick has not yet advanced.
      Verified: 0 tiles disagree with the CPU expectation over the WHOLE plane
      (49 nuclei aged on verdantia at tick 1002, 403 on spqr at 3102).
- [x] 1.10 The acres histogram (`EconomyModel.committedStaffing` — `assessCommitted`
      is not a function that exists) as a per-slot reduction. `farm_acres.wesl`,
      and it must stay the LAST reader of maturity: its consumer reads the CPU's
      end-of-tick map, which includes the plot the patch phase just placed at
      exactly the claim threshold. Verified: 0 of 49 districts off (982 tiles)
      and 0 of 410 off (37,977 tiles).
- [x] 1.6a The probe was measuring a board no game occupies, and 1.5/1.6 are
      re-verified because of it. The uploader's mirrors start empty, so the
      FIRST refresh raises `FLAG_OWNER_CHANGED` on every owned tile and
      `farm_ripen` applies the CONQUEST rule to the whole map — the probe
      dispatched against maturity wiped to the field-zone seed. Every check
      derives its reference from the planes the GPU read, so all of them still
      agreed EXACTLY, on a board where nothing was above the claim threshold.
      Measured on verdantia at tick 1002: CPU maturity peaks at 788 milli with
      1,016 tiles at or above claim; the plane the passes read peaked at 62 with
      none. Two refreshes before the dispatch fixes it, and every earlier result
      holds on the real board (production total rises 7.6x, still 0 districts
      off).
- [x] 1.11 INVERTED by D9. The exponential-race passes are KEPT, not retired —
      equidistributed is the contract now. They must, however, be re-pointed at
      `cityWeight` instead of `suitability`: weighting by the ungated base was a
      wrong DISTRIBUTION, not a different sample from the right one.
- [x] 1.12 Isolation-verify every pass against the CPU on IDENTICAL inputs —
      now the primary gate, not a preliminary (D9). EVERY pass has a probe: the
      line that said 1.7 was the exception was stale, and 1.7 acquired one when
      it landed — `LedgerProbe.worker`'s PATCH APPLICATION block re-evaluates
      the CPU's rule per district against the same reductions the GPU used
      (`creditOff`/`creditWorst`), and the 24-dispatch loop reaches the branch
      that actually writes a plot. What was missing was not a probe but a ROW:
      the table had never reported `patch apply` at the late-game horizon
      alongside the rest. It does now, and the whole table is a single run.

      RE-RUN AT THE LATE-GAME HORIZON, which is the only one that counts: 900
      and 3000 ticks is the cheap half of the game and hides anything that needs
      a full board. (The first attempt at this reported "100 bots" and was
      actually running with none — a `--bots` argument that never reached the
      worker because a prettier reformat silently broke the edit that passed it.
      The numbers below are the corrected run.) spqr, tick 9303, 100 bots, 601
      districts, apple/metal-3:

      | check | result |
      |---|---|
      | district production | 0 districts off; totals identical (1,505,145,860) |
      | granary capacity | 0 districts off; worst 1 milli (0.0003%) |
      | patch credit + acreage | 0 districts off |
      | patch APPLICATION | 0 districts off, worst 0 milli |
      | labour acreage | 0 districts off, 148,686 tiles both ways |
      | farm tenure | 0 tiles disagree, 586 nuclei aged both ways |
      | PRNG | 0 of 512 draws beyond one f32 ulp (worst 2.96e-8) |
      | city weight | 185,296 tiles, 0 missing, 0 extra, 0 predicate disagreements |
      | placement draws | 362 districts and 41 players named a winner |
      | residents upload | 0 of 601 slots differ (145,488,126 both) |
      | maturity drift (2.3) | 154,178 of 154,178 exact, worst 0.00 milli |

      PATCH APPLICATION reaches all six of its branches over the 24-dispatch
      loop — no drive 24, saving 12,174, labour-blocked 45, no tile 1,832,
      PLACED 349 — and every one of the 349 plots landed at the claim threshold
      in the maturity plane the rest of the dispatch reads (0 missed). The
      single-dispatch figure is "0 districts placed", which is the RULE and not
      a broken write: a district banks at most 3,000 milli per dispatch against
      a cost of 50,000, and 584 of 601 clear the labour gate, so the branch is
      simply out of reach until credit accumulates.

      One number in that loop needs its explanation stated rather than assumed,
      because its own label invites the wrong reading. Production over the 24
      dispatches goes 1,505,218,132 -> 1,506,181,040, and "stable means the
      accumulators reset" makes a rise look like a leak. It is not: the loop
      PLACES 349 plots without ticking the sim, so the board it re-dispatches
      genuinely grows. The rise is 962,908 milli, or 2,759 per plot placed —
      one fresh plot's worth of production. An accumulator that failed to reset
      would climb by its own value each dispatch (~1.5 billion), not by 0.064%
      across all 24.

      THE ONE RESIDUAL is the flood cadence, and this run bounds it further than
      D9 did. 1,698 tiles of 185,296 (0.92%) carry a city weight more than 0.1%
      from the CPU's, ALL with the same shed cell. The worst is 70.05%, not the
      14.7% measured on the thinner board — and the direction is the tell: on
      those tiles the GPU's weight is HIGHER (1.165 against 0.685), which is
      what a fresher district looks like when the CPU froze its maturity ten
      ticks ago and the farms have ripened since. Under D9 the GPU's is the
      better number; 4.2 carries the bound.

      Everything the probe can catch as a DEFECT, it reports as zero.

- [x] 1.13 DECIDED: the city half of `tenureTick` MOVES WITH THE CUTOVER. 1.9
      ports the farm half; the city half ages density tiles behind a per-player
      demand gate (population against housing) and reduces a per-player housing
      bonus. It was left open because it needs a per-player uniform in and a
      per-player reduction out, "a shape nothing in the pipeline has yet".

      THAT PREMISE IS NO LONGER TRUE, which is what settles it. Both shapes were
      built for other reasons and are verified: `playerSeed`
      (`{type: "u32", count: 256}`) is a per-player upload going in, and
      `roomCount` (`array<atomic<u32>, 256>`, readable) is a per-player integer
      reduction coming back. `owner[i]` indexes those arrays directly — the
      draws already do it (`atomicMin(&pickKey[mine], ...)`). Nothing new has to
      be invented; the pass is `roomCount`'s shape with a different summand.

      And every INPUT it reads is already resident: `density` (f32 plane, the
      uploader mirrors `p.densityEntries()`), `tenure` (readable, because
      `farm_tenure` already writes it) and damage via `farmFlags`' FLAG_DAMAGED.
      So leaving it on the CPU is not "staying where it is" — after the cutover
      it would mean copying the density and tenure planes BACK every tick to
      read them, which is Level A's round trip on the cheapest consumer in the
      economy. Stranding it costs more than moving it.

      THE GATE STAYS ON THE CPU and is uploaded as a per-player flag. `housing =
      basePopulation + urbanArea·popPerDensity + tenureCapacityBonus` is three
      per-player scalars the CPU already holds, and it reads the PREVIOUS tick's
      bonus — `tenureTick` computes `saturated` before it overwrites the bonus —
      so splitting gate-in/bonus-out across the two sides introduces no ordering
      hazard that the CPU does not already have.

      ORDERING: alongside `farm_tenure`, after `district_yield`, for the reason
      that pass documents — `tenureTick` runs after `foodTick`, so the ledger's
      capacity term must read the tenure this tick has not yet advanced. The two
      halves write the same `tenure` plane over DISJOINT tiles (full city tiles
      vs Farmland nuclei), so they can be one pass or two adjacent ones.

      THE ONE GENUINELY NEW THING is the render side effect:
      `recordDensityUpdate` emits a density byte whenever aging changes
      `urbanRenderByte`. That is a sparse per-tile output, and it is
      `maturity_compact`'s shape — count and pack the tiles whose byte moved,
      read back only that prefix. It is the piece to design rather than
      transcribe.

      Cost, for scale: 0.7% of the tick. It moves because its producer has, not
      because it is expensive. Implementation lands with the cutover — added to
      `complete-gpu-economy-cutover` as task 2.4 so it is not stranded.

## 2. Fix the ordering the ledger cutover exposed

- [x] 2.1 ORDERING, satisfied by construction. The pipeline runs
      `farm_ripen` (which folds in nucleus seeding and the conquest rule) ->
      `farm_credit` -> the patch weight, race and claim -> `farm_patch_apply`
      (the only other writer of maturity) -> `farm_acres` -> `district_yield`.
      Every write to maturity therefore happens before the ledger reads it,
      which is what D3 requires and what the CPU does by running `farmTick`
      inside `foodTick` immediately before the ledger loop. `farm_tenure` sits
      AFTER `district_yield` for the mirror-image reason: `tenureTick` runs
      after `foodTick`, so the ledger's capacity term must read the tenure this
      tick has not yet advanced.

- [x] 2.2 SUPERSEDED by D9. This asked for a clean hash stream from the ledger
      injection A/B, which was the bit-identity contract. What it was really
      testing — that the ledger reads the same maturity the CPU's does — is 2.3,
      and 2.3 now answers it directly rather than through a hash.

- [x] 2.3 MATURITY DRIFT — the GPU's `farmTick` lands exactly where the CPU's
      does. The comparison had to be set up right: the GPU advances the board
      one tick from the uploaded state, so the reference is the CPU ticked one
      step FURTHER, not the state that was uploaded. Diffing against the upload
      would have compared tick N with tick N+1 and called the crop CA broken.

      | | tiles compared | exact |
      |---|---|---|
      | verdantia, tick 1002 | 986 | **986 (100%)** |
      | spqr, tick 9102, 100 bots | 154,178 | **154,178 (100%)** |

      Worst difference 0.00 milli on both. This covers ripening, senescence, the
      fallow floor, nucleus seeding and the conquest rule together — the whole
      of `farmTick` except placement.

      Two offsets are EXCLUDED and counted rather than folded into a tolerance,
      because both are artefacts of running two copies and both vanish at the
      cutover: 6 tiles that changed hands inside the comparison window (the GPU
      applies the previous tick's ownership diff, the CPU applies this tick's),
      and 66 where a plot appeared on one side only (the CPU's patch credits
      accumulated over the whole game; the uploader's mirror started empty this
      session, so the two ledgers are not at the same point). Under D9 the
      latter is a different sample of the same law.

      For context on what this replaces: the same probe measured 662 tiles of
      disagreement when the GPU was only ripening and not doing all of
      `farmTick`, which is the failure D3 was written about.

## 3. Cut over as a unit

- [x] 3.1 THE RULESET NOW SELECTS A DEVICE, not just a `Config`. `GpuEconomy`
      (`src/client/games/leanfront/economy/GpuEconomy.ts`) owns the device, the
      compiled system and the uploader for the life of a game; LeanFront's
      runtime builds and dispatches it BETWEEN ticks through the shared worker
      host, which lets a synchronous `executeNextTick` consume a GPU at all.

      Verified live in the shipping worker, not a probe:

          leanfront: GPU economy on apple - metal-3
          leanfront economy @200:  upload 0.4 ms, dispatch 2.5 ms
          leanfront economy @1200: upload 0.3 ms, dispatch 2.3 ms

      and with `--ruleset openfront`, no economy is constructed at all.

      `create` returns null rather than throwing when there is no device, a lost
      adapter or a shader that will not link — the game then runs the CPU
      economy, because a game that will not launch is worse than one that runs
      at yesterday's speed.

      NOT switched: any consumer. The dispatch runs and its results are
      discarded, which is deliberate — under D6 the per-tile consumers move as a
      unit, and 3.2 is blocked on the finding below.

- [ ] 3.2 Switch every per-tile consumer together (design D6). TWO SWITCHED,
      measured, and the shape of D6's argument confirmed in numbers.

      | served from the GPU | sim ms/tick (interleaved, 100 samples/arm) |
      |---|---|
      | nothing | 95.0 |
      | district ledger | 110.3 -> 87.9 (20%) |
      | ledger + farm CA | 95.0 -> **63.3 (33%)** |

      D6 IN NUMBERS: the dispatch (~10 ms) and the uploader (~19 ms) are paid
      once per tick however many consumers are served. One consumer switched is
      net NEGATIVE; two is roughly break-even; every consumer after that is pure
      saving. A partial port is worse than no port, which is exactly what the
      design said and now has a measurement behind it.

      THE FARM CA, and the primitive that made it affordable. Serving `farmTick`
      needs the maturity plane back, and that plane is 8 MB on spqr with ~150k
      live tiles in it. `maturity_compact.wesl` counts and packs instead — one
      atomic increment per living tile, ref and value into two lists — and the
      reader copies back only as many entries as the counter reports
      (`readBuffer(name, elements)` now takes a prefix). 1.2 MB rather than
      8 MB, and bounded by how much crop exists rather than by how large the map
      is, which is what the readback requirement is actually about.

      `FarmTickProvider` serves the whole tick or none of it: ripening and patch
      placement both write maturity and the second reads what the first
      produced, so a provider that served only one would leave the halves a tick
      apart — the split that broke the ledger cutover. Tested.

      THE SHED IS BUILT AND NOT ENABLED. `shed_compact.wesl` plus the scatter
      into the tile-indexed arrays its seam wants is written and links, and it
      is the right shape — 535k covered tiles of 2M, so a compacted
      (tile, dist, cell) list against the 4.6 ms copy plus 11.4 ms O(grid)
      partition that reading the planes whole would cost. But serving it
      COLLAPSES the game: districts fall from ~576 per tick to ~121 and the tick
      drops to 17 ms, which is a board that has died, not one that has got
      faster. `serve fast` and `serve right` are not the same measurement, and
      the district count is what tells them apart.

      Ruled out: the compaction (only covered tiles with a valid cell are
      written); duplicate nuclei in `s.tiles`, which the supplied path really
      did create and which is now fixed on its own merits; the coverage sort's
      order-independence (total, tie-broken by tile ref); and `maturityOf`,
      populated by the shared derivation loop for supplied tiles too.

      Still open, and the next thing to test: the supplied path RECONSTRUCTS the
      shed's regions from "adjacent tiles in different cells" rather than
      receiving them from the flood that found them, and region membership
      drives the whole granary and starvation model. That is the first place a
      reconstruction could differ from the original signal.

      REMAINING after it, in measured order: `growUrbanArea` 8.5%,
      `supplyField` 4.3%, `tenureTick` 0.7%.

      HANDED OVER to `complete-gpu-economy-cutover`, which was proposed for
      exactly this remainder and carries the finding above as its own design D1:
      the shed's DERIVATION moves, not just its flood, so there is nothing to
      reconstruct and nothing to scatter. Its §1 does the reshape, §2-4 the
      consumers this unblocks, §6 the unit switch. This task stays open here as
      the record of where the work stopped and why.

- [x] 3.3 OpenFront stays on the CPU, verified two ways: no economy is
      constructed at all under `--ruleset openfront` (the live check reports no
      device and no dispatch), and its reference hashes reproduce exactly —
      verdantia `1208077788489980`, `2322560228707292` — after every change in
      this section.

## 3b. What the port can actually be worth

- [x] 3b.1 WHAT THE PORT IS WORTH, and a measurement that had to be redone
      before it could be trusted.

      First attempt: 30 ticks with the district ledger on the CPU, then 30 with
      it served from the GPU. It reported a 3% difference, and that number was
      BENEATH ITS OWN NOISE FLOOR — this board has a mean tick of ~51 ms, a p95
      of 101 and a max of 255, so two consecutive blocks of 30 differ by more
      than the effect being measured. It also nearly produced a conclusion:
      that the port was worth ~2x and that `foodTick`'s own 28% was immovable
      per-player arithmetic.

      Redone INTERLEAVED — the provider installed on odd ticks and removed on
      even ones, both arms dispatching so neither is flattered, 100 samples
      each, on the same evolving board:

      | | ms/tick |
      |---|---|
      | district ledger on the CPU | **110.3** |
      | district ledger on the GPU | **87.9** |

      ONE consumer, and it is 20% of the tick. The profile's per-function
      attribution had hidden this: V8 inlines `tenureCurve` and `tileTenure`
      into `foodTick`'s frame, so the ledger loop's cost appeared as
      `foodTick` SELF time (25.3%) with the named callees reading 0.1-0.2%.
      Self time plus inlining is not evidence about which loop to move.

      Scaling that against the stage profile — farmTick 24.2%, foodShedField
      16.1%, growUrbanArea 8.5%, supplyField 4.3%, plus the ledger's measured
      20% — the movable set is roughly **70% of the tick**, not the 57% a
      pessimistic reading of the profile suggested.

      THE SHAPE OF THE WIN, which is D6's argument in numbers. The dispatch
      (~10 ms) and the uploader (~19 ms) are paid ONCE per tick no matter how
      many consumers are served. So one consumer switched is net NEGATIVE — 87.9
      + 29 against 110.3 — and every consumer after it is pure saving. A partial
      port is worse than no port; the complete one takes ~110 ms to roughly
      30 ms of CPU plus that fixed ~29 ms, and D8's retirement of the mirroring
      is what turns the fixed cost from 29 ms into ~10 ms.

- [x] 3b.2 D1 WAS OVER-BROAD AND IS NARROWED. It banned computing per-player
      quantities on the GPU, but its justification only supports banning their
      REPRESENTATION as fields: the flow economy failed because putting
      population in a per-tile field changed where people are, which changed
      starvation and growth. A 256-entry buffer and a 256-thread pass moves the
      addition, not the people, and is not that mistake.

      D1 and the matching spec requirement now say that: a per-player quantity
      SHALL NOT be indexed by tile, and where it computes is settled on cost.
      The old wording also made two things already in the pipeline read as
      violations when they never were — `roomCount`
      (`array<atomic<u32>, 256>`, reduced on the device and read back per
      player) and `playerSeed` (a 256-entry per-player upload). Neither is a
      field.

      Nothing MOVES because of this. The measurement above says the per-tile
      work is ~70% of the tick and is where the return is; the point is that a
      later decision about `foodTick`'s regional allocation gets argued on its
      merits rather than blocked by a rule aimed at something else.

## 4. Verify

HANDED OVER to `complete-gpu-economy-cutover` §7, except where noted. Section 4
is the post-cutover gate, and the cutover moved: 4.1 is its 7.1, 4.5's
verification half is its 7.2, and 4.3 is already closed here. What stays here is
the evidence produced before the handover — 1.12's isolation table, which is
gate item (a) and the only one of the four that does not need the switch.

- [ ] 4.1 THE GATE, per D9 — four things, because bit-identity is no longer one
      of them. (a) Every pass agrees with the CPU function it replaces on
      IDENTICAL inputs: zero missing, zero predicate disagreements, exact
      integer totals. (b) Same seed, same device, twice: identical — the check
      that catches a float atomic sneaking into a reduction. (c) Balance metrics
      over several seeds inside the harness's known seed-noise band. (d)
      OpenFront's CPU hashes unchanged. (a) is the proof; (c) is the weakest and
      never stands alone.
- [ ] 4.2 EXPLAIN every per-tile difference that remains, and bound it. An
      unexplained difference is a defect even when it is small; "the GPU floods
      fresh where the CPU reads a ten-tick-old snapshot" is a specification.

      ONE OF TWO IS BOUNDED so far, at the late-game horizon (1.12's run):

      - CITY WEIGHT, from the supply cadence. 1,698 tiles of 185,296 (0.92%)
        differ by more than 0.1%; worst 70.05%; membership identical (0 missing,
        0 extra) and every differing tile carries the SAME shed cell. Cause:
        `srcMaturityOf` freezes a district's maturity at refresh time, so the
        CPU's weight at tick N+7 is computed against how ripe the farms were at
        tick N. Direction confirms it — the GPU's weight is the larger one on
        the worst tiles (1.165 against 0.685), which is ripening the CPU has not
        seen yet. Bound: the difference is bounded by how much a district's
        maturity can move inside `supplyRefreshTicks`, and it goes to zero if
        the cadence is ever set to 1.
      - GRANARY CAPACITY, from f32. Worst 1 milli in 340,000 (0.0003%), 0
        districts off by more than 1. Every other integer total is exact.

      STILL TO ENUMERATE: the differences the remaining consumers introduce when
      they switch, which is why this stays open. The shed provider already shows
      the shape — 62 only-cpu and 88 only-gpu covered tiles of ~555,500, with 0
      cells assigned differently — one tick of ownership churn rather than a
      disagreement about the flood.

- [x] 4.3 OpenFront's reference hashes are RE-RECORDED, once, by 1.8a — the
      canonical patch order changes which plot a field grows, and both rulesets
      run the same simulation today, so it could not be confined to LeanFront.
      New set at 4000 ticks, seed-prefix `base`: verdantia (2 runs, nations 20,
      bots 40) `1208077788489980`, `2322560228707292`; spqr (1 run, nations 0,
      bots 50) `4764841754597059`. Repro check IDENTICAL. Snowball metrics
      against the old set — verdantia leader 24.7/21.5% → 17.7/25.1%, gini
      0.716/0.631 → 0.668/0.698, firstElim 1053/803 → 853/803, alive 19/15 →
      20/16; spqr leader 12.8% → 17.4%, gini 0.312 → 0.305, firstElim 803
      unchanged, alive 15 → 13. Same seed noise band as the last re-baseline,
      and spqr is a single run. Every hash from here on is measured against THIS
      set.
- [ ] 4.4 Same-device replay: one seed, two runs, identical. NOT RUNNABLE AS
      WRITTEN, and the reason is worth stating so it is not attempted blind:
      `BalanceGame.worker` runs the CPU sim and only RECORDS the adapter as
      provenance — it never constructs a `GpuEconomy`, so replaying a seed
      through it today proves nothing about the device. Making it meaningful
      needs the GPU economy installed there behind a flag, and a flag rather
      than unconditionally, because `balance-browser-check.mjs` exists to prove
      the browser host reproduces the Node host's numbers and an always-on GPU
      path would destroy that comparison. Goes with the cutover's own
      re-baseline (its 7.1 and 7.3).

      What DOES exist today, and is the narrower version of this check: 24
      consecutive dispatches of one unticked board produce an identical
      production total once placement is accounted for (1.12), which is the
      run-to-run stability a float atomic in a reduction would break.

- [ ] 4.5 Measure the tick cost at the LATE-GAME horizon, which is the only one
      that matters. `FullGamePerf`, spqr, 9000 ticks, 100 bots, 38 alive at the
      end: mean **51.3 ms**, p50 48.1, p95 **101 ms**, p99 **120 ms**, max
      **255 ms**, with 505 of 9000 ticks over the 100 ms budget. By execution
      class: PlayerExecution **91.6%**, AttackExecution 4.4%, NationExecution
      3.6%. The economy is the tick; nothing else is close.

      Earlier baseline (`TickProfile.ts`, spqr, 9000 ticks):
      with 100 bots + 25 nations, mean ~30 ms, p95 44-66 ms, MAX 138 ms, and the
      worst ticks all fall between 4,200 and 9,150 — a ramp, not a cliff. (With
      50 bots and no nations the same map never gets there: 4.7 ms mean, 34 ms
      max, because the board never fills. Short or thin runs hide this
      entirely.) Rendering is not implicated: 119.9 fps with the main thread
      91.8% idle, ~0.1-0.2 ms per frame against an 8.3 ms budget. 138 ms is the
      number to kill.

- [ ] 4.6 A vitest browser project for the GPU-dependent tests, since Node has
      no WebGPU. OPEN, AND WORTH RE-ARGUING BEFORE IT IS BUILT. `@vitest/browser`
      is not installed and there are currently ZERO GPU-dependent vitest tests:
      the rig that actually grew is probe workers driven by playwright
      (`LedgerProbe.worker` + `ledger-check.mjs`, which produced 1.12's table),
      and it does things a vitest browser project would not — it ticks a real
      game to 9,000, dispatches against the live board, and diffs against the
      CPU function rather than against an expectation. Adding a second browser
      test stack next to it should be a decision, not an inherited plan.

## 5. Retire the scaffolding

HANDED OVER to `complete-gpu-economy-cutover` §8. Nothing here can be done
first: every item is gated on the cutover being complete and 4.1 having passed,
and removing a seam while the CPU still serves through it is how the path that
can silently disagree becomes the only path.

- [ ] 5.1 Remove the uploader's plane mirroring.
- [ ] 5.2 Remove the provider seams and their staleness/decline logic, which exist only to keep two copies of the state in step.
- [ ] 5.3 Remove the drift probe and the injection A/B harness once 4.1 has passed.
- [ ] 5.4 Keep: every WESL pass, the dense district slots, integer accumulation, the order-independent tie-breaks, `peekFoodShed`, the browser run host and the GPU sweep pool.

## 6. Active LeanFront WIP correctness follow-ups

These remain allowed dirty-GPU work; they are explicit here so isolation work
does not hide or accidentally bless them.

- [ ] 6.1 In `src/client/games/leanfront/economy/GpuEconomy.ts`, read the
      post-dispatch `slotCredit` buffer and call
      `EconomyFieldUploader.absorbCredit(...)` before the next refresh. Without
      that transfer, patch savings reset to their pre-dispatch value every tick.
- [ ] 6.2 In `src/client/games/leanfront/economy/GpuEconomy.ts`, detect changes
      to the live `game.config().food()` values baked into `economyFields` and
      rebuild the compiled system/kernel or decline to the CPU before serving.
      Runtime knob edits must not continue through stale shader constants.
- [ ] 6.3 In the district-yield provider in
      `src/client/games/leanfront/economy/GpuEconomy.ts`, validate every shed
      farm's slot before writing `prodByIdx`, `capByIdx`, totals, or counters.
      A missing slot must return `null` with outputs untouched so CPU fallback
      is atomic rather than layered over a partially written GPU result.
