# shell-input-parity

## ADDED Requirements

### Requirement: Dragging pans; a click acts

The field viewer's pointer model SHALL match the WebGL client: pressing and
moving beyond a small threshold pans the camera; a press that releases without
moving past the threshold is a click that fires the tile action
(`onTileGesture`). This SHALL apply during the spawn phase too (drag to look
around, click to place the spawn). Systems with declared brushes (the cellular
studies) retain a Pan/Brush tool toggle; in the brush tool, dragging paints.

#### Scenario: Drag pans without acting

- **WHEN** the user presses and drags on the map in OpenFront-live
- **THEN** the camera pans and no tile action (spawn/attack/build) is issued

#### Scenario: Click acts

- **WHEN** the user presses and releases on a tile without dragging
- **THEN** the tile action fires (spawn in the spawn phase, else attack/boat/build)

#### Scenario: No tool select for click-action systems

- **WHEN** OpenFront-live is mounted
- **THEN** no Pan/Brush tool toggle is shown; the toggle appears only for
  tile-painting (brush) systems
