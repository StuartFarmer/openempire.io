import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import {
  BuildableUnit,
  Gold,
  PlayerBuildableUnitType,
  TribalStructures,
  UnitType,
} from "../../../core/game/Game";
import { Controller } from "../../Controller";
import {
  ToggleStructureEvent,
  ToggleSupplyOverlayEvent,
} from "../../InputHandler";
import { UIState } from "../../UIState";
import { renderNumber, translateText } from "../../Utils";
import { GameView } from "../../view";

const settlementIcon = assetUrl("images/SettlementIconWhite.svg");
const farmlandIcon = assetUrl("images/FarmlandIconWhite.svg");
const barnIcon = assetUrl("images/BarnIconWhite.svg");
const foodIcon = assetUrl("images/FoodIcon.svg");

const BAR_ENTRIES: Array<{
  unitType: PlayerBuildableUnitType;
  icon: string;
  key: string;
}> = [
  { unitType: UnitType.Settlement, icon: settlementIcon, key: "settlement" },
  { unitType: UnitType.Farmland, icon: farmlandIcon, key: "farmland" },
  { unitType: UnitType.Barn, icon: barnIcon, key: "barn" },
];

/**
 * Persistent build entry point for the Tribal age (layered maps only): the
 * always-visible bar next to the bottom control panel. Clicking an entry
 * arms plot placement (the same uiState.ghostStructure the paint mode
 * reads); clicking again, Escape, or right-click disarms. The radial menu
 * intentionally has no build entry on layered maps.
 */
@customElement("build-bar")
export class BuildBar extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;

  private playerBuildables: BuildableUnit[] | null = null;
  private _hovered: UnitType | null = null;
  private _lastGhost: UnitType | null = null;
  private _supplyOverlayOn = false;
  private _supplyHovered = false;

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    const player = this.game?.myPlayer();
    if (!this.game?.hasLayers() || !player) return;
    player.buildables(undefined, TribalStructures.types).then((buildables) => {
      this.playerBuildables = buildables;
    });
    // Track external disarms (Escape / right-click) so the highlight clears.
    const ghost = this.uiState.ghostStructure as UnitType | null;
    if (ghost !== this._lastGhost) {
      this._lastGhost = ghost;
    }
    this.requestUpdate();
  }

  private cost(unitType: UnitType): Gold {
    for (const bu of this.playerBuildables ?? []) {
      if (bu.type === unitType) {
        return bu.cost;
      }
    }
    return 0n;
  }

  private affordable(unitType: UnitType): boolean {
    const player = this.game?.myPlayer();
    if (!player) return false;
    return this.cost(unitType) <= player.food();
  }

  render() {
    const myPlayer = this.game?.myPlayer();
    if (
      !this.game ||
      !this.game.hasLayers() ||
      !myPlayer ||
      this.game.inSpawnPhase() ||
      !myPlayer.isAlive()
    ) {
      return null;
    }

    return html`
      <div
        class="bg-gray-800/92 backdrop-blur-sm rounded-lg shadow-lg p-1 flex flex-col gap-1"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        ${BAR_ENTRIES.map((entry) => this.renderEntry(entry))}
        ${this.renderSupplyToggle()}
      </div>
    `;
  }

  /** Supply-lines heatmap toggle — a view mode, not a buildable. */
  private renderSupplyToggle() {
    return html`
      <div class="relative border-t border-slate-600 pt-1">
        ${this._supplyHovered
          ? html`
              <div
                class="absolute bottom-0 right-full mr-2 text-gray-200 text-center w-max max-w-[220px] text-xs bg-gray-800/90 backdrop-blur-xs rounded-sm p-2 z-[100] shadow-lg pointer-events-none"
              >
                ${translateText("control_panel.supply_overlay")}
              </div>
            `
          : null}
        <button
          class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-white transition-colors cursor-pointer
            ${this._supplyOverlayOn
            ? "border-emerald-400 bg-emerald-400/20"
            : "border-slate-500 hover:bg-gray-700"}"
          @click=${() => {
            this._supplyOverlayOn = !this._supplyOverlayOn;
            this.eventBus?.emit(
              new ToggleSupplyOverlayEvent(this._supplyOverlayOn),
            );
            this.requestUpdate();
          }}
          @mouseenter=${() => {
            this._supplyHovered = true;
            this.requestUpdate();
          }}
          @mouseleave=${() => {
            this._supplyHovered = false;
            this.requestUpdate();
          }}
        >
          <span
            class="size-6 rounded-sm shrink-0"
            style="background: linear-gradient(135deg, #e7e5e4 0%, #78716c 45%, #0a0a0a 100%)"
          ></span>
          <span class="text-[10px] font-bold">Supply</span>
        </button>
      </div>
    `;
  }

  private renderEntry(entry: {
    unitType: PlayerBuildableUnitType;
    icon: string;
    key: string;
  }) {
    const selected = this.uiState.ghostStructure === entry.unitType;
    const affordable = this.affordable(entry.unitType);
    const hovered = this._hovered === entry.unitType;
    const count = this.game.myPlayer()?.totalUnitLevels(entry.unitType) ?? 0;

    return html`
      <div class="relative">
        ${hovered
          ? html`
              <div
                class="absolute bottom-0 right-full mr-2 text-gray-200 text-center w-max max-w-[220px] text-xs bg-gray-800/90 backdrop-blur-xs rounded-sm p-2 z-[100] shadow-lg pointer-events-none"
              >
                <div class="font-bold text-sm">
                  ${translateText(`unit_type.${entry.key}`)}
                </div>
                <div class="py-1">
                  ${translateText(`build_menu.desc.${entry.key}`)}
                </div>
                <div class="flex items-center justify-center gap-1">
                  <img src=${foodIcon} width="13" height="13" />
                  <span class="text-amber-300"
                    >${renderNumber(this.cost(entry.unitType))}</span
                  >
                </div>
              </div>
            `
          : null}
        <button
          class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-white transition-colors cursor-pointer
            ${selected
            ? "border-amber-400 bg-amber-400/20"
            : "border-slate-500 hover:bg-gray-700"}
            ${affordable || selected ? "" : "opacity-40 cursor-not-allowed"}"
          @click=${() => {
            if (selected) {
              this.uiState.ghostStructure = null;
            } else if (affordable) {
              this.uiState.ghostStructure = entry.unitType;
            }
            this.requestUpdate();
          }}
          @mouseenter=${() => {
            this._hovered = entry.unitType;
            this.eventBus?.emit(new ToggleStructureEvent([entry.unitType]));
            this.requestUpdate();
          }}
          @mouseleave=${() => {
            this._hovered = null;
            this.eventBus?.emit(new ToggleStructureEvent(null));
            this.requestUpdate();
          }}
        >
          <img src=${entry.icon} alt=${entry.key} class="size-6" />
          <div class="flex flex-col items-start leading-none">
            <span class="text-xs font-bold">${renderNumber(count)}</span>
            <span
              class="text-[10px] ${affordable
                ? "text-amber-300"
                : "text-red-300"} flex items-center gap-0.5"
            >
              <img src=${foodIcon} width="9" height="9" />
              ${renderNumber(this.cost(entry.unitType))}
            </span>
          </div>
        </button>
      </div>
    `;
  }
}
