import { EngineTileMap, TileRef } from "./EngineTileMap";

export const FOUNDATION_LAND_TERRAIN_BIT = 1 << 7;
export const FOUNDATION_ELEVATION_MAGNITUDE_MASK = 0x1f;
export const FOUNDATION_ELEVATION_MAGNITUDE_STEPS = 31;
export const FOUNDATION_GRASS_TERRAIN_BYTE = FOUNDATION_LAND_TERRAIN_BIT;

export function foundationTerrainByteForElevation(elevation: number): number {
  return foundationLandTerrainByteForElevation(elevation);
}

export function foundationLandTerrainByteForElevation(
  elevation: number,
): number {
  const normalizedElevation = clampElevation(elevation);
  return (
    FOUNDATION_LAND_TERRAIN_BIT |
    Math.round(normalizedElevation * FOUNDATION_ELEVATION_MAGNITUDE_STEPS)
  );
}

export function foundationWaterTerrainByteForElevation(
  elevation: number,
): number {
  return Math.round(
    clampElevation(elevation) * FOUNDATION_ELEVATION_MAGNITUDE_STEPS,
  );
}

export function isFoundationLandTerrainByte(terrainByte: number): boolean {
  return (terrainByte & FOUNDATION_LAND_TERRAIN_BIT) !== 0;
}

export function foundationElevationFromTerrainByte(
  terrainByte: number,
): number {
  return (
    (terrainByte & FOUNDATION_ELEVATION_MAGNITUDE_MASK) /
    FOUNDATION_ELEVATION_MAGNITUDE_STEPS
  );
}

export class FoundationTerrain {
  constructor(private readonly map: EngineTileMap) {}

  terrainByte(ref: TileRef): number {
    if (!this.map.isValidRef(ref)) {
      throw new Error(`Invalid tile ref: ${ref}`);
    }
    return this.map.terrainBuffer()[ref];
  }

  isGrass(ref: TileRef): boolean {
    return this.isLand(ref);
  }

  isLand(ref: TileRef): boolean {
    return isFoundationLandTerrainByte(this.terrainByte(ref));
  }

  isWater(ref: TileRef): boolean {
    return !this.isLand(ref);
  }

  elevation(ref: TileRef): number {
    if (!this.map.isValidRef(ref)) {
      throw new Error(`Invalid tile ref: ${ref}`);
    }
    return this.map.elevation(ref);
  }
}

function clampElevation(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
