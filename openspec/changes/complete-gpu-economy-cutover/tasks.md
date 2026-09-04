## 0. The rig, before any seam

Every failure in the last session was a measurement that could not tell a
speed-up from a corpse. These come first because everything after depends on
them being trustworthy.

- [x] 0.1 HEALTH ASSERTION alongside every timing, and it corrected its own
      specification on the first real board. `LedgerProbe` samples districts,
      living players and farms before and after the A/B, samples districts per
      arm per tick, and the driver exits non-zero when the assertion fails.

      WHAT WAS SPECIFIED — "a tick that gets faster while ANY of these falls
      materially is a FAILURE" — is wrong about living players, and the first
      run said so. Verdantia at tick 1000, over the 200 A/B ticks: players fell
      27.1% (48 -> 35) while districts fell 6.8% and every value check was
      exact. That is ordinary bot elimination, which is the GAME working; it is
      lumpy at small N, and one bad war trips any threshold worth having.

      So districts and farms are ASSERTED and living players is REPORTED. They
      are what the economy's work is done over, a real collapse hits them first
      and hardest — the one that happened was districts 576 -> 121, a 79% fall
      against the 6.8% ordinary attrition produces — and elimination cannot
      forge them. The tolerance is 20%: an order of magnitude above the noise
      and a quarter of the signal.

      A second assertion the task did not ask for and the interleaved design
      needs: the two arms must run over the same district count. Sharing one
      board means a collapse drags both arms equally, so a GAP between them is
      the sign that one arm is serving less rather than serving faster.
      Measured: cpu arm 60, gpu arm 60.

- [x] 0.2 The interleaved A/B is the ONLY A/B. It already was in substance —
      `LedgerProbe` alternates arms tick by tick at 100 samples each — but a
      stale comment still described the 30-tick block form that produced the 3%
      figure, attached to a block that no longer did it. Removed, and the
      surviving comment says why the block form cannot be rescued by running it
      longer: the board evolves between the blocks, so the arms never compare
      the same thing however many samples each gets. 100 is recorded as a floor
      rather than a setting.

      Checked for others: the only remaining A/B in the tree is
      `SupplyInjection.worker`, which is a hash-IDENTITY control, not a timing
      comparison, and is slated for removal by 8.2.

- [x] 0.3 A reusable SEAM DIFF — `src/client/games/leanfront/economy/SeamDiff.ts`, with
      `tests/SeamDiff.test.ts` (17 tests, Node, no GPU needed). Given what a
      provider serves and what the CPU function returns, it compares membership
      in both directions and values on the shared keys, and reports
      `compared` — so a vacuous comparison cannot read as agreement, which is
      the failure the parent change's 1.6a found the hard way.

      The shed's hand-rolled version is REFACTORED onto it rather than left
      beside it, which is what proves it generalises: identical numbers before
      and after (15,557 cpu / 15,653 gpu / 96 only-gpu / 0 cells differing).

      DESIGNING IT SURFACED D4 EARLY. The strict verdict failed the shed on 96
      only-gpu tiles — which is not a defect but the staleness contract, and
      the reader should not have to know that. So an allowance is declared at
      the CALL SITE with a mandatory reason (`seamDiff` throws on an allowance
      without one, because an allowance with no stated cause is a tolerance).
      Two things it deliberately will not do: an allowance never excuses a VALUE
      disagreement, since staleness changes which entries exist and not what a
      shared one says; and merging per-player parts takes the strictest
      allowance, so merging cannot be a route to loosening a contract.

      The shed's is 1%, against 0.617% measured on verdantia at tick 1000 (96 of
      15,557) and 0.027% on spqr at 9303 (150 of 555,525) — above both, and far
      below anything a broken seam produces.

## 1. Move the shed's DERIVATION (design D1)

The flood already runs on the device and is verified. What follows it does not,
and that is the only reason a scatter was ever needed.

