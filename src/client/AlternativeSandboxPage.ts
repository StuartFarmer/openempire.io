import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { BoardMap } from "../core/game/BoardMap";
import {
  createAlternativeMap,
  expandAlternativeTerritory,
} from "../games/alternative";
import { buildBoardMapTerrainRGBA } from "./render/gl";

@customElement("alternative-sandbox-page")
export class AlternativeSandboxPage extends LitElement {
  private readonly map: BoardMap = createAlternativeMap();

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

  private expand = (): void => {
    expandAlternativeTerritory(this.map, 1);
    this.ownedTiles = countOwned(this.map);
  };

  private reset = (): void => {
    const fresh = createAlternativeMap();
    this.map.terrain.set(fresh.terrain);
    this.map.state.set(fresh.state);
    this.map.layers!.elevation.set(fresh.layers!.elevation);
    this.map.layers!.moisture.set(fresh.layers!.moisture);
    this.ownedTiles = countOwned(this.map);
  };

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
          ></canvas>
        </div>
      </section>
    `;
  }
}

function countOwned(map: BoardMap): number {
  let count = 0;
  for (const state of map.state) {
    if ((state & 0x0fff) !== 0) count++;
  }
  return count;
}

function tintOwnedTiles(pixels: Uint8ClampedArray, state: Uint16Array): void {
  for (let ref = 0; ref < state.length; ref++) {
    if ((state[ref] & 0x0fff) === 0) continue;
    const offset = ref * 4;
    pixels[offset] = Math.min(255, pixels[offset] + 52);
    pixels[offset + 1] = Math.min(255, pixels[offset + 1] + 24);
  }
}
