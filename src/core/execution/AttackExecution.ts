import { renderTroops } from "../formatting/NumberFormat";
import {
  Attack,
  Difficulty,
  Execution,
  Game,
  MessageType,
  Player,
  PlayerID,
  PlayerType,
  TerrainType,
  TerraNullius,
  TribalStructures,
} from "../game/Game";
import { GameMap, TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { assertNever } from "../Util";
import { FlatBinaryHeap } from "./utils/FlatBinaryHeap"; // adjust path if needed

const malusForRetreat = 25;
/** Priority pull toward enemy resource tiles (farms/settlements) — large enough
 *  to jump them to the front of the conquest queue whenever the attack reaches
 *  them, so an army bites the enemy's economy first. */
const RESOURCE_ATTACK_PRIORITY = 1_000_000;
/** Backstop so a front that can afford nothing cannot spin the tick loop. */
const MAX_SKIPS_PER_TICK = 64;
export class AttackExecution implements Execution {
  private active: boolean = true;
  private toConquer = new FlatBinaryHeap();

  private random = new PseudoRandom(123);

  private target: Player | TerraNullius;

  private mg: Game;
  // Direct GameMap reference to skip the Game delegation hop in hot loops.
  private map: GameMap;

  private attack: Attack | null = null;

  // Cached smallIDs for integer owner comparisons in hot loops.
  private ownerSmallID: number;
  private targetSmallID: number;
  // Reusable neighbor buffers to avoid closures/allocation in hot loops.
  private nbuf: TileRef[] = [0, 0, 0, 0];
  private nbuf2: TileRef[] = [0, 0, 0, 0];

  constructor(
    private startTroops: number | null = null,
    private _owner: Player,
    private _targetID: PlayerID | null,
    private sourceTile: TileRef | null = null,
    private removeTroops: boolean = true,
    // A CONCENTRATED PUSH: seed the advance from only this stretch of the
    // attacker's border (the "drag along the border" segment) instead of the
    // whole front, so the committed troops punch deep and local. Null → the
    // classic whole-border advance (bots).
    private sourceTiles: TileRef[] | null = null,
  ) {}

  public targetID(): PlayerID | null {
    return this._targetID;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number) {
    if (!this.active) {
      return;
    }
    this.mg = mg;
    this.map = mg.map();

    if (this._targetID !== null && !mg.hasPlayer(this._targetID)) {
      console.warn(`target ${this._targetID} not found`);
      this.active = false;
      return;
    }

    this.target =
      this._targetID === this.mg.terraNullius().id()
        ? mg.terraNullius()
        : mg.player(this._targetID);
    this.ownerSmallID = this._owner.smallID();
    this.targetSmallID = this.target.smallID();

    if (this._owner === this.target) {
      console.error(`Player ${this._owner} cannot attack itself`);
      this.active = false;
      return;
    }

    // ALLIANCE CHECK — block attacks on friendly (ally or same team)
    if (this.target.isPlayer()) {
      const targetPlayer = this.target as Player;
      if (this._owner.isFriendly(targetPlayer)) {
        console.warn(
          `${this._owner.displayName()} cannot attack ${targetPlayer.displayName()} because they are friendly (allied or same team)`,
        );
        this.active = false;
        return;
      }
    }

    if (this.target && this.target.isPlayer()) {
      const targetPlayer = this.target as Player;
      if (
        targetPlayer.type() !== PlayerType.Bot &&
        this._owner.type() !== PlayerType.Bot
      ) {
        // Don't let bots embargo since they can't trade anyway.
        targetPlayer.addEmbargo(this._owner, true);
        this.rejectIncomingAllianceRequests(targetPlayer);
      }
    }

    if (this.target.isPlayer() && !this._owner.canAttackPlayer(this.target)) {
      this.active = false;
      return;
    }

    this.startTroops ??= this.mg
      .config()
      .attackAmount(this._owner, this.target);
    if (this.removeTroops) {
      this.startTroops = Math.min(this._owner.troops(), this.startTroops);
      this._owner.removeTroops(this.startTroops);
    }
    this.attack = this._owner.createAttack(
      this.target,
      this.startTroops,
      this.sourceTile,
      new Set<TileRef>(),
    );

    if (this.sourceTiles !== null && this.sourceTiles.length > 0) {
      // Concentrated segment push: seed the front only from the chosen stretch
      // of our border (its enemy-adjacent neighbours), so troops focus there.
      for (const t of this.sourceTiles) {
        if (this.map.ownerID(t) === this.ownerSmallID) this.addNeighbors(t);
      }
    } else if (this.sourceTile !== null) {
      this.addNeighbors(this.sourceTile);
    } else {
      this.refreshToConquer();
    }

    // Put the committed troops ON the front that was just seeded — which is
    // the stretch of border the player aimed at (front-line-troops). The
    // attack is constructed holding its troops in reserve; this places them.
    this.attack.flushReserve();

    // Record stats
    this.mg.stats().attack(this._owner, this.target, this.startTroops);

    // NOTE: opposing attacks are NOT cancelled here any more. This used to be
    // two scalars subtracting — `if (incoming.troops() > this.attack.troops())`
    // — with no reference to any tile, so a counter-attack launched anywhere
    // on the map instantly deleted a push grinding into the opposite border.
    // Opposing forces now meet only where their fronts are physically
    // adjacent; see clashWithOpposing(), run per tick.
    const isSegmentPush =
      this.sourceTiles !== null && this.sourceTiles.length > 0;
    for (const outgoing of this._owner.outgoingAttacks()) {
      if (
        outgoing !== this.attack &&
        outgoing.target() === this.attack.target() &&
        // Boat attacks (sourceTile is not null) and concentrated segment
        // pushes are kept separate — a segment push stays focused, and you can
        // run several along different stretches of your front.
        this.attack.sourceTile() === null &&
        !isSegmentPush
      ) {
        this.attack.setTroops(this.attack.troops() + outgoing.troops());
        outgoing.delete();
      }
    }

    if (this.target.isPlayer()) {
      const difficulty = this.mg.config().gameConfig().difficulty;
      let relationChange: number;
      switch (difficulty) {
        case Difficulty.Easy:
          relationChange = -60;
          break;
        case Difficulty.Medium:
          relationChange = -70;
          break;
        case Difficulty.Hard:
          relationChange = -80;
          break;
        case Difficulty.Impossible:
          relationChange = -100;
          break;
        default:
          assertNever(difficulty);
      }
      this.target.updateRelation(this._owner, relationChange);
    }
  }

  private refreshToConquer() {
    if (this.attack === null) {
      throw new Error("Attack not initialized");
    }

    this.toConquer.clear();
    this.attack.clearBorder();
    for (const tile of this._owner.borderTiles()) {
      this.addNeighbors(tile);
    }
  }

  private retreat(malusPercent = 0) {
    if (this.attack === null) {
      throw new Error("Attack not initialized");
    }

    const deaths = this.attack.troops() * (malusPercent / 100);
    if (deaths) {
      this.mg.displayMessage(
        "events_display.attack_cancelled_retreat",
        MessageType.ATTACK_CANCELLED,
        this._owner.id(),
        undefined,
        { troops: renderTroops(deaths) },
      );
    }
    if (this.removeTroops === false && this.sourceTile === null) {
      // startTroops are always added to attack troops at init but not always removed from owner troops
      // subtract startTroops from attack troops so we don't give back startTroops to owner that were never removed
      // boat attacks (sourceTile !== null) are the exception: troops were removed at departure and must be returned after attack still
      this.attack.setTroops(this.attack.troops() - (this.startTroops ?? 0));
    }

    const survivors = this.attack.troops() - deaths;
    this._owner.addTroops(survivors);
    this.attack.delete();
    this.active = false;

    // Not all retreats are canceled attacks
    if (this.attack.retreated()) {
      // Record stats
      this.mg.stats().attackCancel(this._owner, this.target, survivors);
    }
  }

  tick(ticks: number) {
    if (this.attack === null) {
      throw new Error("Attack not initialized");
    }
    const targetIsPlayer = this.target.isPlayer(); // cache target type
    const targetPlayer = targetIsPlayer ? (this.target as Player) : null; // cache target player

    if (this.attack.retreated()) {
      if (targetIsPlayer) {
        this.retreat(malusForRetreat);
      } else {
        this.retreat();
      }
      this.active = false;
      return;
    }

    if (this.attack.retreating()) {
      return;
    }

    if (!this.attack.isActive()) {
      this.active = false;
      return;
    }

    if (targetPlayer && this._owner.isFriendly(targetPlayer)) {
      // In this case a new alliance was created AFTER the attack started.
      this.retreat();
      return;
    }

    // Place any freed troops and let the force even out along the front.
    this.seep();
    // Opposing pushes annihilate ONLY where the two fronts touch.
    this.clashWithOpposing();
    const troopCount = this.attack.troops();
    if (troopCount < 1) {
      this.attack.delete();
      this.active = false;
      return;
    }

    let numTilesPerTick = this.mg
      .config()
      .attackTilesPerTick(
        troopCount,
        this._owner,
        this.target,
        this.attack.borderSize() + this.random.nextInt(0, 5),
      );

    // Tiles the front could not afford this tick: re-queued at the end so a
    // stalled stretch does not block the stretches that can still advance.
    const unaffordable: TileRef[] = [];
    let skipped = 0;

    while (numTilesPerTick > 0) {
      if (this.attack.troops() < 1) {
        this.attack.delete();
        this.active = false;
        return;
      }

      if (this.toConquer.size() === 0) {
        this.refreshToConquer();
        this.retreat();
        return;
      }

      const tileToConquer = this.toConquer.dequeue();

      let onBorder = false;
      const numNeighbors = this.map.neighbors4(tileToConquer, this.nbuf);
      for (let i = 0; i < numNeighbors; i++) {
        if (this.map.ownerID(this.nbuf[i]) === this.ownerSmallID) {
          onBorder = true;
          break;
        }
      }
      if (this.map.ownerID(tileToConquer) !== this.targetSmallID || !onBorder) {
        this.attack.removeBorderTile(tileToConquer);
        continue;
      }
      if (
        !this.map.isLand(tileToConquer) ||
        this.map.isImpassable(tileToConquer)
      ) {
        this.attack.removeBorderTile(tileToConquer);
        continue;
      }

      // The force AT THIS TILE is what fights here — not the whole army.
      // This is what makes a wide front weak per tile and a concentrated one
      // strong, and what makes a stretch that runs dry stall on its own.
      const localTroops = this.attack.troopsAt(tileToConquer);
      // attackLogic weighs the defender's WHOLE army against the attacker, so
      // the local force has to be brought back to that scale or every ratio
      // pins at the cost ceiling. Scaling by the reference width makes an
      // attack spread over that many tiles behave exactly as it always did,
      // while a narrower front fights proportionally stronger per tile and a
      // wider one weaker — which is the whole point.
      const effectiveTroops =
        localTroops * this.mg.config().food().frontReferenceWidth;
      const { attackerTroopLoss, defenderTroopLoss, tilesPerTickUsed } = this.mg
        .config()
        .attackLogic(
          this.mg,
          effectiveTroops,
          this._owner,
          this.target,
          tileToConquer,
        );
      if (localTroops < 1 || localTroops < attackerTroopLoss) {
        unaffordable.push(tileToConquer);
        skipped++;
        if (skipped >= MAX_SKIPS_PER_TICK) break;
        continue;
      }

      this.addNeighbors(tileToConquer);
      numTilesPerTick -= tilesPerTickUsed;
      this.attack.spendAt(tileToConquer, attackerTroopLoss);
      // Survivors leave the front with the tile and are re-placed by seep.
      this.attack.removeBorderTile(tileToConquer);
      if (targetPlayer) {
        targetPlayer.removeTroops(defenderTroopLoss);
      }
      this._owner.conquer(tileToConquer);
      // Fighting scars the ground (rework-settlement-ecology): tiles taken
      // from a PLAYER in combat accumulate damage that must fully heal before
      // they grow again. Wilderness expansion is not combat and leaves no scar.
      if (targetPlayer) {
        this.mg.addTileDamage(
          tileToConquer,
          this.mg.config().food().combatTileDamageMilli,
        );
      }
      this.attack.setFrontTile(tileToConquer);
      this.handleDeadDefender();
    }

    // Put the tiles we could not pay for back on the queue for a later tick,
    // once seep has fed those stretches.
    for (const t of unaffordable) {
      this.toConquer.enqueue(t, this.mg.ticks() + 1);
    }
  }

  /**
   * Opposing pushes meet where they physically touch (front-line-troops).
   *
   * If we attack P, our front tiles are P-owned; if P attacks us, P's front
   * tiles are ours. Along a shared frontier those two sets are 4-adjacent, so
   * a pair (a, b) with a on our front and b on theirs is a place where the two
   * armies are actually in contact. Only there do they annihilate, and only by
   * what each has present. Countering at the far end of a border therefore
   * does nothing to a push here — there is no adjacent pair.
   */
  private clashWithOpposing(): void {
    if (this.attack === null || !this.target.isPlayer()) return;
    const opponent = this.target;
    for (const incoming of this._owner.incomingAttacks()) {
      if (!incoming.isActive() || incoming.attacker() !== opponent) continue;
      // Ascending tile order so the outcome never depends on Map iteration.
      const ours = [...this.attack.frontTiles()].sort((a, b) => a - b);
      for (const a of ours) {
        let here = this.attack.troopsAt(a);
        if (here <= 0) continue;
        const n = this.map.neighbors4(a, this.nbuf);
        for (let i = 0; i < n && here > 0; i++) {
          const b = this.nbuf[i];
          const theirs = incoming.troopsAt(b);
          if (theirs <= 0) continue;
          const killed = Math.min(here, theirs);
          this.attack.spendAt(a, killed);
          incoming.spendAt(b, killed);
          here -= killed;
        }
      }
      if (incoming.troops() < 1) incoming.delete();
    }
  }

  /**
   * Place freed troops and let the force even out along the front. Without
   * this a stretch that runs dry stays dry forever and a breakthrough cannot
   * be reinforced; with it the army behaves like a viscous fluid rather than a
   * rigid lattice. Computed from a start-of-tick snapshot so the result does
   * not depend on visit order.
   */
  private seep(): void {
    if (this.attack === null) return;
    this.attack.flushReserve();
    const frac = this.mg.config().food().frontSeepFraction;
    if (frac <= 0) return;
    const tiles = [...this.attack.frontTiles()].sort((a, b) => a - b);
    if (tiles.length < 2) return;
    const snapshot = new Map<TileRef, number>();
    for (const t of tiles) snapshot.set(t, this.attack.troopsAt(t));
    for (const t of tiles) {
      const give = Math.floor((snapshot.get(t) ?? 0) * frac);
      if (give <= 0) continue;
      const n = this.map.neighbors4(t, this.nbuf);
      const targets: TileRef[] = [];
      for (let i = 0; i < n; i++) {
        if (snapshot.has(this.nbuf[i])) targets.push(this.nbuf[i]);
      }
      if (targets.length === 0) continue;
      // spendAt returns what was really there, and distributeOver places all
      // of it, so the total is conserved exactly.
      const moved = this.attack.spendAt(t, give);
      this.attack.distributeOver(targets, moved);
    }
  }

  private rejectIncomingAllianceRequests(target: Player) {
    const request = this._owner
      .incomingAllianceRequests()
      .find((ar) => ar.requestor() === target);
    if (request !== undefined) {
      request.reject();
    }
  }

  private addNeighbors(tile: TileRef) {
    if (this.attack === null) {
      throw new Error("Attack not initialized");
    }

    const tickNow = this.mg.ticks(); // cache tick

    const numNeighbors = this.map.neighbors4(tile, this.nbuf);
    for (let i = 0; i < numNeighbors; i++) {
      const neighbor = this.nbuf[i];
      if (
        this.map.isWater(neighbor) ||
        this.map.isImpassable(neighbor) ||
        this.map.ownerID(neighbor) !== this.targetSmallID
      ) {
        continue;
      }
      this.attack.addBorderTile(neighbor);
      let numOwnedByMe = 0;
      const numInner = this.map.neighbors4(neighbor, this.nbuf2);
      for (let j = 0; j < numInner; j++) {
        if (this.map.ownerID(this.nbuf2[j]) === this.ownerSmallID) {
          numOwnedByMe++;
        }
      }

      let mag: number;
      switch (this.map.terrainType(neighbor)) {
        case TerrainType.Plains:
          mag = 1;
          break;
        case TerrainType.Highland:
          mag = 1.5;
          break;
        case TerrainType.Mountain:
          mag = 2;
          break;
        default:
          mag = 0;
          break;
      }

      let priority =
        (this.random.nextInt(0, 7) + 10) * (1 - numOwnedByMe * 0.5 + mag / 2) +
        tickNow;

      // Push toward the enemy's ECONOMY: grab their Farmland/Settlements first.
      // With the raze roll a captured resource tile is either taken or burned —
      // both far more damaging than swallowing open land, so an attack that can
      // reach an enemy's farms should go for them (add-urban-core-growth).
      {
        const plot = this.mg.plotAt(neighbor);
        if (plot !== undefined && TribalStructures.has(plot.type())) {
          // How sharply the AI hunts economy tiles scales with difficulty
          // (unify-layered-path).
          const focus = this.mg
            .config()
            .aiDifficulty(this._owner.type()).resourceFocus;
          priority -= RESOURCE_ATTACK_PRIORITY * focus;
        }
      }

      this.toConquer.enqueue(neighbor, priority);
    }
  }

  private handleDeadDefender() {
    if (!(this.target.isPlayer() && this.target.numTilesOwned() < 100)) return;
    const target: Player = this.target;

    this.mg.conquerPlayer(this._owner, target);

    for (let i = 0; i < 10; i++) {
      for (const tile of target.tiles()) {
        let borders = false;
        this.mg.forEachNeighbor(tile, (t) => {
          if (!borders && this.mg.owner(t) === this._owner) {
            borders = true;
          }
        });
        if (borders) {
          this._owner.conquer(tile);
        } else {
          let captured = false;
          this.mg.forEachNeighbor(tile, (neighbor) => {
            if (captured) return;
            const no = this.mg.owner(neighbor);
            if (no.isPlayer() && no !== target && !no.isFriendly(target)) {
              this.mg.player(no.id()).conquer(tile);
              captured = true;
            }
          });
        }
      }
    }
  }

  owner(): Player {
    return this._owner;
  }

  isActive(): boolean {
    return this.active;
  }
}