- [x] 1.1 Every host reader of the shed's per-tile data, re-derived from the
      code rather than from D1's table. The table HOLDS — no sim consumer needs
      the per-tile sets after the cutover — and it was incomplete in three ways
      that matter to the tasks below.

      Grepped every member of `PlayerFoodShed`: `tilled`, `ranked`, `tiles`,
      `cellAt`/`hasCell`/`cellIndexAt`, `farms`/`farmIndex`, `peopleByFarm`,
      `laborByFarm`, `fedByFarm`, `regionOf`. Sim readers (`src/core`) only —
      `upload.ts` and the probe workers are scaffolding that retires with §8 or
      IS the check.

      | reader | shape | after the cutover |
      |---|---|---|
      | `FoodEconomy:120,121` ledger loop, `tilled` + `cellIndexAt` | per tile | already GPU-served |
      | `FarmGrowth:188` `hasCell`/`cellAt` | per tile | already GPU-served |
      | `FarmGrowth:235` `tilled`/`ranked` | per tile | already GPU-served |
      | `FarmGrowth:306` `ranked` | per tile | already GPU-served — inside `farmTick`, which the provider serves whole (`farmTick` returns early at :154) |
      | `EconomyModel:307` `committedStaffing` | per tile | `acresAccum` (2.1) |
      | `UrbanGrowth:333` `hasCell`/`cellAt` in `recedeToTarget` | per tile | moves with placement (3.1) |
      | `EconomyModel:249` `tilled.size` | a COUNT | coverage count (2.2) |
      | `FoodEconomy:203,285`, `FarmGrowth:248`, `EconomyModel:228,315` `peopleByFarm` | per district | reduction (1.3) |
      | `FoodEconomy:207` `regionOf` | per district | adjacency (1.4) |
      | `FoodEconomy:136,140` `farmIndex` | per district | **not in the table** — stays |
      | `FoodEconomy:280` `fedByFarm` WRITE | per district | **not in the table** — stays |

      THE THIRD OMISSION IS THE USEFUL ONE, and it changes 1.3. `laborByFarm`
      has NO reader outside `FoodShed.ts` — it is written by the pooling, copied
      into `peopleByFarm`, and then consumed by the coverage selection inside
      the same function. So it never crosses a seam at all: it is an internal
      intermediate, computed and consumed entirely on the device, and 1.3 does
      not have to serve it. Only `peopleByFarm` crosses, and it has four sim
      consumers.

      AND A COMPLICATION 1.3 SHOULD KNOW ABOUT BEFORE IT STARTS: the labour
      pooling is a reduction, but what follows it is not. `recompute` caps each
      cell at its need, sums the surplus, sorts the under-staffed cells by tile
      ref and walks them handing out the surplus until it runs out
      (`FoodShed.ts:571-599`). That is a sequential redistribution ACROSS a
      player's districts, not an `atomicAdd` — "identical in shape to
      `driveAccum`" is true of the pooling and false of the spillover.

      D1 does not reach it — it is O(districts) over one player's own cells
      against a peak of ~600 board-wide, not territory — so the first reading
      was "the pooling moves, the spillover stays on the host". THAT IS WRONG,
      and 1.2's dependency is what shows it. The spillover's output IS the pool
      the coverage cut-off is computed from (`slots = floor(pool /
      farmersPerFieldTile) - 1`, reading `laborByFarm` AFTER the spill). So
      leaving it on the host puts a host step BETWEEN two device passes, and the
      dispatch would have to split — device pool, read back, spill, upload,
      device coverage — which is a round trip per tick to save writing one
      serial pass.

      It moves, and it is cheap to move, because "sequential" here means
      sequential across ONE PLAYER'S districts, not across tiles: one thread per
      player walking the district slots in ascending tile order (which is
      already how slots are numbered, parent D4) does the cap, the surplus sum
      and the hand-out in a single pass of ~600 iterations worst case. That is
      the same shape as the per-district histogram scan 1.2 needs anyway.

      Recorded because it is a real ordering constraint and not a preference:
      1.3 must land BEFORE 1.2, since 1.2 cannot compute a cut-off without the
      post-spill pool.

