import { render } from "lit";
import { afterEach, expect, test, vi } from "vitest";
import approved from "../docs/city-local-palette.json";
import { GameShellPage } from "../src/client/GameShellPage";
import * as summaries from "../src/client/webgpu/CityDevelopmentUpdates";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import { cityDevelopmentState } from "../src/core/development/CityDevelopmentExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import {
  paintedResources,
  paintedState,
} from "../src/core/execution/utils/PaintedEconomy";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { SimpleFrontCityConfig } from "../src/core/game/Rulesets";
import { setup } from "./util/Setup";
import type { TestConfig } from "./util/TestConfig";

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

test("the ambient backdrop stops rendering and ticking off the homepage, then resumes", () => {
  const page = new GameShellPage() as any;
  page.ambient = true;
  page.systemId = "simplefront";
  page.running = true;
  page.kernel = {};
  const messages: any[] = [];
  page.worker = {
    postMessage: (message: any) => messages.push(message),
    terminate() {},
  };
  page.onWorkerMessage({
    type: "ready",
    popPerDensity: 1,
    fertility: new Uint8Array(),
    suitability: new Uint8Array(),
  });
  page.onAmbientPageChange(
    new CustomEvent("showPage", { detail: "page-shell" }),
  );
  expect(page.classList.contains("hidden")).toBe(true);
  expect(page.running).toBe(false);
  expect(messages[messages.length - 1]).toMatchObject({
    type: "running",
    running: false,
  });
  page.onAmbientPageChange(
    new CustomEvent("showPage", { detail: "page-play" }),
  );
  expect(page.classList.contains("hidden")).toBe(false);
  expect(page.running).toBe(true);
  expect(messages[messages.length - 1]).toMatchObject({
    type: "running",
    running: true,
  });
});

test("an ambient mount that finishes after navigation never starts a worker", async () => {
  const page = new GameShellPage() as any;
  page.ambient = true;
  page.systemId = "simplefront";
  let finishDerivation!: () => void;
  page.deriveTerrain = () =>
    new Promise<void>((resolve) => {
      finishDerivation = resolve;
    });
  const starts: boolean[] = [];
  // GPU derivation and worker creation are external boundaries; exercise real mount/navigation.
  page.startWorker = async () => {
    starts.push(page.running);
  };
  page.applyGameView = async () => {};
  page.uploadBakedTint = async () => {};
  const mounting = page.onSystemMounted({});
  page.onAmbientPageChange(
    new CustomEvent("showPage", { detail: "page-shell" }),
  );
  finishDerivation();
  await mounting;
  expect(starts).toEqual([]);
  expect(page.running).toBe(false);
  expect(page.classList.contains("hidden")).toBe(true);
  page.stepAmbient();
  expect(page.running).toBe(false);
});

test("navigation cancels a pending ambient worker import before it can prewarm", async () => {
  const sent: any[] = [];
  vi.doMock("../src/client/webgpu/ShellSim.worker.ts?worker&inline", () => ({
    default: class {
      postMessage(message: any) {
        sent.push(message);
      }
      terminate() {}
    },
  }));
  try {
    const page = new GameShellPage() as any;
    page.ambient = true;
    page.systemId = "simplefront";
    page.mapKey = "Verdantia";
    page.mapWidth = page.mapHeight = 10;
    const loading = page.startWorker();
    page.onAmbientPageChange(
      new CustomEvent("showPage", { detail: "page-shell" }),
    );
    await loading;
    expect(page.worker).toBeNull();
    expect(sent.filter((message) => message.type === "init")).toHaveLength(0);
  } finally {
    vi.doUnmock("../src/client/webgpu/ShellSim.worker.ts?worker&inline");
  }
});

test("normal SimpleFront launches with development while ambient and explicit overrides stay isolated", async () => {
  const sent: any[] = [];
  vi.doMock("../src/client/webgpu/ShellSim.worker.ts?worker&inline", () => ({
    default: class {
      postMessage(message: any) {
        sent.push(message);
      }
      terminate() {}
    },
  }));
  const page = new GameShellPage() as any;
  page.systemId = "simplefront";
  page.mapKey = "Verdantia";
  page.mapWidth = page.mapHeight = 10;
  await page.startWorker();
  expect(sent[sent.length - 1].cityDevelopment).toEqual(DEFAULT_CONFIG);
  history.replaceState(null, "", "/?city-development=1#shell");
  await page.startWorker();
  expect(sent[sent.length - 1].cityDevelopment).toEqual(DEFAULT_CONFIG);
  expect(page.cityDevelopmentConfig).toBeUndefined();
  page.ambient = true;
  await page.startWorker();
  expect(sent[sent.length - 1].cityDevelopment).toBeUndefined();
  page.ambient = false;
  page.setNextCityDevelopment({ ...DEFAULT_CONFIG, populationRate: 0.7 });
  await page.startWorker();
  expect(sent[sent.length - 1].cityDevelopment.populationRate).toBe(0.7);
  page.setNextCityDevelopment(undefined);
  await page.startWorker();
  expect(sent[sent.length - 1].cityDevelopment).toBeUndefined();
  vi.doUnmock("../src/client/webgpu/ShellSim.worker.ts?worker&inline");
});

