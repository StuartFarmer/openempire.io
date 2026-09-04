## Context

`BoardMap` already carries static terrain bytes, OpenFront-compatible tile state, and optional named typed layers. Alternative mechanics need the same typed-array pattern for dynamic state like troop mass, frontier progress, and building occupancy without changing the base OpenFront game.

## Goals / Non-Goals

**Goals:**

- Define a minimal runtime container around `BoardMap`.
- Allow game modes to register mechanics as systems/classes.
- Allow arbitrary named tile layers for dynamic data.
- Preserve OpenFront as a runtime that can ignore unused layers.

**Non-Goals:**

- No full port of foundation troop flow or wilderness expansion.
- No renderer plugin system yet.
- No per-tile object model.
- No inheritance hierarchy beyond a small structural system interface.

## Decisions

- Use typed-array layers, not tile objects. Existing render and simulation code already index by tile ref, and objects per tile would be expensive.
- Put polymorphism in systems. A `BoardSystem` can be a class with command handlers, tick behavior, and optional overlay output. The runtime does not need to know whether the system is OpenFront expansion, frontier pull, fluid flow, buildings, or something later.
- Keep commands and overlays open. They are small objects with a `type` string plus arbitrary data, avoiding closed unions at the shared boundary.
- Keep entities sparse. Buildings and units often need IDs and metadata; a small entity store handles that without forcing every tile layer to encode object state.

## Risks / Trade-offs

- Loose command/overlay typing can hide mistakes between a system and its UI. Mitigation: game-mode-specific code can narrow command and overlay types locally.
- Generic layers can be mis-sized. Mitigation: runtime creation and layer assignment validate layer length against the map.
- This does not make OpenFront use the new systems yet. Mitigation: OpenFront remains the regression path, while alternative modes can opt in gradually.
