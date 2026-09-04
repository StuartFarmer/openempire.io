import {
  Difficulty,
  Game,
  GameMode,
  GameType,
  HumansVsNations,
  Player,
  PlayerID,
  PlayerType,
  Relation,
  Structures,
  TerraNullius,
  UnitType,
} from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { canBuildTransportShip } from "../../game/TransportShipUtils";
import { PseudoRandom } from "../../PseudoRandom";
import {
  assertNever,
  boundingBoxCenter,
  calculateBoundingBoxCenter,
} from "../../Util";
import { AttackExecution } from "../AttackExecution";
import { DonateTroopsExecution } from "../DonateTroopExecution";
import { NationAllianceBehavior } from "../nation/NationAllianceBehavior";
import {
  EMOJI_ASSIST_ACCEPT,
  EMOJI_ASSIST_RELATION_TOO_LOW,
  EMOJI_ASSIST_TARGET_ALLY,
  EMOJI_ASSIST_TARGET_ME,
  NationEmojiBehavior,
} from "../nation/NationEmojiBehavior";
import { TransportShipExecution } from "../TransportShipExecution";
import { closestTwoTiles } from "../Util";
import { borderSegment } from "./BorderSegment";
import { deployableTroops, fieldStaffingNeed } from "./EconomyModel";
import { foodShedField } from "./FoodShed";
import {
  committedShare,
  effectiveMaxTroops,
  foodRunwayTicks,
  totalPower,
} from "./WarIntel";

/** An open war goal (rework-ai-war-strategy D3): reinforce `targetID` every
 *  pass while the war is +EV — net tiles growing, population holding. */
interface Campaign {
  targetID: PlayerID;
  lastTiles: number;
  lastPop: number;
  stalls: number;
}

