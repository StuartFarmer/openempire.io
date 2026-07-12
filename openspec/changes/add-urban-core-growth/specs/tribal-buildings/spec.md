# Spec delta: tribal-buildings (add-urban-core-growth)

## REMOVED Requirements

### Requirement: Painted single-tile plots

**Reason**: The city is now a self-growing density field founded from a Core, not an assemblage of painted Settlement/Farmland/Barn plots. Manual plot painting, plot occupancy, and one-plot-per-tile placement are removed.

**Migration**: Settlement is replaced by the founded Core (spawn action). Farmland/Barn are removed; their roles (production, storage) move to the density field and the Granary infrastructure respectively. The stroke-paint build UX is replaced by found-capital + infrastructure placement (see `urban-core-growth`).
