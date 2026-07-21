# Shell Transport Ship Visualization

## Scope

Render active `TransportShip` units in `#shell` with the same sprite scale and
player colors as the live WebGL client. Trade ships, warships, labels, health
bars, selection, and other mobile units remain out of scope.

## Data flow

On each simulation frame, `ShellSim.worker` filters `game.units` to active
`TransportShip` units and sends a compact typed array containing each unit's
ID, current tile, previous tile, and owner small ID. `GameShellPage` forwards
that snapshot and the already-computed player palette colors to
`CameraRenderer`.

## Rendering

`CameraRenderer` adds one instanced WebGPU draw after the terrain draw. Each
instance is a 13-by-13-world-tile quad centered on the unit, matching the live
client's `unitSize`. It samples the existing 5-by-5
`resources/sprites/transportship.png` with nearest filtering and applies the
live unit shader's gray-band mapping: light pixels use territory fill, dark
pixels use border color, and intermediate pixels use their midpoint.

Current and previous tiles are interpolated using elapsed wall time over the
shell's 100 ms simulation tick. Empty snapshots issue no boat draw.

## Failure behavior

If the sprite cannot load, terrain rendering and simulation continue without
boats. Unknown palette slots use the shell's existing fallback player color.

## Verification

A focused test covers transport snapshot packing and proves trade ships,
warships, and inactive transports are excluded. Existing type checks and the
relevant shell tests must remain at their documented baseline.
