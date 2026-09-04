import { TileRef } from "../../game/GameMap";

/**
 * Aim a concentrated push (add-urban-core-growth). The player doesn't drag —
 * they just move the cursor: the nearest point on their own border follows it,
 * and the DISTANCE from the cursor to that border sets the breadth:
 *
 *   - cursor on/at the border → the WHOLE border  (a broad, full-front push,
 *                               matching the bots' whole-border advance)
 *   - cursor far into enemy    → a NARROW spearhead (concentrated deep strike)
 *
 * Breadth decays exponentially with cursor distance, so the full range (whole
 * front → spearhead) is reachable on any border length: a big nation can still
 * throw its entire front forward, or pinpoint a single salient.
 *
 * Pure geometry (no Game/GameView types) so it runs on the sim for tests and on
 * the client for the live highlight/commit. Returns the stretch of border tiles
 * to attack from, centred on the point nearest the cursor.
 */

/** Narrowest a segment can be — a pointed spearhead. */
export const SEGMENT_MIN_WIDTH = 2;
/**
 * Characteristic cursor-distance (tiles) of the breadth falloff: at this
 * distance the segment has narrowed to ~37% of the full border, at ~3× it is
 * essentially a spearhead. Smaller → attacks concentrate faster with distance.
 */
export const SEGMENT_WIDTH_FALLOFF = 8;

export interface BorderSegment {
  /** Border tiles to seed the attack from (the highlighted stretch). */
  sourceTiles: TileRef[];
  /** The border tile nearest the cursor — the segment's centre. */
  centerTile: TileRef;
  /** How many tiles wide the segment is (breadth). */
  width: number;
}

export function borderSegment(
  borderTiles: readonly TileRef[],
  cursorX: number,
  cursorY: number,
  tileX: (t: TileRef) => number,
  tileY: (t: TileRef) => number,
  opts: {
    maxWidth?: number;
    minWidth?: number;
    falloff?: number;
  } = {},
): BorderSegment | null {
  if (borderTiles.length === 0) return null;
  // Default max breadth is the WHOLE border — a click at the front throws the
  // entire nation's border forward, on par with the bots' whole-border push.
  const maxWidth = opts.maxWidth ?? borderTiles.length;
  const minWidth = opts.minWidth ?? SEGMENT_MIN_WIDTH;
  const falloff = opts.falloff ?? SEGMENT_WIDTH_FALLOFF;

  // The point on our border nearest the cursor — this follows the mouse.
  let center = borderTiles[0];
  let nearest = Infinity;
  for (const t of borderTiles) {
    const d = Math.abs(tileX(t) - cursorX) + Math.abs(tileY(t) - cursorY);
    if (d < nearest || (d === nearest && t < center)) {
      nearest = d;
      center = t;
    }
  }

  // Breadth from cursor distance: on the border → the whole front (maxWidth),
  // decaying exponentially to a spearhead (minWidth) as the cursor pulls away.
  const decay = Math.exp(-nearest / falloff);
  const width = Math.max(
    minWidth,
    Math.min(maxWidth, Math.round(minWidth + (maxWidth - minWidth) * decay)),
  );

  // The segment: the `width` border tiles nearest the centre — a contiguous
  // stretch of front around the aim point.
  const cx = tileX(center);
  const cy = tileY(center);
  const ranked = borderTiles
    .map((t) => ({
      t,
      d: Math.abs(tileX(t) - cx) + Math.abs(tileY(t) - cy),
    }))
    .sort((a, b) => a.d - b.d || a.t - b.t);
  const sourceTiles = ranked.slice(0, width).map((e) => e.t);

  return { sourceTiles, centerTile: center, width };
}
