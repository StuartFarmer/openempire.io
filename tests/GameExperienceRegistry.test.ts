import { describe, expect, test } from "vitest";
import {
  fieldNationsFromManifest,
  getGameDefinition,
  PLAYABLE_GAMES,
  seedFieldNationOwners,
} from "../src/client/games/experience";
import { openfront } from "../src/client/games/openfront/system";
import { composeTerrain } from "../src/client/lab/systems/terrain/system";
import { CAMERA_RENDER_WGSL } from "../src/client/shell/CameraRenderer";
import { compileFieldSystem } from "../src/client/webgpu/FieldDynamics";

describe("playable game registry", () => {
  test("lists every complete game and no studies", () => {
    expect(PLAYABLE_GAMES.map(({ id }) => id)).toEqual([
      "openfront",
      "leanfront",
      "leanfront-simple",
      "conquest",
      "empire",
    ]);
    expect(
      PLAYABLE_GAMES.some(({ id }) =>
        ["terrain", "grazing", "settlement"].includes(id),
      ),
    ).toBe(false);
  });

  test("preserves all worker games and their views", () => {
    expect(
      PLAYABLE_GAMES.filter(({ backend }) => backend === "worker").map(
        ({ id, view }) => [id, view],
      ),
    ).toEqual([
      ["openfront", "openfront"],
      ["leanfront", "leanfront"],
      ["leanfront-simple", "leanfront-simple"],
    ]);
  });

  test("requires complete field experience mappings", () => {
    const fieldGames = PLAYABLE_GAMES.filter(
      ({ backend }) => backend === "field",
    );
    expect(fieldGames).toHaveLength(2);
    for (const game of fieldGames) {
      if (game.backend !== "field") throw new Error("unreachable");
      expect(game.system.kind).toBe("game");
      expect(game.view).toBe(game.system.defaultView);
      expect(game.system.players?.localPlayer).toBe(1);
      expect(game.experience.spawn).toBeDefined();
      expect(game.experience.stats.tiles).toBeTruthy();
      expect(game.experience.hover.owner).toBe("owner");
    }
  });

  test("looks up either backend through one game boundary", () => {
    expect(getGameDefinition("openfront")?.backend).toBe("worker");
    expect(getGameDefinition("leanfront-simple")?.backend).toBe("worker");
    expect(getGameDefinition("terrain")).toBeUndefined();
  });

  test("maps Empire's available food into the shared resource HUD", () => {
    const game = getGameDefinition("empire");
    expect(game?.backend).toBe("field");
    if (game?.backend !== "field") throw new Error("unreachable");
    expect(game.experience.stats.food).toBe("totalFood");
    expect(game.system.scalars?.totalFood).toEqual({
      reduce: "sum",
      layer: "food",
      groupBy: "owner",
    });
  });

  test("field game views consume the common spawn mask", async () => {
    for (const game of PLAYABLE_GAMES) {
      if (game.backend !== "field") continue;
      const compiled = await compileFieldSystem(composeTerrain(game.system));
      expect(game.system.params?.maskFade).toEqual({
        value: 0,
        min: 0,
        max: 1,
        step: 0.01,
        hidden: true,
      });
      expect(
        compiled.kernelConfig.passes.find(
          ({ name }) => name === `view/${game.view}`,
        )?.binds,
      ).toContain("P");
    }
  });

  test("uses every map nation at its literal authored coordinate", () => {
    const authored = Array.from({ length: 55 }, (_, i) => ({
      name: `SPQR ${i + 1}`,
      coordinates: [i + 2, i + 3] as [number, number],
    }));

    const players = fieldNationsFromManifest(authored);

    expect(players).toHaveLength(56); // human + all 55 map nations
    expect(players[1]).toMatchObject({
      id: 2,
      name: "SPQR 1",
      x: 2,
      y: 3,
    });
    expect(players[55]).toMatchObject({
      id: 56,
      name: "SPQR 55",
      x: 56,
      y: 57,
    });
  });

  test("seeds nation ownership around exact manifest centers", () => {
    const players = fieldNationsFromManifest([
      { name: "Exact", coordinates: [3, 2] },
    ]);
    const water = new Uint32Array(48);

    const owner = seedFieldNationOwners(8, 6, water, players, 1);

    expect(owner[2 * 8 + 3]).toBe(2);
    expect(owner[2 * 8 + 2]).toBe(2);
    expect(owner[0]).toBe(0);
  });

  test("every field game uses the exact Live match shader", () => {
    for (const game of PLAYABLE_GAMES) {
      if (game.backend !== "field") continue;
      expect(game.system.views[game.view]?.source).toBe(
        openfront.views.openfront.source,
      );
    }
  });

  test("shared Live output carries plot type into the camera sprite pass", () => {
    expect(openfront.views.openfront.source).toContain("f32(p + 1u) / 255.0");
    expect(CAMERA_RENDER_WGSL).toContain("encodedPlot");
  });

  test("field games expose a compact human-border presentation pass", async () => {
    for (const game of PLAYABLE_GAMES) {
      if (game.backend !== "field") continue;
      const compiled = await compileFieldSystem(composeTerrain(game.system));
      expect(compiled.derivedNames).toEqual(
        expect.arrayContaining(["fieldBorderCount", "fieldBorderTiles"]),
      );
      expect(compiled.kernelConfig.passes.map(({ name }) => name)).toEqual(
        expect.arrayContaining(["field_border_zero", "field_border"]),
      );
      expect(
        compiled.kernelConfig.passes.find(({ name }) => name === "field_border")
          ?.binds,
      ).toContain("owner.read:array<u32>");
      expect(
        compiled.kernelConfig.buffers
          .filter(({ name }) => name.startsWith("fieldBorder"))
          .every(({ readable }) => readable === true),
      ).toBe(true);
    }
  });
});
