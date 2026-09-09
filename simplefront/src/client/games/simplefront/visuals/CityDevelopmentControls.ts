import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import approved from "../../../../../docs/city-local-palette.json";
import {
  DEFAULT_CONFIG,
  GAME_POPULATION_SCALE,
  validateConfig,
  type GrowthConfig,
} from "../../../../core/development/CityDevelopmentConfig";
import type { ShellUrbanSummary } from "../../../webgpu/ShellSimProtocol";
import { CityAges, type AgeStyle } from "./CityAges";

const settings: [keyof GrowthConfig, string, number, number, number][] = [
  ["populationRate", "Population speed", 0, 2, 0.01],
  ["targetOccupancy", "Housing threshold (fraction occupied)", 0.5, 0.95, 0.01],
  ["densify", "Maturation preference", 0, 1, 0.01],
  [
    "maturationScale",
    "Housing scale for maturation preference",
    0,
    100000,
    100,
  ],
  ["rate", "Construction speed", 0, 2000, 1],
  ["ruralCapacity", "Housing per level", 10, 1000, 1],
];
const fertility: typeof settings = [
  ["lowerLevel", "Lower development level", 1, 99, 1],
  ["upperLevel", "Upper development level", 2, 100, 1],
  ["lowerLevelBirths", "Fertility at lower level", 0, 10, 0.1],
  ["upperLevelBirths", "Fertility at upper level", 0, 10, 0.1],
];
const statusText: Record<ShellUrbanSummary["status"], string> = {
  "no-housing": "Spawn to receive the 10,000 minimum housing allowance.",
  vacancies:
    "Filling vacancies — construction waits for the housing threshold.",
  construction: "Active construction — adding housing on legal land.",
  "no-space": "No legal expansion or upgrade space.",
  disabled: "Construction paused — construction speed is zero.",
  waiting: "Waiting for the match to start or the player to return.",
};

@customElement("city-development-controls")
export class CityDevelopmentControls extends LitElement {
  @property({ attribute: false }) config: Readonly<GrowthConfig> =
    DEFAULT_CONFIG;
  @property({ attribute: false }) summary?: ShellUrbanSummary;
  @property({ attribute: false }) ageLevels: readonly number[] =
    approved.ageLevels;
  @property({ attribute: false }) palette: readonly AgeStyle[] =
    approved.palettes;
  @state() private draft: GrowthConfig = { ...DEFAULT_CONFIG };
  @state() private levels = [...approved.ageLevels];
  @state() private styles: AgeStyle[] = structuredClone(approved.palettes);
  @state() private economicError = "";
  @state() private visualError = "";
  @state() private applied = false;

