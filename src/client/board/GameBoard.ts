import { EventBus } from "../../core/EventBus";
import {
  ClientID,
  GameStartInfo,
  Intent,
  StampedIntent,
  Turn,
} from "../../core/Schemas";
import { Config } from "../../core/configuration/Config";
import { boardMapFromGameMap } from "../../core/game/BoardMap";
import { GameMapLoader } from "../../core/game/GameMapLoader";
import {
  loadTerrainMap,
  TerrainMapData,
} from "../../core/game/TerrainMapLoader";
import {
  GRAPHICS_KEY,
  USER_SETTINGS_CHANGED_EVENT,
  UserSettings,
} from "../../core/game/UserSettings";
import { WorkerClient } from "../../core/worker/WorkerClient";
import { InputHandler, ToggleRenderDebugGuiEvent } from "../InputHandler";
import { TransformHandler } from "../TransformHandler";
import { UIState } from "../UIState";
import { WebGLFrameBuilder } from "../WebGLFrameBuilder";
import {
  applyGraphicsOverrides,
  createRenderSettings,
  deepAssign,
  GLUnavailableError,
  MapRenderer,
  preloadAtlasData,
  renderDpr,
  showGLGate,
  trackGLInit,
  type RenderSettings,
} from "../render/gl";
import { ALL_UNIT_TYPES, UnitState } from "../render/types";
import { GameView } from "../view";
import { MoveWarshipIntentEvent } from "./BoardEvents";
import {
  loadTerrainColorSidecar,
  withTerrainColorSidecar,
} from "./TerrainColorSidecar";

export interface BoardRenderer {
  transformHandler: TransformHandler;
  uiState: UIState;
  initialize(): void;
  tick(): void;
  dispose?(): void;
}

export type BoardRendererFactory = (
  inputEl: HTMLElement,
  game: GameView,
  eventBus: EventBus,
  playerRole: string | null,
  view: MapRenderer,
) => BoardRenderer;

export interface BoardTurnAdapter {
  start?(hooks: { onTurn: (turn: Turn) => void }): void;
  sendIntent?(intent: Intent): void;
  dispose?(): void;
}

export interface GameBoardOptions {
  container: HTMLElement;
  eventBus: EventBus;
  gameStartInfo: GameStartInfo;
  clientID: ClientID | undefined;
  playerName: string;
  playerClanTag: string | null;
  playerRole: string | null;
  userSettings: UserSettings;
  isReplay?: boolean;
  terrainLoad?: Promise<TerrainMapData> | null;
  mapLoader: GameMapLoader;
  createRenderer?: BoardRendererFactory;
  turnAdapter?: BoardTurnAdapter | false;
}

export interface GameBoardHandle {
  gameView: GameView;
  worker: WorkerClient;
  input: InputHandler;
  renderer: BoardRenderer;
  webglBuilder: WebGLFrameBuilder;
  sendIntent(intent: Intent): void;
  dispose(): void;
}

export function createBoardDom(container: HTMLElement): {
  glCanvas: HTMLCanvasElement;
  inputOverlay: HTMLElement;
  dispose(): void;
} {
  const glCanvas = document.createElement("canvas");
  glCanvas.id = "webgl-debug-canvas";
  glCanvas.style.position = "fixed";
  glCanvas.style.left = "0";
  glCanvas.style.top = "0";
  glCanvas.style.width = "100%";
  glCanvas.style.height = "100%";
  glCanvas.style.touchAction = "none";
  glCanvas.style.pointerEvents = "none";

  const inputOverlay = document.createElement("div");
  inputOverlay.id = "game-input-overlay";
  inputOverlay.style.position = "fixed";
  inputOverlay.style.left = "0";
  inputOverlay.style.top = "0";
  inputOverlay.style.width = "100%";
  inputOverlay.style.height = "100%";
  inputOverlay.style.touchAction = "none";

  container.insertBefore(glCanvas, container.firstChild);
  container.appendChild(inputOverlay);

  return {
    glCanvas,
    inputOverlay,
    dispose: () => {
      glCanvas.remove();
      inputOverlay.remove();
    },
  };
}

class MinimalBoardRenderer implements BoardRenderer {
  public readonly transformHandler: TransformHandler;
  public readonly uiState: UIState = {
    attackRatio: 20,
    ghostStructure: null,
    rocketDirectionUp: true,
  };

  constructor(inputEl: HTMLElement, game: GameView, eventBus: EventBus) {
    this.transformHandler = new TransformHandler(game, eventBus, inputEl);
  }

  initialize(): void {
    window.addEventListener("resize", this.onResize);
    this.transformHandler.centerAll(0.9);
  }

  tick(): void {}

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
  }

  private onResize = (): void => {
    this.transformHandler.updateCanvasBoundingRect();
  };
}