class Config extends SimpleFrontCityConfig {
  setInertFood(): void {}
}
async function fixture() {
  const info = new PlayerInfo("city", PlayerType.Human, null, "city");
  const game = await setup(
    "plains",
    {},
    [info],
    undefined,
    Config as unknown as typeof TestConfig,
    false,
  );
  const centre = game.ref(50, 50);
  game.addExecution(new SpawnExecution("city-ui", info, centre));
  game.executeNextTick();
  game.executeNextTick();
  return { game, player: game.player(info.id), centre };
}

test("urban worker summary counts deployed population once and reads housing pressure without mutation", async () => {
  expect(summaries).toHaveProperty("cityDevelopmentSummary");
  const { game, player, centre } = await fixture();
  const read = (summaries as any).cityDevelopmentSummary;
  player.setTroops(6000);
  paintedState(player).pendingLandingTroops = 2000;
  const model = cityDevelopmentState(player)!.model;
  const before = model.deterministicState();
  expect(read(game, player, paintedResources(game, player))).toMatchObject({
    population: 8000,
    idle: 6000,
    deployed: 2000,
    housing: 10000,
    occupancy: 0.8,
    pressure: 0,
    status: "vacancies",
  });
  expect(
    read(game, player, paintedResources(game, player)).birthsPerSecond,
  ).toBeCloseTo(520);
  expect(model.deterministicState()).toEqual(before);
  player.setTroops(8000);
  expect(read(game, player, paintedResources(game, player))).toMatchObject({
    status: "construction",
    pressure: 1,
  });
  for (const tile of [...player.tiles()])
    if (tile !== centre) player.relinquish(tile);
  expect(read(game, player, paintedResources(game, player))).toMatchObject({
    status: "no-space",
    upgradeBlocked: true,
  });
  player.relinquish(centre);
  expect(read(game, player, paintedResources(game, player))).toMatchObject({
    housing: 10000,
    occupancy: 1,
    status: "waiting",
    birthsPerSecond: 0,
  });
});

test("unspawned urban summary waits rather than reporting survivors without housing", async () => {
  const info = new PlayerInfo("waiting", PlayerType.Human, null, "waiting");
  const game = await setup(
    "plains",
    {},
    [info],
    undefined,
    Config as unknown as typeof TestConfig,
    false,
  );
  const player = game.player(info.id);
  expect(
    (summaries as any).cityDevelopmentSummary(
      game,
      player,
      paintedResources(game, player),
    ).status,
  ).toBe("waiting");
});

test("survivors without development refill base vacancies before constructing", async () => {
  const { game, player, centre } = await fixture();
  player.relinquish(centre);
  expect(
    summaries.cityDevelopmentSummary(
      game,
      player,
      paintedResources(game, player),
    ),
  ).toMatchObject({
    housing: 10000,
    occupancy: player.troops() / 10000,
    pressure: 0,
    status: "vacancies",
  });
});

function pageFixture() {
  const page = new GameShellPage() as any;
  page.systemId = "simplefront";
  page.mapWidth = 10;
  page.mapHeight = 10;
  page.inSpawn = false;
  page.myStats = { alive: true };
  page.mySmallID = 1;
  page.showingGame = true;
  page.plotU32 = new Uint32Array(100);
  page.ownerScratch = new Uint32Array(100).fill(1);
  const messages: any[] = [];
  page.worker = { postMessage: (m: any) => messages.push(m), terminate() {} };
  page.onWorkerMessage({
    type: "ready",
    cityDevelopment: DEFAULT_CONFIG,
    popPerDensity: 1,
    fertility: new Uint8Array(),
    suitability: new Uint8Array(),
  });
  messages.length = 0;
  return { page, messages };
}