- [x] 1.2 COVERAGE as a per-district selection. MEASURED FIRST, and the
      measurement removes most of what this task asked for. The design proposed
      a 256-bin maturity histogram plus a prefix sum for the cut-off, and asked
      in its open questions whether 256 bins were enough.

      BIN COUNT WAS THE WRONG AXIS. A histogram picks a maturity LEVEL; the CPU
      selects by `(maturity DESC, tileRef ASC)`. Wherever the cut-off lands
      inside a group of tiles sharing one maturity, the tie-break decides who
      eats, and no histogram over maturity alone reproduces that at any bin
      count. Farms settle AT their climate ceiling, so ties are not hypothetical:
      the largest group of equal-maturity tiles in one district is 1,266 on spqr
      at tick 9303 and 6 on verdantia at tick 1000.

      THE CUT-OFF NEVER BINDS. Districts where a cut-off exists at all — pool
      staffs some but not all claimed tiles:

      | board | districts | live cut-off | staff every tile | staff none |
      |---|---|---|---|---|
      | spqr, tick 9303, 100 bots | 591 | **0** | 589 | 2 |
      | verdantia, tick 1000, 30 bots | 48 | **0** | 46 | 2 |

      And it is structural rather than lucky. The spillover caps each cell at
      `need = (1 + claims) · farmersPerFieldTile` before coverage reads the
      pool, so `slots = floor(pool / farmersPerFieldTile) - 1 <= claims`
      ALWAYS, with equality exactly when the cell reached its need. A cut-off
      therefore requires a cell still under-staffed after its whole shed network
      has redistributed — a labour-starved empire, not a normal one. On both
      boards every cell reaches need, so the ranking orders tiles and then
      selects nothing.

      (An earlier version of this measurement reported "0 of 591 districts"
      against every district as the denominator. That was 0 of 0: a district
      that staffs every tile cannot exhibit the phenomenon either way, so
      including it is the vacuous comparison `SeamDiff` was built to catch. The
      probe now reports the live-cut-off count as its own denominator.)

      SO WHAT 1.2 BUILDS: `slots >= claims` — every claimed tile tilled, which
      is a comparison and a mark, no histogram, no prefix sum, no sort. That is
      100% of districts measured on two boards.

      The under-staffed branch is still a RULE and must still be exact, because
      "never observed" is not "cannot happen" — a war that guts a player's
      population is exactly the state that would reach it. It is rare and small
      when it happens, so it does not need the parallel machinery: a per-district
      serial selection over that district's claimed tiles, in the shape the
      histogram scan would have used anyway. What it must NOT be is a maturity
      histogram, for the tie reason above.

      Noted for the packing that looks tempting and does not work: the exact
      sort key `(1000 - maturity) << 21 | tileRef` fits spqr's 2^21 tiles in a
      u32 and does NOT fit earthxl at 4096x2048 = 2^23, which needs 33 bits.

      BUILT — `shed_cover.wesl`, after `shed_spill` (it reads the post-spill
      pool) and after `shed_claims` (it compares against that count). Three
      branches, and the structure is why there are only three:

      | branch | outcome | spqr 9303 | verdantia 1000 |
      |---|---|---|---|
      | `staffed >= claims` | every claimed tile worked | 589 of 591 | 46 of 48 |
      | `staffed == 0` | nothing worked, all fallow | 2 | 2 |
      | `0 < staffed < claims` | the ranking SELECTS | **0** | **0** |

      The third branch ESCALATES rather than being reimplemented: the pass marks
      those tiles and the host runs its own exact selection for those districts
      alone. What crosses is bounded by how many districts are labour-STARVED,
      not by the map, and the alternative is a two-level radix select — its own
      300 lines and its own correctness argument — for a path that has never
      executed. The probe counts escalations so it can never be zero by
      assumption: **0 tiles** on both boards.

      VERIFIED at both horizons — spqr at tick 9303 first, because the thin
      board has already been wrong twice in this section:

      | check | spqr 9303 | verdantia 1000 |
      |---|---|---|
      | `shed.ranked` ISOLATED | **151,731 of 151,731, 0 off** | 1,320 of 1,320, 0 off |
      | `shed.tilled` ISOLATED | **150,225 of 150,225, 0 off** | 1,377 of 1,377, 0 off |
      | `shed.ranked` vs the CPU | 0 only-cpu, 758 only-gpu (0.50%) | 0 only-cpu, 88 (7.14%) |
      | `shed.tilled` vs the CPU | 0 only-cpu, 758 only-gpu (0.51%) | 0 only-cpu, 88 (6.83%) |
      | escalations | **0 tiles** | **0 tiles** |

      The drift fraction FALLING from 7% to 0.5% as the board fills is the shape
      a claim-margin effect should have: the number of tiles sitting within one
      ripen of the threshold scales with the frontier, not with the field, so it
      shrinks against a set that grew 120x. The thin board's 7% was a small
      denominator, not a large effect — worth stating, because the allowance was
      raised from 2% to 10% after seeing 7.1%, which is tuning a threshold to
      pass. It is defensible only because the GATE is the isolated row and the
      mechanism was named before the number was seen.

      ZERO ONLY-CPU IS THE LOAD-BEARING HALF of the CPU-referenced rows: the
      GPU never MISSES a tile the CPU staffs, it only adds 88 that ripened one
      tick further — the same skew `claimAccum` carries, at the claim margin.
      The isolated rows hold the inputs equal and read 0, which is the gate.

