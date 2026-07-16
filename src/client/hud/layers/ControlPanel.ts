import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { Config } from "../../../core/configuration/Config";
import { EventBus } from "../../../core/EventBus";
import { GameMode, GameType, Gold } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { UserSettings } from "../../../core/game/UserSettings";
import { ClientID } from "../../../core/Schemas";
import { SendFoodAllocationIntentEvent } from "../../board/BoardEvents";
import { Controller } from "../../Controller";
import { AttackRatioEvent } from "../../InputHandler";
import { UIState } from "../../UIState";
import {
  getGamesPlayed,
  renderNumber,
  renderTroops,
  translateText,
} from "../../Utils";
import { GameView } from "../../view";
import { PlayerView } from "../../view/PlayerView";
const barnIcon = assetUrl("images/BarnIconWhite.svg");
const foodIcon = assetUrl("images/FoodIcon.svg");
const soldierIcon = assetUrl("images/SoldierIcon.svg");
const swordIcon = assetUrl("images/SwordIcon.svg");

@customElement("control-panel")
export class ControlPanel extends LitElement implements Controller {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public uiState: UIState;

  @state()
  private attackRatio: number = 0.2;

  @state()
  private _maxTroops: number;

  @state()
  private troopRate: number;

  @state()
  private _troops: number;

  @state()
  private _isVisible = false;

  @state()
  private _notification: { type: "warning" | "info"; message: string } | null =
    null;

  // Food economy (layered games only)
  @state()
  private _food: Gold = 0n;
  /**
   * Allocation slider (add-food-allocation): population share of each
   * tick's production. Seeded from the sim once, then locally authoritative
   * (the intent round-trips through the turn loop).
   */
  @state()
  private _foodAllocation: number | null = null;
  @state()
  private _foodNetPerTick: number = 0;
  @state()
  private _foodStarving: boolean = false;

  @state()
  private _attackingTroops: number = 0;

  @state()
  @state()
  private _troopRateIsIncreasing: boolean = true;
  private _lastTroopSample: { tick: number; troops: number } | null = null;

  // Border detection cache
  private _nearbyPlayerIDs: Set<number> = new Set();
  private _borderRefreshCounter: number = 0;
  private _borderTilesPromise: Promise<void> | null = null;
  // Track last attack tick per target player (for 15-second threshold)
  private _lastAttackTickByTarget: Map<number, number> = new Map();
  private static readonly BORDER_REFRESH_INTERVAL = 10; // recompute every 1s
  private static readonly ATTACK_THRESHOLD_TICKS = 15 * 10; // 15 seconds

  init() {
    this.attackRatio = new UserSettings().attackRatio();
    this.uiState.attackRatio = this.attackRatio;
    this.eventBus.on(AttackRatioEvent, (event) => {
      let newAttackRatio = this.attackRatio + event.attackRatio / 100;

      if (newAttackRatio < 0.01) {
        newAttackRatio = 0.01;
      }

      if (newAttackRatio > 1) {
        newAttackRatio = 1;
      }

      if (newAttackRatio === 0.11 && this.attackRatio === 0.01) {
        // If we're changing the ratio from 1%, then set it to 10% instead of 11% to keep a consistency
        newAttackRatio = 0.1;
      }

      this.attackRatio = newAttackRatio;
      this.onAttackRatioChange(this.attackRatio);
    });
  }

  tick() {
    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisibile(true);
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    this.updateTroopIncrease();

    const config = this.game.config();
    this._maxTroops = config.maxTroops(player);
    this._troops = player.troops();
    this._food = player.food();
    this._foodAllocation ??= player.foodPopulationShare();
    this._foodNetPerTick = player.foodProduction() - player.foodConsumption();
    this._foodStarving = player.foodStarved() > 0;
    this._attackingTroops = player
      .outgoingAttacks()
      .map((a) => a.troops)
      .reduce((a, b) => a + b, 0);

    const helpEnabled = new UserSettings().helpMessages();

    // Don't target veteran players
    if (helpEnabled && getGamesPlayed() < 20) {
      // Track outgoing attacks for 15-second threshold
      this.trackOutgoingAttacks(player);

      // Refresh border detection cache periodically
      this.refreshNearbyPlayers(player);

      // Compute notification
      this._notification = this.computeNotification(player, config);
    }

    this.requestUpdate();
  }

