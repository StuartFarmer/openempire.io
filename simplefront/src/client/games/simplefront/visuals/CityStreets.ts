import { clamp } from "../../../../core/development/CityDevelopmentConfig";
import type { CityDevelopmentUpdate } from "../../../../core/game/GameUpdates";

interface StreetField {
  width: number;
  height: number;
  level(tile: number): number;
  elevation(tile: number): number;
}

export const SUBCELLS = 2;
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
  // Sparse union-find: one record per developed tile, no world-sized plane.
  private readonly components = new Map<
    number,
    { parent: number; size: number }
  >();
  readonly settings: StreetSettings;
  constructor(
    readonly model: StreetField,
    readonly seed: number,
    settings: StreetSettings = DEFAULT_STREETS,
  ) {
    this.settings = {
      branching: clamp(settings.branching),
      straightness: clamp(settings.straightness),
    };
  }
  /** Stateless visual noise cannot consume the simulation's random sequence. */
  noise(a: number, b = 0): number {
    let h =
      Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263) ^ this.seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  private neighbours(tile: number): (number | null)[] {
    const w = this.model.width;
    return [
      tile >= w ? tile - w : null,
      tile % w < w - 1 ? tile + 1 : null,
      tile < w * (this.model.height - 1) ? tile + w : null,
      tile % w > 0 ? tile - 1 : null,
    ];
  }
  private establish(tile: number): StreetTile {
    // Shared top/left crossings leave the bottom-right pixel for a building.
    const hx = 0,
      hy = 0;
    const hub = hy * SUBCELLS + hx;
    const paths = this.neighbours(tile).map((n, direction) => {
      // Both sides of a shared edge choose exactly the same crossing point.
      const gate = 0;
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
      // A short frontage ensures even north/west-only connections have a house.
      roads: new Set([hub, 1]),
      connections: new Set(),
      buildings: new Map(),
      paths,
      reserved: new Set(paths.flat()),
    };
    this.tiles.set(tile, detail);
    this.components.set(tile, { parent: tile, size: 1 });
    return detail;
  }

  private component(tile: number): number {
    let node = this.components.get(tile)!;
    while (node.parent !== tile) {
      node.parent = this.components.get(node.parent)!.parent;
      tile = node.parent;
      node = this.components.get(tile)!;
    }
    return tile;
  }

  private joinComponents(a: number, b: number): void {
    let first = this.component(a),
      second = this.component(b);
    if (first === second) return;
    if (this.components.get(first)!.size < this.components.get(second)!.size)
      [first, second] = [second, first];
    this.components.get(second)!.parent = first;
    this.components.get(first)!.size += this.components.get(second)!.size;
  }

  private rebuildComponents(): void {
    this.components.clear();
    for (const tile of this.tiles.keys())
      this.components.set(tile, { parent: tile, size: 1 });
    for (const [tile, detail] of this.tiles)
      for (const neighbour of detail.connections) {
        if (this.tiles.has(neighbour)) this.joinComponents(tile, neighbour);
        else detail.connections.delete(neighbour);
      }
  }

  private connect(tile: number, neighbour: number): void {
    const direction = this.neighbours(tile).indexOf(neighbour);
    const a = this.tiles.get(tile)!,
      b = this.tiles.get(neighbour)!;
    for (const cell of a.paths[direction]) a.roads.add(cell);
    for (const cell of b.paths[(direction + 2) % 4]) b.roads.add(cell);
    a.connections.add(neighbour);
    b.connections.add(tile);
    this.joinComponents(tile, neighbour);
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
  sync(changed: Iterable<number>): Set<number> {
    const m = this.model,
      dirty = new Set<number>();
    const pending = new Set<number>();
    let removed = false;
    for (const tile of changed) {
      if (!m.level(tile)) {
        if (this.tiles.delete(tile)) {
          dirty.add(tile);
          removed = true;
        }
        continue;
      }
      const existing = this.tiles.get(tile);
      if (!existing) pending.add(tile);
      else if (existing.level !== m.level(tile)) dirty.add(tile);
    }
    // Union-find handles additions; explicit physical removals need a rebuild.
    // Ordinary ownership/population losses never remove physical street tiles.
    if (removed) this.rebuildComponents();
    // Usually just one new tile. The queue also supports inspecting an already
    // grown model: each addition must attach to a connected developed neighbour.
    while (pending.size) {
      let progressed = false;
      for (const tile of pending) {
        const neighbours = this.neighbours(tile).filter(
          (n): n is number => n !== null && this.tiles.has(n),
        );
        if (!neighbours.length) continue;
        const height = m.elevation(tile);
        const score = (n: number) => {
          const d = this.tiles.get(n)!;
          const w = m.width;
          const opposite = n + (n - tile);
          const straight =
            d.connections.has(opposite) &&
            (Math.abs(n - tile) === w ||
              Math.floor(n / w) === Math.floor(opposite / w));
          return (
            Math.abs(height - m.elevation(n)) * 12 +
            Math.max(0, height - m.elevation(n)) * 8 -
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
          // Unlike the frozen demo, always bridge separate street networks.
          // Branching only decides whether to add a loop within one network.
          if (
            this.component(tile) !== this.component(n) ||
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
        this.establish(tile);
        dirty.add(tile);
        pending.delete(tile);
      }
    }
    for (const tile of dirty) if (this.tiles.has(tile)) this.infill(tile);
    return dirty;
  }
}

/** Sparse physical replica plus incremental visual state; never owns a Game. */
export class CityStreets {
  layout: StreetLayout | null = null;
  private field = new Map<
    number,
    { level: number; owner: number; elevation: number }
  >();
  width = 0;
  height = 0;

  apply(update: CityDevelopmentUpdate): Set<number> {
    if (update.reset) {
      this.field.clear();
      this.width = update.width;
      this.height = update.height;
      this.layout = new StreetLayout(
        {
          width: this.width,
          height: this.height,
          level: (tile) => this.field.get(tile)?.level ?? 0,
          elevation: (tile) => (this.field.get(tile)?.elevation ?? 0) / 31,
        },
        update.seed,
      );
    }
    if (
      !this.layout ||
      update.width !== this.width ||
      update.height !== this.height
    )
      throw new Error("Development delta requires a matching full snapshot.");
    const changed = new Set<number>();
    for (let i = 0; i < update.tiles.length; i += 4) {
      const [tile, level, owner, elevation] = update.tiles.subarray(i, i + 4);
      if ((this.field.get(tile)?.level ?? 0) !== level) changed.add(tile);
      if (level > 0) this.field.set(tile, { level, owner, elevation });
      else this.field.delete(tile);
    }
    return this.layout.sync(changed);
  }

  owner(tile: number): number {
    return this.field.get(tile)?.owner ?? 0;
  }

  /** Four 3-bit pixels in the first word; second word's upper byte is level. */
  sprite(tile: number): [number, number] {
    const detail = this.layout?.tiles.get(tile);
    if (!detail) return [0, 0];
    const words: [number, number] = [0, (detail.level << 24) >>> 0];
    for (let pixel = 0; pixel < SUBCELLS * SUBCELLS; pixel++) {
      const house = detail.buildings.get(pixel);
      const code = detail.roads.has(pixel)
        ? 1
        : house
          ? 2 + Math.min(3, Math.floor(house.variant * 4))
          : 0;
      words[pixel >> 3] =
        (words[pixel >> 3] | (code << ((pixel % 8) * 3))) >>> 0;
    }
    return words;
  }
}

export function spritePixels(words: readonly number[]): number[] {
  return Array.from(
    { length: SUBCELLS * SUBCELLS },
    (_, pixel) => (words[pixel >> 3] >>> ((pixel % 8) * 3)) & 7,
  );
}
