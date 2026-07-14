import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import {
  BuildableUnit,
  Gold,
  PlayerBuildableUnitType,
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

/**
 * Persistent build bar for the urban age (add-urban-core-growth). The player
 * places SEEDS: a Settlement is a city nucleus that grows outward on its own,
 * gated by the food-shed around it; Farmland ripens in place and feeds nearby
 * settlements; a Barn stores the surplus. Cities and farms are mutually
 * exclusive per tile. Clicking an entry arms plot placement
 * (uiState.ghostStructure the paint mode reads); clicking again / Escape /
 * right-click disarms. The bar also carries map-overlay toggles (Supply).
 */
const BAR_ENTRIES: Array<{
  unitType: PlayerBuildableUnitType;
  icon: string;
  key: string;
}> = [
  { unitType: UnitType.Settlement, icon: settlementIcon, key: "settlement" },
  { unitType: UnitType.Farmland, icon: farmlandIcon, key: "farmland" },
  { unitType: UnitType.Barn, icon: barnIcon, key: "barn" },
];

@customElement("build-bar")
export class BuildBar extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;

  private playerBuildables: BuildableUnit[] | null = null;
  private _hovered: UnitType | null = null;
  private _supplyOverlayOn = false;
  private _supplyHovered = false;

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    const player = this.game?.myPlayer();
    if (!player) return;
    player
      .buildables(undefined, [
        UnitType.Settlement,
        UnitType.Farmland,
        UnitType.Barn,
      ])
      .then((buildables) => {
        this.playerBuildables = buildables;
      });
    this.requestUpdate();
  }

  private cost(unitType: UnitType): Gold {
    for (const bu of this.playerBuildables ?? []) {
      if (bu.type === unitType) return bu.cost;
    }
    return 0n;
  }

  /** Banked seed count for awarded plots; null for food-priced buildables. */
  private seedCount(unitType: UnitType): number | null {
    const player = this.game?.myPlayer();
    if (!player) return null;
    if (unitType === UnitType.Settlement) return player.settlementSeeds();
    if (unitType === UnitType.Farmland) return player.farmSeeds();
    return null;
  }

  private affordable(unitType: UnitType): boolean {
    const player = this.game?.myPlayer();
    if (!player) return false;
    // Awarded plots (rework-settlement-ecology): placeable while a banked
    // seed exists — conquest earns farm seeds, population milestones earn
    // settlements. Food never pays for plots.
    const seeds = this.seedCount(unitType);
    if (seeds !== null) return seeds > 0;
    return this.cost(unitType) <= player.food();
  }

  /** The price row: banked seeds for awarded plots, food cost otherwise. */
  private renderPrice(unitType: UnitType, iconPx: number) {
    const seeds = this.seedCount(unitType);
    if (seeds !== null) {
      return html`<span class="${seeds > 0 ? "text-lime-300" : "text-red-300"}"
        >${seeds} ${translateText("build_menu.seeds")}</span
      >`;
    }
    return html`<img src=${foodIcon} width=${iconPx} height=${iconPx} />
      <span class="text-amber-300">${renderNumber(this.cost(unitType))}</span>`;
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
        ${this.renderSupplyToggle()}
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
                  ${this.renderPrice(entry.unitType, 13)}
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
            <span class="text-xs font-bold">${countLabel}</span>
            <span class="text-[10px] flex items-center gap-0.5">
              ${this.renderPrice(entry.unitType, 9)}
            </span>
          </div>
        </button>
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
}
