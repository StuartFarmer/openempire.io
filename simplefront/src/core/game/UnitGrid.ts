import { PlayerID, Unit, UnitType } from "./Game";
import { GameMap, TileRef } from "./GameMap";

export interface GridUnit {
  tile(): TileRef;
  lastTile(): TileRef;
  type(): UnitType;
  isActive(): boolean;
  isUnderConstruction(): boolean;
  owner(): { id(): PlayerID };
}

export type UnitPredicate<TUnit extends GridUnit = GridUnit> = (value: {
  unit: TUnit;
  distSquared: number;
}) => boolean;

export class UnitGrid<TUnit extends GridUnit = Unit> {
  private grid: Map<UnitType, Set<TUnit>>[][];
  private readonly cellSize = 100;
  private readonly unitsByTile = new Map<TileRef, Set<TUnit>>();
  private readonly indexedTile = new WeakMap<TUnit, TileRef>();
  // Exact queries retain the coarse bucket's insertion order, even when a
  // unit moves within that bucket onto a tile occupied by a newer unit.
  private readonly insertionOrder = new WeakMap<TUnit, number>();
  private nextOrder = 0;

  constructor(private gm: GameMap) {
    this.grid = Array(Math.ceil(gm.height() / this.cellSize))
      .fill(null)
      .map(() =>
        Array(Math.ceil(gm.width() / this.cellSize))
          .fill(null)
          .map(() => new Map<UnitType, Set<TUnit>>()),
      );
  }

  // Get grid coordinates from pixel coordinates
  private getGridCoords(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }

  // Add a unit to the grid
  addUnit(unit: TUnit) {
    const tile = unit.tile();
    const [gridX, gridY] = this.getGridCoords(this.gm.x(tile), this.gm.y(tile));

    if (this.isValidCell(gridX, gridY)) {
      const unitSet = this.grid[gridY][gridX].get(unit.type());
      if (!unitSet?.has(unit)) this.insertionOrder.set(unit, this.nextOrder++);
      if (unitSet !== undefined) {
        unitSet.add(unit);
      } else {
        this.grid[gridY][gridX].set(unit.type(), new Set<TUnit>([unit]));
      }
      this.addAtTile(unit, tile);
    }
  }

  // Remove a unit from the grid
  removeUnit(unit: TUnit) {
    const tile = unit.tile();
    this.removeUnitByTile(unit, tile);
  }

  removeUnitByTile(unit: TUnit, tile: TileRef) {
    this.removeAtTile(unit);
    const [gridX, gridY] = this.getGridCoords(this.gm.x(tile), this.gm.y(tile));

    if (this.isValidCell(gridX, gridY)) {
      const unitSet = this.grid[gridY][gridX].get(unit.type());
      if (unitSet !== undefined) {
        unitSet.delete(unit);
      }
    }
  }

  private addAtTile(unit: TUnit, tile: TileRef): void {
    if (this.indexedTile.get(unit) !== tile) this.removeAtTile(unit);
    let units = this.unitsByTile.get(tile);
    if (!units) this.unitsByTile.set(tile, (units = new Set()));
    units.add(unit);
    this.indexedTile.set(unit, tile);
  }

  private removeAtTile(unit: TUnit): void {
    // UnitView.lastTile is the start of the tick, not necessarily the previous
    // indexed position; inactive updates can also move before removal.
    const tile = this.indexedTile.get(unit);
    if (tile === undefined) return;
    const units = this.unitsByTile.get(tile);
    units?.delete(unit);
    if (units?.size === 0) this.unitsByTile.delete(tile);
    this.indexedTile.delete(unit);
  }