  private trackOutgoingAttacks(player: PlayerView) {
    const currentTick = this.game.ticks();
    for (const attack of player.outgoingAttacks()) {
      if (attack.targetID !== 0 && !attack.retreating) {
        this._lastAttackTickByTarget.set(attack.targetID, currentTick);
      }
    }
    // Clean up old entries
    for (const [playerID, tick] of this._lastAttackTickByTarget.entries()) {
      if (currentTick - tick > ControlPanel.ATTACK_THRESHOLD_TICKS * 2) {
        this._lastAttackTickByTarget.delete(playerID);
      }
    }
  }

  private refreshNearbyPlayers(player: PlayerView) {
    this._borderRefreshCounter++;
    if (
      this._borderRefreshCounter < ControlPanel.BORDER_REFRESH_INTERVAL ||
      this._borderTilesPromise !== null
    ) {
      return;
    }
    this._borderRefreshCounter = 0;
    this._borderTilesPromise = player.borderTiles().then((bt) => {
      this._borderTilesPromise = null;
      const myID = player.smallID();
      const nearby = new Set<number>();
      for (const tile of bt.borderTiles) {
        for (const neighbor of this.game.neighbors(tile as TileRef)) {
          const ownerID = this.game.ownerID(neighbor);
          if (ownerID !== 0 && ownerID !== myID) {
            nearby.add(ownerID);
          }
        }
      }
      this._nearbyPlayerIDs = nearby;
    });
  }

  private computeNotification(
    player: PlayerView,
    config: Config,
  ): { type: "warning" | "info"; message: string } | null {
    const currentTick = this.game.ticks();

    // Army limit warning
    const { gameMode, gameType } = config.gameConfig();
    const isPublicTeamGame =
      gameMode === GameMode.Team && gameType === GameType.Public;
    const canDonateTroops = config.donateTroops();
    if (isPublicTeamGame && canDonateTroops) {
      const ratio = this._troops / Math.max(this._maxTroops, 1);
      if (ratio >= config.armyLimitWarningThreshold()) {
        return {
          type: "warning",
          message: "control_panel.army_limit_warning",
        };
      }
    }

    // Low troops (Less than 1k) warning
    if (this._troops < 10000 && this._troops > 0) {
      return { type: "warning", message: "control_panel.low_troops_warning" };
    }

    // Info messages: check nearby players for traitors, AFK allies, AFK teammates
    for (const nearbyID of this._nearbyPlayerIDs) {
      let other;
      try {
        other = this.game.playerBySmallID(nearbyID);
      } catch {
        continue;
      }
      if (!other.isPlayer() || !other.isAlive()) continue;

      const lastAttackTick = this._lastAttackTickByTarget.get(nearbyID) ?? -1;
      const secondsSinceAttack = (currentTick - lastAttackTick) / 10;
      const hasNotAttackedRecently =
        lastAttackTick < 0 || secondsSinceAttack > 15;

      if (!hasNotAttackedRecently) continue;

      if (other.isTraitor() && player.isAlliedWith(other)) {
        return { type: "info", message: "control_panel.traitor_neighbor_info" };
      }
      if (other.isDisconnected() && player.isAlliedWith(other)) {
        return {
          type: "info",
          message: "control_panel.allied_afk_neighbor_info",
        };
      }
      if (other.isDisconnected() && player.isOnSameTeam(other)) {
        return {
          type: "info",
          message: "control_panel.teammate_afk_neighbor_info",
        };
      }
    }

    return null;
  }

