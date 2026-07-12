# Design: add-urban-core-growth

## Context

Two papers, one decomposition (Wang et al. 2024; Marquis & Barthelemy 2026): total urban **area** follows a logistic S-curve capped by a carrying capacity; the **spatial** placement of that area follows a local suitability rule with congestion. We implement exactly that split. Everything is deterministic (seeded PRNG, integer/IEEE math identical across clients) and layered-map-only.

The fork already supplies three of the four suitability drivers: `crop` (fertility), the supply field (logistics), and the terrain shoreline bit. The fourth — freshwater — exists in the generator (`watermap`, `lakes`, `irrigation`, rivers) but is discarded at bake; we add one baked plane for it.

## The state

Per player, replacing the plot set:

- `core: TileRef | null` — the founded capital (one; re-found on respawn).
- `density: Map<TileRef, number>` — urban density in `[0,1]` per owned land tile. Milliunit-integer internally (`0..1000`) for determinism, like food.
- `area A` = Σ density (in tiles-equivalent); `maturity = A / K`.

The density field is the single source of truth. Population, food production, food consumption, and the population cap are all read off `density × crop` — no plot objects.

## The tick (per player, layered maps, after supply-field refresh)

1. **Carrying capacity.** `K = Σ_{x ∈ reach} s⁺(x)`, where `reach` is owned land within the supply flood and `s⁺ = max(0, s(x))` (below). `K` is the logistic ceiling — the land's max supportable built area.
2. **How much (logistic).** `ΔA = clamp( r · A · (1 − A/K) )`, with `A` the current summed density. `r` (base growth rate knob) is scaled by the food surplus fraction fed through the allocation slider: a well-fed, growth-allocated city advances `r`; a starving one has `ΔA ≤ 0` (deurbanization — the paper's terminal decline). `ΔA` is a milli-density budget to deposit this tick.
3. **Where (suitability-CA).** Deposit `ΔA` onto candidate tiles — frontier (owned, density < 1, adjacent to density > 0) plus the core on turn one — with probability weight `s⁺(x)`. Deposit raises `density[x]` toward 1; overflow spills to the next candidate (infilling → edge expansion as the interior saturates). A fraction `dispersalRate` of the budget instead seeds a **satellite**: one deposit on an owned tile beyond the frontier chosen by `s⁺`, which becomes a new growth nucleus and later coalesces when the fields meet.
4. **Food, from density.** Production = Σ `crop(x) · density(x) · supplyQuality(x→core)` (fertile, supplied, built land feeds people). Consumption/population cap = Σ `density(x) · popPerDensity`. The existing food-economy storage/decay/starvation stages run unchanged on these density-derived flows.

## The suitability field

```
s(x) =  w_food · cropNorm(x)                       // fertility        (crop plane)
      + w_water·( freshwater(x) + w_shore·shore(x) ) // hydrology + coast (water plane + terrain bit)
      + w_logi · supplyQuality(x → core)            // logistics        (supply field)
      + Σ infra · boost(x)                          // player agency    (aqueduct/road/granary)
      − w_cong · localDensity(x)                    // congestion       (density field)
```

- `cropNorm`, `freshwater` ∈ `[0,1]` (layer bytes / 255); `shore(x)` ∈ {0,1} from `isShoreline`/`isOceanShore`.
- `supplyQuality(x→core)` is the existing `1/(1+(d/radius)^power)` — a tile the core cannot reach through owned land scores 0 there and does not urbanize. This IS the "logistics to the core."
- `localDensity(x)` = density averaged over the 4-neighborhood. The congestion term is load-bearing: it saturates the interior and forces growth outward, which is what produces the `e^(−r/r₀)` density gradient, `radius ∝ √P`, and rough edges. Without it you get a filled disk; with it you get a city.

## Decisions

1. **Density field, not plots.** A continuous field is what the papers model and what makes the emergent gradients/scaling appear. Plots (discrete objects, occupancy map, one-per-tile) are removed. This is the biggest departure and the reason for a dedicated branch.
2. **Logistic ceiling from suitability, not a knob.** `K` must respond to the land (rivers, coast, fertility, your infrastructure) so that _where you found and what you build_ changes the city's ultimate size — the whole point. A flat `K` knob would throw the geography away.
3. **Congestion is a term, not a hard cap.** Ishikawa/Andersson: attraction to built land + repulsion from local density. One subtractive term buys the entire empirical morphology. Tuning `w_cong` vs `w_logi` is the compact-vs-sprawl dial (the paper's η / green-vs-social knob).
4. **Structures reshape the field; they are not the city.** Matches the transport-coevolution and dielectric-breakdown-planning models (Baum-Snow, Capel-Timms, Batty). The player is the _external field_ that biases self-organized growth — agency over direction without tile micromanagement. Keep the set minimal: Aqueduct (water term), Road (extends supply reach → logistics), Granary (local `K`). Cost in food, as plots did.
5. **Reuse, don't reinvent.** Supply field → logistics term verbatim. Food economy storage/decay/starvation/allocation → run on density-derived flows. Razing → deletes density in captured tiles → logistic regrowth. TribalEconomy bot brain → retargeted to found + place infrastructure.
6. **One new plane only.** `water` (freshwater proximity), appended to `LAYER_NAMES`. Baked from the generator's `normalizedWatermap` + `irrigation` + lake/river masks, quantized like the others. Shoreline stays free (terrain bit). This is a `map-layer-sidecars`-shaped format bump: bump every layered map's `layers.bin`.
7. **Determinism.** The CA deposit order and satellite choice use the player's seeded `PseudoRandom` (as razing does); the field is a pure function of layers + supply + density. Same seed ⇒ identical growth.

## Risks

- [Runaway snowball] the logistic cap bounds a single city, but a player who founds on a river delta could dominate. → `w_*` and `r` are harness-swept for leader-share/Gini before UI; `K`'s dependence on _reachable_ land (supply-bounded) is the natural brake.
- [Feel] descriptive models are not automatically fun. → the demo map `estuaria` plus the run-openfront harness are for judging the loop early; the whole thing is branch-isolated.
- [Perf] density CA over large empires. → work is bounded by the supply flood cutoff (same bound as the supply field) and the per-tick `ΔA` budget, not by empire size.
- [Client] rendering a continuous field instead of sprites is new work (a density heatmap over territory), but the supply overlay pass is a direct template.
