import { html, render } from "lit";
import { beforeAll, describe, expect, test, vi } from "vitest";

let GameShellPage: typeof import("../src/client/GameShellPage").GameShellPage;

beforeAll(async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  ({ GameShellPage } = await import("../src/client/GameShellPage"));
  warning.mockRestore();
});

function workerPage(id: "openfront" | "leanfront" | "leanfront-simple") {
  const page = new GameShellPage() as any;
  page.systemId = id;
  page.mapWidth = 10;
  page.mapHeight = 10;
  page.worker = { postMessage: vi.fn() };
  page.inSpawn = false;
  page.myStats = { alive: true };
  return page;
}

describe("universal game shell lifecycle", () => {
  test("shows every completed field tick without waiting for scalar readback", async () => {
    let finish!: () => void;
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.derivedOk = false;
    page.showingGame = true;
    page.tickReadout = 0;
    page.tickCount = 0;
    page.kernel = {
      writeUniform: vi.fn(),
      beginFrame: () => ({
        pass: vi.fn(),
        finish: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      }),
    };
    page.compiled = {
      system: { id: "conquest" },
      layerNames: ["owner"],
      writeParams: () => new ArrayBuffer(0),
      runTick: vi.fn(),
      runView: vi.fn(),
    };

    page.advance(1);
    expect(page.tickReadout).toBe(0);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(page.tickReadout).toBe(1);
  });

  test("starts the spawn camera from the accepting worker frame", () => {
    const page = new GameShellPage() as any;
    page.systemId = "leanfront-simple";
    page.mapWidth = 10;
    page.mapHeight = 10;
    page.inSpawn = true;
    page.kernel = { writeBufferU32Range: vi.fn() };
    page.ownerScratch = new Uint32Array(100);

    page.onWorkerFrame({
      type: "frame",
      tick: 1,
      inSpawn: false,
      mySmallID: 1,
      owner: null,
      plot: null,
      front: null,
      density: null,
      damage: null,
      supply: null,
      burns: null,
      stats: null,
      transportShips: new Int32Array(),
      names: null,
      myStats: null,
      fronts: null,
      spawnAnchor: 35,
      nationSpawns: [{ x: 1, y: 2, name: "Aster" }],
    });

    expect(page.cameraTween).toEqual({ cx: 5.5, cy: 3.5, scale: 20 });
    expect(page.nationSpawns).toEqual([{ x: 1, y: 2, name: "Aster" }]);
  });

  test.each([
    ["openfront", true, "openfront"],
    ["leanfront", true, "leanfront"],
    ["leanfront-simple", true, "leanfront-simple"],
    ["conquest", false, "conquest"],
    ["empire", false, "empire"],
  ] as const)(
    "auto-starts %s in its game view",
    async (id, workerBacked, view) => {
      const page = new GameShellPage() as any;
      page.systemId = id;
      page.deriveTerrain = vi.fn().mockResolvedValue(undefined);
      page.destroySim = vi.fn();
      page.startWorker = vi.fn().mockResolvedValue(undefined);
      page.applyGameView = vi.fn().mockResolvedValue(undefined);

      await page.onSystemMounted({
        manifest: vi.fn().mockResolvedValue({ nations: [] }),
      } as never);

      expect(page.startWorker).toHaveBeenCalledTimes(workerBacked ? 1 : 0);
      expect(page.applyGameView).toHaveBeenCalledWith(view);
      expect(page.running).toBe(true);
      expect(page.inSpawn).toBe(true);
      expect(page.tool).toBe("pan");
    },
  );

  test("uses a field game's native spawn and attack commands", () => {
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.mapWidth = 10;
    page.mapHeight = 10;
    page.compiled = { localPlayer: 1 };
    page.kernel = {};
    page.hoverFields = { waterMask: new Uint32Array(100) };
    page.stampBrush = vi.fn();
    page.mergePlayerIntent = vi.fn();
    page.inSpawn = true;

    expect(page.onTileGesture(3, 4, {} as PointerEvent)).toBe(true);
    expect(page.stampBrush).toHaveBeenCalledWith("spawnP1", 3, 4);
    expect(page.inSpawn).toBe(false);
    expect(page.cameraTween).toEqual({ cx: 3.5, cy: 4.5, scale: 20 });

    expect(page.onTileGesture(8, 6, {} as PointerEvent)).toBe(true);
    expect(page.mergePlayerIntent).toHaveBeenCalledWith(1, {
      alive: 1,
      attacking: 1,
      commit: 0.6,
      targetX: 8,
      targetY: 6,
    });
  });

  test("routes simple plot actions through the live worker", () => {
    const page = workerPage("leanfront-simple");
    for (const action of ["city", "farm", "raze"] as const) {
      page.fieldAction = action;
      expect(page.onTileGesture(3, 4, {} as PointerEvent)).toBe(true);
      expect(page.worker.postMessage).toHaveBeenLastCalledWith({
        type: "plot_action",
        action,
        tile: 43,
      });
    }
  });

  test("keeps Simple attack cancellation on the worker intent path", () => {
    const page = workerPage("leanfront-simple");
    page.myStats = { alive: true, activeAttackID: "attack-7" };
    const host = document.createElement("div");
    render(page.renderPlayerHud(), host);

    [...host.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "stop")
      ?.dispatchEvent(new MouseEvent("click"));

    expect(page.worker.postMessage).toHaveBeenLastCalledWith({
      type: "intent",
      intent: { type: "cancel_attack", attackID: "attack-7" },
    });
  });

  test("rejects a field spawn on water without leaving spawn mode", () => {
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.mapWidth = 2;
    page.mapHeight = 2;
    page.compiled = { localPlayer: 1 };
    page.kernel = {};
    page.hoverFields = { waterMask: new Uint32Array([0, 2, 0, 0]) };
    page.stampBrush = vi.fn();
    page.inSpawn = true;

    expect(page.onTileGesture(1, 0, {} as PointerEvent)).toBe(true);
    expect(page.stampBrush).not.toHaveBeenCalled();
    expect(page.inSpawn).toBe(true);
    expect(page.status).toBe("Spawn rejected: choose land");
  });

  test("rejects an occupied field spawn from the bounded hover result", () => {
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.mapWidth = 2;
    page.mapHeight = 2;
    page.compiled = { localPlayer: 1 };
    page.kernel = {};
    page.hoverFields = { waterMask: new Uint32Array(4) };
    page.fieldHover = { tile: 2, owner: 3, values: { owner: 3 } };
    page.stampBrush = vi.fn();
    page.inSpawn = true;

    expect(page.onTileGesture(0, 1, {} as PointerEvent)).toBe(true);
    expect(page.stampBrush).not.toHaveBeenCalled();
    expect(page.inSpawn).toBe(true);
    expect(page.status).toBe("Spawn rejected: tile is occupied");
  });

  test("rejects a brush spawn inside an AI starting territory", () => {
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.mapWidth = 20;
    page.mapHeight = 20;
    page.compiled = { localPlayer: 1 };
    page.kernel = {};
    page.hoverFields = { waterMask: new Uint32Array(400) };
    page.nationSpawns = [{ x: 10, y: 10, name: "Aster" }];
    page.stampBrush = vi.fn();
    page.inSpawn = true;

    expect(page.onTileGesture(13, 10, {} as PointerEvent)).toBe(true);
    expect(page.stampBrush).not.toHaveBeenCalled();
    expect(page.status).toBe("Spawn rejected: tile is occupied");
  });

  test("routes pause and turbo through worker and GPU backends", () => {
    const field = new GameShellPage() as any;
    field.systemId = "conquest";
    field.running = true;
    field.accumulator = 7;
    field.toggleRunning();
    field.setTurbo(true);
    expect(field.running).toBe(false);
    expect(field.turbo).toBe(true);
    expect(field.accumulator).toBe(0);

    const worker = new GameShellPage() as any;
    worker.systemId = "leanfront-simple";
    worker.running = true;
    worker.postWorker = vi.fn();
    worker.toggleRunning();
    worker.setTurbo(true);
    expect(worker.postWorker.mock.calls).toEqual([
      [{ type: "running", running: false, turbo: false }],
      [{ type: "running", running: false, turbo: true }],
    ]);
  });

  test("restarts a field game through its own lifecycle", async () => {
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.kernel = {};
    page.running = true;
    page.inSpawn = false;
    page.status = "Action rejected: old";
    page.history.set(1, { troops: [1], tiles: [1], food: [1], balance: [0] });
    page.fieldHover = { tile: 3, owner: 2, values: { owner: 2 } };
    page.nationSpawns = [{ x: 1, y: 1, name: "Aster" }];
    page.paramValues.hoveredPlayer = 2;
    page.cameraTween = { cx: 1, cy: 1, scale: 10 };
    page.resetState = vi.fn().mockResolvedValue(undefined);
    page.beginFieldGame = vi.fn();
    page.applyGameView = vi.fn().mockResolvedValue(undefined);

    await page.restartSim();

    expect(page.resetState).toHaveBeenCalledOnce();
    expect(page.beginFieldGame).toHaveBeenCalledOnce();
    expect(page.applyGameView).toHaveBeenCalledWith("conquest");
    expect(page.running).toBe(true);
    expect(page.inSpawn).toBe(true);
    expect(page.history.size).toBe(0);
    expect(page.status).toBe("");
    expect(page.fieldHover).toBeNull();
    expect(page.nationSpawns).toEqual([]);
    expect(page.paramValues.hoveredPlayer).toBe(0);
    expect(page.cameraTween).toBeNull();
  });

  test("advances the common camera and mask transition for a field game", () => {
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.kernel = {};
    page.compiled = {};
    page.stepMaskFade = vi.fn();
    page.stepCameraTween = vi.fn();
    page.beginSimulationBatch = vi.fn(() => 0);

    page.advance(1);

    expect(page.stepMaskFade).toHaveBeenCalledOnce();
    expect(page.stepCameraTween).toHaveBeenCalledOnce();
  });

  test("renders the shared HUD with LeanFront Simple resources and actions", () => {
    const page = new GameShellPage() as any;
    page.systemId = "leanfront-simple";
    page.inSpawn = false;
    page.myStats = {
      troops: 18,
      population: 18,
      food: 9,
      starved: 0,
      tiles: 3,
      alive: true,
      farmSeeds: 0,
      settlementSeeds: 0,
    };
    const host = document.createElement("div");

    render(page.renderPlayerHud(), host);

    expect(host.textContent).toContain("people");
    expect(host.textContent).toContain("food");
    expect(host.textContent).toContain("tiles");
    expect(host.textContent).toContain("city");
    expect(host.textContent).toContain("farm");
    expect(host.textContent).toContain("raze");
  });

  test("presents LeanFront Simple people, food, and capacity as whole units", () => {
    const page = new GameShellPage() as any;
    page.systemId = "leanfront-simple";
    page.inSpawn = false;
    page.mapWidth = 10;
    page.myStats = {
      troops: 18.6,
      population: 18.6,
      food: 9.4,
      starved: 0,
      tiles: 3,
      alive: true,
      farmSeeds: 0,
      settlementSeeds: 0,
    };
    page.simplePlots.set(43, {
      kind: 1,
      level: 1,
      stock: 18.6,
      capacity: 100,
      growth: 4.2,
    });
    page.ownerScratch = new Uint32Array(100);
    page.ownerScratch[43] = 1;
    const host = document.createElement("div");

    render(page.renderPlayerHud(), host);

    const text = host.textContent?.replace(/\s/g, "");
    expect(text).toContain("people19");
    expect(text).toContain("food9");
    expect(page.leanfrontHoverRows(3, 4)).toEqual(
      expect.arrayContaining([
        ["people", "19"],
        ["capacity", "100"],
      ]),
    );
  });

  test("does not duplicate field resources and commitment in the tuning panel", () => {
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.inSpawn = false;
    page.compiled = {
      localPlayer: 1,
      playerFieldNames: ["commit"],
      paramList: [],
    };
    page.scalarReadout = {
      totalPeople: [0, 18],
      totalFood: [0, 9],
    };
    page.playerOutputReadout = [{}, { foodSpendFx: 256 }];
    const host = document.createElement("div");

    render(html`${page.renderPlayerHud()}${page.renderSimPanel()}`, host);

    expect(
      host.querySelectorAll('[aria-label="Attack commitment"]'),
    ).toHaveLength(1);
    expect(host.textContent?.match(/population/g)).toHaveLength(1);
  });

  test("shows a worker nation's stable identity beside the hovered tile", () => {
    const page = new GameShellPage() as any;
    page.innerHTML =
      '<canvas id="shell-canvas"></canvas><div id="shell-labels"></div>';
    page.systemId = "leanfront-simple";
    page.mapWidth = 10;
    page.inSpawn = false;
    page.mySmallID = 1;
    page.hoverTile = { x: 3, y: 4 };
    page.hoverClient = { x: 30, y: 40 };
    page.ownerScratch = new Uint32Array(100);
    page.ownerScratch[43] = 2;
    page.playerFill[2] = 0x4c96e0;
    page.playerName.set(2, "Aster");
    page.playerStat.set(2, {
      troops: 12,
      tiles: 2,
      alive: true,
      food: 5,
      production: 0,
      consumption: 0,
    });

    page.updateHoverChip();

    const chip = page.querySelector("#shell-labels div") as HTMLDivElement;
    expect(chip.textContent).toContain("Aster · 12");
    expect(chip.style.color).toBe("rgb(76, 150, 224)");
    expect(page.paramValues.hoveredPlayer).toBe(2);
  });

  test("uses the Live border-segment highlight for a worker game", () => {
    const page = new GameShellPage() as any;
    page.systemId = "leanfront-simple";
    page.mapWidth = 10;
    page.mapHeight = 10;
    page.inSpawn = false;
    page.buildType = null;
    page.mySmallID = 1;
    page.myStats = { alive: true };
    page.hoverTile = { x: 8, y: 5 };
    page.hoverFields = { waterMask: new Uint32Array(100) };
    page.myBorderTiles = [42, 43, 44, 52, 54, 62, 63, 64];
    page.highlightU32 = new Uint32Array(100);
    page.kernel = { writeBufferU32Range: vi.fn() };

    page.updateSegmentHighlight(true);

    expect(page.litHighlight.length).toBeGreaterThan(0);
    for (const tile of page.litHighlight) {
      expect(page.highlightU32[tile]).toBe(255);
    }
  });

  test("reports valid and invalid field targets and renders defeat", () => {
    const page = new GameShellPage() as any;
    page.systemId = "conquest";
    page.mapWidth = 10;
    page.mapHeight = 10;
    page.compiled = { localPlayer: 1 };
    page.hoverFields = { waterMask: new Uint32Array(100) };
    page.fieldHover = { tile: 43, owner: 2, values: { owner: 2 } };
    page.inSpawn = false;

    expect(page.fieldTargetFeedback(3, 4)).toBe("valid attack");
    page.fieldHover.owner = 1;
    expect(page.fieldTargetFeedback(3, 4)).toBe("invalid · yours");
    page.hoverFields.waterMask[43] = 2;
    expect(page.fieldTargetFeedback(3, 4)).toBe("invalid · water");

    page.myStats = {
      troops: 0,
      population: 0,
      food: 0,
      starved: 0,
      tiles: 0,
      alive: false,
      farmSeeds: 0,
      settlementSeeds: 0,
    };
    const host = document.createElement("div");
    render(page.renderPlayerHud(), host);
    expect(host.textContent).toContain("Defeated");
    expect(host.textContent).not.toContain("city");
  });
});
