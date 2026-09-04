# tile-damage Specification

## Purpose
Define how combat damage blocks productivity, persists land use, and renders deterministic burn and fire effects while tiles heal.
## Requirements
### Requirement: A damaged tile is unproductive until fully healed

While a tile's damage is greater than zero it SHALL: refuse urban growth (the city CA skips it), refuse new Farmland placement, halt an existing Farmland's maturation there, and pause the tile's tenure clock (per tile-stability). Only a **fully healed** tile (damage = 0) resumes growth and can begin accruing stability. A conquered tile SHALL retain its land-use zone (`Field` or `Urban`) through the burn: while damaged it is a scorched tile of that type, and once healed it **regrows as the conqueror's own tile of the same type** (an initial farmland, or an empty urban lot that regrows a house) — never as neutral wild ground.

#### Scenario: No rebuilding on smoking ground

- **WHEN** the player tries to place a Farmland on a tile with damage 0.3
- **THEN** placement is refused until the tile fully heals

#### Scenario: The city grows around the scar

- **WHEN** the urban CA would otherwise expand into a damaged frontier tile
- **THEN** it is skipped in favor of healed candidates until its damage reaches 0

#### Scenario: A conquered field regrows for its captor

- **WHEN** a player conquers an enemy field tile and its ~100-tick burn completes
- **THEN** the tile is a `Field` tile of the conqueror at the initial farmland floor and regrows as their farmland — the captor inherits worked land, not wild ground

#### Scenario: A conquered city regrows for its captor

- **WHEN** a player conquers an enemy city tile and its burn completes
- **THEN** the tile is an `Urban` lot of the conqueror that regrows a house as their population fills it

### Requirement: Damage is rendered as a burn, then a scorch

The renderer SHALL render a damaged tile as **burnt ground**: freshly damaged tiles read as scorched/charred, fading toward normal terrain as they heal, so contested areas read as burnt-over at a glance (replacing the single-brown battle-worn tint). Damage rendering SHALL be consistent across the WebGPU shell and WebGL renderers.

#### Scenario: Watching a front burn and recover

- **WHEN** the player looks at a recently contested corridor
- **THEN** tiles show a scorch intensity proportional to remaining damage, fading to normal terrain as they heal

### Requirement: Every conquered tile is burnt, and the fire is shown

Every tile conquered in an attack on another player — not only the tile holding a razed nucleus — SHALL receive combat damage (entering the burnt state) AND SHALL trigger the fire effect over that tile. The fire trigger SHALL be a deterministic per-tile burn event delivered to both renderers (replacing the prior behavior where fire played only when a plot _unit_ died). Wilderness expansion (conquering unowned land) SHALL NOT burn.

#### Scenario: A captured district is set ablaze tile by tile

- **WHEN** a player conquers a multi-tile enemy farm district
- **THEN** every conquered tile shows the fire effect and enters the burnt state — not just the nucleus tile

#### Scenario: Expanding into wilderness does not burn

- **WHEN** a player expands onto unowned neutral land
- **THEN** no damage is applied and no fire plays

### Requirement: The flame phase rages for five seconds

The fire effect's active **flame** phase SHALL last 5 seconds (up from 1.5) before settling into its ash/fade phase, in both the WebGPU shell (`CameraRenderer` `FIRE_DUR` and the matching total-lifetime cap) and the WebGL renderer (`PlotFirePass` / `render-settings.json plotFireDurationMs`). The two renderers SHALL use the same 5-second flame duration.

#### Scenario: A longer, fiercer burn

- **WHEN** a tile is set ablaze by conquest or razing
- **THEN** flames flicker over it for ~5 seconds before fading, identically in both renderers
