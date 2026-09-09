import { clamp } from "./config";
import { CityModel } from "./model";

export const SUBCELLS = 4;
export interface StreetSettings {
  branching: number;
  straightness: number;
}
export const DEFAULT_STREETS: Readonly<StreetSettings> = Object.freeze({
  branching: 0.2,
  straightness: 0.55,
});
export interface Building {
  cell: number;
  frontage: number;
  variant: number;
}
export interface StreetTile {
  level: number;
  hub: number;
  roads: Set<number>;
  connections: Set<number>;
  buildings: Map<number, Building>;
  paths: number[][];
  reserved: Set<number>;
}

/** An incremental visual automaton. Reads the simulation; never writes to it. */
export class StreetLayout {
  readonly tiles = new Map<number, StreetTile>();
  readonly settings: StreetSettings;
  constructor(
    readonly model: CityModel,
    readonly seed: number,
    settings: StreetSettings = DEFAULT_STREETS,
  ) {
    this.settings = {
      branching: clamp(settings.branching),
      straightness: clamp(settings.straightness),
    };
    this.sync();
  }
  /** Stateless visual noise cannot consume the simulation's random sequence. */
  noise(a: number, b = 0): number {
    let h =
      Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263) ^ this.seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  private neighbours(tile: number): (number | null)[] {
    const w = this.model.terrain.width;
    return [
      tile >= w ? tile - w : null,
      tile % w < w - 1 ? tile + 1 : null,
      tile < w * (w - 1) ? tile + w : null,
      tile % w > 0 ? tile - 1 : null,
    ];
  }
  private coordinate(a: number, b: number): number {
    return clamp(
      Math.round(
        SUBCELLS / 2 +
          (this.noise(a, b) - 0.5) *
            (SUBCELLS - 2) *
            (1 - this.settings.straightness),
      ),
      1,
      SUBCELLS - 2,
    );
  }
  private establish(tile: number): StreetTile {
    const hx = this.coordinate(tile, 7001),
      hy = this.coordinate(tile, 7002);
    const hub = hy * SUBCELLS + hx;
    const paths = this.neighbours(tile).map((n, direction) => {
      // Both sides of a shared edge choose exactly the same crossing point.
      const gate = this.coordinate(
        Math.min(tile, n ?? tile),
        Math.max(tile, n ?? tile),
      );
      const tx = direction === 1 ? SUBCELLS - 1 : direction === 3 ? 0 : gate;
      const ty = direction === 0 ? 0 : direction === 2 ? SUBCELLS - 1 : gate;
      let x = hx,
        y = hy;
      const path = [hub];
      const moveX = () => {
        while (x !== tx) {
          x += Math.sign(tx - x);
          path.push(y * SUBCELLS + x);
        }
      };
      const moveY = () => {
        while (y !== ty) {
          y += Math.sign(ty - y);
          path.push(y * SUBCELLS + x);
        }
      };
      // Align within the neighbourhood before approaching its boundary.
      if (direction % 2) {
        moveY();
        moveX();
      } else {
        moveX();
        moveY();
      }
      return path;
    });
    const detail: StreetTile = {
      level: this.model.level(tile),
      hub,
      roads: new Set([hub]),
      connections: new Set(),
      buildings: new Map(),
      paths,
      reserved: new Set(paths.flat()),
    };
    this.tiles.set(tile, detail);
    return detail;
  }
  private connect(tile: number, neighbour: number): void {
    const direction = this.neighbours(tile).indexOf(neighbour);
    const a = this.tiles.get(tile)!,
      b = this.tiles.get(neighbour)!;
    for (const cell of a.paths[direction]) a.roads.add(cell);
    for (const cell of b.paths[(direction + 2) % 4]) b.roads.add(cell);
    a.connections.add(neighbour);
    b.connections.add(tile);
  }
  private localNeighbours(cell: number): number[] {
    const neighbours: number[] = [];
    if (cell >= SUBCELLS) neighbours.push(cell - SUBCELLS);
    if (cell % SUBCELLS < SUBCELLS - 1) neighbours.push(cell + 1);
    if (cell < SUBCELLS * (SUBCELLS - 1)) neighbours.push(cell + SUBCELLS);
    if (cell % SUBCELLS) neighbours.push(cell - 1);
    return neighbours;
  }
  private infill(tile: number): void {
    const d = this.tiles.get(tile)!;
    d.level = this.model.level(tile);
    const target = Math.min(SUBCELLS * SUBCELLS, 1 + d.level * 2);
    while (d.buildings.size < target) {
      let best: Building | null = null,
        bestScore = -Infinity;
      for (let cell = 0; cell < SUBCELLS * SUBCELLS; cell++) {
        // Reserve future street alignments so later junctions cannot demolish homes.
        if (d.reserved.has(cell) || d.buildings.has(cell)) continue;
        const ns = this.localNeighbours(cell);
        const frontage = ns.find((n) => d.roads.has(n));
        if (frontage === undefined) continue;
        const score =
          this.noise(tile, cell) +
          0.35 * ns.filter((n) => d.buildings.has(n)).length;
        if (score > bestScore) {
          bestScore = score;
          best = { cell, frontage, variant: this.noise(tile, cell + 100) };
        }
      }
      if (!best) break;
      d.buildings.set(best.cell, best);
    }
  }
  sync(): void {
    const m = this.model,
      dirty = new Set<number>();
    const pending = new Set<number>();
    for (let tile = 0; tile < m.capacity.length; tile++) {
      if (!m.level(tile) || m.terrain.water[tile]) continue;
      const existing = this.tiles.get(tile);
      if (!existing) pending.add(tile);
      else if (existing.level !== m.level(tile)) dirty.add(tile);
    }
    // Usually just one new tile. The queue also supports inspecting an already
    // grown model: each addition must attach to a connected developed neighbour.
    while (pending.size) {
      let progressed = false;
      for (const tile of pending) {
        const neighbours = this.neighbours(tile).filter(
          (n): n is number => n !== null && this.tiles.has(n),
        );
        if (!neighbours.length) continue;
        const height = m.terrain.height[tile];
        const score = (n: number) => {
          const d = this.tiles.get(n)!;
          const w = m.terrain.width;
          const opposite = n + (n - tile);
          const straight =
            d.connections.has(opposite) &&
            (Math.abs(n - tile) === w ||
              Math.floor(n / w) === Math.floor(opposite / w));
          return (
            Math.abs(height - m.terrain.height[n]) * 12 +
            Math.max(0, height - m.terrain.height[n]) * 8 -
            (straight ? this.settings.straightness : 0) +
            this.noise(tile, n) * 0.6
          );
        };
        neighbours.sort((a, b) => score(a) - score(b));
        this.establish(tile);
        this.connect(tile, neighbours[0]);
        dirty.add(tile);
        dirty.add(neighbours[0]);
        for (const n of neighbours.slice(1)) {
          // Extra local joins form loops, while sparse branching leaves bigger blocks.
          if (
            this.noise(Math.min(tile, n), Math.max(tile, n) + 9000) <
            this.settings.branching
          ) {
            this.connect(tile, n);
            dirty.add(n);
          }
        }
        pending.delete(tile);
        progressed = true;
      }
      if (!progressed) {
        // Another independent neighbourhood; do not draw a road through the
        // wilderness to the historical founding tile.
        const tile = pending.values().next().value!;
        const detail = this.establish(tile);
        for (const cell of detail.paths[1].slice(0, 3)) detail.roads.add(cell);
        dirty.add(tile);
        pending.delete(tile);
      }
    }
    for (const tile of dirty) this.infill(tile);
  }
}
