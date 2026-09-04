# Spec: seed-awards

## REMOVED Requirements

### Requirement: Founding pairs are awarded by the peak-population ladder

**Reason**: The ladder (base rung, `n^(k·taper)` scaling, ratchet, paired awards) was pacing machinery for a founding economy that is now a simple purchase; it required repeated retunes (10k→4k rung, taper 2) just to fire at all.
**Migration**: Settlement and Farmland are bought with food (`costResource`) — see tribal-buildings. `SeedAwards.ts`, seed banks (`settlementSeeds`/`farmSeeds`), the award ratchet, and the build-bar seed counters are deleted; the HUD shows food cost instead.

#### Scenario: No awards remain

- **WHEN** a player's peak population crosses any former ladder rung
- **THEN** nothing is granted; structures are available exactly when their food cost is affordable
