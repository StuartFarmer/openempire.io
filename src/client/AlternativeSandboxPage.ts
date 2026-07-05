import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { BoardMap } from "../core/game/BoardMap";
import {
  dispatchBoardCommand,
  tickBoardRuntime,
  type BoardRuntime,
} from "../core/game/BoardRuntime";
import { createAlternativeOpenFrontRuntime } from "../games/alternative";
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
    this.ownedTiles = countOwned(this.map);
  };

  private reset = (): void => {
    this.stopClock();
    this.runtime = createAlternativeOpenFrontRuntime();
    this.frameBridge = new BoardRuntimeFrameBridge(this.runtime);
    this.ownedTiles = countOwned(this.map);
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
    this.ownedTiles = countOwned(this.map);
  };

  private startClock(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = window.setInterval(() => {
      tickBoardRuntime(this.runtime);
      this.frameBridge.nextFrame();
      this.ownedTiles = countOwned(this.map);
    }, 100);
  }

  private stopClock(): void {
    if (this.tickTimer === null) return;
    window.clearInterval(this.tickTimer);
    this.tickTimer = null;
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
        <div class="max-w-5xl mx-auto flex flex-col gap-4">
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
          <div class="text-sm text-white/70">
            Owned tiles: ${this.ownedTiles}
          </div>
          <canvas
            class="w-full max-w-[640px] aspect-square [image-rendering:pixelated] border border-white/15 bg-black"
            aria-label="Alternative game board preview"
            @click=${this.handleCanvasClick}
          ></canvas>
        </div>
      </section>
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
