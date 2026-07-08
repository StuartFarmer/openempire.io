/**
 * PlotCache — per-tile tribal plot buffer (add-tile-painted-structures).
 *
 * Tribal structures (Settlement/Farmland/Barn) are 2×2 tile plots painted
 * into the terrain rather than drawn as sprite icons. This cache maintains
 * a map-sized Uint8Array consumed by PlotPass as an R8UI texture.
 *
 * Encoding per tile: 0 = no plot, otherwise
 *   value = 1 + typeIdx * 4 + (localY * 2 + localX)
 * where typeIdx is 0 Settlement / 1 Farmland / 2 Barn and (localX, localY)
 * is the tile's position within its plot's 2×2 footprint. Encoding the
 * local parity here lets the fragment shader pick the pattern pixel without
 * any anchor lookups (farmland's light/dark "tilled" rows fall out of
 * localY).
 *
 * Ownership changes (capture) do not touch the buffer — the pattern is the
 * structure, not the owner.
 */
import { TRIBAL_PLOT_TYPE_INDEX } from "../types";

export const PLOT_TYPE_INDEX = TRIBAL_PLOT_TYPE_INDEX;

export class PlotCache {
  readonly plotState: Uint8Array;
  /** True if plotState changed this tick; cleared by clearDirty(). */
  plotDirty = false;

  constructor(
    private readonly mapW: number,
    private readonly mapH: number,
  ) {
    this.plotState = new Uint8Array(mapW * mapH);
  }

  /** Paint a plot's 2×2 footprint (anchor = top-left tile ref). */
  addPlot(anchorRef: number, unitType: string): void {
    const typeIdx = PLOT_TYPE_INDEX.get(unitType);
    if (typeIdx === undefined) return;
    const ax = anchorRef % this.mapW;
    const ay = (anchorRef - ax) / this.mapW;
    for (let ly = 0; ly < 2; ly++) {
      for (let lx = 0; lx < 2; lx++) {
        const x = ax + lx;
        const y = ay + ly;
        if (x >= this.mapW || y >= this.mapH) continue;
        this.plotState[y * this.mapW + x] = 1 + typeIdx * 4 + (ly * 2 + lx);
      }
    }
    this.plotDirty = true;
  }

  /** Clear a plot's footprint (on unit deletion). */
  removePlot(anchorRef: number): void {
    const ax = anchorRef % this.mapW;
    const ay = (anchorRef - ax) / this.mapW;
    for (let ly = 0; ly < 2; ly++) {
      for (let lx = 0; lx < 2; lx++) {
        const x = ax + lx;
        const y = ay + ly;
        if (x >= this.mapW || y >= this.mapH) continue;
        this.plotState[y * this.mapW + x] = 0;
      }
    }
    this.plotDirty = true;
  }

  /** Plot-type value at a tile (0 = none) — used by paint-mode prechecks. */
  plotStateAt(ref: number): number {
    return this.plotState[ref];
  }

  clearDirty(): void {
    this.plotDirty = false;
  }
}
