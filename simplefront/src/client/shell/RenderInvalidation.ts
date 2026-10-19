export type ViewUpdate =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "chunks"; ids: Uint32Array };

/** Persistent map pixels only need recomputing around changed tile inputs. */
export class RenderInvalidation {
  private full = true;
  private readonly columns: number;
  private readonly marked: Uint8Array;
  private readonly ids: number[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.columns = Math.ceil(width / 32);
    this.marked = new Uint8Array(this.columns * Math.ceil(height / 32));
  }

  markTile(tile: number): void {
    if (
      this.full ||
      !Number.isInteger(tile) ||
      tile < 0 ||
      tile >= this.width * this.height
    )
      return;
    const x = tile % this.width;
    const y = Math.floor(tile / this.width);
    // Ownership borders read any8: their neighbours can change colour too.
    for (
      let cy = Math.max(0, y - 1) >> 5;
      cy <= Math.min(this.height - 1, y + 1) >> 5;
      cy++
    ) {
      for (
        let cx = Math.max(0, x - 1) >> 5;
        cx <= Math.min(this.width - 1, x + 1) >> 5;
        cx++
      ) {
        const id = cy * this.columns + cx;
        if (!this.marked[id]) {
          this.marked[id] = 1;
          this.ids.push(id);
        }
      }
    }
    // Conservative crossover; the uniform has room for 2,048 chunk IDs.
    if (
      this.ids.length >= Math.ceil(this.marked.length / 4) ||
      this.ids.length > 2048
    )
      this.markAll();
  }

  markAll(): void {
    this.full = true;
  }

  /** Snapshot now, so changes arriving during GPU work belong to the next view. */
  take(): ViewUpdate {
    const update: ViewUpdate = this.full
      ? { kind: "full" }
      : this.ids.length
        ? { kind: "chunks", ids: Uint32Array.from(this.ids) }
        : { kind: "none" };
    for (const id of this.ids) this.marked[id] = 0;
    this.ids.length = 0;
    this.full = false;
    return update;
  }
}