export async function createGameBoard(
  options: GameBoardOptions,
): Promise<GameBoardHandle> {
  const config = new Config(
    options.gameStartInfo.config,
    options.userSettings,
    options.isReplay ?? false,
  );
  const terrainMap =
    options.terrainLoad !== undefined && options.terrainLoad !== null
      ? await options.terrainLoad
      : await loadTerrainMap(
          options.gameStartInfo.config.gameMap,
          options.mapLoader,
        );

  const atlasDataLoad = preloadAtlasData();
  const worker = new WorkerClient(options.gameStartInfo, options.clientID);
  await worker.initialize();
  await atlasDataLoad;

  const gameView = new GameView(
    worker,
    config,
    terrainMap,
    options.clientID,
    options.playerName,
    options.playerClanTag,
    options.gameStartInfo.gameID,
    options.gameStartInfo.players,
  );

  const dom = createBoardDom(options.container);
  const graphicsListenerAbort = new AbortController();
  const { view, cachedWebGLFrameCallback } = await createWebGLView(
    dom.glCanvas,
    terrainMap,
    config,
    resolveRenderSettings(options.userSettings),
  );

  const renderer =
    options.createRenderer?.(
      dom.inputOverlay,
      gameView,
      options.eventBus,
      options.playerRole,
      view,
    ) ?? new MinimalBoardRenderer(dom.inputOverlay, gameView, options.eventBus);

  const { builder: webglBuilder, stopFrameLoop } = mountWebGLFrameLoop(
    terrainMap,
    view,
    dom.glCanvas,
    cachedWebGLFrameCallback,
    renderer.transformHandler,
    gameView,
    options.eventBus,
  );

  installGraphicsListeners(
    view,
    webglBuilder,
    gameView,
    options.eventBus,
    options.userSettings,
    graphicsListenerAbort,
  );

  const turnAdapter =
    options.turnAdapter === false
      ? null
      : (options.turnAdapter ?? createLocalTurnAdapter(options.clientID));
  turnAdapter?.start?.({ onTurn: (turn) => worker.sendTurn(turn) });

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    turnAdapter?.dispose?.();
    graphicsListenerAbort.abort();
    renderer.dispose?.();
    stopFrameLoop();
    view.dispose();
    worker.cleanup();
    dom.dispose();
  };

  return {
    gameView,
    worker,
    input: new InputHandler(
      gameView,
      renderer.uiState,
      dom.inputOverlay,
      options.eventBus,
    ),
    renderer,
    webglBuilder,
    sendIntent: (intent) => turnAdapter?.sendIntent?.(intent),
    dispose,
  };
}

function resolveRenderSettings(userSettings: UserSettings): RenderSettings {
  const settings = createRenderSettings();
  applyGraphicsOverrides(settings, userSettings.graphicsOverrides());
  return settings;
}

function createLocalTurnAdapter(
  clientID: ClientID | undefined,
): BoardTurnAdapter {
  let turnNumber = 0;
  let intents: StampedIntent[] = [];
  let interval: number | null = null;

  return {
    start({ onTurn }) {
      interval = window.setInterval(() => {
        onTurn({ turnNumber, intents });
        turnNumber++;
        intents = [];
      }, 100);
    },
    sendIntent(intent) {
      intents.push({ ...intent, clientID: clientID ?? "local" });
    },
    dispose() {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    },
  };
}

async function createWebGLView(
  glCanvas: HTMLCanvasElement,
  terrainMap: TerrainMapData,
  config: Config,
  settings: RenderSettings,
): Promise<{
  view: MapRenderer;
  cachedWebGLFrameCallback: { current: FrameRequestCallback | null };
}> {
  const gameMap = terrainMap.gameMap;
  const mapWidth = gameMap.width();
  const mapHeight = gameMap.height();
  const terrainColors = await loadTerrainColorSidecar(
    terrainMap.terrainColorsPath,
    mapWidth,
    mapHeight,
  );
  const boardMap = withTerrainColorSidecar(
    boardMapFromGameMap(gameMap),
    terrainColors,
  );
  const terrainBytes = boardMap.terrain;

  const cachedWebGLFrameCallback: { current: FrameRequestCallback | null } = {
    current: null,
  };
  const captureRaf = (cb: FrameRequestCallback): number => {
    cachedWebGLFrameCallback.current = cb;
    return 0;
  };
  const captureCaf = (_id: number): void => {
    cachedWebGLFrameCallback.current = null;
  };

  const palette = new Float32Array(4096 * 2 * 4);
  let view: MapRenderer;
  try {
    view = new MapRenderer(
      glCanvas,
      {
        mapWidth,
        mapHeight,
        unitTypes: [...ALL_UNIT_TYPES],
        players: [],
        maxPlayers: 1024,
      },
      terrainBytes,
      palette,
      config,
      settings,
      captureRaf,
      captureCaf,
      boardMap,
    );
  } catch (e) {
    if (e instanceof GLUnavailableError) {
      trackGLInit(e.glStatus, e.renderer);
    }
    glCanvas.remove();
    throw e;
  }

  if (view.glLimited) {
    trackGLInit(
      "limited",
      view.glLimited.renderer,
      view.glLimited.maxTextureSize,
    );
    showGLGate("limited");
  } else {
    trackGLInit("ok", "");
  }

  (window as unknown as { __webglView?: unknown }).__webglView = view;

  return { view, cachedWebGLFrameCallback };
}

