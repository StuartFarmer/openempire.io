/**
 * SegmentHighlightController — the live aim preview for a concentrated push
 * (add-urban-core-growth). As the cursor moves over land you could attack, it
 * highlights the stretch of YOUR border that a click would advance: the border
 * point nearest the cursor, its breadth set by how far the cursor is (near =
 * broad, far = a pointed spearhead). Mirrors the click logic in
 * ClientGameRunner, so what you see is what you'll commit.
 *
 * The border is fetched from the worker (async) and cached, refreshed on a
 * cadence. The segment is recomputed both when the cursor moves AND when fresh
 * border data arrives — so a growing/shrinking border re-lights the correct
 * cells even while the mouse sits still (a `tick()` drives the cadence).
 */

import { EventBus } from "../../core/EventBus";
import { borderSegment } from "../../core/execution/utils/BorderSegment";
import { TileRef } from "../../core/game/GameMap";
import { Controller } from "../Controller";
import { MouseMoveEvent } from "../InputHandler";
import { MapRenderer } from "../render/gl";
import { OWNER_MASK } from "../render/gl/utils/TileCodec";
import { TransformHandler } from "../TransformHandler";
import { GameView } from "../view";

/** Re-fetch the (async) border at most this often, in sim ticks. */
const BORDER_REFRESH_TICKS = 3;

export class SegmentHighlightController implements Controller {
  private mask: Uint8Array;
  private lit: TileRef[] = [];
  private border: TileRef[] = [];
  private borderTick = -Infinity;
  private borderFetching = false;
  private lastTile = -1;
  private shown = false;

  // Last cursor position (screen space), so we can recompute the segment when
  // the border shifts underneath a stationary mouse.
  private mouseX = -1;
  private mouseY = -1;
  private hasMouse = false;

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: TransformHandler,
    private view: MapRenderer,
  ) {
    this.mask = new Uint8Array(game.width() * game.height());
  }

  init() {
    this.eventBus.on(MouseMoveEvent, (e) => {
      this.mouseX = e.x;
      this.mouseY = e.y;
      this.hasMouse = true;
      this.apply(false);
    });
  }

  /** Drives the border-refresh cadence even when the cursor isn't moving. */
  tick(): void {
    if (!this.hasMouse || this.game.inSpawnPhase()) return;
    this.refreshBorder();
  }

  getTickIntervalMs(): number {
    return 100;
  }

  private refreshBorder(): void {
    const me = this.game.myPlayer();
    if (me === null || this.borderFetching) return;
    if (
      this.border.length > 0 &&
      this.game.ticks() - this.borderTick < BORDER_REFRESH_TICKS
    ) {
      return;
    }
    this.borderFetching = true;
    me.borderTiles()
      .then((bt) => {
        this.border = Array.from(bt.borderTiles);
        this.borderTick = this.game.ticks();
        // Border moved — re-light the aimed segment against the new cells even
        // if the cursor hasn't moved (force past the same-tile dedupe).
        if (this.hasMouse) this.apply(true);
      })
      .finally(() => {
        this.borderFetching = false;
      });
  }

  private clear(): void {
    if (!this.shown) return;
    this.shown = false;
    this.lastTile = -1;
    for (const t of this.lit) this.mask[t] = 0;
    this.lit = [];
    this.view.setSegmentHighlight(false);
  }

  /**
   * Recompute the aimed segment from the last cursor position and the cached
   * border. `force` bypasses the same-tile dedupe (used when the border, not
   * the cursor, is what changed).
   */
  private apply(force: boolean): void {
    const me = this.game.myPlayer();
    if (me === null || this.game.inSpawnPhase() || !this.hasMouse) {
      this.clear();
      return;
    }
    this.refreshBorder();
    if (this.border.length === 0) {
      this.clear();
      return;
    }

    const cell = this.transformHandler.screenToWorldCoordinates(
      this.mouseX,
      this.mouseY,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) {
      this.clear();
      return;
    }
    const tile = this.game.ref(cell.x, cell.y);
    // Preview only over land we do NOT own — a potential attack target.
    const ownerID = this.game.tileState(tile) & OWNER_MASK;
    if (!this.game.isLand(tile) || ownerID === me.smallID()) {
      this.clear();
      return;
    }
    if (!force && tile === this.lastTile && this.shown) return; // already lit
    this.lastTile = tile;

    const world = this.transformHandler.screenToWorldCoordinatesFloat(
      this.mouseX,
      this.mouseY,
    );
    const seg = borderSegment(
      this.border,
      world.x,
      world.y,
      (t) => this.game.x(t),
      (t) => this.game.y(t),
    );
    if (seg === null || seg.sourceTiles.length === 0) {
      this.clear();
      return;
    }

    for (const t of this.lit) this.mask[t] = 0;
    for (const t of seg.sourceTiles) this.mask[t] = 255;
    this.lit = seg.sourceTiles;
    this.view.updateSegmentHighlight(this.mask);
    this.view.setSegmentHighlight(true);
    this.shown = true;
  }
}
