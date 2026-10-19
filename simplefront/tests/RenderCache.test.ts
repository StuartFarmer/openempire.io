import { beforeAll, expect, it, vi } from "vitest";
import * as mapViews from "../src/client/shell/MapLayerViews";

let GameShellPage: typeof import("../src/client/GameShellPage").GameShellPage;
beforeAll(async () => {
  ({ GameShellPage } = await import("../src/client/GameShellPage"));
});

function fixture() {
  const page = new GameShellPage() as any;
  page.systemId = "simplefront";
  page.mapWidth = page.mapHeight = 1024;
  page.bakedTintOn = true;
  page.inSpawn = true;
  page.paramValues = { maskFade: 0, hoveredPlayer: 0 };
  page.ownerScratch = new Uint32Array(1024 * 1024);
  for (const name of [
    "plotU32",
    "frontU32",
    "densityU32",
    "damageU32",
    "supplyU32",
  ])
    page[name] = new Uint32Array(1024 * 1024);
  page.plotBytes = new Uint8Array(1024 * 1024);
  const finish = vi.fn().mockResolvedValue({ gpuMs: 0, dispatches: 1 });
  page.kernel = {
    beginFrame: vi.fn(() => ({ finish })),
    writeUniform: vi.fn(),
    writeBuffer: vi.fn(),
    writeBufferU32Range: vi.fn(),
  };
  page.compiled = {
    runView: vi.fn(),
    runDerive: vi.fn(),
    writeParams: (params: Record<string, number>) =>
      new Float32Array([params.maskFade, params.hoveredPlayer]).buffer,
    playerCount: 0,
  };
  return { page, finish, runView: page.compiled.runView };
}

function workerFrame(page: any, fields: Record<string, unknown> = {}) {
  page.onWorkerFrame({
    mySmallID: 0,
    inSpawn: true,
    tick: 1,
    spawnAnchor: null,
    myStats: null,
    transportShips: new Uint32Array(),
    ...fields,
  });
}

it("skips HUD-only updates and repeated unchanged conduit data", async () => {
  const { page, runView } = fixture();
  await page.renderOpenfront();
  runView.mockClear();
  workerFrame(page);
  await page.renderOpenfront();
  expect(runView).not.toHaveBeenCalled();
  workerFrame(page, { plot: new Uint32Array([41000, 2]) });
  await page.renderOpenfront();
  expect(runView).toHaveBeenCalledTimes(1);
  workerFrame(page, {
    plot: new Uint32Array([41000, 2]),
    owner: new Uint32Array([41000, 0]),
    damage: new Uint32Array([41000]),
  });
  await page.renderOpenfront();
  expect(runView).toHaveBeenCalledTimes(1);
});

it("retains deltas received while a submission is pending", async () => {
  const { page, runView, finish } = fixture();
  await page.renderOpenfront();
  let resolve!: (value: unknown) => void;
  finish.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  workerFrame(page, { plot: new Uint32Array([41000, 2]) });
  const pending = page.renderOpenfront();
  expect(page.inFlight).toBe(true);
  workerFrame(page, { plot: new Uint32Array([41000, 1]) });
  resolve({});
  await pending;
  await page.renderOpenfront();
  expect(runView).toHaveBeenCalledTimes(3);
});

it("retries a failed submission as a full render", async () => {
  const { page, runView, finish } = fixture();
  await page.renderOpenfront();
  finish.mockRejectedValueOnce(new Error("submit failed"));
  workerFrame(page, { plot: new Uint32Array([41000, 2]) });
  await page.renderOpenfront();
  expect(page.inFlight).toBe(false);
  expect(page.needsRedraw).toBe(true);
  await page.renderOpenfront();
  expect(runView).toHaveBeenCalledTimes(3);
  expect(runView.mock.calls.at(-1)?.[2]).toBeUndefined();
});