- [x] 1.3 LABOUR POOLS as integer per-district reductions, plus the spillover
      (see 1.1: it moves, and it lands before 1.2 because 1.2 reads its output).
      `peopleByFarm` crosses back; `laborByFarm` does not — it has no reader
      outside `FoodShed.ts`.

      OCCUPANCY RUNS IN f32, and the reasoning is recorded because it was nearly
      got wrong in the expensive direction. The pooling adds
      `floor(housed * occupancy)` per covered tile, which the CPU does in f64.
      WGSL has no f64, and the exact integer route is closed by magnitude:
      `housed` reaches popPerDensity (10,000, 16,500 in the presets) and
      `urbanCivilians` reaches ~3.5M per player, so the exact product is ~5.8e10
      and overflows u32 before any division. Making it exact needs byte-wise
      long division over an emulated 64-bit product, and `remainder * 256` only
      stays under 2^31 while a player's housing stays under ~2^23 — true of an
      average player, false of a dominant one on a 145M-person board, which
      would need 4-bit steps and 16 iterations on each of ~555,000 covered
      tiles.

      THAT WAS THE WRONG GATE. D5 requires reductions to be INTEGER because a
      float `atomicAdd` completes in nondeterministic order and varies run to
      run on the same device — an unreproducible game. Summing `floor(...)` into
      an i32 accumulator satisfies it completely. Whether that `floor` lands on
      the same integer as the CPU's f64 `floor` is FIDELITY, which D9 settled:
      bit-identity is not the contract.

      And the scale settles it beyond argument. Measured on verdantia at tick
      1000 by re-running the CPU's own arithmetic in `Math.fround`: 2 of 65
      tiles differ, 2 of 44 districts, worst ONE PERSON against district pools
      in the thousands (15 of 48 players have occupancy exactly 1.0, where f32
      is exact by construction). Meanwhile this same system carries city weights
      up to 70% from the CPU's, accepted and written down as the GPU being MORE
      correct because the CPU reads a ten-tick-old snapshot. Chasing one person
      in 242,000 while the reference value beside it is 70% out is not rigour.

      So: f32 occupancy, integer accumulation, and the difference is STATED
      (4.2) rather than engineered away. The late-game magnitude was not
      measured, deliberately — it cannot change the decision, and the probe
      hooks are in place if a reason to care ever appears.

      BUILT — four passes, in the order `recompute` uses, placed straight after
      the flood that feeds them and before every consumer of coverage or
      labour:

      - `reset_shed` — the two new `atomicAdd` targets. Its own pass because
        `reset_cells` is at nine storage buffers and this device's cap is TEN,
        not the eight the older comments assume; eleven would not build.
      - `shed_claims` — the cell's field: non-nucleus covered tiles that are
        claimed crop or persistent Field zone. A THIRD acreage count, and it
        has to be: `acreAccum` counts what drives expansion, `acresAccum` what
        a district has committed, this what its labour need is measured
        against. The nucleus exclusion is load-bearing — `needOf` adds the 1
        back, so counting it here would inflate every district's need.
      - `shed_pool` — `floor(housed x occupancy)` per inhabited covered tile.
      - `shed_rural` — the rural split, the remainder to `farms[0]`, and the
        `peopleByFarm` SNAPSHOT. It must be taken here, before `shed_spill`
        caps anything: feeding is by residence, tilling is by staffing, and
        snapshotting after the spill would collapse the two and starve every
        dense core.
      - `shed_spill` — one thread per player, two walks of the slot list. Slot
        indices ascend with tile ref (parent D4), so walking them IS the CPU's
        `hungry.sort((a, b) => a - b)` without a sort and without depending on
        which thread arrives first.

      VERIFIED through `seamDiff` (0.3), verdantia at tick 1000, 59 districts
      compared of 59 on each side — membership exact everywhere:

      | check | result |
      |---|---|
      | `claimAccum`, ISOLATED | **0 districts off** |
      | `peopleByFarm` vs the CPU | 2 off, worst **1 person** |
      | `claimAccum` vs the CPU | 34 off, worst 4 |
      | `laborByFarm` vs the CPU | 34 off, worst 800 |

      AND THE ISOLATED ROW IS THE ONE THAT SETTLES IT. Diffing against the CPU
      is ambiguous here, because a dispatch ADVANCES maturity before
      `shed_claims` reads it — so the two sides count crop one ripen apart and
      any disagreement could be skew or defect. "Consistent with the skew" is
      not a gate. Rebuilding the reference from the planes the shader actually
      read — its own maturity, its own shed cells, the flag mirror it was
      handed — gives 0 of 59, which is 4.1(a): agreement on IDENTICAL inputs.

      That also explains the other two rows exactly rather than approximately.
      The 34 claim disagreements propagate through `needOf`, and the labour
      worst is 800 = 4 x farmersPerFieldTile — four claimed tiles' worth,
      matching the claims worst of 4 exactly. The 2-district people difference
      is the f32 occupancy bound above, independently measured at 2 tiles of 65
      before any shader existed.

      A FOOTGUN WORTH RECORDING, because it fails silently in the general case:
      the bind grammar's default element type is
      `spec.type === "u32" ? "u32" : "f32"`, so a buffer declared `i32` and
      bound WITHOUT an explicit `array<i32, N>` annotation binds as f32 and the
      shader reads people-counts as floats. It surfaced here as a WGSL type
      error only because the arithmetic happened not to typecheck.

