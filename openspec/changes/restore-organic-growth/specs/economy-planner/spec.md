# Spec: economy-planner

Bots place seeds by the binding ceiling (design.md D6).

## MODIFIED Requirements

### Requirement: Bots invest in the binding ceiling

(Amended: "affordable" becomes "banked".) When a bot holds a banked seed, it SHALL place whichever seed unbinds the binding ceiling of `min(foodCapacity, housing)`: the Settlement seed when housing is at or below capacity (sited on the best-suitability sampled owned tile — a new nucleus opens a new region; contiguity with the existing city is not required), the Farmland seed otherwise (sited on the best full-field production among sampled legal footprints), falling back to the other seed type when the preferred one is unavailable or has no legal site. Seeds are never hoarded deliberately.

#### Scenario: Seeds go where growth is stuck

- **WHEN** a bot banks a pair while its housing exceeds its food capacity
- **THEN** the farm seed places first (on the best sampled footprint) and the settlement seed follows when housing next binds