test("stale organic city tool cannot found a seed while farm gestures still collect a stroke", () => {
  const { page, messages } = pageFixture();
  page.buildType = UnitType.Settlement;
  expect(page.paintTool()).toBe(false);
  page.onStrokeStart();
  page.onTileGesture(2, 2, {});
  page.onTileGesture(2, 2, {});
  expect(messages).toEqual([]);
  page.plotU32[23] = 5 << 16;
  page.onStrokeStart();
  page.onTileGesture(3, 2, {});
  expect(messages).toHaveLength(0);
  page.buildType = UnitType.Farmland;
  expect(page.paintTool()).toBe(true);
  page.onStrokeStart();
  page.onTileGesture(4, 2, {});
  page.onTileGesture(5, 2, {});
  page.onStrokeEnd(false);
  expect(messages[0].intent).toEqual({
    type: "paint_tiles",
    kind: "farm",
    tiles: [24, 25],
  });
});

test("level labels use physical levels in the viewport and disappear at distant zoom", () => {
  const { page } = pageFixture();
  page.innerHTML =
    '<canvas id="shell-canvas" width="80" height="80"></canvas><div id="shell-labels"></div>';
  page.camera = { cx: 2, cy: 2, scale: 40 };
  page.plotU32[22] = (7 << 16) | 1;
  page.plotU32[99] = 20 << 16;
  expect(page.updateCityLevelLabels).toBeTypeOf("function");
  page.updateCityLevelLabels();
  const labels = page.querySelectorAll("[data-city-level]");
  expect(labels).toHaveLength(1);
  expect(labels[0].textContent).toBe("7");
  page.camera.scale = 4;
  page.updateCityLevelLabels();
  expect(page.querySelectorAll("[data-city-level]")).toHaveLength(0);
});

test("organic zoom can reach readable levels on high-DPI screens without changing ordinary zoom limits", () => {
  const { page } = pageFixture();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  page.renderer = { fitScale: () => 1 };
  page.framebufferPoint = () => ({ x: 0, y: 0 });
  page.camera = { cx: 2, cy: 2, scale: 32 };
  const event = {
    deltaY: -500,
    currentTarget: { width: 80, height: 80 },
    preventDefault() {},
  };
  page.onWheel(event);
  expect(page.camera.scale / 2).toBeGreaterThanOrEqual(24);
  page.renderer = null;
  page.onWorkerMessage({
    type: "ready",
    popPerDensity: 1,
    fertility: new Uint8Array(),
    suitability: new Uint8Array(),
  });
  page.renderer = { fitScale: () => 1 };
  page.onWheel(event);
  expect(page.camera.scale).toBe(32);
});

async function controls() {
  expect(customElements.get("city-development-controls")).toBeTypeOf(
    "function",
  );
  const el = document.createElement("city-development-controls") as any;
  el.config = DEFAULT_CONFIG;
  document.body.append(el);
  await el.updateComplete;
  return el;
}
async function input(el: HTMLElement, name: string, value: string) {
  const field = el.shadowRoot!.querySelector<HTMLInputElement>(
    `[name="${name}"]`,
  )!;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await (el as any).updateComplete;
}

test("housing controls display actual people and round-trip next-match model units", async () => {
  const el = await controls();
  const configs: any[] = [];
  el.addEventListener("city-next-match", (e: Event) =>
    configs.push((e as CustomEvent).detail),
  );
  const housing = el.shadowRoot.querySelector(
    '[name="ruralCapacity"]',
  ) as HTMLInputElement;
  const maturation = el.shadowRoot.querySelector(
    '[name="maturationScale"]',
  ) as HTMLInputElement;
  expect(housing.value).toBe("10000");
  expect(housing.min).toBe("1000");
  expect(housing.max).toBe("100000");
  expect(maturation.value).toBe("2000000");
  await input(el, "ruralCapacity", "20000");
  await input(el, "maturationScale", "3000000");
  el.shadowRoot.querySelector("[data-apply-next]").click();
  await el.updateComplete;
  expect(configs).toEqual([
    { ...DEFAULT_CONFIG, ruralCapacity: 200, maturationScale: 30000 },
  ]);
  el.config = configs[0];
  await el.updateComplete;
  expect(housing.value).toBe("20000");
  expect(maturation.value).toBe("3000000");
});

test("economic drafts validate the full config and apply only on an explicit next-match click", async () => {
  const el = await controls();
  const configs: any[] = [];
  el.addEventListener("city-next-match", (e: Event) =>
    configs.push((e as CustomEvent).detail),
  );
  await input(el, "populationRate", "0.6");
  expect(configs).toEqual([]);
  el.shadowRoot!.querySelector("[data-apply-next]")!.click();
  await el.updateComplete;
  expect(configs[0]).toEqual({ ...DEFAULT_CONFIG, populationRate: 0.6 });
  await input(el, "lowerLevel", "20");
  el.shadowRoot!.querySelector("[data-apply-next]")!.click();
  await el.updateComplete;
  expect(configs).toHaveLength(1);
  expect(el.shadowRoot!.querySelector('[role="alert"]')!.textContent).toContain(
    "Upper development",
  );
});

