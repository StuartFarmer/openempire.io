import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { BoardMap } from "../core/game/BoardMap";
import {
  dispatchBoardCommand,
  tickBoardRuntime,
  type BoardRuntime,
} from "../core/game/BoardRuntime";
import { createAlternativeOpenFrontRuntime } from "../games/alternative";
import { describeAlternativeEconomy } from "../games/alternative/AlternativeFoodEconomy";
import { describeAlternativeMovementWork } from "../games/alternative/AlternativeMovementWork";
import {
  DEFAULT_ALTERNATIVE_TUNING,
  getAlternativeTuning,
  resetAlternativeTuning,
  setAlternativeTuning,
  type AlternativeTuning,
} from "../games/alternative/AlternativeTuning";
import { BoardRuntimeFrameBridge } from "./render/frame";
import { buildBoardMapTerrainRGBA } from "./render/gl";

@customElement("alternative-sandbox-page")
export class AlternativeSandboxPage extends LitElement {
  @state()
  private runtime: BoardRuntime = createAlternativeOpenFrontRuntime();

  private frameBridge = new BoardRuntimeFrameBridge(this.runtime);
  private tickTimer: number | null = null;

  private get map(): BoardMap {
    return this.runtime.map;
  }

  @state()
  private ownedTiles = countOwned(this.map);
  @state()
  private food = 0;
  @state()
  private foodPerTick = 0;
  @state()
  private settlements = 0;
  @state()
  private movementWork: { remaining: number; total: number } | null = null;
  @state()
  private tuning: AlternativeTuning = DEFAULT_ALTERNATIVE_TUNING;

  createRenderRoot() {
    return this;
  }

  firstUpdated(): void {
    this.paint();
  }

  updated(): void {
    this.paint();
  }

  disconnectedCallback(): void {
    this.stopClock();
    super.disconnectedCallback();
  }

  private expand = (): void => {
    runTicks(this.runtime, 20);
    this.frameBridge.nextFrame();
    this.refreshStats();
  };

  private reset = (): void => {
    this.stopClock();
    this.runtime = createAlternativeOpenFrontRuntime();
    this.frameBridge = new BoardRuntimeFrameBridge(this.runtime);
    this.refreshStats();
  };

  private resetTuning = (): void => {
    resetAlternativeTuning(this.runtime);
    this.refreshStats();
  };

  private handleCanvasClick = (event: MouseEvent): void => {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const ref = canvasEventToTileRef(canvas, event, this.map);
    if (ref === null) return;

    if (countOwned(this.map) === 0) {
      dispatchBoardCommand(this.runtime, {
        type: "alternative.place",
        ownerId: 1,
        ref,
      });
      if (countOwned(this.map) > 0) this.startClock();
    } else {
      dispatchBoardCommand(this.runtime, {
        type: "alternative.expand",
        ownerId: 1,
        ref,
        troops: 2_000,
      });
      this.startClock();
    }
    this.frameBridge.nextFrame();
    this.refreshStats();
  };

  private startClock(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = window.setInterval(() => {
      tickBoardRuntime(this.runtime);
      this.frameBridge.nextFrame();
      this.refreshStats();
    }, 100);
  }

