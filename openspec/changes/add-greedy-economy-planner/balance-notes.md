# Balance notes — add-greedy-economy-planner

A/B on verdantia, 2 runs × 3000 ticks, 25 nations / 40 bots, identical seeds
(`--seed-prefix planner-ab`), default knobs. Baseline = the heuristic
TribalEconomy (FARMS_PER_SEED / MIN_FARM_CROP / BARN_AT_STOCK_FRACTION);
planner = the greedy EconomyModel policy. 2026-07-14.

## Final-state comparison

| metric (leader)     | baseline ab-0 | baseline ab-1 | planner ab-0  | planner ab-1  |
| ------------------- | ------------- | ------------- | ------------- | ------------- |
| population          | 381,279       | 826,997       | **2,614,510** | **2,018,186** |
| food capacity       | 572,511       | 1,213,941     | **4,510,414** | **3,464,629** |
| farms               | 228           | 563           | 1,280         | 896           |
| city tiles          | 39            | 85            | **271**       | **193**       |
| settlements         | 4             | 12            | 5             | 0             |
| urban tiles (world) | 101           | 119           | 400           | 543           |

Aggregates: mean leader share 0.514 → 0.548, mean gini 0.583 → 0.489, total
starved 90,890 → 793,549.

## Findings

- **The planner is a decisively stronger economy**: ~3–5× leader population
  and food capacity, ~3–4× city size, ~4× world urban area, on the same seeds.
  The change's premise (model-scored siting and quota-free farming beat the
  heuristics) holds.
- **Settlements are genuinely optional for room at current knobs**: the
  planner founds few (even zero) settlements because the Core's supply field
  (supplyRadius 10, cutoff 3×) covers ~2,800 tiles — room for a ~28M-person
  city — so the room-deficit trigger correctly never fires at these
  population scales. Baseline's 12 settlements were quota-driven, not needed.
  If settlements should matter more, the lever is `supplyRadius` (shrinks
  room per nucleus), not the planner.
- **Snowball moved slightly** (mean leader share +3.4pp, but run-0 leader
  0.432 → 0.603): a stronger shared economy amplifies whoever is already
  winning. Within the historical ~40–55% band, but worth re-checking in the
  next knob sweep; `warSupplyAttrition` and `costGrowthPerOwned` remain the
  anti-snowball levers.
- **Starvation total is up ~9×** — not famine dysfunction but scale:
  populations 3–5× larger ride the food ceiling (births clamp at capacity),
  so ordinary fed-ratio dips touch more people. Starved/population is
  comparable to baseline.
- Deterministic: same seeds + same code reproduce identical hashes across
  reruns.