- [x] 1.4 REGION ADJACENCY — `shed_region.wesl` plus the host union-find.
      Per covered tile, each 4-neighbour in a DIFFERENT cell of the SAME player
      records "these two districts touch"; the union-find runs on the host over
      ~600 nodes, because 600 is not territory.

      A BIT MATRIX, NOT A PAIR LIST, and that is the whole design. Emitting one
      entry per boundary tile would be CORRECT — `union` is idempotent, so
      duplicates cost nothing but bytes — and it fails the readback requirement
      anyway: the list length is the total length of every Voronoi seam on the
      board, which grows with map AREA. Deduplicating into `slots x slots` bits
      makes what crosses a function of how many districts exist, which is what
      "flat in map size" actually means.

      Ruled out on the way, because it looks like it should work: keeping only
      each district's MINIMUM adjacent district is one word per slot and no cap
      at all, but it does not preserve connectivity. Nodes 1-3, 2-4, 3-4 give
      minima 1->3, 2->4, 3->1, 4->2, whose edges union to {1,3} and {2,4} while
      the real graph is one component.

      THE CAP IS 1024 AND IS NOT `MAX_CELLS`, which is worth stating plainly
      because it is the thinnest margin in this change. The matrix is
      `REGION_SLOTS^2` bits and a grid pass clears it, so it cannot exceed the
      SMALLEST shipped map — pangea001 at 256x256 = 65,536 tiles. 1024 slots is
      32,768 words and fits; 2048 needs 131,072 and does not. Against the
      measured peak of 617 districts that is 1.66x headroom, against the 26x
      `MAX_CELLS` carries. So the probe REPORTS saturation instead of letting it
      pass, and a district beyond the cap becomes its own region — degraded, not
      corrupted. Lifting it is cheap if ever needed: adjacency only links
      districts of the SAME player (a shed never crosses a border), and
      per-player counts peak at 41.

      VERIFIED: verdantia at tick 1000, 59 of 59 districts, values off 0; spqr
      at tick 9303, **602 of 602, values off 0** against a reference built from
      the GPU's own shed cells. No saturation at either size (602 < 1024).

      The comparison had to canonicalise first — the CPU roots each region at
      whatever its union-find settled on and this roots at the lowest slot, so
      the two label regions differently while meaning the same grouping. Both
      sides are reduced to their region's lowest nucleus tile, which compares
      the PARTITION rather than the naming, and neither side has to be wrong for
      the diff to be meaningful.

      AND A CASE THE SEAM DIFF'S OWN RULE DOES NOT COVER, worth recording
      because it nearly read as a defect. Against the CPU the late-game board
      shows 23 of 602 districts in a different region — where the thin board
      showed none. `seamDiff` deliberately never lets an allowance excuse a
      VALUE disagreement, on the grounds that staleness changes which entries
      exist rather than what a shared one says. A DERIVED PARTITION is where
      that stops holding: `regionOf` is a function of the covered-tile set, that
      set carries the seam's stated 0.027% drift (62 only-cpu, 88 only-gpu of
      555,525), and a partition is discontinuous in its input — one tile
      bridging two blobs re-roots every district in both at once.

      The answer is NOT to relax the rule, which would let a real defect through
      everywhere else. It is to re-reference the check: rebuild the expected
      partition from the plane the pass actually read. That reads 0 of 602, so
      the 23 are input skew and the pass is exact. Note that verdantia could not
      have settled this either way — both its checks read 0, so the thin board
      cannot distinguish "no defect" from "no exposure".

