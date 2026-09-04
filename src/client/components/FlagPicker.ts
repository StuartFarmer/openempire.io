import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { UserSettings } from "../../core/game/UserSettings";
import { translateText } from "../Utils";
import {
  type FlagEntry,
  loadFlagCatalog,
  resolveFlagUrl,
  sampleFlags,
} from "../flags/FlagCatalog";

const SAMPLE = 49; // 7×7

/**
 * Emoji-picker-style flag chooser for the front page. Shows a random 7×7 slice of
 * the ~6k-flag library with a dice reroll; the pick persists via UserSettings and
 * is read back by the shell for the human's nation. Cosmetic only — never touches
 * the sim.
 */
@customElement("flag-picker")
export class FlagPicker extends LitElement {
  private settings = new UserSettings();
  @state() private open = false;
  @state() private catalog: FlagEntry[] = [];
  @state() private sample: FlagEntry[] = [];
  @state() private selected: string | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.selected = this.settings.getFlag();
    loadFlagCatalog().then((c) => {
      this.catalog = c;
      this.reroll();
    });
    document.addEventListener("click", this.onDocClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("click", this.onDocClick);
  }

  // Close when clicking outside the picker.
  private onDocClick = (e: MouseEvent) => {
    if (this.open && !this.contains(e.target as Node)) this.open = false;
  };

  private reroll = () => {
    this.sample = sampleFlags(this.catalog, SAMPLE);
  };

  private toggle = (e: Event) => {
    e.stopPropagation();
    this.open = !this.open;
  };

  private pick(id: string | null) {
    if (id === null) {
      this.settings.clearFlag();
      this.selected = null;
    } else {
      this.settings.setFlag(id);
      this.selected = id;
    }
    this.open = false;
  }

  render() {
    const url = resolveFlagUrl(this.selected);
    return html`
      <div class="relative shrink-0">
        <button
          type="button"
          title=${translateText("flag_picker.title")}
          @click=${this.toggle}
          class="flex items-center justify-center w-10 h-10 rounded border border-white/30 bg-white/5 hover:bg-white/15 overflow-hidden transition-colors cursor-pointer"
        >
          ${url
            ? html`<img
                src=${url}
                class="max-w-full max-h-full object-contain"
                alt=""
              />`
            : html`<span class="text-white/50 text-lg">🏳️</span>`}
        </button>

        ${this.open
          ? html`
              <div
                class="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-[22rem] max-w-[90vw] rounded-xl border border-white/15 bg-neutral-900/95 backdrop-blur-md p-3 shadow-2xl"
                @click=${(e: Event) => e.stopPropagation()}
              >
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-medium text-white/70"
                    >${translateText("flag_picker.title")}</span
                  >
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      title=${translateText("flag_picker.reroll")}
                      @click=${this.reroll}
                      class="w-7 h-7 flex items-center justify-center rounded border border-white/15 hover:bg-white/15 text-base cursor-pointer"
                    >
                      🎲
                    </button>
                    <button
                      type="button"
                      title=${translateText("flag_picker.clear")}
                      @click=${() => this.pick(null)}
                      class="w-7 h-7 flex items-center justify-center rounded border border-white/15 hover:bg-white/15 text-xs text-white/70 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div class="grid grid-cols-7 gap-1">
                  ${this.sample.map(
                    (f) => html`
                      <button
                        type="button"
                        title=${f.name}
                        @click=${() => this.pick(f.id)}
                        class="aspect-[3/2] flex items-center justify-center rounded border ${this
                          .selected === f.id
                          ? "border-white"
                          : "border-white/10"} bg-black/30 hover:border-white/60 overflow-hidden cursor-pointer"
                      >
                        <img
                          src=${resolveFlagUrl(f.id) ?? ""}
                          loading="lazy"
                          class="max-w-full max-h-full object-contain"
                          alt=""
                        />
                      </button>
                    `,
                  )}
                </div>
              </div>
            `
          : null}
      </div>
    `;
  }
}
