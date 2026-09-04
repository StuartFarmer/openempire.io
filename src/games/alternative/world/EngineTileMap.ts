export type TileRef = number;

export interface EngineTileMap {
  width(): number;
  height(): number;
  ref(x: number, y: number): TileRef;
  x(ref: TileRef): number;
  y(ref: TileRef): number;
  isValidRef(ref: TileRef): boolean;
  terrainBuffer(): Uint8Array;
  elevationBuffer(): Float32Array;
  elevation(ref: TileRef): number;
  stateBuffer(): Uint16Array;
}

export class FoundationEngineTileMap implements EngineTileMap {
  private readonly width_: number;
  private readonly height_: number;
  private readonly terrain: Uint8Array;
  private readonly elevationValues: Float32Array;
  private readonly state: Uint16Array;

  constructor(
    width: number,
    height: number,
    terrain: Uint8Array,
    state: Uint16Array = new Uint16Array(width * height),
    elevation: Float32Array = elevationBufferFromTerrain(terrain),
  ) {
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`Invalid map width: ${width}`);
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new Error(`Invalid map height: ${height}`);
    }
    const expectedLength = width * height;
    if (terrain.length !== expectedLength) {
      throw new Error(
        `Terrain buffer length ${terrain.length} does not match ${width}x${height}`,
      );
    }
    if (state.length !== expectedLength) {
      throw new Error(
        `State buffer length ${state.length} does not match ${width}x${height}`,
      );
    }
    if (elevation.length !== expectedLength) {
      throw new Error(
        `Elevation buffer length ${elevation.length} does not match ${width}x${height}`,
      );
    }

    this.width_ = width;
    this.height_ = height;
    this.terrain = terrain;
    this.elevationValues = elevation;
    this.state = state;
  }

  width(): number {
    return this.width_;
  }

  height(): number {
    return this.height_;
  }

  ref(x: number, y: number): TileRef {
    if (!this.isValidCoord(x, y)) {
      throw new Error(`Invalid tile coordinates: ${x},${y}`);
    }
    return y * this.width_ + x;
  }

  x(ref: TileRef): number {
    this.assertValidRef(ref);
    return ref % this.width_;
  }

  y(ref: TileRef): number {
    this.assertValidRef(ref);
    return Math.floor(ref / this.width_);
  }

  isValidRef(ref: TileRef): boolean {
    return (
      Number.isInteger(ref) && ref >= 0 && ref < this.width_ * this.height_
    );
  }

  terrainBuffer(): Uint8Array {
    return this.terrain;
  }

  elevationBuffer(): Float32Array {
    return this.elevationValues;
  }

  elevation(ref: TileRef): number {
    this.assertValidRef(ref);
    return this.elevationValues[ref];
  }

  stateBuffer(): Uint16Array {
    return this.state;
  }

  private isValidCoord(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.width_ &&
      y < this.height_
    );
  }

  private assertValidRef(ref: TileRef): void {
    if (!this.isValidRef(ref)) {
      throw new Error(`Invalid tile ref: ${ref}`);
    }
  }
}

function elevationBufferFromTerrain(terrain: Uint8Array): Float32Array {
  const elevation = new Float32Array(terrain.length);
  for (let i = 0; i < terrain.length; i++) {
    elevation[i] = (terrain[i] & 0x1f) / 31;
  }
  return elevation;
}