- [x] 1.5 Isolation-verify each against the CPU on identical inputs, BEFORE
      anything consumes them. The bar is already established: coverage and labour
      matched exactly when measured through the old path — tilled 141,900, ranked
      141,326, pooled people 141,178,585, regions 67.

      DONE. All four moved pieces are isolation-verified and NOTHING consumes
      them yet, which is the point — the seams are built and proven before §2
      switches a consumer onto them.

      spqr, tick 9303, 602 districts compared of 602 on each side, membership
      exact on every row:

      | check | vs the CPU | ISOLATED |
      |---|---|---|
      | `peopleByFarm` | **0 off** | not needed — it agrees directly |
      | `claimAccum` | 315 off, worst 6 | **0 off** |
      | `laborByFarm` | 315 off, worst 1200 | inherits `claimAccum` |
      | `shed.ranked` | 0 only-cpu, 758 only-gpu | **0 off of 151,731** |
      | `shed.tilled` | 0 only-cpu, 758 only-gpu | **0 off of 150,225** |
      | `regionOf` | 23 off | **0 off** |

      EVERY NON-ZERO IS ACCOUNTED FOR, arithmetically rather than plausibly.
      `claimAccum` differs because a dispatch advances maturity before
      `shed_claims` reads it, so the two sides count crop one ripen apart; the
      labour worst of 1200 is 6 x farmersPerFieldTile, exactly six claimed
      tiles' worth, matching the claims worst of 6. `regionOf`'s 23 is the
      covered-tile drift through a partition's step function. All three vanish
      against a reference built from the planes the passes actually read, which
      is what 4.1(a) asks for.

      AND THE THIN BOARD WOULD HAVE MISSED TWO OF THEM. Verdantia reported
      `peopleByFarm` 2 off and `regionOf` 0; spqr reports 0 and 23. The first
      got BETTER at scale (32 of 41 players sit at occupancy exactly 1.0 late
      game, where f32 is exact by construction — 0 of 6,338 tiles differ), and
      the second only appears once there are enough districts for one tile to
      bridge two of them. Neither board is the safe one to check on.

- [ ] 1.6 Reshape `PlayerFoodShed` to per-district state plus a device-resident
      cell field. `tilled.size` becomes a count; `hasCell`/`cellAt` for NUCLEI
      stay (per district); the per-tile sets go.
- [ ] 1.7 Confirm NOTHING scatters, buckets or sorts a per-tile field on the
      host. If something does, a consumer was missed.
- [ ] 1.8 Measure with 0.1's health assertion. Position to beat: 65.9 ms/tick
      with ledger + farm CA, against 97.4 on the CPU.
- [ ] 1.9 Retire the uploader's per-player walk — ~8 ms of its 17 ms is reading
      `tilled`/`ranked` to build flags the device now owns. Confirm the drop.

## 2. The consumers the reshape unblocks

- [ ] 2.1 `EconomyModel.committedStaffing` from `acresAccum`, which already
      exists and is verified (0 of 410 districts off, 37,977 tiles).
