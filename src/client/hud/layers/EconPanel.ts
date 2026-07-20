import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { Controller } from "../../Controller";
import { translateText } from "../../Utils";
import { GameView, PlayerView } from "../../view";
import "../ui/ResourceChart";
import { ResourceChart, ResourceSample } from "../ui/ResourceChart";

/** Sample cadence in game ticks (~0.5s at 10 tps). */
const SAMPLE_EVERY_TICKS = 5;

/**
 * The food economy panel (add-economy-insights): a thin food-specific wiring
 * of ResourceChart. Every food accessor lives HERE — a future metal/oil
 * panel is a second instance of the chart with different accessors, not a
 * new implementation.
 */
@customElement("econ-panel")
export class EconPanel extends LitElement implements Controller {
  public game: GameView | null = null;
  public eventBus: EventBus | null = null;

  @property({ type: Boolean }) visible = false;

  private lastSampledTick = -1;

  createRenderRoot() {
    return this;
  }

  init() {}

  getTickIntervalMs() {
    return 250; // sampling is deduped by game tick below
  }

  tick() {
    const game = this.game;
    if (game === null) return;
    const tick = game.ticks();
    if (tick - this.lastSampledTick < SAMPLE_EVERY_TICKS) return;
    const me = game.myPlayer();
    if (!me || !me.isAlive()) return;
    this.lastSampledTick = tick;

    // Sample even while hidden so opening the panel shows history.
    const chart = this.querySelector("resource-chart");
    if (!(chart instanceof ResourceChart)) {
      // `game` is a plain property (assigned after first render) — nudge a
      // re-render so the chart mounts, then sampling starts next pass.
      this.requestUpdate();
      return;
    }
    chart.addSample(this.foodSample(me));
  }

  /**
   * Storage capacity for the chart scale: the base granary cap, stretched
   * to whatever the player actually holds — the per-farm cap bonus is not
   * mirrored to the client, so the live stock is the best available bound.
   */
  private capacityOf(p: PlayerView): number {
    const f = this.game!.config().food();
    return Math.max(f.granaryBase, Number(p.food()));
  }

  private foodSample(me: PlayerView): ResourceSample {
    const game = this.game!;
    const alive = game.playerViews().filter((p) => p.isAlive());
    const myFood = Number(me.food());
    let maxCapacity = 0;
    let rank = 1;
    for (const p of alive) {
      maxCapacity = Math.max(maxCapacity, this.capacityOf(p));
      if (p !== me && Number(p.food()) > myFood) rank++;
    }
    return {
      stock: myFood,
      capacity: this.capacityOf(me),
      maxCapacity,
      production: me.foodProduction(),
      consumption: me.foodConsumption(),
      rank,
      alive: alive.length,
    };
  }

  render() {
    if (this.game === null) {
      return html``;
    }
    // Keep the chart mounted while hidden: the ring buffer lives in the
    // element, and opening the panel should show history, not start cold.
    return html`
      <div
        class="mt-2 p-2 rounded-lg bg-gray-800/85 w-max ${this.visible
          ? ""
          : "hidden"}"
      >
        <div class="text-xs font-bold text-white mb-1">
          ${translateText("econ_panel.food_title")}
        </div>
        <resource-chart></resource-chart>
      </div>
    `;
  }
}