  /**
   * Move an unit to its new cell if it changed
   */
  updateUnitCell(unit: TUnit) {
    const newTile = unit.tile();
    const oldTile = unit.lastTile();
    const [gridX, gridY] = this.getGridCoords(
      this.gm.x(oldTile),
      this.gm.y(oldTile),
    );
    const [newGridX, newGridY] = this.getGridCoords(
      this.gm.x(newTile),
      this.gm.y(newTile),
    );
    if (gridX !== newGridX || gridY !== newGridY) {
      this.removeUnitByTile(unit, oldTile);
      this.addUnit(unit);
    } else if (this.isValidCell(gridX, gridY)) {
      this.addAtTile(unit, newTile);
    }
  }

  private isValidCell(gridX: number, gridY: number): boolean {
    return (
      gridX >= 0 &&
      gridX < this.grid[0].length &&
      gridY >= 0 &&
      gridY < this.grid.length
    );
  }

  // Compute the exact cells in range of tile
  private getCellsInRange(tile: TileRef, range: number) {
    const x = this.gm.x(tile);
    const y = this.gm.y(tile);
    const cellSize = this.cellSize;
    const [gridX, gridY] = this.getGridCoords(x, y);
    const startGridX = Math.max(
      0,
      gridX - Math.ceil((range - (x % cellSize)) / cellSize),
    );
    const endGridX = Math.min(
      this.grid[0].length - 1,
      gridX + Math.ceil((range - (cellSize - (x % cellSize))) / cellSize),
    );
    const startGridY = Math.max(
      0,
      gridY - Math.ceil((range - (y % cellSize)) / cellSize),
    );
    const endGridY = Math.min(
      this.grid.length - 1,
      gridY + Math.ceil((range - (cellSize - (y % cellSize))) / cellSize),
    );

    return { startGridX, endGridX, startGridY, endGridY };
  }

  private squaredDistanceFromTile(unit: TUnit, tile: TileRef): number {
    const x = this.gm.x(tile);
    const y = this.gm.y(tile);
    const tileX = this.gm.x(unit.tile());
    const tileY = this.gm.y(unit.tile());
    const dx = tileX - x;
    const dy = tileY - y;
    const distSquared = dx * dx + dy * dy;
    return distSquared;
  }

  // Get all units within range of a point
  // Returns [unit, distanceSquared] pairs for efficient filtering
  nearbyUnits(
    tile: TileRef,
    searchRange: number,
    types: readonly UnitType[] | UnitType,
    predicate?: UnitPredicate<TUnit>,
    includeUnderConstruction: boolean = false,
  ): Array<{ unit: TUnit; distSquared: number }> {
    const nearby: Array<{ unit: TUnit; distSquared: number }> = [];
    const gm = this.gm;
    const x = gm.x(tile);
    const y = gm.y(tile);
    const { startGridX, endGridX, startGridY, endGridY } = this.getCellsInRange(
      tile,
      searchRange,
    );
    const rangeSquared = searchRange * searchRange;

    if (searchRange === 0) {
      // Preserve the existing range calculation at bucket boundaries; fixing
      // its zero-radius edge behaviour separately would change game replays.
      if (startGridX > endGridX || startGridY > endGridY) return nearby;
      const units = this.unitsByTile.get(tile);
      if (!units) return nearby;
      const ordered = [...units].sort(
        (a, b) => this.insertionOrder.get(a)! - this.insertionOrder.get(b)!,
      );
      for (const type of Array.isArray(types) ? types : [types]) {
        for (const unit of ordered) {
          if (unit.type() !== type || !unit.isActive()) continue;
          if (!includeUnderConstruction && unit.isUnderConstruction()) continue;
          const value = { unit, distSquared: 0 };
          if (predicate !== undefined && !predicate(value)) continue;
          nearby.push(value);
        }
      }
      return nearby;
    }

    if (Array.isArray(types)) {
      for (let cy = startGridY; cy <= endGridY; cy++) {
        for (let cx = startGridX; cx <= endGridX; cx++) {
          const cell = this.grid[cy][cx];
          for (const type of types) {
            const unitSet = cell.get(type);
            if (unitSet === undefined) continue;
            for (const unit of unitSet) {
              if (!unit.isActive()) continue;
              // Exclude units under construction by default (e.g., defense posts being built)
              // But include them for spacing checks
              if (!includeUnderConstruction && unit.isUnderConstruction())
                continue;
              const unitTile = unit.tile();
              const dx = gm.x(unitTile) - x;
              const dy = gm.y(unitTile) - y;
              const distSquared = dx * dx + dy * dy;
              if (distSquared > rangeSquared) continue;
              const value = { unit, distSquared };
              if (predicate !== undefined && !predicate(value)) continue;
              nearby.push(value);
            }
          }
        }
      }
      return nearby;
    }

    const type = types;
    for (let cy = startGridY; cy <= endGridY; cy++) {
      for (let cx = startGridX; cx <= endGridX; cx++) {
        const unitSet = this.grid[cy][cx].get(type as UnitType);
        if (unitSet === undefined) continue;
        for (const unit of unitSet) {
          if (!unit.isActive()) continue;
          // Exclude units under construction by default (e.g., defense posts being built)
          // But include them for spacing checks
          if (!includeUnderConstruction && unit.isUnderConstruction()) continue;
          const unitTile = unit.tile();
          const dx = gm.x(unitTile) - x;
          const dy = gm.y(unitTile) - y;
          const distSquared = dx * dx + dy * dy;
          if (distSquared > rangeSquared) continue;
          const value = { unit, distSquared };
          if (predicate !== undefined && !predicate(value)) continue;
          nearby.push(value);
        }
      }
    }
    return nearby;
  }

