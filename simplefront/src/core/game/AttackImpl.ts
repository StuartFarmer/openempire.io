import { Attack, Player, TerraNullius } from "./Game";
import { GameImpl } from "./GameImpl";
import { TileRef } from "./GameMap";
import { PlayerImpl } from "./PlayerImpl";

export class AttackImpl implements Attack {
  private _isActive = true;
  private _borderSize = 0;
  private _frontTile: TileRef | null = null;
  public _retreating = false;
  public _retreated = false;

  /**
   * The force this attack has AT EACH TILE of its front (front-line-troops).
   * Troops used to be a single number, so an attack had strength but no
   * location: a counter-attack launched anywhere deleted a push grinding into
   * the opposite border, and a front's width cost nothing because every tile
   * was priced off the undivided total. Keyed by the tiles in `_border` — the
   * enemy tiles this attack is pressing.
   */
  private _troopsAt = new Map<TileRef, number>();
  /** Σ _troopsAt, maintained on every mutation (integer). */
  private _troopsSum = 0;
  /**
   * Troops with nowhere to stand right now — a conquered tile's survivors
   * before the advance opens new front, or a commitment made against an empty
   * front. Flushed onto the front by the per-tick seep pass. Counted in
   * `troops()` so the total is conserved exactly.
   */
  private _reserve = 0;

  constructor(
    private _id: string,
    private _target: Player | TerraNullius,
    private _attacker: Player,
    troops: number,
    private _sourceTile: TileRef | null,
    private _border: Set<number>,
    private _mg: GameImpl,
  ) {
    this._reserve = Math.max(0, Math.floor(troops));
  }

  sourceTile(): TileRef | null {
    return this._sourceTile;
  }

  frontTile(): TileRef | null {
    return this._frontTile;
  }
  setFrontTile(tile: TileRef): void {
    this._frontTile = tile;
  }

  target(): Player | TerraNullius {
    return this._target;
  }
  attacker(): Player {
    return this._attacker;
  }
  troops(): number {
    return this._troopsSum + this._reserve;
  }

  /**
   * Set the TOTAL, preserving the distribution's shape (design.md D6). Callers
   * like retreat, attack merging, nuke deaths and starvation attrition all
   * scale the whole force; rescaling proportionally keeps a concentrated
   * spearhead concentrated instead of collapsing it onto one tile.
   */
  setTroops(troops: number) {
    const next = Math.max(0, Math.floor(troops));
    const current = this.troops();
    if (next === current) return;
    if (next === 0) {
      this._troopsAt.clear();
      this._troopsSum = 0;
      this._reserve = 0;
      return;
    }
    if (current === 0) {
      // Nothing on the front to scale — hold it until seep places it.
      this._reserve = next;
      return;
    }
    // Scale every entry by next/current, then put the rounding remainder in
    // the reserve so the sum is exact without biasing any tile.
    let placed = 0;
    for (const [tile, n] of this._troopsAt) {
      const scaled = Math.floor((n * next) / current);
      this._troopsAt.set(tile, scaled);
      placed += scaled;
    }
    this.dropEmptyFrontEntries();
    this._troopsSum = placed;
    this._reserve = next - placed;
  }

  /** The force at one front tile (0 if the attack has nothing there). */
  troopsAt(tile: TileRef): number {
    return this._troopsAt.get(tile) ?? 0;
  }

  /** Put troops on a front tile. */
  addTroopsAt(tile: TileRef, n: number): void {
    if (n <= 0) return;
    const v = Math.floor(n);
    this._troopsAt.set(tile, this.troopsAt(tile) + v);
    this._troopsSum += v;
  }

  /** Take up to `n` troops from a tile; returns how many were actually there. */
  spendAt(tile: TileRef, n: number): number {
    const have = this.troopsAt(tile);
    const spent = Math.min(have, Math.max(0, Math.floor(n)));
    if (spent <= 0) return 0;
    const left = have - spent;
    // Keep a drained front tile in the field so seep can refill it from its
    // neighbouring front tiles on the next tick.
    this._troopsAt.set(tile, left);
    this._troopsSum -= spent;
    return spent;
  }

  /** Tracked front tiles, including a drained tile awaiting seep. */
  frontTiles(): IterableIterator<TileRef> {
    return this._troopsAt.keys();
  }

  /** Unplaced troops awaiting a front tile. */
  reserve(): number {
    return this._reserve;
  }

  /**
   * Spread the reserve evenly over the front. Called once per tick by the seep
   * pass — troops freed by a conquest land on whatever front the advance has
   * just opened. Integer split with the remainder left in reserve, so nothing
   * is created or lost.
   */
  flushReserve(): void {
    if (this._reserve <= 0) return;
    const tiles = [...this._border];
    if (tiles.length === 0) return;
    tiles.sort((a, b) => a - b);
    const share = Math.floor(this._reserve / tiles.length);
    if (share > 0) {
      for (const t of tiles) this.addTroopsAt(t, share);
      this._reserve -= share * tiles.length;
    }
    // Hand the remainder out one troop at a time, lowest tile first.
    for (const t of tiles) {
      if (this._reserve <= 0) break;
      this.addTroopsAt(t, 1);
      this._reserve -= 1;
    }
  }