  private updateTroopIncrease() {
    const player = this.game?.myPlayer();
    if (player === null) return;
    // The urban-core tick owns population growth, so the displayed rate is
    // the observed troop delta (per second: 10 ticks/s), not a formula.
    const tick = this.game.ticks();
    const troops = player.troops();
    const last = this._lastTroopSample;
    if (last !== null && tick > last.tick) {
      const perTick = (troops - last.troops) / (tick - last.tick);
      this.troopRate = perTick * 10;
      this._troopRateIsIncreasing = perTick >= 0;
    }
    if (last === null || tick !== last.tick) {
      this._lastTroopSample = { tick, troops };
    }
  }

  onAttackRatioChange(newRatio: number) {
    this.uiState.attackRatio = newRatio;
  }

  setVisibile(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  private handleRatioSliderInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = Number(input.value);
    this.attackRatio = value / 100;
    this.onAttackRatioChange(this.attackRatio);
  }

  private handleRatioSliderPointerUp(e: Event) {
    (e.target as HTMLInputElement).blur();
  }

  private handleFoodAllocationInput(e: Event) {
    const value = Number((e.target as HTMLInputElement).value);
    this._foodAllocation = value / 100;
    this.eventBus.emit(new SendFoodAllocationIntentEvent(this._foodAllocation));
  }

  /** Allocation slider: population share ↔ storage share. */
  private renderFoodAllocationRow(compact: boolean) {
    if (this._foodAllocation === null) {
      return html``;
    }
    const popPct = Math.round(this._foodAllocation * 100);
    return html`
      <div
        class="flex items-center gap-1.5 ${compact ? "" : "mt-1"}"
        translate="no"
        title=${translateText("control_panel.food_allocation")}
      >
        <div
          class="flex items-center gap-1 shrink-0 border border-gray-600 rounded-md px-1 py-0.5 ${compact
            ? "text-xs"
            : "text-sm"} font-bold text-white cursor-pointer ${compact
            ? "w-[7rem]"
            : "w-[8rem]"}"
        >
          <img
            src=${soldierIcon}
            alt=""
            aria-hidden="true"
            width="12"
            height="12"
            style="filter: brightness(0) invert(1);"
          />
          <span class="tabular-nums">${popPct}%</span>
          <img
            src=${barnIcon}
            alt=""
            aria-hidden="true"
            width="12"
            height="12"
            class="ml-auto"
          />
          <span class="tabular-nums">${100 - popPct}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          .value=${String(popPct)}
          @input=${(e: Event) => this.handleFoodAllocationInput(e)}
          @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
          class="flex-1 h-1.5 accent-amber-300 cursor-pointer"
        />
      </div>
    `;
  }

  private calculateTroopBar(): { greenPercent: number; orangePercent: number } {
    const base = Math.max(this._maxTroops, 1);
    const greenPercentRaw = (this._troops / base) * 100;
    const orangePercentRaw = (this._attackingTroops / base) * 100;

    const greenPercent = Math.max(0, Math.min(100, greenPercentRaw));
    const orangePercent = Math.max(
      0,
      Math.min(100 - greenPercent, orangePercentRaw),
    );

    return { greenPercent, orangePercent };
  }

