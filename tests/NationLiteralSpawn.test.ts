import { describe, expect, test, vi } from "vitest";
import {
  literalNationSpawnTile,
  NationExecution,
} from "../src/core/execution/NationExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import {
  Cell,
  Difficulty,
  Nation,
  PlayerInfo,
  PlayerType,
} from "../src/core/game/Game";

describe("map-authored nation spawning", () => {
  test("uses the literal manifest coordinate without random displacement", () => {
    const game = {
      isValidCoord: vi.fn().mockReturnValue(true),
      ref: vi.fn().mockReturnValue(123),
      isLand: vi.fn().mockReturnValue(true),
      hasOwner: vi.fn().mockReturnValue(false),
      isImpassable: vi.fn().mockReturnValue(false),
    };

    expect(literalNationSpawnTile(game as never, new Cell(17, 29))).toBe(123);
    expect(game.ref).toHaveBeenCalledOnce();
    expect(game.ref).toHaveBeenCalledWith(17, 29);
  });

  test("does not move an already-spawned nation during the spawn phase", () => {
    const info = new PlayerInfo("Exact", PlayerType.Nation, null, "nation-id");
    const nation = new Nation(new Cell(17, 29), info);
    const player = { hasSpawned: () => true, team: () => null };
    const game = {
      config: () => ({ gameConfig: () => ({ difficulty: Difficulty.Medium }) }),
      hasPlayer: () => true,
      player: () => player,
      inSpawnPhase: () => true,
      addExecution: vi.fn(),
      isValidCoord: () => true,
      ref: () => 123,
      isLand: () => true,
      hasOwner: () => false,
      isImpassable: () => false,
    };
    const execution = new NationExecution("game-id", nation);
    execution.init(game as never);

    for (let tick = 0; tick < 150; tick += 1) execution.tick(tick);

    expect(game.addExecution).not.toHaveBeenCalled();
  });

  test("queues a manifest nation at its exact authored center", () => {
    const info = new PlayerInfo("Exact", PlayerType.Nation, null, "nation-id");
    const nation = new Nation(new Cell(17, 29), info);
    const player = { hasSpawned: () => false, team: () => null };
    const game = {
      config: () => ({ gameConfig: () => ({ difficulty: Difficulty.Medium }) }),
      hasPlayer: () => true,
      player: () => player,
      inSpawnPhase: () => true,
      addExecution: vi.fn(),
      isValidCoord: () => true,
      ref: (x: number, y: number) => y * 100 + x,
      isLand: () => true,
      hasOwner: () => false,
      isImpassable: () => false,
    };
    const execution = new NationExecution("game-id", nation);
    execution.init(game as never);

    execution.tick(0);

    expect(game.addExecution).toHaveBeenCalledOnce();
    expect(game.addExecution.mock.calls[0][0]).toBeInstanceOf(SpawnExecution);
    expect((game.addExecution.mock.calls[0][0] as SpawnExecution).tile).toBe(
      2917,
    );
  });

  test("keeps the manifest center in team modes", () => {
    const info = new PlayerInfo("Exact", PlayerType.Nation, null, "nation-id");
    const nation = new Nation(new Cell(17, 29), info);
    const player = { hasSpawned: () => false, team: () => 1 };
    const game = {
      config: () => ({ gameConfig: () => ({ difficulty: Difficulty.Medium }) }),
      hasPlayer: () => true,
      player: () => player,
      inSpawnPhase: () => true,
      addExecution: vi.fn(),
      teamSpawnArea: () => ({ x: 0, y: 0, width: 2, height: 2 }),
      isValidCoord: () => true,
      ref: (x: number, y: number) => y * 100 + x,
      isLand: () => true,
      hasOwner: () => false,
      isImpassable: () => false,
    };
    const execution = new NationExecution("game-id", nation);
    execution.init(game as never);

    execution.tick(0);

    expect((game.addExecution.mock.calls[0][0] as SpawnExecution).tile).toBe(
      2917,
    );
  });
});