test("six live age anchors and 36 colours retain the last valid palette and restore the saved defaults", async () => {
  const el = await controls();
  const palettes: any[] = [];
  el.addEventListener("city-visuals", (e: Event) =>
    palettes.push((e as CustomEvent).detail),
  );
  expect(el.shadowRoot!.querySelectorAll('input[type="color"]')).toHaveLength(
    36,
  );
  await input(el, "age-1", "1");
  expect(palettes).toEqual([]);
  await input(el, "age-1", "3");
  expect(palettes[0].levels[1]).toBe(3);
  await input(el, "color-0-ground", "#112233");
  expect(palettes[1].styles[0].ground).toBe("#112233");
  el.shadowRoot!.querySelector("[data-reset-visuals]")!.click();
  await el.updateComplete;
  expect(palettes[2]).toEqual({
    levels: approved.ageLevels,
    styles: approved.palettes,
  });
});

test("HUD renders authoritative no-housing survivors and next-match UI only for active organic mode", async () => {
  const { page } = pageFixture();
  page.myStats = {
    alive: true,
    urban: {
      population: 80,
      idle: 60,
      deployed: 20,
      housing: 0,
      occupancy: null,
      birthsPerSecond: 0,
      pressure: 1,
      status: "no-housing",
      upgradeBlocked: false,
    },
  };
  const host = document.createElement("div");
  render(page.renderCityControls(), host);
  const ui = host.querySelector("city-development-controls") as any;
  expect(ui).not.toBeNull();
  document.body.append(host);
  await ui.updateComplete;
  expect(ui.shadowRoot.textContent).toContain("No housing");
  page.onWorkerMessage({
    type: "ready",
    popPerDensity: 1,
    fertility: new Uint8Array(),
    suitability: new Uint8Array(),
  });
  render(page.renderCityControls(), host);
  expect(host.querySelector("city-development-controls")).toBeNull();
});

test("saved next-match drafts and live visual choices remain correct when controls remount", async () => {
  const { page } = pageFixture();
  const host = document.createElement("div");
  document.body.append(host);
  render(page.renderCityControls(), host);
  let ui = host.querySelector("city-development-controls") as any;
  await ui.updateComplete;
  await input(ui, "populationRate", "0.7");
  ui.shadowRoot.querySelector("[data-apply-next]").click();
  await input(ui, "age-1", "3");
  await input(ui, "color-0-ground", "#112233");
  expect(page.cityDevelopmentConfig.populationRate).toBe(0.2);
  render(null, host);
  render(page.renderCityControls(), host);
  ui = host.querySelector("city-development-controls") as any;
  await ui.updateComplete;
  expect(ui.shadowRoot.querySelector('[name="populationRate"]').value).toBe(
    "0.7",
  );
  expect(ui.shadowRoot.querySelector('[name="age-1"]').value).toBe("3");
  expect(ui.shadowRoot.querySelector('[name="color-0-ground"]').value).toBe(
    "#112233",
  );
});

test("pending organic settings go only to the next selected SimpleFront worker and clear active presentation", async () => {
  const sent: any[] = [];
  vi.doMock("../src/client/webgpu/ShellSim.worker.ts?worker&inline", () => ({
    default: class {
      postMessage(message: any) {
        sent.push(message);
      }
      terminate() {}
    },
  }));
  const { page } = pageFixture();
  page.mapKey = "Verdantia";
  page.setNextCityDevelopment({ ...DEFAULT_CONFIG, populationRate: 0.7 });
  await page.startWorker();
  expect(sent[sent.length - 1]).toMatchObject({
    type: "init",
    ruleset: "simplefront",
    cityDevelopment: { populationRate: 0.7 },
  });
  page.onWorkerMessage({
    type: "ready",
    cityDevelopment: DEFAULT_CONFIG,
    popPerDensity: 1,
    fertility: new Uint8Array(),
    suitability: new Uint8Array(),
  });
  page.systemId = "openfront";
  // The release-gated picker currently registers only SimpleFront. Model an
  // alternate selected worker at that registry boundary without adding an entry.
  vi.spyOn(page, "selectedLiveGame").mockReturnValue({ id: "openfront" });
  await page.startWorker();
  expect(sent[sent.length - 1]).toMatchObject({
    type: "init",
    ruleset: "openfront",
    cityDevelopment: undefined,
  });
  expect(page.cityDevelopmentConfig).toBeUndefined();
  vi.doUnmock("../src/client/webgpu/ShellSim.worker.ts?worker&inline");
});
