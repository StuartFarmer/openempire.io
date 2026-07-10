/**
 * SupplyOverlay — client-side recompute of the local player's supply field
 * for the heatmap overlay (openspec add-supply-lines).
 *
 * Mirrors the sim's SupplyField BFS (multi-source over owned passable land
 * from completed Settlements/Barns) against client-side view data, so the
 * overlay needs no wire changes. It can be up to one sim refresh cadence
 * ahead of the field the sim is actually charging from — invisible at
 * overlay precision.
 *
 * Output encoding (one byte per tile, row-major like TileRef):
 *   0        → not the local player's tile (transparent)
 *   1..255   → supply quality 0..1 (value = 1 + round(quality × 254))
 */

import { supplyQualityFromDistance } from "../../../../core/execution/utils/SupplyField";
import { UnitType } from "../../../../core/game/Game";
import type { GameView } from "../../../view/GameView";

export class SupplyOverlayComputer {
  private out = new Uint8Array(0);
  private dist = new Int32Array(0);
  private queue = new Int32Array(0);
  /** BFS write cursor into `queue` (valid only during compute()). */
  private tail = 0;

  /**
   * Recompute the quality field for the local player. Returns null when
   * there is no local player yet. Reuses internal buffers — the returned
   * array is valid until the next call.
   */
  compute(gameView: GameView): Uint8Array | null {
    const me = gameView.myPlayer();
    if (me === null) return null;

    const w = gameView.width();
    const h = gameView.height();
    const total = w * h;
    if (this.out.length !== total) {
      this.out = new Uint8Array(total);
      this.dist = new Int32Array(total);
      this.queue = new Int32Array(total);
    }
    this.out.fill(0);
    this.dist.fill(-1);

    const f = gameView.config().food();
    const cutoff = Math.ceil(f.supplyRadius * 3);
    const mySmallID = me.smallID();

    // Multi-source seed: my completed supply nodes (tribal plots build
    // instantly, so no under-construction filter is needed client-side).
    this.tail = 0;
    for (const node of me.units(UnitType.Settlement, UnitType.Barn)) {
      const t = node.tile();
      if (gameView.ownerID(t) !== mySmallID) continue;
      if (this.dist[t] !== -1) continue;
      this.dist[t] = 0;
      this.queue[this.tail++] = t;
    }

    // Plain-queue BFS (uniform step cost), identical shape to the sim's.
    let head = 0;
    while (head < this.tail) {
      const cur = this.queue[head++];
      const d = this.dist[cur] + 1;
      if (d > cutoff) continue;
      const x = cur % w;
      // Cardinal neighbors with edge guards; refs are row-major (y·w + x).
      if (x > 0) this.visit(gameView, cur - 1, d, mySmallID);
      if (x < w - 1) this.visit(gameView, cur + 1, d, mySmallID);
      if (cur >= w) this.visit(gameView, cur - w, d, mySmallID);
      if (cur < total - w) this.visit(gameView, cur + w, d, mySmallID);
    }

    // Paint every owned land tile: reached tiles by quality, unreached ~0.
    for (let t = 0; t < total; t++) {
      if (gameView.ownerID(t) !== mySmallID) continue;
      if (!gameView.isLand(t) || gameView.isImpassable(t)) continue;
      const d = this.dist[t];
      const quality = supplyQualityFromDistance(d === -1 ? Infinity : d, f);
      this.out[t] = 1 + Math.round(quality * 254);
    }
    return this.out;
  }

  /** Enqueue an unvisited owned passable neighbor at distance d. */
  private visit(
    gameView: GameView,
    t: number,
    d: number,
    mySmallID: number,
  ): void {
    if (this.dist[t] !== -1) return;
    if (gameView.ownerID(t) !== mySmallID) return;
    if (!gameView.isLand(t) || gameView.isImpassable(t)) return;
    this.dist[t] = d;
    this.queue[this.tail++] = t;
  }
}