  private renderMobileTroopBar() {
    const { greenPercent, orangePercent } = this.calculateTroopBar();
    return html`
      <div
        class="w-full h-6 border border-gray-600 rounded-md bg-gray-900/60 overflow-hidden relative"
      >
        <div class="relative h-full">
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-malibu-blue transition-transform duration-200 ease-out"
            style="transform: scaleX(${greenPercent / 100});"
          ></div>
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-aquarius transition-transform duration-200 ease-out"
            style="transform: translateX(${greenPercent}%) scaleX(${orangePercent /
            100});"
          ></div>
        </div>
        <div
          class="absolute inset-0 flex items-center justify-between px-1.5 text-xs font-bold leading-none pointer-events-none"
          translate="no"
        >
          <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >${renderTroops(this._troops)}</span
          >
          <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >${renderTroops(this._maxTroops)}</span
          >
        </div>
        <div
          class="absolute inset-0 flex items-center justify-center gap-0.5 pointer-events-none"
          translate="no"
        >
          <img
            src=${soldierIcon}
            alt=""
            aria-hidden="true"
            width="12"
            height="12"
            class="brightness-0 invert drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
          />
          <span
            class="text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${this
              ._troopRateIsIncreasing
              ? "text-green-400"
              : "text-orange-400"}"
            >+${renderTroops(this.troopRate)}/s</span
          >
        </div>
      </div>
    `;
  }

  private renderDesktopTroopBar() {
    const { greenPercent, orangePercent } = this.calculateTroopBar();
    return html`
      <div
        class="w-full h-6 border border-gray-600 rounded-md bg-gray-900/60 overflow-hidden relative"
      >
        <div class="relative h-full">
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-malibu-blue transition-transform duration-200 ease-out"
            style="transform: scaleX(${greenPercent / 100});"
          ></div>
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-aquarius transition-transform duration-200 ease-out"
            style="transform: translateX(${greenPercent}%) scaleX(${orangePercent /
            100});"
          ></div>
        </div>
        <div
          class="absolute inset-0 flex items-center text-lg font-bold leading-none pointer-events-none"
          translate="no"
        >
          <span class="flex-1 flex justify-end h-full items-center pr-0.5">
            <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
              >${renderTroops(this._troops)}</span
            >
          </span>
          <span
            class="h-full flex items-center px-0.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >/</span
          >
          <span
            class="flex-1 flex justify-start h-full items-center pl-0.5 gap-0.5"
          >
            <span
              class="text-white tabular-nums w-[3.5rem] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
              >${renderTroops(this._maxTroops)}</span
            >
            <img
              src=${soldierIcon}
              alt=""
              aria-hidden="true"
              width="22"
              height="22"
              class="shrink-0 brightness-0 invert drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ml-1.5"
            />
          </span>
        </div>
      </div>
    `;
  }

  private renderNotification() {
    if (!this._notification) return html``;
    const isWarning = this._notification.type === "warning";
    return html`
      <div
        class="flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-xs font-medium mb-1 ${isWarning
          ? "border-orange-400/60 bg-orange-400/10 text-orange-300"
          : "border-blue-400/60 bg-blue-400/10 text-blue-300"}"
      >
        <span class="shrink-0">${isWarning ? "⚠" : "ℹ"}</span>
        <span>${translateText(this._notification.message)}</span>
      </div>
    `;
  }

  private renderDesktop() {
    return html`
      ${this.renderNotification()}
      <!-- Row 1: troop rate | troop bar | gold -->
      <div class="flex gap-1.5 items-center mb-1">
        <!-- Troop rate -->
        <div
          class="flex items-center gap-1 shrink-0 border rounded-md font-bold text-sm py-0.5 px-1 w-[5.5rem] ${this
            ._troopRateIsIncreasing
            ? "border-green-400"
            : "border-orange-400"}"
          translate="no"
        >
          <img
            src=${soldierIcon}
            alt=""
            aria-hidden="true"
            width="13"
            height="13"
            class="shrink-0"
            style="filter: ${this._troopRateIsIncreasing
              ? "brightness(0) saturate(100%) invert(74%) sepia(44%) saturate(500%) hue-rotate(83deg) brightness(103%)"
              : "brightness(0) saturate(100%) invert(65%) sepia(60%) saturate(600%) hue-rotate(330deg) brightness(105%)"}"
          />
          <span
            class="text-sm font-bold tabular-nums ${this._troopRateIsIncreasing
              ? "text-green-400"
              : "text-orange-400"}"
            >+${renderTroops(this.troopRate)}/s</span
          >
        </div>
        <!-- Troop bar -->
        <div class="flex-1">${this.renderDesktopTroopBar()}</div>
        ${this.renderFoodChip("text-sm")}
      </div>
      <!-- Row 2: attack ratio | slider -->
      <div class="flex items-center gap-1.5" translate="no">
        <div
          class="flex items-center gap-1 shrink-0 border border-gray-600 rounded-md px-1 py-0.5 text-sm font-bold text-white cursor-pointer w-[8rem]"
        >
          <img
            src=${swordIcon}
            alt=""
            aria-hidden="true"
            width="12"
            height="12"
            style="filter: brightness(0) invert(1);"
          />
          <span
            >${(this.attackRatio * 100).toFixed(0)}%
            (${renderTroops(
              (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio,
            )})</span
          >
        </div>
        <input
          type="range"
          min="1"
          max="100"
          .value=${String(Math.round(this.attackRatio * 100))}
          @input=${(e: Event) => this.handleRatioSliderInput(e)}
          @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
          class="flex-1 h-1.5 accent-aquarius cursor-pointer"
        />
      </div>
      <!-- Row 3: food allocation (population share ↔ storage share) -->
      ${this.renderFoodAllocationRow(false)}
    `;
  }