function mountWebGLFrameLoop(
  terrainMap: TerrainMapData,
  view: MapRenderer,
  glCanvas: HTMLCanvasElement,
  cachedWebGLFrameCallback: { current: FrameRequestCallback | null },
  transformHandler: TransformHandler,
  gameView: GameView,
  eventBus: EventBus,
): { builder: WebGLFrameBuilder; stopFrameLoop: () => void } {
  const gameMap = terrainMap.gameMap;
  const mapWidth = gameMap.width();
  const mapHeight = gameMap.height();

  let cachedCanvasW = glCanvas.clientWidth;
  let cachedCanvasH = glCanvas.clientHeight;
  const resizeObs = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        cachedCanvasW = width;
        cachedCanvasH = height;
      }
    }
  });
  resizeObs.observe(glCanvas);

  const syncCamera = (): void => {
    const scale = transformHandler.scale;
    const dpr = renderDpr();
    const centerX =
      transformHandler.offsetX +
      mapWidth / 2 +
      (cachedCanvasW - mapWidth) / (2 * scale);
    const centerY =
      transformHandler.offsetY +
      mapHeight / 2 +
      (cachedCanvasH - mapHeight) / (2 * scale);
    view.setCameraState(centerX, centerY, scale * dpr);
    const cb = cachedWebGLFrameCallback.current;
    cachedWebGLFrameCallback.current = null;
    cb?.(performance.now());
  };

  eventBus.on(MoveWarshipIntentEvent, (e) => {
    const tile = e.tile;
    const tx = gameView.x(tile);
    const ty = gameView.y(tile);
    const firstUnit = gameView.unit(e.unitIds[0]);
    if (firstUnit === undefined) return;
    view.showMoveIndicator(tx, ty, firstUnit.owner().smallID());
  });

  let rafId: number | null = null;
  const driveFrame = (): void => {
    syncCamera();
    rafId = requestAnimationFrame(driveFrame);
  };
  rafId = requestAnimationFrame(driveFrame);

  const stopFrameLoop = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    resizeObs.disconnect();
  };

  const builder = new WebGLFrameBuilder(view);
  view.onContextRestored = () => {
    builder.clearCaches();

    const mapSize = mapWidth * mapHeight;
    const allRefs = new Array(mapSize);
    const allTerrain = new Uint8Array(mapSize);
    for (let i = 0; i < mapSize; i++) {
      allRefs[i] = i;
      allTerrain[i] = gameView.terrainByte(i);
    }
    view.applyTerrainDelta(allRefs, allTerrain);

    const frameData = gameView.frameData();
    view.uploadTileAndTrailState(frameData.tileState, frameData.trailState);
    view.updateStructures(frameData.units as Map<number, UnitState>);
    view.uploadRailroadState(frameData.railroadState);
    view.updateRelations(frameData.relationMatrix, frameData.relationSize);

    builder.update(gameView);
  };

  return { builder, stopFrameLoop };
}

function installGraphicsListeners(
  view: MapRenderer,
  webglBuilder: WebGLFrameBuilder,
  gameView: GameView,
  eventBus: EventBus,
  userSettings: UserSettings,
  graphicsListenerAbort: AbortController,
): void {
  view.setShowPatterns(userSettings.territoryPatterns());
  globalThis.addEventListener(
    `${USER_SETTINGS_CHANGED_EVENT}:settings.territoryPatterns`,
    (e) => view.setShowPatterns((e as CustomEvent<string>).detail === "true"),
    { signal: graphicsListenerAbort.signal },
  );

  globalThis.addEventListener(
    `${USER_SETTINGS_CHANGED_EVENT}:settings.anonymousNames`,
    () => webglBuilder.refreshNames(gameView),
    { signal: graphicsListenerAbort.signal },
  );

  const resolveSettings = () => resolveRenderSettings(userSettings);
  const refreshDerivedGraphics = (): void => {
    view.rebuildTerrain();
    gameView.refreshPlayerColors();
    webglBuilder.refreshPalette(gameView);
  };
  const onGraphicsChanged = (): void => {
    deepAssign(view.getSettings(), resolveSettings());
    refreshDerivedGraphics();
  };
  globalThis.addEventListener(
    `${USER_SETTINGS_CHANGED_EVENT}:${GRAPHICS_KEY}`,
    onGraphicsChanged,
    {
      signal: graphicsListenerAbort.signal,
    },
  );

  let debugGui: { open(): void; destroy(): void } | null = null;
  let debugGuiLoading = false;
  eventBus.on(ToggleRenderDebugGuiEvent, () => {
    if (debugGui === null) {
      if (debugGuiLoading) return;
      debugGuiLoading = true;
      import("../render/gl/debug/index")
        .then(({ createDebugGui }) => {
          debugGui = createDebugGui(
            view.getSettings(),
            resolveSettings,
            refreshDerivedGraphics,
          );
          debugGui.open();
        })
        .finally(() => {
          debugGuiLoading = false;
        });
    } else {
      debugGui.destroy();
      debugGui = null;
    }
  });
}
