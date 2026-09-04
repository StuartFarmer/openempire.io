# shell-sim-worker

## ADDED Requirements

### Requirement: The OpenFront-live sim runs in a Web Worker

The shell SHALL run the OpenFront-live `src/core` simulation in a dedicated Web
Worker (not on the main thread). The worker SHALL construct the runner exactly as
the in-process path did (Singleplayer, N bots, `randomSpawn:false`, the same
`FetchGameMapLoader`), with the asset manifest and CDN base provided by the main
thread before the runner is created, and SHALL self-tick at the game rate while
running, yielding so a slow tick cannot starve message posting.

#### Scenario: The render thread is not blocked by the sim

- **WHEN** OpenFront-live runs on a large map
- **THEN** the sim tick executes in the worker and the main thread's per-frame
  work stays small (deltas + render), so panning/zooming stays smooth while the
  sim ticks

#### Scenario: Extreme load degrades gracefully

- **WHEN** a sim tick is slower than the tick interval
- **THEN** the game runs below real-time in the worker rather than freezing the
  UI, and the client keeps rendering

### Requirement: The client is driven by a minimal per-tick payload

Each tick the worker SHALL post the render conduits (owner/plot/density/damage/
field/front) as deltas with their packed buffers transferred, plus a small
summary: a per-player stats table (with names for newly-seen players), the
human's stats, front-label positions and signed deltas, name anchors, the spawn
phase flag, and a one-shot spawn anchor. The main thread SHALL apply the conduit
deltas to its GPU buffers and render, and SHALL populate the HUD, hover readout,
and labels from the shipped summaries and its own maintained per-tile buffers —
without direct `Game` access.

#### Scenario: HUD and overlays match the sim

- **WHEN** the sim advances
- **THEN** the stats HUD, name/troop labels, front coloring + labels, structure
  fills, and damage wash update from the shipped payload, identical to the
  in-process rendering

#### Scenario: Hover reads local buffers

- **WHEN** the human hovers a tile
- **THEN** the readout reports owner/troops (from the player table), structure/
  urban/farm/damage (from the maintained per-tile buffers), and terrain — no
  round-trip to the worker

### Requirement: Human input posts semantic actions to the worker

Human gestures SHALL post semantic actions (spawn, act-at-tile with the attack
ratio, build a unit at a tile, set food share) to the worker rather than being
validated on the main thread, and the worker SHALL resolve them into the correct
intents (attack vs boat, troop counts, validity) and queue them.

#### Scenario: A click acts through the worker

- **WHEN** the human clicks a tile in play
- **THEN** the worker resolves attack-vs-boat and the ratio-scaled troops and
  applies it, and the resulting ownership change renders on a later frame

### Requirement: The terrain season derive is throttled

The shell SHALL re-run the GPU terrain `season` derivation a few times per second
rather than every tick, so its per-map GPU cost does not scale with the tick
rate; the view SHALL continue to render every relevant frame using the latest
derived terrain.

#### Scenario: Season derive cost is bounded

- **WHEN** OpenFront-live runs on a large map
- **THEN** the season derivation runs at a small fixed rate, not once per sim
  tick, and the terrain still updates visibly over time
