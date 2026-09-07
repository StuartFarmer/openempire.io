import { render } from "lit";
import { beforeAll, expect, test, vi } from "vitest";
import { CameraRenderer } from "../src/client/shell/CameraRenderer";
import { translateText } from "../src/client/Utils";
import { UnitType } from "../src/core/game/Game";

let GameShellPage: typeof import("../src/client/GameShellPage").GameShellPage;
beforeAll(async () => {
  ({ GameShellPage } = await import("../src/client/GameShellPage"));
});

function pageFixture() {
  // Exercise the page's real gesture/HUD methods; replace only the worker transport.
  const page = new GameShellPage() as any;
  const messages: unknown[] = [];
  page.systemId = "simplefront";
  page.mapWidth = 10;
  page.mapHeight = 10;
  page.worker = {
    postMessage: (message: unknown) => messages.push(message),
    terminate() {},
  };
  page.inSpawn = false;
  page.myStats = {
    alive: true,
    troops: 1500,
    food: 4000,
    population: 2000,
    tiles: 100,
    farmSeeds: 0,
    settlementSeeds: 0,
    painted: {
      foodMilli: 4_000_000n,
      foodCapacityMilli: 10_000_000n,
      foodGainMilli: 8400,
      idleTroops: 1500,
      deployedTroops: 500,
      totalTroops: 2000,
      troopCapacity: 10000,
      troopGain: 5.6,
      farms: 1,
      cities: 1,
    },
  };
  return { page, messages };
}

test.each([true, false])(
  "SimpleFront provides a homepage exit with GPU support %s",
  (supported) => {
    const { page } = pageFixture();
    const container = document.createElement("div");
    const support = vi
      .spyOn(CameraRenderer, "isSupported")
      .mockReturnValue(supported);
    try {
      render(page.render(), container);
      const homeSelector = `a[aria-label="${translateText("play_page.back_home")}"]`;
      expect(container.querySelector(homeSelector)?.getAttribute("href")).toBe(
        "/",
      );
      page.ambient = true;
      render(page.render(), container);
      expect(container.querySelector(homeSelector)).toBeNull();
    } finally {
      support.mockRestore();
    }
  },
);

test("SimpleFront opens on the calibrated Verdantia map", async () => {
  const { FieldViewerBase } =
    await import("../src/client/viewer/FieldViewerBase");
  const base = vi
    .spyOn(FieldViewerBase.prototype, "connectedCallback")
    .mockImplementation(() => {});
  const { page } = pageFixture();
  page.connectedCallback();
  expect(page.mapKey).toBe("Verdantia");
  page.disconnectedCallback();
  base.mockRestore();
});

test("painting previews without sending, then commits one ordered stroke", () => {
  const { page, messages } = pageFixture();
  page.buildType = UnitType.Farmland;
  page.onStrokeStart();
  page.onTileGesture(1, 1, {});
  page.onTileGesture(4, 1, {});
  expect(messages).toEqual([]);
  page.onStrokeEnd(false);
  expect(messages).toEqual([
    {
      type: "intent",
      intent: { type: "paint_tiles", kind: "farm", tiles: [11, 12, 13, 14] },
    },
  ]);
});

test("cancel discards preview and empty seed banks never deselect the brush", () => {
  const { page, messages } = pageFixture();
  page.buildType = UnitType.Settlement;
  page.applyMyStats(page.myStats);
  expect(page.buildType).toBe(UnitType.Settlement);
  page.onStrokeStart();
  page.onTileGesture(1, 1, {});
  page.onStrokeEnd(true);
  expect(messages).toEqual([]);
});

test("HUD explains the global resource model and active opponents", () => {
  const { page } = pageFixture();
  const container = document.createElement("div");
  render(page.renderPlayerHud(), container);
  for (const label of [
    "Paint Farm",
    "Paint City",
    "Attack",
    "Food",
    "Troops",
    "Idle",
    "Deployed",
    "Active opponents",
  ])
    expect(container.textContent).toContain(label);
  expect(container.textContent).not.toMatch(/seed|starv|worker|maturity/i);
});

test("difficulty is persisted for next match without restarting the worker", () => {
  const { page, messages } = pageFixture();
  localStorage.setItem("openfront:match.difficulty", "Easy");
  page.setMatchDifficulty("Hard");
  expect(localStorage.getItem("simplefront:match.difficulty")).toBe("Hard");
  expect(localStorage.getItem("openfront:match.difficulty")).toBe("Easy");
  expect(messages).toEqual([]);
  expect(pageFixture().page.matchDifficulty).toBe("Hard");
});

test("completed match cancels strokes, blocks actions and clears on reset", () => {
  const { page, messages } = pageFixture();
  page.buildType = UnitType.Farmland;
  page.onStrokeStart();
  page.onTileGesture(1, 1, {});
  page.onWorkerFrame({
    matchResult: {
      winnerID: "enemy",
      winnerName: "Rival",
      humanWon: false,
      elapsedSeconds: 651,
    },
  });
  page.onStrokeEnd(false);
  page.toggleRunning();
  page.onTileGesture(2, 2, {});
  expect(messages).toEqual([]);
  const container = document.createElement("div");
  render(page.renderPlayerHud(), container);
  expect(container.textContent).toContain("Defeat");
  expect(container.textContent).toContain("Rival");
  expect(container.textContent).toContain("10:51");
  page.ambient = true;
  render(page.renderPlayerHud(), container);
  expect(container.textContent).not.toContain("Defeat");
  page.destroySim();
  expect(page.matchResult).toBeNull();
  expect(page.paintStroke).toBeNull();
});

test("authoritative partial feedback does not invent a local debit", () => {
  const { page } = pageFixture();
  const before = page.myStats.painted.foodMilli;
  page.onWorkerFrame({
    paintResults: [
      {
        placed: [11, 12],
        skipped: 1,
        spentMilli: 4_000_000n,
        stoppedUnaffordable: true,
      },
    ],
  });
  expect(page.status).toContain("Tiles painted: 2");
  expect(page.status).toContain("insufficient food");
  expect(page.myStats.painted.foodMilli).toBe(before);
});

test("pointer cancel uses the cancellation hook and sends no purchase", () => {
  const { page, messages } = pageFixture();
  page.buildType = UnitType.Farmland;
  page.onStrokeStart();
  page.onTileGesture(1, 1, {});
  page.painting = true;
  page.onPointerUp({ type: "pointercancel" });
  expect(messages).toEqual([]);
  expect(page.painting).toBe(false);
});