- [ ] 2.2 `EconomyModel.assessStaffing` from the coverage count.
- [ ] 2.3 `assessUrbanRoom` from `roomCount`, a 256-entry readback that already
      exists.
- [ ] 2.4 The CITY half of `tenureTick`, decided by the parent change's task
      1.13 and named here so it is not stranded. `farm_tenure` already ports the
      farm half; this ages full density tiles behind a per-player demand gate and
      reduces the per-player housing bonus. Gate in as a 256-entry flag
      (`playerSeed`'s shape), bonus out as a 256-entry integer reduction
      (`roomCount`'s shape), alongside `farm_tenure` after `district_yield` and
      writing the same `tenure` plane over disjoint tiles. The piece to DESIGN
      rather than transcribe is the render side effect: `recordDensityUpdate`
      emits a byte whenever aging moves `urbanRenderByte`, so it wants
      `maturity_compact`'s count-and-pack rather than a plane readback. 0.7% of
      the tick — it moves because its producer has.

## 3. Urban placement

- [ ] 3.1 A seam for `growUrbanArea`/`addCityTiles`. `cityWeight` and the draw
      already exist and `cityWeight` is verified (185,296 tiles, 0 missing, 0
      predicate disagreements); what is missing is the way to serve the chosen
      tile and apply it.
- [ ] 3.2 Seam diff: the tile the CPU would place against the tile the GPU names,
      over many ticks — DISTRIBUTIONALLY, per `gpu-economy`'s draw requirement,
      not tile-for-tile.
- [ ] 3.3 Measure cumulatively, with health.

## 4. Supply field

- [ ] 4.1 Serve `SupplyProvider`. Its seam wants a `Map<TileRef, number>` per
      player — filling one per refresh is the materialise cost that killed the
      hybrid, and is the same mistake as the shed's scatter. So the consumers of
      `supply.dist` move first (`urbanSuitability` and `supplyQuality` are
      already on the device), and the map stops existing rather than being
      filled faster.
- [ ] 4.2 Seam diff and cumulative measurement.

## 5. Staleness contracts (design D4)

- [ ] 5.1 State, on each provider interface, the interval between the snapshot it
      reads and the tick it serves.
- [ ] 5.2 Guard every consumer that resolves a provider's output to a simulation
      ENTITY. `FoodShed`'s is done — a flood naming a destroyed farm threw inside
      `foodTick` and aborted the economy for the rest of the tick — and the same
      hazard exists wherever a seam names a settlement or a player.
- [ ] 5.3 A test per guard: a provider naming an entity that no longer exists is
      survived, not thrown on.

## 6. Cut over as a unit (parent D6)

- [ ] 6.1 Switch every per-tile consumer together for `leanfront` once the
      cumulative measurement beats the CPU. Not before — a partial switch is
      SLOWER than none, because the dispatch and upload are paid once per tick
      regardless.
- [ ] 6.2 OpenFront stays on the CPU: no device constructed, and the frozen
      reference in `docs/OpenFrontLiveReference.md` remains exact — verdantia
      `801065038163313`, `2069060768539590`; spqr `4964847657180561`.
- [ ] 6.3 Live in the shell, both rulesets, at the late-game horizon rather than
      on the first thousand ticks.

## 7. Verify

- [ ] 7.1 The gate from `gpu-economy`: per-pass isolation on identical inputs,
      same-seed replay on one device, balance metrics inside the harness's noise
      band, and the OpenFront hashes in `docs/OpenFrontLiveReference.md`
      unchanged.
- [ ] 7.2 Late-game cost against the baseline — `FullGamePerf`, spqr, 9000
      ticks: mean 51.3 ms, p95 101, p99 120, max 255, 505 of 9000 ticks over
      budget. The tail is what makes the game unplayable and the tail is what
      must move.
- [ ] 7.3 Re-baseline LeanFront's own reference set on the GPU sweep host.

## 8. Retire the scaffolding (parent D8)

- [ ] 8.1 Remove the mirroring the seams no longer need.
- [ ] 8.2 Remove `rand_probe`, `patchReason` and the injection A/B harness.
- [ ] 8.3 KEEP: every WESL pass, the dense district slots, integer accumulation,
      the order-independent tie-breaks, the per-district reductions, the seam
      diffs and the health assertions. The rig is what made the difference between a port
      and a plausible-looking corpse.