it("does not let an old map completion clear a new map's in-flight state", async () => {
  const { page, finish } = fixture();
  let resolve!: (value: unknown) => void;
  finish.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = page.renderOpenfront();
  page.kernel = {};
  page.inFlight = true;
  resolve({});
  await pending;
  expect(page.inFlight).toBe(true);
});

it("teardown releases the old submission without clearing a later one", async () => {
  const { page, finish } = fixture();
  let resolveOld!: (value: unknown) => void;
  let resolveNew!: (value: unknown) => void;
  finish.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolveOld = r;
      }),
  );
  const old = page.renderOpenfront();
  page.destroySim();
  expect(page.inFlight).toBe(false);
  finish.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolveNew = r;
      }),
  );
  const next = page.renderOpenfront();
  resolveOld({});
  await old;
  expect(page.inFlight).toBe(true);
  resolveNew({});
  await next;
  expect(page.inFlight).toBe(false);
});

it("schedules an unsettled mask fade even while paused", async () => {
  const { page } = fixture();
  page.inSpawn = false;
  page.mySmallID = 1;
  page.myStats = { alive: true };
  page.running = false;
  for (let n = 0; n < 200 && page.paramValues.maskFade !== 1; n++) {
    page.needsRedraw = false;
    await page.renderOpenfront();
    if (page.paramValues.maskFade !== 1) expect(page.needsRedraw).toBe(true);
  }
  expect(page.paramValues.maskFade).toBe(1);
});

it("detects view parameters while paused and presents cached frames", async () => {
  const { page, runView } = fixture();
  await page.renderOpenfront();
  page.running = false;
  page.paramValues.hoveredPlayer = 3;
  await page.renderOpenfront();
  expect(runView).toHaveBeenCalledTimes(2);
  const render = vi.fn();
  page.renderer = {
    syncSize: () => false,
    fitScale: () => 1,
    mapWidth: 1024,
    mapHeight: 1024,
    render,
  };
  page.present();
  page.present();
  expect(render).toHaveBeenCalledTimes(2);
  expect(page.needsRedraw).toBe(true); // present cleared hoveredPlayer while paused
});

it("uploads plot types only when they change, independently of farm maturity", () => {
  const { page } = fixture();
  const writePlotTiles = vi.fn();
  page.renderer = { writePlotTiles, setTransportShips: vi.fn() };
  workerFrame(page, { plot: new Uint32Array([41000, 2]) });
  expect(writePlotTiles).toHaveBeenCalledTimes(1);
  expect(writePlotTiles.mock.calls[0][3]).toEqual([41000]);
  workerFrame(page, { plot: new Uint32Array([41000, 2 | (200 << 8)]) });
  expect(writePlotTiles).toHaveBeenCalledTimes(1);
});

it("invalidates after baked terrain loads and ignores a stale map load", async () => {
  const { page, runView } = fixture();
  page.mapWidth = page.mapHeight = 2;
  page.currentMapData = {};
  await page.renderOpenfront();
  const bitmap = vi.spyOn(mapViews, "buildViewBitmap");
  bitmap.mockResolvedValue({} as ImageBitmap);
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return {
          drawImage() {},
          getImageData: () => ({ data: new Uint8Array(16).fill(255) }),
        };
      }
    },
  );
  try {
    await page.uploadBakedTint();
    expect(page.kernel.writeBufferU32Range).toHaveBeenCalledWith(
      "tint",
      new Uint32Array(4).fill(0xffffff),
      0,
      3,
    );
    await page.renderOpenfront();
    expect(runView).toHaveBeenCalledTimes(2);
    let resolve!: (bitmap: ImageBitmap) => void;
    bitmap.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = page.uploadBakedTint();
    page.currentMapData = {};
    page.kernel.writeBufferU32Range.mockClear();
    resolve({} as ImageBitmap);
    await pending;
    expect(page.kernel.writeBufferU32Range).not.toHaveBeenCalled();
  } finally {
    bitmap.mockRestore();
    vi.unstubAllGlobals();
  }
});
