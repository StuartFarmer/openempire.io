/**
 * PlotCache — per-tile tribal plot buffer (add-tile-painted-structures).
 *
 * Tribal structures (Settlement/Farmland/Barn) occupy a single tile and are
 * painted into the terrain rather than drawn as sprite icons. This cache
 * maintains a map-sized Uint8Array consumed by PlotPass as an R8UI texture.
 *
 * Encoding per tile: 0 = no plot, 1 = Settlement, 2 = Farmland, 3 = Barn
 * (TRIBAL_PLOT_TYPE_INDEX + 1). The 2×2 "sprite" look (e.g. farmland's
 * tilled rows) is produced inside the fragment shader from the sub-tile UV,
 * so the type buffer carries only the type.
 *
 * A parallel maturity buffer (0..255) carries each Farmland tile's growth
 * so the shader can pick its variant — Initial → Planted → Growing → Grown
 * (and back down again when the field senesces / food runs low). It is
 * meaningful only for Farmland tiles; other plot types leave it at a full
 * default and the shader ignores it.
 *
 * Plots build instantly and never change tiles; painting happens
 * unconditionally on unit add and clears on removal. Ownership changes
 * (capture) do not touch the buffer — the pattern is the structure, not
 * the owner.
 */
import { TRIBAL_PLOT_TYPE_INDEX } from "../types";

export const PLOT_TYPE_INDEX = TRIBAL_PLOT_TYPE_INDEX;

export class PlotCache {
  readonly plotState: Uint8Array;
  /** Per-tile Farmland maturity 0..255 (ignored for other plot types). */
  readonly plotMaturity: Uint8Array;
  /** True if plotState/plotMaturity changed this tick; cleared by clearDirty(). */
  plotDirty = false;

  constructor(mapW: number, mapH: number) {
    this.plotState = new Uint8Array(mapW * mapH);
    this.plotMaturity = new Uint8Array(mapW * mapH);
  }

  /** Paint a plot's tile. `maturity` only matters for Farmland (default full). */
  addPlot(ref: number, unitType: string, maturity = 255): void {
    const typeIdx = PLOT_TYPE_INDEX.get(unitType);
    if (typeIdx === undefined) return;
    this.plotState[ref] = 1 + typeIdx;
    this.plotMaturity[ref] = maturity;
    this.plotDirty = true;
  }

  /** Update a painted Farmland tile's maturity in place (no-op if unchanged). */
  setMaturity(ref: number, maturity: number): void {
    if (this.plotMaturity[ref] === maturity) return;
    this.plotMaturity[ref] = maturity;
    this.plotDirty = true;
  }

  /** Clear a plot's tile (on unit deletion). */
  removePlot(ref: number): void {
    this.plotState[ref] = 0;
    this.plotMaturity[ref] = 0;
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