  private stopClock(): void {
    if (this.tickTimer === null) return;
    window.clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private refreshStats(): void {
    const economy = describeAlternativeEconomy(this.runtime, 1);
    this.ownedTiles = countOwned(this.map);
    this.food = economy.food;
    this.foodPerTick = economy.foodPerTick;
    this.settlements = economy.settlements;
    this.movementWork = describeAlternativeMovementWork(this.runtime);
    this.tuning = getAlternativeTuning(this.runtime);
  }

  private updateTuning(key: keyof AlternativeTuning, event: Event): void {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    setAlternativeTuning(this.runtime, { [key]: Math.max(0, value) });
    this.refreshStats();
  }

  private paint(): void {
    const canvas = this.querySelector("canvas");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    canvas.width = this.map.width;
    canvas.height = this.map.height;
    const image = context.createImageData(this.map.width, this.map.height);
    image.data.set(buildBoardMapTerrainRGBA(this.map));
    tintOwnedTiles(image.data, this.map.state);
    context.putImageData(image, 0, 0);
  }

  render() {
    return html`
      <section
        class="w-full h-full bg-neutral-950 text-white overflow-auto p-4 sm:p-6"
      >
        <div class="max-w-6xl mx-auto flex flex-col gap-4">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <h1 class="text-2xl font-semibold">Alternative Sandbox</h1>
            <div class="flex gap-2">
              <button
                class="px-3 py-2 bg-white text-black text-sm font-medium"
                @click=${this.expand}
              >
                Expand
              </button>
              <button
                class="px-3 py-2 border border-white/30 text-sm font-medium"
                @click=${this.reset}
              >
                Reset
              </button>
            </div>
          </div>
          <div class="text-sm text-white/70 flex gap-4 flex-wrap">
            Owned tiles: ${this.ownedTiles}
            <span>Food: ${Math.floor(this.food)}</span>
            <span>Food/tick: ${this.foodPerTick}</span>
            <span>Settlements: ${this.settlements}</span>
            ${this.movementWork
              ? html`<span>
                  Move work:
                  ${Math.ceil(this.movementWork.remaining)}/${Math.ceil(
                    this.movementWork.total,
                  )}
                </span>`
              : ""}
          </div>
          <div class="grid gap-4 lg:grid-cols-[minmax(0,640px)_280px]">
            <canvas
              class="w-full max-w-[640px] aspect-square [image-rendering:pixelated] border border-white/15 bg-black"
              aria-label="Alternative game board preview"
              @click=${this.handleCanvasClick}
            ></canvas>
            <aside class="border border-white/15 p-3 flex flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-base font-semibold">Tuning</h2>
                <button
                  class="px-2 py-1 border border-white/30 text-xs font-medium"
                  @click=${this.resetTuning}
                >
                  Reset
                </button>
              </div>
              ${this.renderTuningInput(
                "Settlement food/tick",
                "settlementFoodPerTick",
                1,
              )}
              ${this.renderTuningInput("Base move work", "baseMoveWork", 1)}
              ${this.renderTuningInput(
                "Troop work/tick",
                "troopWorkPerTick",
                0.05,
              )}
              ${this.renderTuningInput(
                "Logistics distance factor",
                "logisticsDistanceFactor",
                0.05,
              )}
              ${this.renderTuningInput("Slope factor", "slopeFactor", 0.01)}
            </aside>
          </div>
        </div>
      </section>
    `;
  }

  private renderTuningInput(
    label: string,
    key: keyof AlternativeTuning,
    step: number,
  ) {
    return html`
      <label class="flex flex-col gap-1 text-sm text-white/75">
        <span>${label}</span>
        <input
          class="w-full bg-black border border-white/20 px-2 py-1 text-white"
          name=${key}
          type="number"
          min="0"
          step=${step}
          .value=${String(this.tuning[key])}
          @input=${(event: Event) => this.updateTuning(key, event)}
        />
      </label>
    `;
  }
}

function runTicks(runtime: BoardRuntime, count: number): void {
  for (let i = 0; i < count; i++) tickBoardRuntime(runtime);
}

function countOwned(map: BoardMap): number {
  let count = 0;
  for (const state of map.state) {
    if ((state & 0x0fff) !== 0) count++;
  }
  return count;
}

function canvasEventToTileRef(
  canvas: HTMLCanvasElement,
  event: MouseEvent,
  map: BoardMap,
): number | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * map.width);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * map.height);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return y * map.width + x;
}

function tintOwnedTiles(pixels: Uint8ClampedArray, state: Uint16Array): void {
  for (let ref = 0; ref < state.length; ref++) {
    if ((state[ref] & 0x0fff) === 0) continue;
    const offset = ref * 4;
    pixels[offset] = Math.min(255, pixels[offset] + 52);
    pixels[offset + 1] = Math.min(255, pixels[offset + 1] + 24);
  }
}
