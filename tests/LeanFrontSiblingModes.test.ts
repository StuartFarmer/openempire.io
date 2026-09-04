import { existsSync, readFileSync } from "fs";
import { describe, expect, test } from "vitest";

import { leanfrontSimple } from "../src/client/games/leanfront-simple/system";
import { leanfront } from "../src/client/games/leanfront/system";
import { getLiveGame, LIVE_GAMES } from "../src/client/games/registry";

describe("LeanFront sibling modes", () => {
  test("keeps original LeanFront live and mounts the simple GPU mode separately", () => {
    expect(LIVE_GAMES.map(({ id }) => id)).toEqual(["openfront", "leanfront"]);
    expect(getLiveGame("leanfront")).toBeDefined();
    expect(getLiveGame("leanfront-simple")).toBeUndefined();
    expect(leanfront.id).toBe("leanfront");
    expect(leanfrontSimple.id).toBe("leanfront-simple");
    expect(leanfrontSimple.name).toBe("LeanFront Simple");

    expect(existsSync("src/client/games/leanfront/runtime.ts")).toBe(true);
    expect(existsSync("src/client/games/leanfront-simple/system.ts")).toBe(
      true,
    );

    const shell = readFileSync("src/client/GameShellPage.ts", "utf8");
    expect(shell).toContain('from "./games/leanfront-simple/system"');
    expect(shell).toContain("composeTerrain(leanfrontSimple)");
  });
});
