import { Execution, Game, Player } from "../game/Game";
import type { PlayerImpl } from "../game/PlayerImpl";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash } from "../Util";
import { AttackExecution } from "./AttackExecution";
import { BoatRetreatExecution } from "./BoatRetreatExecution";
import { PaintTilesExecution } from "./PaintTilesExecution";
import { RetreatExecution } from "./RetreatExecution";
import { TransportShipExecution } from "./TransportShipExecution";
import { decidePaintedAI, paintedAIState } from "./utils/PaintedAI";

export function attachPaintedAI(
  gameID: string,
  game: Game,
  player: Player,
): void {
  const cfg = game.config().paintedAI();
  if (!cfg || !player.hasSpawned()) return;
  if (paintedAIState(player)?.attached) return;
  const random = new PseudoRandom(simpleHash(gameID) + simpleHash(player.id()));
  (player as PlayerImpl)._paintedAI = {
    attached: true,
    phase: random.nextInt(0, cfg.decisionTicks),
    reserveRatio: random.nextFloat(cfg.reserveMin, cfg.reserveMax),
    policy: "balanced",
    lastDecisionTick: -1,
    plotCursor: 0,
    borderCursor: 0,
    coastCursor: 0,
    campaign: null,
    pendingCoast: null,
    foodBlockedTicks: 0,
  };
  game.addExecution(new PaintedAIExecution(player));
}

export class PaintedAIExecution implements Execution {
  private game: Game;
  private active = true;
  constructor(private player: Player) {}
  init(game: Game): void {
    this.game = game;
  }
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  tick(ticks: number): void {
    const state = paintedAIState(this.player),
      game = this.game;
    if (!state || !this.player.isAlive() || game.getWinner() !== null) {
      this.active = false;
      if (state) state.attached = false;
      return;
    }
    if (game.inSpawnPhase() || !this.player.hasSpawned()) return;
    const cfg = game.config().paintedAI();
    if (
      !cfg ||
      ticks === state.lastDecisionTick ||
      ticks % cfg.decisionTicks !== state.phase
    )
      return;
    state.lastDecisionTick = ticks;
    const decision = decidePaintedAI(game, this.player, state);
    switch (decision.kind) {
      case "paint":
        game.addExecution(
          new PaintTilesExecution(this.player, decision.plot, [decision.tile]),
        );
        break;
      case "attack":
        game.addExecution(
          new AttackExecution(
            decision.troops,
            this.player,
            decision.targetID,
            null,
            true,
            decision.sourceTiles,
          ),
        );
        break;
      case "wait":
        if (decision.reason === "food")
          state.foodBlockedTicks += cfg.decisionTicks;
        break;
      case "retreat":
        game.addExecution(new RetreatExecution(this.player, decision.attackID));
        break;
      case "transport":
        game.addExecution(
          new TransportShipExecution(
            this.player,
            decision.tile,
            decision.troops,
          ),
        );
        break;
      case "boat-retreat":
        game.addExecution(
          new BoatRetreatExecution(this.player, decision.unitID),
        );
        break;
    }
  }
}
