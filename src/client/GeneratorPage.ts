import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  createAlternativeWorldEngineMap,
  type AlternativeWorldEngineMap,
} from "../games/alternative/world";
import {
  buildGeneratedMapInfo,
  buildGeneratorSourceImage,
  normalizeGeneratedMapIdentity,
} from "../games/alternative/world/GeneratorMapExport";
import {
  DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG,
  type FoundationWorldEngineMapConfig,
} from "../games/alternative/world/WorldEngineElevation";
import { buildBoardMapTerrainRGBA } from "./render/gl";

type GeneratorConfig = Pick<
  FoundationWorldEngineMapConfig,
  | "seed"
  | "width"
  | "height"
  | "seaLevel"
  | "continentScale"
  | "mountainStrength"
  | "coastFalloff"
  | "coastRoughness"
  | "latitudeEffect"
  | "elevationCooling"
  | "rainNoise"
  | "warmthRainfall"
  | "riverFlowRetention"
  | "lakeWaterThreshold"
  | "lakeElevationRange"
  | "riverWeakThreshold"
  | "riverStrongThreshold"
>;

@customElement("generator-page")
export class GeneratorPage extends LitElement {
  @state()
  private mapId = "GeneratedWorld";

  @state()
  private mapName = "Generated World";

  @state()
  private config: GeneratorConfig = {
    seed: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.seed,
    width: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.width,
    height: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.height,
    seaLevel: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.seaLevel,
    continentScale: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.continentScale,
    mountainStrength:
      DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.mountainStrength,
    coastFalloff: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.coastFalloff,
    coastRoughness: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.coastRoughness,
    latitudeEffect: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.latitudeEffect,
    elevationCooling:
      DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.elevationCooling,
    rainNoise: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.rainNoise,
    warmthRainfall: DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.warmthRainfall,
    riverFlowRetention:
      DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.riverFlowRetention,
    lakeWaterThreshold:
      DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.lakeWaterThreshold,
    lakeElevationRange:
      DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.lakeElevationRange,
    riverWeakThreshold:
      DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.riverWeakThreshold,
    riverStrongThreshold:
      DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG.riverStrongThreshold,
  };

  @state()
  private generated: AlternativeWorldEngineMap =
    createAlternativeWorldEngineMap(this.config);

  createRenderRoot() {
    return this;
  }

  firstUpdated(): void {
    this.paint();
  }

  updated(): void {
    this.paint();
  }

  private regenerate = (): void => {
    this.generated = createAlternativeWorldEngineMap(this.config);
  };

  private updateString =
    (key: "mapId" | "mapName") =>
    (event: Event): void => {
      this[key] = (event.target as HTMLInputElement).value;
    };

  private updateNumber =
    (key: keyof GeneratorConfig) =>
    (event: Event): void => {
      const input = event.target as HTMLInputElement;
      const value = input.type === "range" ? input.valueAsNumber : input.value;
      this.config = {
        ...this.config,
        [key]: Number(value),
      };
    };

  private downloadInfo = (): void => {
    const info = buildGeneratedMapInfo({
      id: this.mapId,
      name: this.mapName,
    });
    downloadBlob(
      new Blob([`${JSON.stringify(info, null, 2)}\n`], {
        type: "application/json",
      }),
      "info.json",
    );
  };

