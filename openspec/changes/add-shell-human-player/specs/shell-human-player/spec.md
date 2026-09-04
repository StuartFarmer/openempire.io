# shell-human-player

## ADDED Requirements

### Requirement: The human is a real player identified by clientID

In OpenFront-live the shell SHALL create the human as a `PlayerType.Human`
player with a known `clientID` and NOT random-spawn it (bots still spawn). The
shell SHALL resolve the human via `game.playerByClientID(clientID)` and treat
that player as the local player for all reads and writes. Every human intent
SHALL be stamped with that `clientID` before entering a turn.

#### Scenario: The human is not auto-spawned

- **WHEN** an OpenFront-live game starts
- **THEN** bots spawn and expand, but the human owns no tiles and the game is in
  the spawn phase until the human places a spawn

#### Scenario: Intents resolve to the human

- **WHEN** the human issues an action
- **THEN** the intent is stamped with the human's `clientID`, and the sim
  resolves it to the human player (`playerByClientID`)

### Requirement: Human intents drive the in-process sim through the turn queue

The shell SHALL maintain a per-frame queue of human intents; each advance it
SHALL drain the queue into `gr.addTurn({turnNumber, intents})` (before
`executeNextTick`), so queued actions take effect on the next simulated tick.
Empty queues SHALL still advance the sim (idle turns).

#### Scenario: A queued action is applied next tick

- **WHEN** the human clicks to act while the sim is running
- **THEN** the intent is queued and applied on the next `executeNextTick`, and
  the resulting ownership/stat change renders that frame

### Requirement: The human spawns by clicking during the spawn phase

While `game.inSpawnPhase()`, a left-click on spawnable land SHALL issue a
`spawn` intent for that tile. On placement the spawn phase SHALL end
(singleplayer) and the camera SHALL move to the spawn. A prompt SHALL indicate
the spawn is required until it is placed.

#### Scenario: Clicking land spawns the human

- **WHEN** the human left-clicks spawnable land in the spawn phase
- **THEN** a `spawn` intent is issued, the human gains a starting territory, the
  spawn phase ends, and the camera centers on the spawn

### Requirement: The human expands by attack, over water by boat

Outside the spawn phase, a left-click on a tile SHALL, when
`myPlayer.canAttack(tile)`, issue an `attack` intent with `troops =
round(myPlayer.troops() · attackRatio)` and `targetID` = the tile owner's id (or
null for TerraNullius). When the target is reachable only across water and
`myPlayer.bestTransportShipSpawn(tile)` is valid, the shell SHALL issue a `boat`
intent instead. Clicks that are neither SHALL be no-ops.

#### Scenario: Adjacent attack

- **WHEN** the human clicks an attackable neighboring tile
- **THEN** an `attack` intent is issued for the ratio-scaled troop count and the
  frontier advances over the following ticks

#### Scenario: Amphibious attack

- **WHEN** the human clicks a target across water with a valid transport spawn
- **THEN** a `boat` intent is issued and a transport ship launches toward it

### Requirement: The human builds the age's structures

The build panel SHALL list `myPlayer.buildableUnits(tile)` limited to the current
age's player-buildables (Settlement, Farmland, Barn) with their live food cost
and buildability. Selecting a buildable then clicking a tile where
`myPlayer.canBuild(type, tile)` is valid SHALL issue a `build_unit` intent.
Unaffordable or invalid placements SHALL be rejected before issuing.

#### Scenario: Building a settlement

- **WHEN** the human selects Settlement and clicks a valid, affordable tile
- **THEN** a `build_unit` intent is issued and the structure appears once the
  sim builds it

### Requirement: The human tunes food allocation

A control SHALL issue the `food_allocation` intent with `populationShare` in
[0,1], reflecting the current allocation and updating it on change.

#### Scenario: Shifting allocation to banking

- **WHEN** the human lowers the population share
- **THEN** a `food_allocation` intent is issued and more production banks as
  stored food over subsequent ticks

### Requirement: A live stats HUD reflects the human player

The shell SHALL display the human's live troops, gold, population, and
tiles-owned (read from `myPlayer` each frame), plus an attack-ratio control
whose value scales issued attack/boat troop counts. When the human is dead
(`!isAlive()`), the HUD SHALL indicate it.

#### Scenario: Stats update as the game runs

- **WHEN** the sim advances and the human's territory or economy changes
- **THEN** the HUD troops/gold/population/tiles values update to match `myPlayer`

### Requirement: Player names and troop labels render over the map

For each living player with territory, the shell SHALL project its `placeName`
anchor (tile coords) to screen through the shell camera and render a label
(name + troop count) that tracks pan/zoom. The human's own territory SHALL be
visually distinguished, and hovering a tile SHALL report that tile's owner.

#### Scenario: Labels track the camera

- **WHEN** the human pans or zooms
- **THEN** each player's name/troop label stays anchored over its territory

#### Scenario: Tile ownership on hover

- **WHEN** the human hovers a tile
- **THEN** the readout names the owning player (or neutral) for that tile