export class AiAttackBehavior {
  private botAttackTroopsSent: number = 0;
  private campaign: Campaign | null = null;
  /** Bordering players' totalPower from the previous attack pass (D7). */
  private lastPassPower = new Map<PlayerID, number>();
  /** Derived once per pass from lastPassPower vs live readings. */
  private surging = new Set<PlayerID>();
  private powerDeclined = new Set<PlayerID>();

  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
    private triggerRatio: number,
    private reserveRatio: number,
    private expandRatio: number,
    private allianceBehavior?: NationAllianceBehavior,
    private emojiBehavior?: NationEmojiBehavior,
  ) {}

  maybeAttack() {
    if (this.player === null || this.allianceBehavior === undefined) {
      throw new Error("not initialized");
    }

    const border = Array.from(this.player.borderTiles())
      .flatMap((t) => this.game.neighbors(t))
      .filter(
        (t) =>
          this.game.isLand(t) &&
          !this.game.isImpassable(t) &&
          this.game.ownerID(t) !== this.player?.smallID(),
      );
    const playerNeighbors = this.player.nearby();
    const borderingPlayerSet = new Set<Player>(
      border
        .map((t) => this.game.playerBySmallID(this.game.ownerID(t)))
        .filter((o): o is Player => o.isPlayer()),
    );
    for (const n of playerNeighbors) {
      if (n.isPlayer()) borderingPlayerSet.add(n);
    }
    const borderingPlayers = [...borderingPlayerSet].sort(
      (a, b) => a.troops() - b.troops(),
    );
    const borderingFriends = borderingPlayers.filter(
      (o) => this.player?.isFriendly(o) === true,
    );
    const borderingEnemies = borderingPlayers.filter(
      (o) => this.player?.isFriendly(o) === false,
    );

    this.updateTrendMemory(borderingPlayers);
    this.applyThreatDrift(borderingPlayers);

    // Attack TerraNullius but not nuked territory (direct border or across a river)
    const hasNonNukedTerraNullius =
      border.some((t) => !this.game.hasOwner(t) && !this.game.hasFallout(t)) ||
      playerNeighbors.some((n) => !n.isPlayer());
    if (hasNonNukedTerraNullius) {
      if (this.sendAttack(this.game.terraNullius())) return;
    }

    if (borderingEnemies.length === 0) {
      if (this.random.chance(5)) {
        this.attackWithRandomBoat();
      }
    } else {
      if (this.random.chance(10)) {
        this.attackWithRandomBoat(borderingEnemies);
        return;
      }

      this.allianceBehavior.maybeSendAllianceRequests(borderingEnemies);
    }

    this.attackBestTarget(borderingFriends, borderingEnemies);
  }

  /**
   * Strength trend memory (D7): compare live totalPower against last pass's
   * readings, derive the surge/decline sets the strategies consult, then
   * store this pass's readings. Runs once at the top of maybeAttack so early
   * returns can't skip it; entries for players no longer bordering drop out.
   */
  private updateTrendMemory(borderingPlayers: Player[]) {
    const f = this.game.config().food();
    const powerNow = new Map<PlayerID, number>();
    this.surging.clear();
    this.powerDeclined.clear();
    for (const p of borderingPlayers) {
      const now = totalPower(p);
      powerNow.set(p.id(), now);
      const prev = this.lastPassPower.get(p.id());
      if (prev === undefined) continue; // first sight → not surging
      if (now > prev * f.surgeGrowthFactor) this.surging.add(p.id());
      if (now < prev) this.powerDeclined.add(p.id());
    }
    this.lastPassPower = powerNow;
  }

  /**
   * Threat drift (D5): a bordering non-friendly player at ≥ threatPowerRatio
   * × our total power drifts toward Hostile each pass. Relation decay
   * recovers it when the differential ends, so hostility tracks the threat —
   * neighbors of a snowballing player organically turn on it, with no global
   * leader bookkeeping. One-directional: never a bonus for weak neighbors.
   */
  private applyThreatDrift(borderingPlayers: Player[]) {
    const f = this.game.config().food();
    const ourPower = Math.max(1, totalPower(this.player));
    for (const other of borderingPlayers) {
      if (this.player.isFriendly(other)) continue;
      if (other.type() === PlayerType.Bot) continue;
      if (totalPower(other) >= f.threatPowerRatio * ourPower) {
        this.player.updateRelation(other, -f.threatDriftPerPass);
      }
    }
  }

  /** Open (or refresh) the war goal after a successful attack on a player. */
  private openCampaign(target: Player) {
    if (this.player.type() !== PlayerType.Nation) return;
    this.campaign = {
      targetID: target.id(),
      lastTiles: this.player.numTilesOwned(),
      lastPop: totalPower(this.player),
      stalls: 0,
    };
  }

  /**
   * Campaign persistence (D3), called after the reserve gate and before the
   * trigger lottery. Returns true when it reinforced (pass consumed). While
   * the war is +EV — net tiles grew, population held — keep the pressure on
   * the same target every pass; a population drop below campaignPopFloor
   * ends the war immediately (it is consuming the demography); a stall ends
   * it after campaignMaxStalls passes. Reinforcements flow through the
   * normal sizing path, so reserve, staffing floor, war share, and send
   * caps all still bind — persistence changes cadence, never depth.
   */
  private tickCampaign(): boolean {
    if (this.campaign === null) return false;
    const f = this.game.config().food();
    const target = this.game.player(this.campaign.targetID);
    if (!target.isAlive() || this.player.isFriendly(target)) {
      this.campaign = null;
      return false;
    }

    const tiles = this.player.numTilesOwned();
    const pop = totalPower(this.player);
    const gained = tiles > this.campaign.lastTiles;
    const popHolding = pop >= this.campaign.lastPop * f.campaignPopFloor;

    if (!popHolding) {
      this.campaign = null;
      return false;
    }
    if (gained) {
      // sendAttack refreshes the campaign snapshots on success.
      if (this.sendAttack(target)) return true;
      this.campaign.lastTiles = tiles;
      this.campaign.lastPop = pop;
      return false;
    }
    this.campaign.stalls++;
    if (this.campaign.stalls >= f.campaignMaxStalls) {
      this.campaign = null;
      return false;
    }
    this.campaign.lastTiles = tiles;
    this.campaign.lastPop = pop;
    return false;
  }

  private attackWithRandomBoat(borderingEnemies: Player[] = []) {
    if (this.player === null) throw new Error("not initialized");

    if (this.game.config().isUnitDisabled(UnitType.TransportShip)) {
      return;
    }

    // Check if we've already sent out the maximum number of transport ships
    if (
      this.player.unitCount(UnitType.TransportShip) >=
      this.game.config().boatMaxNumber()
    ) {
      return;
    }

    // Check if we have any shore tiles to launch from
    const shore = Array.from(this.player.borderTiles()).filter((t) =>
      this.game.isShore(t),
    );
    if (shore.length === 0) {
      return;
    }

    const src = this.random.randElement(shore);

    // First look for high-interest targets (unowned or bot-owned). Mainly relevant for earlygame
    let dst = this.findRandomBoatTarget(src, borderingEnemies, true);
    if (dst === null) {
      // None found? Then look for players
      dst = this.findRandomBoatTarget(src, borderingEnemies, false);
      if (dst === null) {
        return;
      }
    }

    const owner = this.game.owner(dst);
    const cap = owner.isPlayer() ? this.troopSendCap() : Infinity;
    // Boats are deployment too: bound by the same war share as land attacks,
    // counting what is already committed (deployableTroops nets off live
    // attacks AND transports). Without this the AI stacks boat after boat and
    // exceeds the share it is supposed to be held to.
    const troops = Math.min(
      this.player.troops() / 5,
      cap,
      deployableTroops(this.game, this.player),
    );
    if (troops < 1) return;

    // Hard & Impossible: don't attack if we'd send less than 20% of target's troops
    if (owner.isPlayer() && this.isAttackTooWeak(troops, owner)) {
      return;
    }

    this.game.addExecution(
      new TransportShipExecution(this.player, dst, troops),
    );
  }

  private findRandomBoatTarget(
    tile: TileRef,
    borderingEnemies: Player[],
    highInterestOnly: boolean = false,
  ): TileRef | null {
    if (this.player === null) throw new Error("not initialized");
    const x = this.game.x(tile);
    const y = this.game.y(tile);
    const unreachablePlayers = new Set<PlayerID>();
    for (let i = 0; i < 500; i++) {
      const randX = this.random.nextInt(x - 150, x + 150);
      const randY = this.random.nextInt(y - 150, y + 150);
      if (!this.game.isValidCoord(randX, randY)) {
        continue;
      }
      const randTile = this.game.ref(randX, randY);
      if (!this.game.isLand(randTile)) {
        continue;
      }
      if (this.game.isImpassable(randTile)) {
        continue;
      }
      const owner = this.game.owner(randTile);
      if (owner === this.player) {
        continue;
      }
      // Skip players we already know are unreachable (Performance optimization)
      if (owner.isPlayer() && unreachablePlayers.has(owner.id())) {
        continue;
      }
      // Don't send boats to players with which we share a border, that usually looks stupid
      if (owner.isPlayer() && borderingEnemies.includes(owner)) {
        continue;
      }
      // Don't spam boats into players which are stronger than us (FFA only)
      if (
        this.isFFA() &&
        owner.isPlayer() &&
        owner.troops() > this.player.troops()
      ) {
        continue;
      }

      let matchesCriteria: boolean;
      if (highInterestOnly) {
        // High-interest targeting: prioritize unowned tiles or tiles owned by bots
        matchesCriteria = !owner.isPlayer() || owner.type() === PlayerType.Bot;
      } else {
        // Normal targeting: return unowned tiles or tiles owned by non-friendly players
        matchesCriteria = !owner.isPlayer() || !owner.isFriendly(this.player);
      }
      if (!matchesCriteria) {
        continue;
      }

      // Validate that we can actually build a transport ship to this target
      if (canBuildTransportShip(this.game, this.player, randTile) === false) {
        if (owner.isPlayer()) {
          unreachablePlayers.add(owner.id());
        }
        continue;
      }

      return randTile;
    }
    return null;
  }

  // attackBestTarget is called with borderingFriends and borderingEnemies sorted by troops (ascending)
  private attackBestTarget(
    borderingFriends: Player[],
    borderingEnemies: Player[],
  ) {
    // In games with high starting gold, nations will quickly build a lot of cities
    // This causes them to expand slowly (cities increase max troops), and bots will steal their structures
    // In this case: Attack bots before ratio checks
    if (this.hasNeighboringBotWithStructures()) {
      if (this.attackBots()) return;
    }

    // Save up troops until we reach the reserve ratio
    if (!this.hasReserveRatioTroops()) return;

    // An open +EV campaign reinforces without re-rolling the trigger lottery
    if (this.tickCampaign()) return;

    // Maybe save up troops until we reach the trigger ratio
    if (!this.hasTriggerRatioTroops() && !this.random.chance(10)) return;

    // Get attack strategies in priority order based on difficulty
    const strategies = this.getAttackStrategies(
      borderingFriends,
      borderingEnemies,
    );

    for (const strategy of strategies) {
      if (strategy()) return;
    }
  }

  private getAttackStrategies(
    borderingFriends: Player[],
    borderingEnemies: Player[],
  ): Array<() => boolean> {
    const { difficulty } = this.game.config().gameConfig();

    // Define all strategies as functions that return true if they attacked
    const retaliate = (): boolean => {
      const attacker = this.findIncomingAttackPlayer();
      if (attacker) {
        return this.sendAttack(attacker, true);
      }
      return false;
    };

    const bots = (): boolean => this.attackBots();

    const assist = (): boolean => this.assistAllies();

    const traitor = (): boolean => {
      const traitor = this.findTraitor(borderingEnemies);
      if (traitor) {
        return this.sendAttack(traitor);
      }
      return false;
    };

    const afk = (): boolean => {
      // borderingEnemies is already sorted by troops (ascending), so first match is weakest afk enemy
      const afk = borderingEnemies.find(
        (enemy) =>
          enemy.isDisconnected() &&
          (!this.isFFA() || enemy.troops() < this.player.troops() * 3),
      );
      if (afk) {
        return this.sendAttack(afk);
      }
      return false;
    };

    const betray = (): boolean =>
      this.maybeBetrayAndAttack(borderingFriends, borderingEnemies);

    const nuked = (): boolean => {
      if (this.isBorderingNukedTerritory()) {
        return this.sendAttack(this.game.terraNullius());
      }
      return false;
    };

    const victim = (): boolean => {
      const victim = this.findVictim(borderingEnemies);
      if (victim) {
        return this.sendAttack(victim);
      }
      return false;
    };

    const hated = (): boolean => {
      for (const relation of this.player.allRelationsSorted()) {
        if (relation.relation !== Relation.Hostile) continue;
        const other = relation.player;
        if (this.player.isFriendly(other)) continue;
        if (this.isFFA() && other.troops() > this.player.troops() * 3) continue;
        return this.sendAttack(other);
      }
      return false;
    };

    const veryWeak = (): boolean => {
      const veryWeak = this.findVeryWeakEnemy(borderingEnemies);
      if (veryWeak) {
        return this.sendAttack(veryWeak);
      }
      return false;
    };

    // Dogpile (D4): join a war in progress — hit a weaker-at-home enemy
    // already exchanging attacks with a third party.
    const joinWar = (): boolean => {
      for (const enemy of borderingEnemies) {
        if (enemy.troops() >= this.player.troops()) continue;
        const inThirdPartyWar =
          enemy
            .incomingAttacks()
            .some(
              (a) =>
                a.attacker() !== this.player &&
                !this.player.isFriendly(a.attacker()),
            ) ||
          enemy.outgoingAttacks().some((a) => {
            const t = a.target();
            return t.isPlayer() && t !== this.player;
          });
        if (inThirdPartyWar) {
          return this.sendAttack(enemy);
        }
      }
      return false;
    };

    // Famine warfare (D6): a neighbor with almost no food runway loses
    // population under pressure — attacks against it compound. Fires
    // reliably at resourceFocus 1, rarely at 0.25.
    const starving = (): boolean => {
      const focus = this.game
        .config()
        .aiDifficulty(this.player.type()).resourceFocus;
      if (focus <= 0) return false;
      const denom = Math.max(1, Math.round(1 / focus));
      if (denom > 1 && !this.random.chance(denom)) return false;
      const f = this.game.config().food();
      const target = borderingEnemies.find(
        (enemy) =>
          foodRunwayTicks(enemy) < f.starvingRunwayTicks &&
          (!this.isFFA() ||
            (enemy.troops() < this.player.troops() * 1.2 &&
              !this.surging.has(enemy.id()))),
      );
      if (target) {
        return this.sendAttack(target);
      }
      return false;
    };

    const weakest = (): boolean => {
      // borderingEnemies is already sorted by troops (ascending); in FFA,
      // skip surging enemies (D7) — never fight a steep growth curve.
      const candidate = this.isFFA()
        ? borderingEnemies.find((enemy) => !this.surging.has(enemy.id()))
        : borderingEnemies[0];
      if (candidate !== undefined) {
        // In FFA, don't attack if they have more troops than us
        if (!this.isFFA() || candidate.troops() < this.player.troops()) {
          return this.sendAttack(candidate);
        }
      }
      return false;
    };

    const island = (): boolean => {
      if (borderingEnemies.length === 0) {
        const enemy = this.findNearestIslandEnemy();
        if (enemy) {
          return this.sendAttack(enemy);
        }
      }
      return false;
    };

    const donate = (): boolean => this.donateTroops();

    // Return strategies in order based on difficulty
    // Easy nations get the dumbest order, impossible nations get the smartest order
    switch (difficulty) {
      case Difficulty.Easy:
        // prettier-ignore
        return [nuked, bots, retaliate, assist, betray, hated, weakest];
      case Difficulty.Medium:
        // prettier-ignore
        return [bots, nuked, retaliate, assist, betray, hated, afk, traitor, joinWar, starving, weakest, island, donate];
      case Difficulty.Hard:
        // prettier-ignore
        return [bots, retaliate, assist, betray, nuked, traitor, afk, hated, veryWeak, starving, victim, joinWar, weakest, island, donate];
      case Difficulty.Impossible:
        // prettier-ignore
        return [retaliate, bots, veryWeak, starving, joinWar, assist, traitor, afk, betray, victim, nuked, hated, weakest, island, donate];
      default:
        assertNever(difficulty);
    }
  }

  private hasNeighboringBotWithStructures(): boolean {
    return this.player
      .nearby()
      .some(
        (n) =>
          n.isPlayer() &&
          n.type() === PlayerType.Bot &&
          !this.player.isFriendly(n) &&
          n.units().some((u) => Structures.has(u.type())),
      );
  }

  // Readiness gates (D1): ratios divide by the ACHIEVABLE population —
  // food-supported capacity clamped to housing — not raw housing capacity,
  // which a food-bound population never approaches (nations idled forever
  // in the trigger lottery on housing-based ratios).
  private hasReserveRatioTroops(): boolean {
    const maxTroops = effectiveMaxTroops(this.game, this.player);
    const ratio = this.player.troops() / maxTroops;
    return ratio >= this.reserveRatio;
  }

  private hasTriggerRatioTroops(): boolean {
    const maxTroops = effectiveMaxTroops(this.game, this.player);
    const ratio = this.player.troops() / maxTroops;
    return ratio >= this.triggerRatio;
  }

  findIncomingAttackPlayer(): Player | null {
    let incomingAttacks = this.player
      .incomingAttacks()
      .filter((attack) => !this.player.isFriendly(attack.attacker()));
    // Ignore bot attacks if we are not a bot.
    if (this.player.type() !== PlayerType.Bot) {
      incomingAttacks = incomingAttacks.filter(
        (attack) => attack.attacker().type() !== PlayerType.Bot,
      );
    }
    let largestAttack = 0;
    let largestAttacker: Player | undefined;
    for (const attack of incomingAttacks) {
      if (attack.troops() <= largestAttack) continue;
      largestAttack = attack.troops();
      largestAttacker = attack.attacker();
    }
    if (largestAttacker !== undefined) {
      return largestAttacker;
    }
    return null;
  }

  // Sort neighboring bots by density (troops / tiles) and attempt to attack many of them (Parallel attacks)
  // sendAttack will do nothing if we don't have enough reserve troops left
  // Bots that own structures are prioritized as targets (they might have stolen our structures and they will delete them!)
  private attackBots(): boolean {
    const bots = this.player
      .nearby()
      .filter(
        (n): n is Player =>
          n.isPlayer() &&
          this.player.isFriendly(n) === false &&
          n.type() === PlayerType.Bot,
      );

    if (bots.length === 0) {
      return false;
    }

    this.botAttackTroopsSent = 0;

    const density = (p: Player) => p.troops() / p.numTilesOwned();
    const ownsStructures = (p: Player) =>
      p.units().some((u) => Structures.has(u.type()));
    const sortedBots = bots.slice().sort((a, b) => {
      const aHasStructures = ownsStructures(a);
      const bHasStructures = ownsStructures(b);
      if (aHasStructures !== bHasStructures) {
        return aHasStructures ? -1 : 1;
      }
      return density(a) - density(b);
    });
    const reducedBots = sortedBots.slice(0, this.getBotAttackMaxParallelism());

    for (const bot of reducedBots) {
      this.sendAttack(bot);
    }

    // Only short-circuit the rest of the targeting pipeline if we actually
    // allocated some troops to bot attacks.
    return this.botAttackTroopsSent > 0;
  }

  private getBotAttackMaxParallelism(): number {
    const { difficulty } = this.game.config().gameConfig();
    switch (difficulty) {
      case Difficulty.Easy:
        return 1;
      case Difficulty.Medium:
        return this.random.chance(2) ? 1 : 2;
      case Difficulty.Hard:
        return 3;
      // On impossible difficulty, attack as much bots as possible in parallel
      case Difficulty.Impossible: {
        return 100;
      }
      default:
        assertNever(difficulty);
    }
  }

  private assistAllies(): boolean {
    if (this.emojiBehavior === undefined) throw new Error("not initialized");

    if (this.game.config().disableAlliances()) return false;

    for (const ally of this.player.allies()) {
      if (ally.targets().length === 0) continue;
      if (this.player.relation(ally) < Relation.Friendly) {
        this.emojiBehavior.sendEmoji(ally, EMOJI_ASSIST_RELATION_TOO_LOW);
        continue;
      }
      for (const target of ally.targets()) {
        if (target === this.player) {
          this.emojiBehavior.sendEmoji(ally, EMOJI_ASSIST_TARGET_ME);
          continue;
        }
        if (this.player.isFriendly(target)) {
          this.emojiBehavior.sendEmoji(ally, EMOJI_ASSIST_TARGET_ALLY);
          continue;
        }
        if (!this.sendAttack(target)) continue;
        this.player.updateRelation(ally, -20);
        this.emojiBehavior.sendEmoji(ally, EMOJI_ASSIST_ACCEPT);
        return true;
      }
    }
    return false;
  }

  // Find a traitor who isn't significantly stronger than us
  private findTraitor(borderingEnemies: Player[]): Player | null {
    if (this.game.config().disableAlliances()) return null;

    // borderingEnemies is already sorted by troops (ascending), so first match is weakest traitor
    return (
      borderingEnemies.find(
        (enemy) =>
          enemy.isTraitor() &&
          (!this.isFFA() || enemy.troops() < this.player.troops() * 1.2),
      ) ?? null
    );
  }

  private maybeBetrayAndAttack(
    borderingFriends: Player[],
    borderingEnemies: Player[],
  ): boolean {
    if (this.allianceBehavior === undefined) throw new Error("not initialized");

    if (this.game.config().disableAlliances()) return false;

    if (borderingFriends.length > 0) {
      for (const friend of borderingFriends) {
        if (
          this.allianceBehavior.maybeBetray(
            friend,
            borderingFriends.length + borderingEnemies.length,
          )
        ) {
          return this.sendAttack(friend, true);
        }
      }
    }
    return false;
  }

  private isBorderingNukedTerritory(): boolean {
    if (this.game.config().isUnitDisabled(UnitType.MissileSilo)) {
      return false;
    }

    for (const tile of this.player.borderTiles()) {
      for (const neighbor of this.game.neighbors(tile)) {
        if (
          this.game.isLand(neighbor) &&
          !this.game.hasOwner(neighbor) &&
          this.game.hasFallout(neighbor)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  // Find someone who isn't significantly stronger than us and is exposed:
  // under big attack from others (50%+ of their troops incoming), or with
  // most of their power deployed away and declining (D2 — a player mid-push
  // elsewhere is thin at home NOW).
  private findVictim(borderingEnemies: Player[]): Player | null {
    // borderingEnemies is already sorted by troops (ascending), so first match is weakest victim
    return (
      borderingEnemies.find((enemy) => {
        if (this.isFFA() && enemy.troops() > this.player.troops() * 1.2) {
          return false;
        }

        const totalIncomingTroops = enemy
          .incomingAttacks()
          .reduce((sum, attack) => sum + attack.troops(), 0);
        if (totalIncomingTroops > enemy.troops() * 0.5) return true;

        return (
          committedShare(enemy) > 0.5 && this.powerDeclined.has(enemy.id())
        );
      }) ?? null
    );
  }

  // Find very weak (less than 15% of their ACHIEVABLE troops, D1) enemies
  // which also don't have significantly more troops than us (to target MIRVed players)
  private findVeryWeakEnemy(borderingEnemies: Player[]): Player | null {
    const veryWeakEnemies = borderingEnemies.filter((enemy) => {
      const enemyMaxTroops = effectiveMaxTroops(this.game, enemy);
      return (
        enemy.troops() < enemyMaxTroops * 0.15 &&
        (!this.isFFA() || enemy.troops() < this.player.troops() * 1.2)
      );
    });

    // borderingEnemies is already sorted by troops (ascending), so first match is weakest very weak enemy
    return veryWeakEnemies.length > 0 ? veryWeakEnemies[0] : null;
  }

  private findNearestIslandEnemy(): Player | null {
    if (this.game.config().isUnitDisabled(UnitType.TransportShip)) {
      return null;
    }

    // Check if we've already sent out the maximum number of transport ships
    if (
      this.player.unitCount(UnitType.TransportShip) >=
      this.game.config().boatMaxNumber()
    ) {
      return null;
    }

    // Check if we have any shore tiles to launch from
    const hasShore = Array.from(this.player.borderTiles()).some((t) =>
      this.game.isShore(t),
    );
    if (!hasShore) return null;

    const filteredPlayers = this.game.players().filter((p) => {
      if (p === this.player) return false;
      if (this.player.isFriendly(p)) return false;
      // In FFA, don't spam boats into players with more troops
      return !this.isFFA() || p.troops() < this.player.troops();
    });

    if (filteredPlayers.length === 0) return null;

    const playerCenter = this.getPlayerCenter(this.player);

    const sortedPlayers = filteredPlayers
      .map((filteredPlayer) => {
        const filteredPlayerCenter = this.getPlayerCenter(filteredPlayer);

        const playerCenterTile = this.game.ref(playerCenter.x, playerCenter.y);
        const filteredPlayerCenterTile = this.game.ref(
          filteredPlayerCenter.x,
          filteredPlayerCenter.y,
        );

        const distance = this.game.manhattanDist(
          playerCenterTile,
          filteredPlayerCenterTile,
        );
        return { player: filteredPlayer, distance };
      })
      .sort((a, b) => a.distance - b.distance); // Sort by distance (ascending)

    // Try players in order of distance until we find reachable candidates
    const reachablePlayers: Player[] = [];
    for (const entry of sortedPlayers) {
      const closest = closestTwoTiles(
        this.game,
        Array.from(this.player.borderTiles()).filter((t) =>
          this.game.isShore(t),
        ),
        Array.from(entry.player.borderTiles()).filter((t) =>
          this.game.isShore(t),
        ),
      );
      if (closest === null) continue;

      if (canBuildTransportShip(this.game, this.player, closest.y)) {
        reachablePlayers.push(entry.player);
        // We only need up to 2 reachable candidates
        if (reachablePlayers.length >= 2) break;
      }
    }

    if (reachablePlayers.length === 0) return null;

    // 33% chance to pick the second-nearest player if available
    if (reachablePlayers.length >= 2 && this.random.chance(3)) {
      return reachablePlayers[1];
    }

    return reachablePlayers[0];
  }

  // In team games, nations should be willing to attack/boat into stronger
  // enemies - they can rely on teammates to donate. In FFA, going after
  // someone significantly stronger is usually a losing proposition.
  private isFFA(): boolean {
    return this.game.config().gameConfig().gameMode === GameMode.FFA;
  }

  private getPlayerCenter(player: Player) {
    if (player.largestClusterBoundingBox) {
      return boundingBoxCenter(player.largestClusterBoundingBox);
    }
    return calculateBoundingBoxCenter(this.game, player.borderTiles());
  }

  attackRandomTarget() {
    // Save up troops until we reach the trigger ratio
    if (!this.hasTriggerRatioTroops()) return;

    // Retaliate against incoming attacks
    const incomingAttackPlayer = this.findIncomingAttackPlayer();
    if (incomingAttackPlayer) {
      if (this.sendAttack(incomingAttackPlayer, true)) return;
    }

    // Select a traitor as an enemy
    const toAttack = this.getNeighborTraitorToAttack();
    if (toAttack !== null) {
      if (this.random.chance(3)) {
        if (this.sendAttack(toAttack)) return;
      }
    }

    // Choose a new enemy randomly
    const neighbors = this.player.nearby();
    for (const neighbor of this.random.shuffleArray(neighbors)) {
      if (!neighbor.isPlayer()) continue;
      if (this.player.isFriendly(neighbor)) continue;
      if (
        neighbor.type() === PlayerType.Nation ||
        neighbor.type() === PlayerType.Human
      ) {
        if (this.random.chance(2)) {
          continue;
        }
      }
      if (this.sendAttack(neighbor)) return;
    }
  }

  getNeighborTraitorToAttack(): Player | null {
    if (this.game.config().disableAlliances()) return null;

    const traitors = this.player
      .nearby()
      .filter(
        (n): n is Player =>
          n.isPlayer() && this.player.isFriendly(n) === false && n.isTraitor(),
      );
    return traitors.length > 0 ? this.random.randElement(traitors) : null;
  }

  /**
   * Pick a stretch of our border facing `target` to attack FROM
   * (front-line-troops). An attack's troops are now spread over the front it
   * seeds, so the old whole-border path would smear the AI's whole force one
   * tile thick along its entire frontier — the weakest possible commitment at
   * every point. Committing to a bounded stretch gives the AI the same
   * concentration a human gets by clicking.
   */
  private attackSegment(target: Player | TerraNullius): TileRef[] | undefined {
    const targetID = target.isPlayer() ? (target as Player).smallID() : 0;
    const mine = this.player.smallID();
    const contact: TileRef[] = [];
    for (const t of this.player.borderTiles()) {
      let touches = false;
      this.game.forEachNeighbor(t, (n) => {
        if (touches) return;
        const o = this.game.ownerID(n);
        if (o === mine) return;
        // Unowned land counts as contact when expanding into wilderness.
        if (o === targetID && (targetID !== 0 || this.game.isLand(n))) {
          touches = true;
        }
      });
      if (touches) contact.push(t);
    }
    if (contact.length === 0) return undefined;
    // Aim somewhere along the contact front and commit a bounded stretch
    // around it, so troops-per-tile stays meaningful on a long frontier.
    // Against players the draw is weighted toward their Farmland/Settlement
    // clusters (D6.2, scaled by resourceFocus) — fronts seek the harvest.
    const aim = target.isPlayer()
      ? this.weightedAimTile(contact, target as Player)
      : contact[this.random.nextInt(0, contact.length)];
    const seg = borderSegment(
      contact,
      this.game.x(aim),
      this.game.y(aim),
      (t) => this.game.x(t),
      (t) => this.game.y(t),
      { maxWidth: Math.max(8, Math.floor(contact.length / 3)) },
    );
    return seg?.sourceTiles;
  }

  /** Chebyshev radius around enemy Farmland/Settlement tiles inside which a
   *  contact tile counts as economy-adjacent for front aiming (D6.2). */
  private static readonly RESOURCE_AIM_RADIUS = 4;

  /**
   * Famine-front aiming (D6.2): draw the aim tile with integer weight
   * 1 + round(3·resourceFocus) for contact tiles near the target's
   * Farmland/Settlement tiles, 1 elsewhere — Easy nations barely notice the
   * fields, Impossible nations drive straight at them. Deterministic:
   * cumulative integer weights over the seeded PRNG.
   */
  private weightedAimTile(contact: TileRef[], target: Player): TileRef {
    const uniform = () => contact[this.random.nextInt(0, contact.length)];
    const focus = this.game
      .config()
      .aiDifficulty(this.player.type()).resourceFocus;
    const bonus = Math.round(3 * focus);
    if (bonus <= 0) return uniform();

    const sites = target
      .units(UnitType.Farmland, UnitType.Settlement)
      .map((u) => u.tile());
    if (sites.length === 0) return uniform();

    const r = AiAttackBehavior.RESOURCE_AIM_RADIUS;
    const nearEconomy = (t: TileRef): boolean => {
      const tx = this.game.x(t);
      const ty = this.game.y(t);
      return sites.some(
        (s) =>
          Math.abs(this.game.x(s) - tx) <= r &&
          Math.abs(this.game.y(s) - ty) <= r,
      );
    };

    const weights = contact.map((t) => (nearEconomy(t) ? 1 + bonus : 1));
    let total = 0;
    for (const w of weights) total += w;
    let draw = this.random.nextInt(0, total);
    for (let i = 0; i < contact.length; i++) {
      draw -= weights[i];
      if (draw < 0) return contact[i];
    }
    return contact[contact.length - 1];
  }

  forceSendAttack(target: Player | TerraNullius) {
    this.game.addExecution(
      new AttackExecution(
        this.player.troops() / 2,
        this.player,
        target.isPlayer() ? target.id() : this.game.terraNullius().id(),
        null,
        true,
        this.attackSegment(target) ?? null,
      ),
    );
  }

  sendAttack(target: Player | TerraNullius, force = false): boolean {
    if (!force && !this.shouldAttack(target)) return false;

    if (target.isPlayer()) {
      const sent = this.player.sharesBorderWith(target)
        ? this.sendLandAttack(target)
        : this.sendBoatAttack(target);
      // A successful attack on a player opens (or refreshes) the war goal.
      if (sent) this.openCampaign(target);
      return sent;
    } else {
      // sharesBorderWith(TerraNullius) counts water tiles as TN (ownerID 0 = TN smallID),
      // so use a land-only adjacency check to decide land vs boat attack.
      if (this.hasLandBorderWithTerraNullius()) {
        return this.sendLandAttack(target);
      } else {
        return this.sendBoatAttackToNearbyTerraNullius();
      }
    }
  }

  private hasLandBorderWithTerraNullius(): boolean {
    for (const border of this.player.borderTiles()) {
      for (const neighbor of this.game.neighbors(border)) {
        if (
          this.game.isLand(neighbor) &&
          !this.game.isImpassable(neighbor) &&
          !this.game.hasOwner(neighbor)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  // Scans shore border tiles (every 10th) for unowned land within 5 water tiles
  // in each cardinal direction, then sends a transport ship to the first match.
  private sendBoatAttackToNearbyTerraNullius(): boolean {
    if (this.game.config().isUnitDisabled(UnitType.TransportShip)) return false;
    if (
      this.player.unitCount(UnitType.TransportShip) >=
      this.game.config().boatMaxNumber()
    )
      return false;

    const directions: [number, number][] = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    const shores = Array.from(this.player.borderTiles()).filter((t) =>
      this.game.isShore(t),
    );

    for (let i = 0; i < shores.length; i += 10) {
      const border = shores[i];

      const bx = this.game.x(border);
      const by = this.game.y(border);

      for (const [dx, dy] of directions) {
        const x1 = bx + dx;
        const y1 = by + dy;
        if (!this.game.isValidCoord(x1, y1)) continue;
        if (!this.game.isWater(this.game.ref(x1, y1))) continue;

        const nx = bx + dx * 5;
        const ny = by + dy * 5;
        if (!this.game.isValidCoord(nx, ny)) continue;
        const tile = this.game.ref(nx, ny);
        if (!this.game.isLand(tile)) continue;
        if (this.game.isImpassable(tile)) continue;
        if (this.game.hasOwner(tile)) continue;
        if (this.game.hasFallout(tile)) continue;
        if (!canBuildTransportShip(this.game, this.player, tile)) continue;

        // Same war-share bound as every other deployment path.
        const troops = Math.min(
          this.player.troops() / 5,
          deployableTroops(this.game, this.player),
        );
        if (troops < 1) return false;

        this.game.addExecution(
          new TransportShipExecution(this.player, tile, troops),
        );
        return true;
      }
    }
    return false;
  }

  shouldAttack(other: Player | TerraNullius): boolean {
    if (
      // Always attack Terra Nullius, non-humans and traitors
      other.isPlayer() === false ||
      other.type() !== PlayerType.Human ||
      other.isTraitor() ||
      // Always attack if we are a bot or in an HvN game
      this.player.type() === PlayerType.Bot ||
      this.game.config().gameConfig().playerTeams === HumansVsNations
    ) {
      return true;
    }

    // Prevent attacking of humans on lower difficulties
    const { difficulty } = this.game.config().gameConfig();
    if (difficulty === Difficulty.Easy && this.random.nextInt(0, 4) !== 0) {
      return false;
    }
    if (difficulty === Difficulty.Medium && this.random.chance(4)) {
      return false;
    }
    return true;
  }

  /**
   * For Hard & Impossible nations in FFA: returns true if `troops` is less
   * than 20% of the target's troop count, meaning the attack is too weak to
   * be worthwhile.  Bots and team games are exempt.
   */
  private isAttackTooWeak(troops: number, target: Player): boolean {
    if (this.player.type() === PlayerType.Bot) return false;
    if (this.game.config().gameConfig().gameMode === GameMode.Team)
      return false;
    // Nations under attack may retaliate freely
    if (this.player.incomingAttacks().length > 0) return false;
    const { difficulty } = this.game.config().gameConfig();
    return (
      (difficulty === Difficulty.Hard ||
        difficulty === Difficulty.Impossible) &&
      troops < target.troops() * 0.2
    );
  }

  /**
   * For Hard & Impossible nations in FFA: computes the max troops this nation
   * can send in an attack without letting its troop count drop below a
   * fraction of its strongest non-allied neighbor's troop count (Hard: 75%,
   * Impossible: 90%). Allied players and bot neighbors are not considered
   * threats. Bots and team games are entirely exempt. Returns Infinity when
   * no cap applies.
   *
   * Nations under attack may retaliate with at least the total incoming
   * attack troops, even if that exceeds the neighbor-based cap.
   */
  private troopSendCap(): number {
    if (this.player.type() === PlayerType.Bot) return Infinity;
    if (this.game.config().gameConfig().gameMode === GameMode.Team)
      return Infinity;

    const { difficulty } = this.game.config().gameConfig();
    let retainFraction: number;
    switch (difficulty) {
      case Difficulty.Hard:
        retainFraction = 0.75;
        break;
      case Difficulty.Impossible:
        retainFraction = 0.9;
        break;
      default:
        return Infinity;
    }

    // Threat judgment (D2): a neighbor's committed troops come home
    // eventually — judge their TOTAL power, not the diminished home pool a
    // mid-push neighbor shows, so the cap under-retains exactly never.
    let maxNeighborTroops = 0;
    for (const n of this.player.nearby()) {
      if (
        n.isPlayer() &&
        !this.player.isFriendly(n) &&
        n.type() !== PlayerType.Bot
      ) {
        maxNeighborTroops = Math.max(maxNeighborTroops, totalPower(n));
      }
    }

    let cap: number;
    if (maxNeighborTroops === 0) {
      cap = Infinity;
    } else {
      const minRetained = Math.ceil(maxNeighborTroops * retainFraction);
      cap = Math.max(0, this.player.troops() - minRetained);
    }

    // Nations under attack may retaliate with at least the incoming troops
    const incoming = this.player.incomingAttacks();
    if (incoming.length > 0) {
      const totalIncoming = incoming.reduce((sum, a) => sum + a.troops(), 0);
      cap = Math.max(cap, totalIncoming);
    }

    return cap;
  }

  private calculateAttackTroops(
    target: Player | TerraNullius,
    nonBotTroops: (targetTroops: number) => number,
  ): number | null {
    // Reserves are a fraction of the ACHIEVABLE army (D1), not of housing.
    const maxTroops = effectiveMaxTroops(this.game, this.player);
    const botWithStructures =
      target.isPlayer() &&
      target.type() === PlayerType.Bot &&
      target.units().some((u) => Structures.has(u.type()));
    // Use the expand ratio when attacking a bot that owns structures — we need to
    // recapture those structures ASAP, even before reaching the normal reserve.
    const useReserve = target.isPlayer() && !botWithStructures;
    const reserveRatio = useReserve ? this.reserveRatio : this.expandRatio;
    // Farmers stay home (rework-settlement-ecology task 10): the tilled
    // field runs on the IDLE pool, so troops sent past its staffing need
    // send the harvest itself — margins fallow, capacity collapses, famine.
    // The reserve floor keeps the fields worked; a player under attack
    // fights with everything (survival outranks the harvest).
    const staffingFloor =
      this.player.incomingAttacks().length > 0
        ? 0
        : fieldStaffingNeed(
            this.game,
            this.player,
            foodShedField(this.game, this.player),
          );
    const targetTroops = Math.max(maxTroops * reserveRatio, staffingFloor);
    // War-share bound (task 10.6): total deployment stays under
    // maxWarShare of the living population — the vanilla reserves are
    // housing-based and a food-bound population sits far below housing, so
    // without this a young AI dumps its whole demography into one push and
    // never rebuilds.
    //
    // NEVER suspended. This used to become Infinity whenever the player had
    // an incoming attack, which meant attacking an AI disabled its own safety
    // limit: it stacked attack on attack until its population was spent, then
    // collapsed and was trivially annexed. Troops are people — a nation that
    // fields 100% of its people has already lost, whether or not it wins the
    // battle.
    const warCap = deployableTroops(this.game, this.player);

    let troops;
    if (
      target.isPlayer() &&
      target.type() === PlayerType.Bot &&
      this.player.type() !== PlayerType.Bot
    ) {
      troops = this.calculateBotAttackTroops(
        target,
        this.player.troops() - targetTroops - this.botAttackTroopsSent,
      );
    } else {
      troops = nonBotTroops(targetTroops);
    }

    // Hard & Impossible: don't drop below neighbor troop threshold (players only)
    if (target.isPlayer()) {
      troops = Math.min(troops, this.troopSendCap());
    }
    troops = Math.min(troops, warCap);

    if (troops < 1) {
      return null;
    }

    // Hard & Impossible: don't attack if we'd send less than 20% of target's troops
    if (target.isPlayer() && this.isAttackTooWeak(troops, target)) {
      return null;
    }

    if (target.isPlayer() && this.player.type() === PlayerType.Nation) {
      if (this.emojiBehavior === undefined) throw new Error("not initialized");
      this.emojiBehavior.maybeSendAttackEmoji(target);
    }

    return troops;
  }

  private sendLandAttack(target: Player | TerraNullius): boolean {
    const troops = this.calculateAttackTroops(
      target,
      (targetTroops) => this.player.troops() - targetTroops,
    );
    if (troops === null) {
      return false;
    }

    this.game.addExecution(
      new AttackExecution(
        troops,
        this.player,
        target.isPlayer() ? target.id() : this.game.terraNullius().id(),
        null,
        true,
        this.attackSegment(target) ?? null,
      ),
    );
    return true;
  }

  private sendBoatAttack(target: Player): boolean {
    if (this.game.config().isUnitDisabled(UnitType.TransportShip)) {
      return false;
    }

    const closest = closestTwoTiles(
      this.game,
      Array.from(this.player.borderTiles()).filter((t) => this.game.isShore(t)),
      Array.from(target.borderTiles()).filter((t) => this.game.isShore(t)),
    );
    if (closest === null) {
      return false;
    }

    if (!canBuildTransportShip(this.game, this.player, closest.y)) {
      return false;
    }

    const troops = this.calculateAttackTroops(
      target,
      () => this.player.troops() / 5,
    );
    if (troops === null) {
      return false;
    }

    this.game.addExecution(
      new TransportShipExecution(this.player, closest.y, troops),
    );
    return true;
  }

  private calculateBotAttackTroops(target: Player, maxTroops: number): number {
    const { difficulty } = this.game.config().gameConfig();
    if (difficulty === Difficulty.Easy) {
      this.botAttackTroopsSent += maxTroops;
      return maxTroops;
    }
    let troops = target.troops() * 4;

    // Don't send more troops than maxTroops (Keep reserve)
    if (troops > maxTroops) {
      // If we haven't enough troops left to do a big enough bot attack, skip it
      if (maxTroops < target.troops() * 2) {
        troops = 0;
      } else {
        troops = maxTroops;
      }
    }
    this.botAttackTroopsSent += troops;
    return troops;
  }

  private donateTroops(): boolean {
    // Only donate in team games
    if (this.game.config().gameConfig().gameMode !== GameMode.Team) {
      return false;
    }

    // Don't donate in public games (To balance HvN)
    if (this.game.config().gameConfig().gameType === GameType.Public) {
      return false;
    }

    // Check if donating troops is allowed
    if (this.game.config().donateTroops() === false) {
      return false;
    }

    // Don't donate if the game has a winner
    if (this.game.getWinner() !== null) {
      return false;
    }

    // Skip donating based on difficulty
    const { difficulty } = this.game.config().gameConfig();
    switch (difficulty) {
      case Difficulty.Easy:
        // Easy nations don't donate
        return false;
      case Difficulty.Medium:
        // Medium nations donate 25% of the time
        if (!this.random.chance(4)) {
          return false;
        }
        break;
      case Difficulty.Hard:
        // Hard nations donate 50% of the time
        if (!this.random.chance(2)) {
          return false;
        }
        break;
      case Difficulty.Impossible:
        // Impossible nations always try to donate
        break;
      default:
        assertNever(difficulty);
    }

    // Find teammates who are currently in combat
    const teammates = this.game
      .players()
      .filter((p) => this.player.isOnSameTeam(p))
      .filter(
        (p) => p.incomingAttacks().length > 0 || p.outgoingAttacks().length > 0,
      );

    if (teammates.length === 0) {
      return false;
    }

    // Find teammate with lowest troop percentage (troops / maxTroops)
    const teammatesWithTroopPercentage = teammates
      .map((teammate) => {
        const maxTroops = this.game.config().maxTroops(teammate);
        const troopPercentage = teammate.troops() / Math.max(maxTroops, 1);
        return { teammate, troopPercentage };
      })
      .sort((a, b) => a.troopPercentage - b.troopPercentage);

    // Try to donate to teammates in order of lowest troop percentage
    let selectedTeammate: Player | null = null;
    for (const entry of teammatesWithTroopPercentage) {
      if (this.player.canDonateTroops(entry.teammate)) {
        selectedTeammate = entry.teammate;
        break;
      }
    }

    if (selectedTeammate === null) {
      return false;
    }

    // Donate a portion of our troops (keeping reserve of the achievable army)
    const maxTroops = effectiveMaxTroops(this.game, this.player);
    const troopsToKeep = maxTroops * this.reserveRatio;
    const availableTroops = this.player.troops() - troopsToKeep;

    if (availableTroops < 1) {
      return false;
    }

    this.game.addExecution(
      new DonateTroopsExecution(
        this.player,
        selectedTeammate.id(),
        availableTroops,
      ),
    );

    return true;
  }
}
