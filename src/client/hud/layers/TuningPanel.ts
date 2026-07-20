import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  FOOD_DEFAULTS,
  FOOD_TUNABLE_KEYS,
  FoodConfig,
} from "../../../core/configuration/FoodConfig";
import { EventBus } from "../../../core/EventBus";
import { SendTuneFoodConfigIntentEvent } from "../../board/BoardEvents";
import { Controller } from "../../Controller";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

const DEBOUNCE_MS = 300;

/**
 * Knob groups for display. Any FoodConfig key not listed here lands in the
 * trailing "other" group automatically, so new knobs never go missing.
 * Exported for the #shell's OpenFront-live tuning section, which renders the
 * same knob set inside its climate panel.
 */
export const TUNING_GROUPS: [labelKey: string, keys: (keyof FoodConfig)[]][] = [
  [
    "tuning_panel.group_farms",
    [
      "landHarvestMilli",
      "farmProductionMilli",
      "farmGrowthRate",
      "farmSenesceRate",
      "tempOptLoN",
      "tempOptHiN",
      "waterWiltN",
      "waterFullN",
      "humidityWeight",
    ],
  ],
  [
    "tuning_panel.group_storage",
    [
      "baseStorage",
      "decayNumer",
      "decayDenom",
      "fieldTileStorageMilli",
      "startingFood",
    ],
  ],
  [
    "tuning_panel.group_population",
    [
      "idleConsumptionMilli",
      "moveConsumptionMilli",
      "fightConsumptionMilli",
      "baseBirthRate",
      "avgLifespanTicks",
      "startPopulation",
    ],
  ],
  [
    "tuning_panel.group_supply_war",
    [
      "supplyRadius",
      "supplyDecayPower",
      "warSupplyAttrition",
      "maxWarShare",
      "combatTileDamageMilli",
      "tileDamageHealMilli",
      "capturedPlotRazeChance",
    ],
  ],
  [
    "tuning_panel.group_urban",
    [
      "popPerDensity",
      "urbanGrowthRate",
      "wFood",
      "wWater",
      "wShore",
      "wLogi",
      "wCong",
    ],
  ],
];

/**
 * In-game sim tuning panel (add-sim-tuning-panel): live-edit any FoodConfig
 * knob. Edits are applied optimistically to the client Config (so HUD math
 * matches) and sent as tune_food_config intents so the WORKER sim picks
 * them up deterministically — they are part of the turn log, so replays
 * reproduce tuned games.
 */
@customElement("tuning-panel")
export class TuningPanel extends LitElement implements Controller {
  public game: GameView | null = null;
  public eventBus: EventBus | null = null;

  @property({ type: Boolean }) visible = false;

  /** In-flight edits awaiting their debounce, keyed by knob. */
  private pending = new Map<keyof FoodConfig, ReturnType<typeof setTimeout>>();

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {}

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }

  private groupedKeys(): [string, (keyof FoodConfig)[]][] {
    const listed = new Set(TUNING_GROUPS.flatMap(([, keys]) => keys));
    const rest = FOOD_TUNABLE_KEYS.filter((k) => !listed.has(k));
    const groups: [string, (keyof FoodConfig)[]][] = [...TUNING_GROUPS];
    if (rest.length > 0) groups.push(["tuning_panel.group_other", rest]);
    return groups;
  }

  private effective(key: keyof FoodConfig): number {
    return this.game?.config().food()[key] ?? FOOD_DEFAULTS[key];
  }

  private isModified(key: keyof FoodConfig): boolean {
    return this.effective(key) !== FOOD_DEFAULTS[key];
  }

  private apply(key: keyof FoodConfig, value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    // Optimistic: the client-side Config mirrors what the sim is about to
    // apply, so HUD-side math (capacity display etc.) stays consistent.
    this.game?.config().setFoodOverride(key, value);
    this.eventBus?.emit(new SendTuneFoodConfigIntentEvent(key, value));
    this.requestUpdate();
  }

  private onInput(key: keyof FoodConfig, e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    const value = Number(raw);
    const existing = this.pending.get(key);
    if (existing !== undefined) clearTimeout(existing);
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        this.apply(key, value);
      }, DEBOUNCE_MS),
    );
  }

  private resetKey(key: keyof FoodConfig): void {
    this.apply(key, FOOD_DEFAULTS[key]);
  }

  private resetAll(): void {
    for (const key of FOOD_TUNABLE_KEYS) {
      if (this.isModified(key)) this.apply(key, FOOD_DEFAULTS[key]);
    }
  }

  private renderRow(key: keyof FoodConfig) {
    const modified = this.isModified(key);
    return html`
      <div
        class="flex items-center gap-1 py-0.5 ${modified
          ? "text-amber-300"
          : "text-slate-200"}"
        title="${translateText(
          "tuning_panel.default_tooltip",
        )}: ${FOOD_DEFAULTS[key]}"
      >
        <span class="flex-1 truncate font-mono text-[11px]">${key}</span>
        ${modified
          ? html`<button
              class="text-[10px] px-1 rounded bg-gray-600 hover:bg-gray-500 text-white"
              @click=${() => this.resetKey(key)}
            >
              ${translateText("tuning_panel.reset")}
            </button>`
          : nothing}
        <input
          type="number"
          step="any"
          min="0"
          class="w-24 px-1 py-0 text-right text-[11px] tabular-nums bg-gray-900/80 border rounded ${modified
            ? "border-amber-400"
            : "border-slate-600"} text-white"
          .value=${String(this.effective(key))}
          @input=${(e: Event) => this.onInput(key, e)}
        />
      </div>
    `;
  }

  render() {
    if (!this.visible || this.game === null) {
      return html``;
    }
    const anyModified = FOOD_TUNABLE_KEYS.some((k) => this.isModified(k));
    return html`
      <div
        class="w-full min-w-60 max-w-80 max-h-[60vh] overflow-y-auto mt-2 text-white"
        @contextmenu=${(e: Event) => e.preventDefault()}
        @wheel=${(e: Event) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-bold"
            >${translateText("tuning_panel.title")}</span
          >
          ${anyModified
            ? html`<button
                class="text-[10px] px-1.5 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-white"
                @click=${this.resetAll}
              >
                ${translateText("tuning_panel.reset_all")}
              </button>`
            : nothing}
        </div>
        ${this.groupedKeys().map(
          ([labelKey, keys]) => html`
            <div class="mt-1.5">
              <div
                class="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-600 mb-0.5"
              >
                ${translateText(labelKey)}
              </div>
              ${keys.map((k) => this.renderRow(k))}
            </div>
          `,
        )}
      </div>
    `;
  }
}
