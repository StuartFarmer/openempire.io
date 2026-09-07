import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import { PlayerBuildableUnitType, UnitType } from "../../../core/game/Game";
import { Controller } from "../../Controller";
import {
  ToggleFertilityOverlayEvent,
  ToggleStructureEvent,
} from "../../InputHandler";
import { UIState } from "../../UIState";
import { renderNumber, translateText } from "../../Utils";
import { GameView } from "../../view";

const settlementIcon = assetUrl("images/SettlementIconWhite.svg");
const farmlandIcon = assetUrl("images/FarmlandIconWhite.svg");

type SoilOverlayMode = "off" | "fertility" | "suitability";

const SOIL_OVERLAY_CYCLE: SoilOverlayMode[] = [
  "off",
  "fertility",
  "suitability",
];

/**
 * Persistent build bar for the tribal age. Settlement and Farmland are FREE
 * and seed-gated (restore-organic-growth seed-ladder spec): each entry shows
 * the banked seed count and disarms at zero, with the next founding-pair rung
 * read out beneath. Clicking an entry arms plot placement
 * (uiState.ghostStructure the paint mode reads); clicking again / Escape /
 * right-click disarms. The bar also carries the soil-overlay cycle button
 * (off → fertility → suitability — read the land before planting or settling).
 */
const BAR_ENTRIES: Array<{
  unitType: PlayerBuildableUnitType;
  icon: string;
  key: string;
}> = [
  { unitType: UnitType.Settlement, icon: settlementIcon, key: "settlement" },
  { unitType: UnitType.Farmland, icon: farmlandIcon, key: "farmland" },
];

@customElement("build-bar")
export class BuildBar extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;

  private _hovered: UnitType | null = null;
  private _soilOverlay: SoilOverlayMode = "off";
  private _overlayHovered = false;

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    this.requestUpdate();
  }

  /** Banked seeds for a bar entry (seed-ladder spec). */
  private seeds(unitType: UnitType): number {
    const player = this.game?.myPlayer();
    if (!player) return 0;
    if (unitType === UnitType.Settlement) return player.settlementSeeds();
    if (unitType === UnitType.Farmland) return player.farmSeeds();
    return 0;
  }

  /** The seed row: banked seeds instead of a price (structures are free). */
  private renderSeeds(unitType: UnitType) {
    return html`<span class="text-amber-300">
      ${translateText("build_menu.seeds", { count: this.seeds(unitType) })}
    </span>`;
  }

  render() {
    const myPlayer = this.game?.myPlayer();
    if (
      !this.game ||
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
        ${this.renderSoilOverlayToggle()}
      </div>
    `;
  }

  private renderEntry(entry: {
    unitType: PlayerBuildableUnitType;
    icon: string;
    key: string;
  }) {
    const selected = this.uiState.ghostStructure === entry.unitType;
    const seeds = this.seeds(entry.unitType);
    const placeable = seeds > 0;
    const hovered = this._hovered === entry.unitType;
    const count = this.game.myPlayer()?.totalUnitLevels(entry.unitType) ?? 0;
    const countLabel = renderNumber(count);

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
                  ${this.renderSeeds(entry.unitType)}
                </div>
              </div>
            `
          : null}
        <button
          class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-white transition-colors cursor-pointer
            ${selected
            ? "border-amber-400 bg-amber-400/20"
            : "border-slate-500 hover:bg-gray-700"}
            ${placeable || selected ? "" : "opacity-40 cursor-not-allowed"}"
          @click=${() => {
            if (selected) {
              this.uiState.ghostStructure = null;
            } else if (placeable) {
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
            <span class="text-xs font-bold">${countLabel}</span>
            <span class="text-[10px] flex items-center gap-0.5">
              ${this.renderSeeds(entry.unitType)}
            </span>
          </div>
        </button>
      </div>
    `;
  }

  /** Soil-overlay cycle — a view mode, not a buildable: off → fertility
   *  (green tint) → suitability (blue tint) → off. */
  private renderSoilOverlayToggle() {
    const mode = this._soilOverlay;
    const suit = mode === "suitability";
    const swatch = suit
      ? "linear-gradient(135deg, #3b82f6 0%, #6486a3 55%, #806640 100%)"
      : "linear-gradient(135deg, #22c55e 0%, #a3a04b 55%, #92400e 100%)";
    const tooltipKey = suit
      ? "control_panel.suitability_overlay"
      : "control_panel.fertility_overlay";
    const labelKey = suit
      ? "control_panel.overlay_suitability"
      : "control_panel.overlay_fertility";
    const activeClass = suit
      ? "border-sky-400 bg-sky-400/20"
      : "border-emerald-400 bg-emerald-400/20";
    return html`
      <div class="relative border-t border-slate-600 pt-1">
        ${this._overlayHovered
          ? html`
              <div
                class="absolute bottom-0 right-full mr-2 text-gray-200 text-center w-max max-w-[220px] text-xs bg-gray-800/90 backdrop-blur-xs rounded-sm p-2 z-[100] shadow-lg pointer-events-none"
              >
                ${translateText(tooltipKey)}
              </div>
            `
          : null}
        <button
          class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-white transition-colors cursor-pointer
            ${mode !== "off"
            ? activeClass
            : "border-slate-500 hover:bg-gray-700"}"
          @click=${() => {
            const i = SOIL_OVERLAY_CYCLE.indexOf(this._soilOverlay);
            this._soilOverlay =
              SOIL_OVERLAY_CYCLE[(i + 1) % SOIL_OVERLAY_CYCLE.length];
            this.eventBus?.emit(
              new ToggleFertilityOverlayEvent(this._soilOverlay),
            );
            this.requestUpdate();
          }}
          @mouseenter=${() => {
            this._overlayHovered = true;
            this.requestUpdate();
          }}
          @mouseleave=${() => {
            this._overlayHovered = false;
            this.requestUpdate();
          }}
        >
          <span
            class="size-6 rounded-sm shrink-0"
            style="background: ${swatch}"
          ></span>
          <span class="text-[10px] font-bold">${translateText(labelKey)}</span>
        </button>
      </div>
    `;
  }
}