  /**
   * Food stock + net flow chip. Red border + red net while starving;
   * green/red net sign otherwise.
   */
  private renderFoodChip(textSize: string) {
    const netPerSec = this._foodNetPerTick * 10;
    const gaining = this._foodNetPerTick >= 0;
    return html`
      <div
        class="flex items-center gap-1 shrink-0 border rounded-md font-bold ${textSize} py-0.5 px-1 relative ${this
          ._foodStarving
          ? "border-red-500 text-red-400"
          : "border-amber-300 text-amber-300"}"
        translate="no"
        title=${this._foodStarving
          ? translateText("control_panel.food_starving")
          : translateText("control_panel.food")}
      >
        <img src=${foodIcon} width="13" height="13" class="shrink-0" />
        <span class="tabular-nums">${renderNumber(this._food)}</span>
        <span
          class="tabular-nums ${this._foodStarving
            ? "text-red-400"
            : gaining
              ? "text-green-400"
              : "text-orange-400"}"
          >${gaining ? "+" : ""}${renderNumber(
            BigInt(Math.round(netPerSec)),
          )}/s</span
        >
      </div>
    `;
  }

  private renderMobile() {
    return html`
      ${this.renderNotification()}
      <div class="flex gap-2 items-center">
        ${this.renderFoodChip("text-xs")}
        <!-- Troop bar -->
        <div class="w-[40%] shrink-0 flex items-center">
          ${this.renderMobileTroopBar()}
        </div>
        <!-- Sword + % label -->
        <div
          class="flex flex-col items-center shrink-0 gap-0.5 w-8"
          translate="no"
        >
          <img
            src=${swordIcon}
            alt=""
            aria-hidden="true"
            width="10"
            height="10"
            style="filter: brightness(0) invert(1);"
          />
          <span class="text-white text-xs font-bold tabular-nums"
            >${(this.attackRatio * 100).toFixed(0)}%</span
          >
        </div>
        <!-- Attack ratio slider -->
        <div class="flex-1" translate="no">
          <input
            type="range"
            min="1"
            max="100"
            .value=${String(Math.round(this.attackRatio * 100))}
            @input=${(e: Event) => this.handleRatioSliderInput(e)}
            @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
            class="w-full h-1.5 accent-aquarius cursor-pointer"
          />
        </div>
      </div>
      ${this.renderFoodAllocationRow(true)}
    `;
  }

  render() {
    return html`
      <div
        class="relative pointer-events-auto ${this._isVisible
          ? "relative w-full text-sm px-2 py-1"
          : "hidden"}"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div class="lg:hidden">${this.renderMobile()}</div>
        <div class="hidden lg:block">${this.renderDesktop()}</div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
