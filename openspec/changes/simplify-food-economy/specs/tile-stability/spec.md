# Spec: tile-stability

## REMOVED Requirements

### Requirement: Tile tenure (demand-gated aging, saturating curve, decay)

**Reason**: A per-tile clock feeding three other systems (density caps, storage caps, growth pace), entirely invisible to the player.
**Migration**: `TileTenure.ts`, the tenure plane, `tenureCapMultMax`/`tenureHalfTicks`/`tenureSaturationRatio`/`tenureDecayMilli`/`wNucleusTenure`, and tenure-grown storage are deleted. Storage caps come from the granary formula (food-economy spec); density caps and growth pacing cease to exist with the urban mechanic. If "old capitals are strong" returns later, it returns as a visible Settlement level in its own change.

#### Scenario: No clocks in the ground

- **WHEN** any tile is inspected at any age
- **THEN** it carries no tenure state and no mechanic varies with how long it has been held
