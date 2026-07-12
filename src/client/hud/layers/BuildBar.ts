import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { Controller } from "../../Controller";
import { ToggleSupplyOverlayEvent } from "../../InputHandler";
import { UIState } from "../../UIState";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

/**
 * Map-overlay toggle bar for the urban age (add-urban-core-growth). The city
 * grows itself from the founded Core — there are no plots to paint — so this
 * always-visible bar (next to the bottom control panel) carries view toggles:
 * the supply-lines heatmap for now, with density/hydrology overlays to come.
 */
@customElement("build-bar")
export class BuildBar extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;

  private _supplyOverlayOn = false;
  private _supplyHovered = false;

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    if (!this.game?.hasLayers()) return;
    this.requestUpdate();
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
        ${this.renderSupplyToggle()}
      </div>
    `;
  }

  /** Supply-lines heatmap toggle — a view mode. */
  private renderSupplyToggle() {
    return html`
      <div class="relative">
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
