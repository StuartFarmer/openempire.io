# settlement-empire

## ADDED Requirements

### Requirement: Land carrying capacity is the potential, ownership is realized on top

The system SHALL derive an unowned, seasonal `potential` field (the settlement-ecology food carrying capacity) and, separately, per-player realized fields — `pop` (settled civilians) and `troops` (mobilized) — tagged by an `owner` field (0 = neutral). Potential is never owned; players convert it into owned population. Realized population on a tile MUST NOT exceed that tile's potential except transiently before starvation corrects it.

#### Scenario: Potential is the opportunity map

- **WHEN** the system runs on a real-climate map
- **THEN** `potential` is high in fertile, watered, frost-free land and ~0 in desert and the winter frost zone, independent of who owns what, and it rises and falls with the seasons

#### Scenario: Ownership is realized, not potential

- **WHEN** a player holds a fertile tile and a neighboring rival holds an equally fertile tile
- **THEN** each tile's `owner` reflects its holder while `potential` is identical on both — the land's capacity is a property of the land, its population a property of the owner

### Requirement: A player's supportable population is its supplied realized potential

The maximum `pop + troops` a player can sustain SHALL equal the sum of `potential` over the tiles it owns AND supplies — not a flat cap. Taking more fertile, supplied land raises the ceiling; losing it lowers the ceiling and forces starvation down to the new limit.

#### Scenario: Fertile conquest raises the ceiling

- **WHEN** a player expands from marginal land onto a supplied fertile valley
- **THEN** its supportable population rises by that valley's potential, and its `pop`/`troops` can grow into the new headroom

#### Scenario: Losing land forces contraction

- **WHEN** a player loses supplied fertile territory to a rival
- **THEN** its supportable ceiling drops and its population above the new ceiling starves down to it

### Requirement: Founding a settlement seeds population and creates a supply source

Founding (a scripted/brush action in this slice) SHALL stamp `pop` at a target tile, drawing food/population from a supplied source. A tile whose `pop` clears a settlement threshold SHALL act as a supply source (settlements are emergent, not discrete objects). Founding onto a tile with no reachable supply and no local potential SHALL fail to establish.

#### Scenario: A seeded settlement becomes a supply source

- **WHEN** population is seeded on fertile land above the settlement threshold
- **THEN** that tile radiates `supply` into its surroundings and its population begins growing toward local potential

#### Scenario: A settlement cannot take root in the void

- **WHEN** population is seeded deep in unsupplied desert (potential ~0, no supply reach)
- **THEN** it starves out rather than establishing a viable settlement

### Requirement: Supply is a terrain-weighted diffusion that gates growth

`supply` SHALL diffuse outward from settled cores, decaying with distance and with terrain cost — cheaper along rivers and coasts, more expensive over mountains and desert. Population growth SHALL require supply: a tile grows toward its potential only in proportion to the supply reaching it, so unsupplied land stays empty even when fertile.

#### Scenario: Supply follows the cheap terrain

- **WHEN** a settlement sits beside a river and a mountain range
- **THEN** its supply reaches far along the river valley and only a short way into the mountains

#### Scenario: Fertile but unreachable land stays empty

- **WHEN** a fertile region lies beyond any settlement's supply range
- **THEN** it does not grow population until a settlement extends supply to it

### Requirement: Owned borders grow organically into the supplied catchment

Owned territory SHALL expand OpenFront-style: an owned tile claims an adjacent neutral tile when that tile has reachable supply and nonzero potential, transferring population and setting its `owner`. Expansion rate SHALL scale with the pusher's population surplus and the target's potential, so a player naturally fills its supplied, fertile catchment and stalls at deserts, the frost line, and its supply limit — without per-tile micromanagement.

#### Scenario: The empire fills its fertile catchment

- **WHEN** a settlement is founded in a river valley and left to grow
- **THEN** its borders spread to fill the supplied fertile land and stop at the surrounding desert and beyond its supply reach

### Requirement: Seasons modulate potential and the food store buffers winter

`potential` SHALL fall in winter with the seasonal temperature (the frost zone dropping to ~0), while a per-tile `food` store banks the growing-season surplus. Population up to the summer capacity SHALL survive winter on the banked store; population beyond capacity with an empty store SHALL starve. Frost-zone tiles SHALL not sustain year-round settlement.

#### Scenario: Banked surplus survives winter

- **WHEN** a temperate settlement banks food through summer and winter lowers its potential
- **THEN** its established population survives on the store rather than collapsing

#### Scenario: Overextension into the frost zone is culled

- **WHEN** a player pushes settlement north of the frost line during summer
- **THEN** the winter frost drops that land's potential to ~0 and the overextended population starves back
