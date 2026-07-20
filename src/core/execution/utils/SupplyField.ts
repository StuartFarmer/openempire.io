import { FoodConfig } from "../../configuration/Config";
import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";

/**
 * Per-player supply field (openspec add-supply-lines): a multi-source BFS
 * distance over the player's own passable land, sourced at every completed
 * Settlement and Barn. Distance converts to a quality multiplier
 * 1/(1 + (d/supplyRadius)^supplyDecayPower) — 1.0 at a node, 0.5 at the
 * radius, ~0 past the flood cutoff (3× radius) or off any owned path.
 *
 * The field is recomputed on a supplyRefreshTicks cadence (lazily, from
 * foodTick), so it is up to one cadence stale — identically stale on every
 * client, which keeps the sim deterministic. Tiles conquered since the last
 * refresh are absent from the map; callers that must rate a moving front use
 * probeDistance(), a bounded walk back to the known field.
 */

/** Flood cutoff in radii — beyond this, quality < ~0.04 ≈ out of supply. */
const CUTOFF_RADII = 3;
/** Max steps probeDistance() walks to reconnect a not-yet-mapped tile. */
const MAX_PROBE_STEPS = 16;

export class PlayerSupply {
  /** Owned-land steps to the nearest supply node; absent = out of supply. */
  readonly dist = new Map<TileRef, number>();
  lastCalcTick = -1;
  /** Node census at last compute — a change forces an immediate refresh. */
  lastNodeCount = -1;
}

const supplyStates = new WeakMap<Player, PlayerSupply>();

/** Quality curve — exported so tests and the client overlay share the math. */
export function supplyQualityFromDistance(
  d: number,
  f: Pick<FoodConfig, "supplyRadius" | "supplyDecayPower">,
): number {
  if (!Number.isFinite(d)) return 0;
  return 1 / (1 + Math.pow(d / f.supplyRadius, f.supplyDecayPower));
}

/**
 * The player's supply field, refreshed if the cadence (or first use) says
 * so. Call once per player per tick and reuse the returned object.
 */
export function supplyField(mg: Game, player: Player): PlayerSupply {
  let s = supplyStates.get(player);
  if (s === undefined) {
    s = new PlayerSupply();
    supplyStates.set(player, s);
  }
  const period = Math.max(1, mg.config().food().supplyRefreshTicks);
  const t = mg.ticks();
  // Territory changes wait for the cadence; a node built, captured, or
  // razed refreshes at once — a new Settlement lights up supply immediately.
  const nodeCount = player.units(UnitType.Settlement).length;
  if (
    s.lastCalcTick === -1 ||
    t - s.lastCalcTick >= period ||
    nodeCount !== s.lastNodeCount
  ) {
    recompute(mg, player, s);
    // STAGGER the cadence by player (deterministic smallID phase): every
    // player refreshing on the same tick piles all the BFS sweeps into one
    // frame — a measured 7× tick spike every period (the once-a-second
    // framerate dip). Backdating the stamp spreads refreshes across the
    // whole cycle while keeping each player's period exact.
    s.lastCalcTick = Math.max(0, t - ((t + player.smallID()) % period));
    s.lastNodeCount = nodeCount;
  }
  return s;
}

/** Supply quality at an owned tile per the current field (no probing). */
export function supplyQuality(
  mg: Game,
  s: PlayerSupply,
  tile: TileRef,
): number {
  return supplyQualityFromDistance(
    s.dist.get(tile) ?? Infinity,
    mg.config().food(),
  );
}

/**
 * Field distance for a tile that may have been conquered after the last
 * refresh (an attack front): if unmapped, walk outward through the player's
 * own land up to MAX_PROBE_STEPS until the known field is reached and return
 * fieldDistance + steps (an upper bound that self-corrects each refresh).
 * Infinity when no owned path back to supply exists — a beachhead or pocket.
 */
export function probeDistance(
  mg: Game,
  player: Player,
  s: PlayerSupply,
  tile: TileRef,
): number {
  const known = s.dist.get(tile);
  if (known !== undefined) return known;
  const map = mg.map();
  const smallID = player.smallID();
  if (map.ownerID(tile) !== smallID) return Infinity;

  const nbuf: TileRef[] = [0, 0, 0, 0];
  const visited = new Set<TileRef>([tile]);
  let frontier: TileRef[] = [tile];
  for (let steps = 1; steps <= MAX_PROBE_STEPS; steps++) {
    const next: TileRef[] = [];
    let best = Infinity;
    for (const cur of frontier) {
      const n4 = map.neighbors4(cur, nbuf);
      for (let i = 0; i < n4; i++) {
        const n = nbuf[i];
        if (visited.has(n)) continue;
        if (map.ownerID(n) !== smallID) continue;
        visited.add(n);
        const d = s.dist.get(n);
        if (d !== undefined) {
          best = Math.min(best, d + steps);
        } else {
          next.push(n);
        }
      }
    }
    if (best !== Infinity) return best;
    if (next.length === 0) return Infinity;
    frontier = next;
  }
  return Infinity;
}

function recompute(mg: Game, player: Player, s: PlayerSupply): void {
  const f = mg.config().food();
  const cutoff = Math.ceil(f.supplyRadius * CUTOFF_RADII);
  const map = mg.map();
  const smallID = player.smallID();
  s.dist.clear();

  // BFS with uniform step cost: a plain head-indexed queue is exact — no
  // heap needed (the dead-end repo's sort()-queue mistake stays there).
  const queue: TileRef[] = [];
  const addSource = (t: TileRef): void => {
    if (map.ownerID(t) !== smallID) return;
    if (!s.dist.has(t)) {
      s.dist.set(t, 0);
      queue.push(t);
    }
  };
  // Urban model (add-urban-core-growth): the founded Core (and, later, Road
  // infrastructure) anchor logistics alongside the Settlements.
  const core = player.core();
  if (core !== null) addSource(core);
  for (const type of [UnitType.Settlement]) {
    for (const node of player.units(type)) {
      if (node.isUnderConstruction()) continue;
      addSource(node.tile());
    }
  }

  const nbuf: TileRef[] = [0, 0, 0, 0];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const d = s.dist.get(cur)! + 1;
    if (d > cutoff) continue;
    const n4 = map.neighbors4(cur, nbuf);
    for (let i = 0; i < n4; i++) {
      const n = nbuf[i];
      if (s.dist.has(n)) continue;
      if (map.ownerID(n) !== smallID) continue;
      if (!map.isLand(n) || map.isImpassable(n)) continue;
      s.dist.set(n, d);
      queue.push(n);
    }
  }
}
