import { describe, expect, test } from "vitest";

import { PLAYABLE_GAMES } from "../src/client/games/experience";
import { getLiveGame, LIVE_GAMES } from "../src/client/games/registry";

describe("LeanFront sibling modes", () => {
  test("registers three separate worker-backed Live games", () => {
    expect(LIVE_GAMES.map(({ id }) => id)).toEqual([
      "openfront",
      "leanfront",
      "leanfront-simple",
    ]);
    expect(getLiveGame("leanfront-simple")?.system.id).toBe("leanfront-simple");
    expect(
      PLAYABLE_GAMES.find(({ id }) => id === "leanfront-simple")?.backend,
    ).toBe("worker");
  });
});
