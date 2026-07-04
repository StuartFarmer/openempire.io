import { describe, expect, test } from "vitest";
import {
  buildBoardMapTerrainRGBA,
  buildTerrainRGBA,
} from "../src/client/render/gl/utils/ColorUtils";
import {
  boardMapFromGameMap,
  validateBoardMap,
  type BoardMap,
} from "../src/core/game/BoardMap";
import { GameMapImpl } from "../src/core/game/GameMap";

describe("BoardMap", () => {
  test("validates required buffers and layer lengths", () => {
    const valid: BoardMap = {
      width: 2,
      height: 2,
      terrain: new Uint8Array(4),
      state: new Uint16Array(4),
      layers: {
        elevation: new Uint8Array(4),
      },
    };

    expect(() => validateBoardMap(valid)).not.toThrow();
    expect(() =>
      validateBoardMap({ ...valid, terrain: new Uint8Array(3) }),
    ).toThrow(/terrain length 3 does not match 2x2/);
    expect(() =>
      validateBoardMap({ ...valid, state: new Uint16Array(3) }),
    ).toThrow(/state length 3 does not match 2x2/);
    expect(() =>
      validateBoardMap({
        ...valid,
        layers: { elevation: new Uint8Array(3) },
      }),
    ).toThrow(/layer elevation length 3 does not match 2x2/);
  });

  test("adapts an existing GameMap without custom layers", () => {
    const gameMap = new GameMapImpl(
      2,
      2,
      new Uint8Array([0x80, 0x81, 0x00, 0x20]),
      2,
    );

    const boardMap = boardMapFromGameMap(gameMap);

    expect(boardMap.width).toBe(2);
    expect(boardMap.height).toBe(2);
    expect(Array.from(boardMap.terrain)).toEqual([0x80, 0x81, 0x00, 0x20]);
    expect(boardMap.state).toBe(gameMap.tileStateBuffer());
    expect(boardMap.layers).toBeUndefined();
  });

  test("uses default OpenFront terrain coloring when no custom colorizer exists", () => {
    const boardMap: BoardMap = {
      width: 1,
      height: 1,
      terrain: new Uint8Array([0x80]),
      state: new Uint16Array(1),
    };

    expect(Array.from(buildBoardMapTerrainRGBA(boardMap))).toEqual(
      Array.from(buildTerrainRGBA(boardMap.terrain, 1, 1)),
    );
  });

  test("uses custom layer-aware terrain coloring", () => {
    const boardMap: BoardMap = {
      width: 2,
      height: 1,
      terrain: new Uint8Array([0x80, 0x80]),
      state: new Uint16Array(2),
      layers: {
        elevation: new Uint8Array([10, 200]),
      },
      colorizer: (map) =>
        new Uint8Array([
          map.layers!.elevation[0],
          0,
          0,
          255,
          map.layers!.elevation[1],
          0,
          0,
          255,
        ]),
    };

    expect(Array.from(buildBoardMapTerrainRGBA(boardMap))).toEqual([
      10, 0, 0, 255, 200, 0, 0, 255,
    ]);
  });
});