  /** Spread `n` troops evenly over the given tiles (deterministic, exact). */
  distributeOver(tiles: readonly TileRef[], n: number): void {
    const amount = Math.max(0, Math.floor(n));
    if (amount <= 0) return;
    if (tiles.length === 0) {
      this._reserve += amount;
      return;
    }
    // Straight stretches of the front already supply ordered neighbors.
    let ordered = tiles;
    for (let i = 1; i < tiles.length; i++) {
      if (tiles[i - 1] > tiles[i]) {
        ordered = [...tiles].sort((a, b) => a - b);
        break;
      }
    }
    const share = Math.floor(amount / ordered.length);
    let left = amount;
    if (share > 0) {
      for (const t of ordered) this.addTroopsAt(t, share);
      left -= share * ordered.length;
    }
    for (const t of ordered) {
      if (left <= 0) break;
      this.addTroopsAt(t, 1);
      left -= 1;
    }
  }

  private dropEmptyFrontEntries(): void {
    for (const [tile, n] of this._troopsAt) {
      if (n <= 0) this._troopsAt.delete(tile);
    }
  }

  isActive() {
    return this._isActive;
  }

  id() {
    return this._id;
  }

  delete() {
    if (this._target.isPlayer()) {
      (this._target as PlayerImpl)._incomingAttacks = (
        this._target as PlayerImpl
      )._incomingAttacks.filter((a) => a !== this);
    }

    (this._attacker as PlayerImpl)._outgoingAttacks = (
      this._attacker as PlayerImpl
    )._outgoingAttacks.filter((a) => a !== this);

    this._isActive = false;
  }

  orderRetreat() {
    this._retreating = true;
  }

  executeRetreat() {
    this._retreated = true;
  }

  retreating(): boolean {
    return this._retreating;
  }

  retreated(): boolean {
    return this._retreated;
  }

  borderSize(): number {
    return this._borderSize;
  }

  clearBorder(): void {
    this._borderSize = 0;
    this._border.clear();
    // The force survives the front being rebuilt; it just has nowhere to
    // stand until the new front tiles are added.
    this._reserve += this._troopsSum;
    this._troopsAt.clear();
    this._troopsSum = 0;
  }

  addBorderTile(tile: TileRef): void {
    if (!this._border.has(tile)) {
      this._borderSize += 1;
      this._border.add(tile);
    }
  }

  removeBorderTile(tile: TileRef): void {
    if (this._border.has(tile)) {
      this._borderSize -= 1;
      this._border.delete(tile);
    }
    // Survivors of a tile that has left the front are not lost — they wait in
    // the reserve for the seep pass to place them on the new front.
    const left = this._troopsAt.get(tile);
    if (left !== undefined) {
      this._troopsAt.delete(tile);
      this._troopsSum -= left;
      this._reserve += left;
    }
  }

  // Returns the top 2 clustered positions of the attack's border.
  // If the second cluster is too small, only returns the largest one.
  clusteredPositions(): TileRef[] {
    if (this._borderSize === 0) {
      const tile = this.sourceTile();
      return tile !== null ? [tile] : [];
    }
    return this.clusterBorderTiles(30, 2);
  }

  // Partitions the attack's border tiles into disconnected segments using BFS,
  // then returns one representative tile per segment.
  //
  // Border tiles naturally fragment when fighting across non-contiguous
  // territory (e.g. islands, chokepoints).
  //
  // Results are sorted largest-first, small clusters below minSize are
  // dropped (the largest is always kept as a fallback), and the list is capped
  // at maxClusters to avoid label clutter on heavily fragmented borders.
  private clusterBorderTiles(minSize: number, maxClusters: number): TileRef[] {
    const map = this._mg.map();
    const visited = new Set<TileRef>();
    const clusters: { tile: TileRef; size: number }[] = [];

    for (const startTile of this._border) {
      if (visited.has(startTile)) continue;

      const queue: TileRef[] = [startTile];
      visited.add(startTile);
      let qi = 0;
      let sumX = 0;
      let sumY = 0;
      let count = 0;

      while (qi < queue.length) {
        const t = queue[qi++];
        sumX += map.x(t);
        sumY += map.y(t);
        count++;

        this._mg.forEachNeighborWithDiag(t, (neighbor) => {
          if (this._border.has(neighbor) && !visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        });
      }

      // The centroid (sumX/count, sumY/count) may not be a real border tile,
      // so we pick whichever tile in the cluster is closest to it. This ensures
      // the representative always sits on an actual front-line tile.
      const cx = sumX / count;
      const cy = sumY / count;
      let best = queue[0];
      let bestDist = Infinity;
      for (const t of queue) {
        const dx = map.x(t) - cx;
        const dy = map.y(t) - cy;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = t;
        }
      }
      clusters.push({ tile: best, size: count });
    }

    clusters.sort((a, b) => b.size - a.size);

    switch (clusters.length) {
      case 0:
        return [];
      case 1:
        // If there's only one cluster, return it even if it's smaller than minSize.
        return [clusters[0].tile];
      default: {
        const significant = clusters.filter((c) => c.size >= minSize);
        if (significant.length === 0) {
          // Always keep at least the largest cluster even if it falls below minSize.
          return [clusters[0].tile];
        }
        return significant.slice(0, maxClusters).map((c) => c.tile);
      }
    }
  }
}