  static styles = css`
    :host {
      display: block;
      width: min(20rem, 100%);
      min-height: 0;
      overflow: auto;
      pointer-events: auto;
      color: #f8fafc;
      font: 12px/1.45 system-ui;
    }
    section {
      background: #09121eeb;
      border: 1px solid #ffffff30;
      border-radius: 6px;
      padding: 0.6rem;
    }
    p {
      margin: 0.3rem 0;
    }
    summary {
      cursor: pointer;
      padding: 0.35rem 0;
      font-weight: 600;
    }
    details {
      border-top: 1px solid #ffffff25;
      margin-top: 0.4rem;
    }
    label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
      margin: 0.3rem 0;
    }
    input[type="number"] {
      width: 5rem;
    }
    input,
    button {
      color: inherit;
      background: #253347;
      border: 1px solid #ffffff55;
      border-radius: 3px;
      padding: 0.25rem;
      font: inherit;
    }
    button {
      cursor: pointer;
      margin: 0.35rem 0;
      padding: 0.4rem;
    }
    input[type="color"] {
      width: 2rem;
      height: 1.8rem;
      padding: 1px;
    }
    .colors {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .colors label {
      flex-direction: column;
      font-size: 10px;
    }
    fieldset {
      border: 1px solid #ffffff30;
      margin: 0.5rem 0;
    }
    [role="alert"] {
      color: #fca5a5;
    }
    .muted {
      color: #cbd5e1;
    }
    @media (max-width: 600px) {
      :host {
        width: min(17rem, 100%);
      }
    }
  `;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("config")) this.draft = { ...this.config };
    if (changed.has("ageLevels")) this.levels = [...this.ageLevels];
    if (changed.has("palette"))
      this.styles = this.palette.map((s) => ({ ...s, houses: [...s.houses] }));
  }

  private applyNext(): void {
    try {
      validateConfig(this.draft);
      this.dispatchEvent(
        new CustomEvent("city-next-match", {
          detail: { ...this.draft },
          bubbles: true,
          composed: true,
        }),
      );
      this.economicError = "";
      this.applied = true;
    } catch (error) {
      this.economicError = (error as Error).message;
      this.applied = false;
    }
  }

  private applyVisuals(): void {
    try {
      const validator = new CityAges();
      validator.setAgeLevels(this.levels);
      validator.setPalette(this.styles);
      this.dispatchEvent(
        new CustomEvent("city-visuals", {
          detail: {
            levels: [...this.levels],
            styles: structuredClone(this.styles),
          },
          bubbles: true,
          composed: true,
        }),
      );
      this.visualError = "";
    } catch (error) {
      this.visualError = (error as Error).message;
    }
  }

  private numeric(fields: typeof settings) {
    return fields.map(([key, label, min, max, step]) => {
      const scale =
        key === "ruralCapacity" || key === "maturationScale"
          ? GAME_POPULATION_SCALE
          : 1;
      return html`<label
        >${label}<input
          name=${key}
          aria-label=${label}
          type="number"
          min=${min * scale}
          max=${max * scale}
          step=${step * scale}
          .value=${String(this.draft[key] * scale)}
          @input=${(e: Event) => {
            this.draft = {
              ...this.draft,
              [key]: (e.target as HTMLInputElement).valueAsNumber / scale,
            };
            this.applied = false;
          }}
      /></label>`;
    });
  }

  protected render() {
    const s = this.summary;
    return html`<section aria-label="City development">
      ${s && s.status !== "waiting"
        ? html`<p>
              <strong
                >Population ${Math.round(s.population).toLocaleString()}</strong
              >
              · idle ${Math.round(s.idle).toLocaleString()} · deployed
              ${Math.round(s.deployed).toLocaleString()}
            </p>
            <p>
              Housing ${s.housing.toLocaleString()} ·
              ${s.occupancy === null
                ? "No housing"
                : `${(s.occupancy * 100).toFixed(1)}% occupied`}
            </p>
            <p>
              Births/s ${s.birthsPerSecond.toFixed(2)} · Housing pressure
              ${(s.pressure * 100).toFixed(0)}%
            </p>
            <p>${statusText[s.status]}</p>
            ${s.upgradeBlocked && s.status === "no-space"
              ? html`<p>
                  Upgrades need four adjacent tiles at the same or a higher
                  level.
                </p>`
              : null}`
        : html`<p>City development — waiting for the match to start.</p>`}
      <details>
        <summary>Next-match economy</summary>
        <p class="muted">
          Draft settings apply after you save them here and restart the match.
          The current match keeps its starting rules.
        </p>
        ${this.numeric(settings)}
        <fieldset>
          <legend>Fertility gradient</legend>
          ${this.numeric(fertility)}
        </fieldset>
        ${this.economicError
          ? html`<p role="alert">${this.economicError}</p>`
          : null}
        <button data-apply-next @click=${this.applyNext}>
          Apply to next match
        </button>
        ${this.applied
          ? html`<p>
              Saved for next match. Use Restart to begin with these settings.
            </p>`
          : null}
      </details>
      <details>
        <summary>Live visual ages & colours</summary>
        <p class="muted">
          Visual ages follow development levels, not elapsed years. Colours and
          anchors update immediately and do not change population or
          construction.
        </p>
        ${this.styles.map(
          (age, i) =>
            html`<fieldset>
              <legend>${age.name}</legend>
              <label
                >Age anchor<input
                  type="number"
                  name=${`age-${i}`}
                  aria-label=${`${age.name} age anchor`}
                  min="1"
                  max="100"
                  step="1"
                  .value=${String(this.levels[i])}
                  @input=${(e: Event) => {
                    this.levels = this.levels.map((n, j) =>
                      j === i
                        ? (e.target as HTMLInputElement).valueAsNumber
                        : n,
                    );
                    this.applyVisuals();
                  }}
              /></label>
              <div class="colors">
                ${["ground", "road", "0", "1", "2", "3"].map(
                  (key) =>
                    html`<label
                      >${key === "ground"
                        ? "Ground"
                        : key === "road"
                          ? "Road"
                          : `House ${Number(key) + 1}`}<input
                        type="color"
                        name=${`color-${i}-${key}`}
                        aria-label=${`${age.name} ${key === "ground" || key === "road" ? key : `house ${Number(key) + 1}`}`}
                        .value=${key === "ground" || key === "road"
                          ? age[key]
                          : age.houses[Number(key)]}
                        @input=${(e: Event) => {
                          const value = (e.target as HTMLInputElement).value;
                          this.styles = this.styles.map((style, j) =>
                            j !== i
                              ? style
                              : key === "ground" || key === "road"
                                ? { ...style, [key]: value }
                                : {
                                    ...style,
                                    houses: style.houses.map((color, k) =>
                                      k === Number(key) ? value : color,
                                    ),
                                  },
                          );
                          this.applyVisuals();
                        }}
                    /></label>`,
                )}
              </div>
            </fieldset>`,
        )}
        ${this.visualError
          ? html`<p role="alert">${this.visualError}</p>`
          : null}
        <button
          data-reset-visuals
          @click=${() => {
            this.levels = [...approved.ageLevels];
            this.styles = structuredClone(approved.palettes);
            this.applyVisuals();
          }}
        >
          Restore saved palette defaults
        </button>
      </details>
    </section>`;
  }
}
