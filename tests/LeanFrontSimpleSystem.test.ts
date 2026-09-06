import { openfront } from "../src/client/games/openfront/system";
import { leanfrontSimple } from "../src/client/games/leanfront-simple/system";

test("is a thin shared-Live render conduit", () => {
  expect(leanfrontSimple.params).toBe(openfront.params);
  expect(leanfrontSimple.players).toBe(openfront.players);
  expect(leanfrontSimple.views).toEqual({
    "leanfront-simple": { source: "views/livegame.wesl" },
  });
  expect(leanfrontSimple.modules["views/livegame.wesl"]).toContain("fn color");
});

test("has no field simulation or player intent surface", () => {
  expect(leanfrontSimple.phases).toBeUndefined();
  expect(leanfrontSimple.brushes).toBeUndefined();
  expect(leanfrontSimple.scalars).toBeUndefined();
  expect(leanfrontSimple.players?.outputs).toBeUndefined();
  expect(leanfrontSimple.input).toBeUndefined();
  expect(leanfrontSimple.ai).toBeUndefined();
});