  private unitIsInRange(
    unit: TUnit,
    tile: TileRef,
    rangeSquared: number,
    playerId?: PlayerID,
    includeUnderConstruction: boolean = false,
  ): boolean {
    if (!unit.isActive()) {
      return false;
    }
    // Exclude units under construction by default (e.g., defense posts being built)
    // But include them for spacing checks
    if (!includeUnderConstruction && unit.isUnderConstruction()) {
      return false;
    }
    if (playerId !== undefined && unit.owner().id() !== playerId) {
      return false;
    }
    const distSquared = this.squaredDistanceFromTile(unit, tile);
    return distSquared <= rangeSquared;
  }

  // Return true if it finds an owned specific unit in range
  hasUnitNearby(
    tile: TileRef,
    searchRange: number,
    type: UnitType,
    playerId?: PlayerID,
    includeUnderConstruction: boolean = false,
  ): boolean {
    const { startGridX, endGridX, startGridY, endGridY } = this.getCellsInRange(
      tile,
      searchRange,
    );
    const rangeSquared = searchRange * searchRange;
    for (let cy = startGridY; cy <= endGridY; cy++) {
      for (let cx = startGridX; cx <= endGridX; cx++) {
        const unitSet = this.grid[cy][cx].get(type);
        if (unitSet === undefined) continue;
        for (const unit of unitSet) {
          if (
            this.unitIsInRange(
              unit,
              tile,
              rangeSquared,
              playerId,
              includeUnderConstruction,
            )
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Return true if any unit of the given types matches the predicate
  anyUnitNearby(
    tile: TileRef,
    searchRange: number,
    types: readonly UnitType[],
    predicate: (unit: TUnit) => boolean,
    playerId?: PlayerID,
    includeUnderConstruction: boolean = false,
  ): boolean {
    const { startGridX, endGridX, startGridY, endGridY } = this.getCellsInRange(
      tile,
      searchRange,
    );
    const rangeSquared = searchRange * searchRange;
    for (let cy = startGridY; cy <= endGridY; cy++) {
      for (let cx = startGridX; cx <= endGridX; cx++) {
        for (const type of types) {
          const unitSet = this.grid[cy][cx].get(type);
          if (unitSet === undefined) continue;
          for (const unit of unitSet) {
            if (
              !this.unitIsInRange(
                unit,
                tile,
                rangeSquared,
                playerId,
                includeUnderConstruction,
              )
            ) {
              continue;
            }
            if (predicate(unit)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
}
