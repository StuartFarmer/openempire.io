/** Bounded, ordered one-cell-wide stroke in integer tile coordinates. */
export class PaintStroke {
  private cells = new Set<number>();
  private last: { x: number; y: number } | null = null;
  constructor(
    private width: number,
    private height: number,
    private limit = 4096,
  ) {}
  add(x: number, y: number): void {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= this.width ||
      y >= this.height ||
      this.isFull()
    )
      return;
    let { x: px, y: py } = this.last ?? { x, y };
    const dx = Math.abs(x - px),
      dy = -Math.abs(y - py);
    const sx = px < x ? 1 : -1,
      sy = py < y ? 1 : -1;
    let error = dx + dy;
    while (!this.isFull()) {
      this.cells.add(py * this.width + px);
      if (px === x && py === y) break;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        px += sx;
      }
      if (twice <= dx) {
        error += dx;
        py += sy;
      }
    }
    this.last = { x, y };
  }
  tiles(): readonly number[] {
    return [...this.cells];
  }
  clear(): void {
    this.cells.clear();
    this.last = null;
  }
  isFull(): boolean {
    return this.cells.size >= this.limit;
  }
}
