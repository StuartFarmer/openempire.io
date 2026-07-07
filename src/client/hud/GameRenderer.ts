import { EventBus } from "../../core/EventBus";
import { UserSettings } from "../../core/game/UserSettings";
import { Controller } from "../Controller";
import { AttackingTroopsController } from "../controllers/AttackingTroopsController";
import { BuildPreviewController } from "../controllers/BuildPreviewController";
import { HoverHighlightController } from "../controllers/HoverHighlightController";
import { SoundEffectController } from "../controllers/SoundEffectController";
import { StructureHighlightController } from "../controllers/StructureHighlightController";
import { ViewModeController } from "../controllers/ViewModeController";
import { GameStartingModal } from "../GameStartingModal";
import { MapRenderer } from "../render/gl";
import { TransformHandler } from "../TransformHandler";
import { UIState } from "../UIState";
import { GameView } from "../view";
import { AlertFrame } from "./layers/AlertFrame";
import { BuildMenu } from "./layers/BuildMenu";
import { ControlPanel } from "./layers/ControlPanel";
import { HeadsUpMessage } from "./layers/HeadsUpMessage";
import { Leaderboard } from "./layers/Leaderboard";
import { MainRadialMenu } from "./layers/MainRadialMenu";
import { PlayerInfoOverlay } from "./layers/PlayerInfoOverlay";
import { PlayerPanel } from "./layers/PlayerPanel";
import { WinModal } from "./layers/WinModal";
import { loadAllSprites } from "./SpriteLoader";

export function createRenderer(
  inputEl: HTMLElement,
  game: GameView,
  eventBus: EventBus,
  playerRole: string | null,
  view: MapRenderer,
): GameRenderer {
  const transformHandler = new TransformHandler(game, eventBus, inputEl);
  const userSettings = new UserSettings();

  const uiState: UIState = {
    attackRatio: 20,
    ghostStructure: null,
    rocketDirectionUp: true,
  };

  //hide when the game renders
  const startingModal = document.querySelector(
    "game-starting-modal",
  ) as GameStartingModal;
  startingModal.hide();

  const buildMenu = document.querySelector("build-menu") as BuildMenu;
  if (!buildMenu || !(buildMenu instanceof BuildMenu)) {
    console.error("BuildMenu element not found in the DOM");
  }
  buildMenu.game = game;
  buildMenu.eventBus = eventBus;
  buildMenu.uiState = uiState;
  buildMenu.transformHandler = transformHandler;

  const leaderboard = document.querySelector("leader-board") as Leaderboard;
  if (!leaderboard || !(leaderboard instanceof Leaderboard)) {
    console.error("LeaderBoard element not found in the DOM");
  }
  leaderboard.eventBus = eventBus;
  leaderboard.game = game;

  const controlPanel = document.querySelector("control-panel") as ControlPanel;
  if (!(controlPanel instanceof ControlPanel)) {
    console.error("ControlPanel element not found in the DOM");
  }
  controlPanel.eventBus = eventBus;
  controlPanel.uiState = uiState;
  controlPanel.game = game;

  const playerInfo = document.querySelector(
    "player-info-overlay",
  ) as PlayerInfoOverlay;
  if (!(playerInfo instanceof PlayerInfoOverlay)) {
    console.error("player info overlay not found");
  }
  playerInfo.eventBus = eventBus;
  playerInfo.transform = transformHandler;
  playerInfo.game = game;

  const winModal = document.querySelector("win-modal") as WinModal;
  if (!(winModal instanceof WinModal)) {
    console.error("win modal not found");
  }
  winModal.eventBus = eventBus;
  winModal.game = game;

  const playerPanel = document.querySelector("player-panel") as PlayerPanel;
  if (!(playerPanel instanceof PlayerPanel)) {
    console.error("player panel not found");
  }
  playerPanel.g = game;
  playerPanel.initEventBus(eventBus);
  playerPanel.uiState = uiState;

  playerPanel.setRole(playerRole);

  const headsUpMessage = document.querySelector(
    "heads-up-message",
  ) as HeadsUpMessage;
  if (!(headsUpMessage instanceof HeadsUpMessage)) {
    console.error("heads-up message not found");
  }
  headsUpMessage.game = game;

  const alertFrame = document.querySelector("alert-frame") as AlertFrame;
  if (!(alertFrame instanceof AlertFrame)) {
    console.error("alert frame not found");
  }
  alertFrame.game = game;

  const layers: Controller[] = [
    new BuildPreviewController(
      game,
      eventBus,
      uiState,
      transformHandler,
      view,
      userSettings,
    ),
    new HoverHighlightController(game, eventBus, transformHandler, view),
    new StructureHighlightController(eventBus, view),
    new ViewModeController(eventBus, view),
    new AttackingTroopsController(game, eventBus, userSettings, view),
    new SoundEffectController(game, eventBus),
    buildMenu,
    new MainRadialMenu(
      eventBus,
      game,
      transformHandler,
      buildMenu,
      uiState,
      playerPanel,
    ),
    leaderboard,
    controlPanel,
    playerInfo,
    winModal,
    playerPanel,
    headsUpMessage,
    alertFrame,
  ];

  return new GameRenderer(transformHandler, uiState, layers);
}

export class GameRenderer {
  private layerTickState = new Map<Controller, { lastTickAtMs: number }>();

  constructor(
    public transformHandler: TransformHandler,
    public uiState: UIState,
    private layers: Controller[],
  ) {}

  initialize() {
    loadAllSprites().catch((err) =>
      console.error("Failed to preload sprites:", err),
    );

    this.layers.forEach((l) => l.init?.());

    window.addEventListener("resize", () =>
      this.transformHandler.updateCanvasBoundingRect(),
    );

    //show whole map on startup
    this.transformHandler.centerAll(0.9);
  }

  tick() {
    const nowMs = performance.now();

    for (const layer of this.layers) {
      if (!layer.tick) {
        continue;
      }

      const state = this.layerTickState.get(layer) ?? {
        lastTickAtMs: -Infinity,
      };

      const intervalMs = layer.getTickIntervalMs?.() ?? 0;
      if (intervalMs > 0 && nowMs - state.lastTickAtMs < intervalMs) {
        this.layerTickState.set(layer, state);
        continue;
      }

      state.lastTickAtMs = nowMs;
      this.layerTickState.set(layer, state);

      layer.tick();
    }
  }
}