  private downloadImage = (): void => {
    const source = buildGeneratorSourceImage(this.generated.map);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(source.width, source.height);
    image.data.set(source.data);
    context.putImageData(image, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, "image.png");
    }, "image/png");
  };

  private paint(): void {
    const canvas = this.querySelector("canvas");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const map = this.generated.map;
    canvas.width = map.width;
    canvas.height = map.height;
    const image = context.createImageData(map.width, map.height);
    image.data.set(buildBoardMapTerrainRGBA(map));
    context.putImageData(image, 0, 0);
  }

  render() {
    const identity = normalizeGeneratedMapIdentity(this.mapId);
    const map = this.generated.map;

    return html`
      <section class="w-full h-full bg-neutral-950 text-white overflow-auto">
        <div
          class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 p-4 sm:p-6"
        >
          <div class="min-w-0 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <h1 class="text-2xl font-semibold">Map Generator</h1>
              <div class="flex gap-2">
                <button
                  class="px-3 py-2 bg-white text-black text-sm font-medium"
                  @click=${this.regenerate}
                >
                  Generate
                </button>
                <button
                  class="px-3 py-2 border border-white/30 text-sm font-medium"
                  @click=${this.downloadImage}
                >
                  image.png
                </button>
                <button
                  class="px-3 py-2 border border-white/30 text-sm font-medium"
                  @click=${this.downloadInfo}
                >
                  info.json
                </button>
              </div>
            </div>
            <canvas
              class="w-full max-w-[900px] aspect-square [image-rendering:pixelated] border border-white/15 bg-black"
              aria-label="Generated map preview"
            ></canvas>
          </div>

          <aside class="flex flex-col gap-4 text-sm">
            <div class="grid gap-3">
              ${this.textInput(
                "Map ID",
                this.mapId,
                this.updateString("mapId"),
              )}
              ${this.textInput(
                "Display Name",
                this.mapName,
                this.updateString("mapName"),
              )}
              ${this.numberInput("Seed", "seed", -2147483648, 2147483647, 1)}
              ${this.numberInput("Width", "width", 32, 1024, 4)}
              ${this.numberInput("Height", "height", 32, 1024, 4)}
              ${this.rangeInput("Sea Level", "seaLevel", 0.2, 0.75, 0.01)}
              ${this.rangeInput(
                "Continent Scale",
                "continentScale",
                0.35,
                1.6,
                0.01,
              )}
              ${this.rangeInput("Mountains", "mountainStrength", 0, 1, 0.01)}
              ${this.rangeInput("Coast Falloff", "coastFalloff", 0, 1.4, 0.01)}
              ${this.rangeInput(
                "Coast Roughness",
                "coastRoughness",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "Latitude Effect",
                "latitudeEffect",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "Elevation Cooling",
                "elevationCooling",
                0,
                0.8,
                0.01,
              )}
              ${this.rangeInput("Rain Noise", "rainNoise", 0, 1, 0.01)}
              ${this.rangeInput(
                "Warmth Rainfall",
                "warmthRainfall",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "River Flow Retention",
                "riverFlowRetention",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "Lake Water Threshold",
                "lakeWaterThreshold",
                0.1,
                5,
                0.01,
              )}
              ${this.rangeInput(
                "Lake Elevation Range",
                "lakeElevationRange",
                0,
                0.5,
                0.01,
              )}
              ${this.rangeInput(
                "Weak River Threshold",
                "riverWeakThreshold",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "Strong River Threshold",
                "riverStrongThreshold",
                0,
                1,
                0.01,
              )}
            </div>

            <div class="border border-white/15 p-3 text-white/75 leading-6">
              <div>
                Folder: map-generator/assets/maps/${identity.folderName}
              </div>
              <div>Files: image.png, info.json</div>
              <div>Then run: npm run gen-maps</div>
              <div>Size: ${map.width}x${map.height}</div>
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  private textInput(
    label: string,
    value: string,
    onInput: (event: Event) => void,
  ) {
    return html`<label class="grid gap-1">
      <span class="text-white/70">${label}</span>
      <input
        class="bg-black border border-white/20 px-3 py-2 text-white"
        .value=${value}
        @input=${onInput}
      />
    </label>`;
  }

  private numberInput(
    label: string,
    key: keyof GeneratorConfig,
    min: number,
    max: number,
    step: number,
  ) {
    return html`<label class="grid gap-1">
      <span class="text-white/70">${label}</span>
      <input
        type="number"
        class="bg-black border border-white/20 px-3 py-2 text-white"
        min=${min}
        max=${max}
        step=${step}
        .value=${String(this.config[key])}
        @input=${this.updateNumber(key)}
      />
    </label>`;
  }

  private rangeInput(
    label: string,
    key: keyof GeneratorConfig,
    min: number,
    max: number,
    step: number,
  ) {
    return html`<label class="grid gap-1">
      <span class="text-white/70"
        >${label}: ${Number(this.config[key]).toFixed(2)}</span
      >
      <input
        type="range"
        min=${min}
        max=${max}
        step=${step}
        .value=${String(this.config[key])}
        @input=${this.updateNumber(key)}
      />
    </label>`;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
