// OpenFront-live simulation worker (move-shell-sim-to-worker). Runs the real
// src/core sim off the main thread and ships the render conduits + a small
// per-tick summary to GameShellPage. Owns EVERY Game read; the main thread has
// no Game access.
import { assetUrl } from "../../core/AssetUrls";
import { SpawnTimerExecution } from "../../core/execution/SpawnTimerExecution";
import { borderSegment } from "../../core/execution/utils/BorderSegment";
import { climateSuitability } from "../../core/execution/utils/FarmGrowth";
import { paintedResources } from "../../core/execution/utils/PaintedEconomy";
import {
  supplyField,
  supplyQualityFromDistance,
} from "../../core/execution/utils/SupplyField";
import { FetchGameMapLoader } from "../../core/game/FetchGameMapLoader";
import {
  Difficulty,
  GameMode,
  GameType,
  UnitType,
  type Attack,
  type Game,
  type Player,
} from "../../core/game/Game";
import {
  GameUpdateType,
  type ErrorUpdate,
  type GameUpdateViewData,
  type UnitUpdate,
} from "../../core/game/GameUpdates";
import { DEFAULT_RULESET } from "../../core/game/Rulesets";
import { createGameRunner, GameRunner } from "../../core/GameRunner";
import type { GameStartInfo, Intent, StampedIntent } from "../../core/Schemas";
import { generateID } from "../../core/Util";
import type { LiveGameRuntime } from "../games/LiveGameRuntime";
import { createLiveGameRuntime } from "../games/registry";
import {
  parseSimpleFrontDifficulty,
  simpleFrontResult,
} from "../shell/SimpleFrontMatch";
import {
  cityDevelopmentSummary,
  CityDevelopmentUpdates,
} from "./CityDevelopmentUpdates";
import {
  packTransportShips,
  type ShellFrontLabel,
  type ShellSimFrame,
  type ShellSimIn,
  type ShellSimOut,
} from "./ShellSimProtocol";

const ctx: Worker = self as unknown as Worker;
const post = (msg: ShellSimOut, transfer?: Transferable[]) =>
  transfer ? ctx.postMessage(msg, transfer) : ctx.postMessage(msg);

const TICK_MS = 100; // game clock — 10 ticks/s
const UNIT_DIFF_EVERY = 6;

let gr: GameRunner | null = null;
let game: Game | null = null;
let runtime: LiveGameRuntime | null = null;
let clientID = "";
let turn = 0;
let running = false;
let runGeneration = 0;
let turbo = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let stepInFlight: Promise<void> | null = null;

let W = 0;
let H = 0;
let popPerDensity = 10000;

let queued: StampedIntent[] = [];
type PendingPlotAction = {
  action: "city" | "farm" | "raze";
  tile: number;
  playerID: string;
  unitID?: number;
  level?: number;
  checks?: number;
};
let pendingPlotActions: PendingPlotAction[] = [];
/** Last-shipped packed plot value per tile (type low byte + Farmland maturity
 *  in the next byte), so the delta only re-emits when either actually changes. */
let plotState: Uint16Array | null = null;
/** Worked-field mask (restore-organic-growth): 1 = worked by a farm. Applied
 *  from packedFieldUpdates; worked tiles render as Farmland in `plot`. */
let fieldState: Uint8Array | null = null;
/** Farmland maturity per tile (0..255) from packedFieldUpdates — packed into
 *  the plot value's second byte so the growth variant needs no extra layer. */
let maturityState: Uint8Array | null = null;
let frontState: Uint8Array | null = null;
/** Tick of the last border change we shipped (see myBorder below). */
let lastBorderChangeSent = -1;
/** Last-shipped supply-quality byte per tile (human view): 0 = out of supply,
 *  1..255 = quality. Rebuilt only when the human's supply field refreshes. */
let supplyState: Uint8Array | null = null;
let supplyPrevTiles: number[] = [];
let supplyLastCalc = -2;
let prevUnitTiles = new Set<number>();
let prevFrontTiles: number[] = [];
const knownNames = new Set<number>();
let unitDiffClock = 0;
let spawnAnchorSent = false;
let nationSpawnsSent = false;
/** Front-page backdrop: no human, spawn phase on a timer, and a slower clock
 *  once warm so the world drifts rather than races behind the menu. */
let ambient = false;
/** Ints per player in the packed `stats` array (see ShellSimProtocol). */
const STAT_STRIDE = 7;
/** How much slower than real time the backdrop ticks once it is warm. */
const AMBIENT_TICK_SCALE = 3;
/** Ticks the backdrop runs during init, before its first frame is shown. Must
 *  clear the spawn phase (numSpawnPhaseTurns, 100) with room for borders. */
const AMBIENT_PREWARM_TICKS = 220;

// Per-tick capture from the GameRunner callback.
let pending: GameUpdateViewData | null = null;
let developmentUpdates = new CityDevelopmentUpdates();

function myPlayer(): Player | null {
  return game && clientID ? game.playerByClientID(clientID) : null;
}

function computePlot(g: Game, tile: number): number {
  const plot = g.plotAt(tile);
  let type = 0;
  if (plot) {
    const ty = plot.type();
    type = ty === UnitType.Settlement ? 1 : ty === UnitType.Barn ? 3 : 2;
  } else if (fieldState && fieldState[tile] !== 0) {
    // Worked field tiles (no structure) draw with the Farmland plot look.
    type = 2;
  }
  // Farmland carries its maturity in the second byte (0..255) so the overlay
  // can pick the growth variant without a separate GPU layer.
  if (type === 2) return 2 | ((maturityState?.[tile] ?? 0) << 8);
  return type;
}

async function init(msg: Extract<ShellSimIn, { type: "init" }>): Promise<void> {
  setRunning(false, false);
  if (stepInFlight) await stepInFlight;
  queued = [];
  turn = 0;
  pending = null;
  developmentUpdates = new CityDevelopmentUpdates();
  knownNames.clear();
  prevUnitTiles.clear();
  prevFrontTiles = [];
  supplyPrevTiles = [];
  supplyLastCalc = -2;
  lastBorderChangeSent = -1;
  unitDiffClock = 0;
  spawnAnchorSent = false;
  nationSpawnsSent = false;
  ambient = msg.ambient === true;
  runtime?.dispose();
  runtime = null;
  pendingPlotActions = [];
  globalThis.__ASSET_MANIFEST__ = msg.assetManifest;
  globalThis.__CDN_BASE__ = msg.cdnBase;
  clientID = generateID();
  const gameStart: GameStartInfo = {
    gameID: generateID(),
    lobbyCreatedAt: 0,
    config: {
      gameMap: msg.mapType,
      gameType: GameType.Singleplayer,
      gameMode: GameMode.FFA,
      difficulty:
        msg.ruleset === "simplefront"
          ? parseSimpleFrontDifficulty(msg.difficulty)
          : Difficulty.Medium,
      donateGold: false,
      donateTroops: false,
      nations: "default",
      bots: msg.bots,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    },
    players: [{ clientID, username: "You", clanTag: null }],
  };
  const loader = new FetchGameMapLoader((path) => assetUrl(`maps/${path}`));
  gr = await createGameRunner(
    gameStart,
    clientID,
    loader,
    (gu) => {
      if (!(gu as ErrorUpdate).errMsg) pending = gu as GameUpdateViewData;
    },
    msg.ruleset ?? DEFAULT_RULESET,
    msg.cityDevelopment,
  );
  game = gr.game;
  runtime = await createLiveGameRuntime(msg.ruleset ?? DEFAULT_RULESET, game);
  // Singleplayer has NO spawn timer (GameRunner only adds SpawnTimerExecution
  // for multiplayer) — the phase ends when a HUMAN picks a spawn. The backdrop
  // has no human, so without this the world sits in the spawn phase forever
  // and the nations mill about placing spawns instead of playing. Add the very
  // same timer the multiplayer path uses.
  if (msg.ambient === true) {
    ambient = true;
    game.addExecution(new SpawnTimerExecution());
  }
  W = game.width();
  H = game.height();
  const food = game.config().food();
  popPerDensity = food.popPerDensity;
  const n = W * H;
  plotState = new Uint16Array(n);
  fieldState = new Uint8Array(n);
  maturityState = new Uint8Array(n);
  frontState = new Uint8Array(n);
  supplyState = new Uint8Array(n);
  // Ship the fertility + suitability hover planes once (rework-settlement-
  // ecology): fertility is the raw `crop` layer the food tick reads;
  // suitability is the static climate-suitability field (0..1 → byte) that
  // gates farm ripening. Both are read-only hover readouts.
  const fertility = new Uint8Array(n);
  const suitability = new Uint8Array(n);
  for (let t = 0; t < n; t += 1) {
    fertility[t] = game.layer("crop", t);
    if (!game.config().paintedEconomy())
      suitability[t] = Math.round(climateSuitability(game, t) * 255);
  }
  if (ambient) {
    // The spawn phase runs on a 100-tick timer, and the backdrop deliberately
    // ticks slower than real time — left alone that is ~30s of nations
    // shuffling into place before anything happens. Burn those ticks here,
    // before anyone can see them, so the very first painted frame is a game
    // already under way.
    while (game.ticks() < AMBIENT_PREWARM_TICKS) {
      gr.addTurn({ turnNumber: turn++, intents: [] });
      gr.executeNextTick();
    }
    pending = null;
  }
  post(
    {
      type: "ready",
      popPerDensity,
      fertility,
      suitability,
      cityDevelopment: game.config().cityDevelopment() ?? undefined,
    },
    [fertility.buffer, suitability.buffer],
  );
  // One frame immediately, WITHOUT stepping. Frames are otherwise only
  // produced by the run loop, so a game that starts (or restarts) paused would
  // leave the client on the previous game's state — stale tick, no spawn-phase
  // nation markers, no fresh player table.
  const { frame, transfer } = buildFrame(game);
  post(frame, transfer);
}

/** Plot deltas from owner changes, worked-field deltas (packedFieldUpdates:
 *  `tile | (byte<<24)`, byte 255 = worked, 0 = released) + a throttled
 *  structure-unit diff. */
function plotDelta(g: Game): Uint32Array | null {
  if (!plotState) return null;
  const out: number[] = [];
  const touch = (t: number) => {
    const v = computePlot(g, t);
    if (v !== plotState![t]) {
      plotState![t] = v;
      out.push(t, v);
    }
  };
  const fld = pending?.packedFieldUpdates;
  if (fld && fieldState) {
    for (let k = 0; k < fld.length; k += 1) {
      const t = fld[k] & 0x00ffffff;
      const byte = fld[k] >>> 24;
      fieldState[t] = byte !== 0 ? 1 : 0;
      if (maturityState) maturityState[t] = byte;
      touch(t); // re-emits when maturity (packed) changed, not only the mask
    }
  }
  const tu = pending?.packedTileUpdates;
  if (tu) for (let k = 0; k + 1 < tu.length; k += 2) touch(tu[k]);
  if (unitDiffClock++ % UNIT_DIFF_EVERY === 0) {
    const cur = new Set<number>();
    for (const u of g.units(
      UnitType.Settlement,
      UnitType.Farmland,
      UnitType.Barn,
    )) {
      const t = Number(u.tile());
      cur.add(t);
      touch(t);
    }
    for (const t of prevUnitTiles) if (!cur.has(t)) touch(t);
    prevUnitTiles = cur;
  }
  return out.length ? Uint32Array.from(out) : null;
}

/** Tiles set ablaze this tick — each becomes a burn-down fire in the renderer.
 *  Primary source (rework-persistent-tiles-and-burn): the sim's per-tile burn
 *  list `packedBurns` — EVERY tile taken in combat, so a whole captured
 *  district burns, not just a razed nucleus. Merged with any tribal plot that
 *  still died by other means (nuke, whole-nation death) from the unit updates.
 *  Peaceful field/city recede (no combat) never lights a fire. */
function burnDelta(): Uint32Array | null {
  let out: number[] | null = null;
  const burns = pending?.packedBurns;
  if (burns && burns.length > 0) {
    out = [];
    for (let k = 0; k < burns.length; k++) out.push(burns[k]);
  }
  const updates = pending?.updates?.[GameUpdateType.Unit] as
    | UnitUpdate[]
    | undefined;
  if (updates) {
    for (const u of updates) {
      if (u.isActive) continue;
      if (
        u.unitType === UnitType.Settlement ||
        u.unitType === UnitType.Farmland ||
        u.unitType === UnitType.Barn
      ) {
        (out ??= []).push(Number(u.pos));
      }
    }
  }
  return out && out.length ? Uint32Array.from(out) : null;
}

/** Front deltas: clear last tick's tiles, repaint the human's active fronts. */
function frontDelta(g: Game, labels: ShellFrontLabel[]): Uint32Array | null {
  if (!frontState) return null;
  const out: number[] = [];
  const paint = (t: number, v: number) => {
    if (frontState![t] !== v) {
      frontState![t] = v;
      out.push(t, v);
    }
  };
  for (const t of prevFrontTiles) paint(t, 0);
  const painted: number[] = [];
  const me = myPlayer();
  if (me && me.isAlive()) {
    const bal = (mine: number, theirs: number) =>
      (mine - theirs) / (mine + theirs + 1);
    const encode = (b: number) =>
      Math.max(1, Math.min(255, Math.round(128 + b * 127)));

    // PER-TILE front balance (front-line-troops). This used to compute ONE
    // number per opposing player — attack total vs a territory-averaged
    // defence — and flood the whole shared border with it, so a front read as
    // uniformly winning or losing and you could not see WHERE a push was.
    // Attack troops now live on individual tiles, so each seam tile is scored
    // by the force actually present at it and the border becomes a gradient:
    // bright where a push is biting, dark where it is being held.
    const myPushes = new Map<number, Attack[]>();
    for (const a of me.outgoingAttacks()) {
      const target = a.target();
      if (!target.isPlayer()) continue;
      const id = (target as Player).smallID();
      const list = myPushes.get(id);
      if (list === undefined) myPushes.set(id, [a]);
      else list.push(a);
    }
    const theirPushes = new Map<number, Attack[]>();
    for (const a of me.incomingAttacks()) {
      const id = a.attacker().smallID();
      const list = theirPushes.get(id);
      if (list === undefined) theirPushes.set(id, [a]);
      else list.push(a);
    }

    // Labels stay an aggregate readout — one signed number per front cluster.
    for (const a of me.outgoingAttacks()) {
      const target = a.target();
      if (!target.isPlayer()) continue;
      const def = target as Player;
      const local =
        (def.troops() * a.borderSize()) / Math.max(1, def.numTilesOwned());
      labels.push({
        tiles: a.clusteredPositions(),
        delta: Math.round(a.troops() - local),
      });
    }
    for (const a of me.incomingAttacks()) {
      const local =
        (me.troops() * a.borderSize()) / Math.max(1, me.numTilesOwned());
      labels.push({
        tiles: a.clusteredPositions(),
        delta: Math.round(local - a.troops()),
      });
    }

    if (myPushes.size > 0 || theirPushes.size > 0) {
      // Baseline holding strength per tile: the standing garrison each side
      // has spread over its territory. Without it a seam with no committed
      // troops on either side would read as a dead heat at full contrast.
      const myGarrison = me.troops() / Math.max(1, me.numTilesOwned());
      const garrisonOf = new Map<number, number>();
      for (const id of [...myPushes.keys(), ...theirPushes.keys()]) {
        const p = g.playerBySmallID(id);
        garrisonOf.set(
          id,
          p.isPlayer()
            ? (p as Player).troops() /
                Math.max(1, (p as Player).numTilesOwned())
            : 0,
        );
      }
      for (const b of me.borderTiles()) {
        const bx = g.x(b);
        const by = g.y(b);
        for (let d = 0; d < 4; d += 1) {
          const nx = bx + (d === 0 ? 1 : d === 1 ? -1 : 0);
          const ny = by + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          const oid = g.ownerID(ni);
          const mineHere = myPushes.get(oid);
          const theirsHere = theirPushes.get(oid);
          if (mineHere === undefined && theirsHere === undefined) continue;
          // My force pressing THEIR tile, theirs pressing MY tile.
          let mine = myGarrison;
          if (mineHere !== undefined) {
            for (const a of mineHere) mine += a.troopsAt(ni);
          }
          let theirs = garrisonOf.get(oid) ?? 0;
          if (theirsHere !== undefined) {
            for (const a of theirsHere) theirs += a.troopsAt(b);
          }
          const v = encode(bal(mine, theirs));
          paint(b, v);
          painted.push(b);
          paint(ni, v);
          painted.push(ni);
        }
      }
    }
  }
  prevFrontTiles = painted;
  return out.length ? Uint32Array.from(out) : null;
}

/** Human supply-quality deltas (add-supply-lines legibility): byte-pack the
 *  human's supply field as `tile | (byte<<24)`, byte = 1 + round(quality·254)
 *  on supplied land, 0 where supply doesn't reach. Rebuilt only when the field
 *  refreshes on its cadence (the dist map is otherwise the cached same object),
 *  so most ticks ship nothing. */
function supplyDelta(g: Game): Uint32Array | null {
  if (g.config().paintedEconomy()) return null;
  if (!supplyState) return null;
  const me = myPlayer();
  if (!me || !me.isAlive()) return null;
  const s = supplyField(g, me);
  if (s.lastCalcTick === supplyLastCalc) return null; // field unchanged
  supplyLastCalc = s.lastCalcTick;
  const f = g.config().food();
  const out: number[] = [];
  const nextTiles: number[] = [];
  const touch = (t: number, byte: number) => {
    if (supplyState![t] !== byte) {
      supplyState![t] = byte;
      out.push(t | (byte << 24));
    }
  };
  for (const [tile, dist] of s.dist) {
    const byte = 1 + Math.round(supplyQualityFromDistance(dist, f) * 254);
    touch(tile, byte);
    nextTiles.push(tile);
  }
  // Clear tiles that dropped out of supply since the last refresh.
  const now = new Set(nextTiles);
  for (const t of supplyPrevTiles) if (!now.has(t)) touch(t, 0);
  supplyPrevTiles = nextTiles;
  return out.length ? Uint32Array.from(out) : null;
}

/** Authored nation flags keyed by PlayerID, built once from g.nations(). Players
 *  carry their originating nation's PlayerID, so this maps a live player → its
 *  manifest flag. Cosmetic; empty when no nation authored a flag. */
let nationFlagByPid: Map<string, string> | null = null;
function nationFlags(g: Game): Map<string, string> {
  if (nationFlagByPid === null) {
    nationFlagByPid = new Map();
    for (const n of g.nations()) {
      if (n.flag !== undefined) nationFlagByPid.set(n.playerInfo.id, n.flag);
    }
  }
  return nationFlagByPid;
}

/** Compact per-player stats + names for newly-seen players. */
function playerSummary(g: Game): {
  stats: Int32Array;
  names:
    | { id: number; name: string; pid: string; ptype: string; flag?: string }[]
    | null;
} {
  const players = g.players();
  const flags = nationFlags(g);
  const stats = new Int32Array(players.length * STAT_STRIDE);
  let names:
    | { id: number; name: string; pid: string; ptype: string; flag?: string }[]
    | null = null;
  let i = 0;
  for (const p of players) {
    const id = p.smallID();
    stats[i++] = id;
    stats[i++] = Math.round(p.troops());
    stats[i++] = p.numTilesOwned();
    stats[i++] = p.isAlive() ? 1 : 0;
    // The food economy for EVERY nation, not just the human: the stats panel
    // charts a rival's food and surplus alongside your own, so "who is
    // starving" is readable rather than guessed.
    const painted = g.config().paintedEconomy()
      ? paintedResources(g, p)
      : undefined;
    const flow = painted
      ? { production: painted.foodGainMilli / 1000, consumption: 0 }
      : (runtime?.stats?.(p) ?? p.foodFlow());
    // food() already returns DISPLAY units (it divides the milli store by
    // 1000 internally) — do not scale it again.
    stats[i++] = Number(p.food());
    stats[i++] = Math.round(flow.production);
    stats[i++] = Math.round(flow.consumption);
    if (!knownNames.has(id)) {
      knownNames.add(id);
      (names ??= []).push({
        id,
        name: p.displayName(),
        pid: p.id(),
        ptype: p.type(),
        flag: flags.get(p.id()),
      });
    }
  }
  return { stats, names };
}

function buildFrame(g: Game): {
  frame: ShellSimFrame;
  transfer: Transferable[];
} {
  const labels: ShellFrontLabel[] = [];
  const owner = pending?.packedTileUpdates ?? null;
  const plot = plotDelta(g);
  const front = frontDelta(g, labels);
  const density = pending?.packedDensityUpdates ?? null;
  // Combat scarring conduit (rework-settlement-ecology): the sim already ships
  // per-tile damage deltas (tile | byte<<24) — pass them straight through.
  const damage = pending?.packedDamageUpdates ?? null;
  const burns = burnDelta();
  const supply = supplyDelta(g);
  const { stats, names } = playerSummary(g);
  const transportShips = packTransportShips(g.units(UnitType.TransportShip));
  const me = myPlayer();
  const runtimeStats = me ? runtime?.stats?.(me) : undefined;
  const painted =
    me && g.config().paintedEconomy() ? paintedResources(g, me) : undefined;
  const prices = g.config().paintedEconomy();
  const myStats = me
    ? {
        painted,
        urban: painted ? cityDevelopmentSummary(g, me, painted) : undefined,
        ...(prices
          ? {
              paintedPricing: {
                farmCostMilli: prices.farmCostMilli,
                cityCostMilli: prices.cityCostMilli,
                landDispatchMilliPerTroop: prices.landDispatchMilliPerTroop,
                transportDispatchMilliPerTroop:
                  prices.transportDispatchMilliPerTroop,
              },
            }
          : {}),
        troops: Math.round(me.troops()),
        food: Number(me.food()),
        population: Math.round(
          painted?.totalTroops ??
            runtimeStats?.population ??
            me.foodFlow().population,
        ),
        starved: Math.round(
          painted ? 0 : (runtimeStats?.starved ?? me.foodFlow().starvedTroops),
        ),
        tiles: me.numTilesOwned(),
        alive: me.isAlive(),
        farmSeeds: me.farmSeeds(),
        settlementSeeds: me.settlementSeeds(),
        activeAttackID: me.outgoingAttacks()[0]?.id(),
      }
    : null;
  // Nations' intended landing sites — only while the human is still choosing,
  // and only once (they do not move). Without this the spawn map is blank and
  // you pick a home with no idea who you are about to be next to.
  let nationSpawns: ShellSimFrame["nationSpawns"] = null;
  if (g.inSpawnPhase() && !nationSpawnsSent) {
    const out: { x: number; y: number; name: string; flag?: string }[] = [];
    for (const n of g.nations()) {
      if (n.spawnCell === undefined) continue;
      out.push({
        x: n.spawnCell.x,
        y: n.spawnCell.y,
        name: n.playerInfo.name,
        flag: n.flag,
      });
    }
    if (out.length > 0) {
      nationSpawns = out;
      nationSpawnsSent = true;
    }
  }
  let spawnAnchor: number | null = null;
  if (!spawnAnchorSent && me && me.numTilesOwned() > 0) {
    spawnAnchor = me.core() ?? [...me.tiles()][0] ?? null;
    if (spawnAnchor !== null) spawnAnchorSent = true;
  }
  // The human's border tiles, shipped exactly when the border MOVES. This used
  // to be a blind every-3-ticks cadence while territory deltas shipped every
  // tick, so the aimed-segment highlight visibly lagged the border it is drawn
  // against — the territory grew, the highlight stayed on the old seam for a
  // few frames, and it read as the highlight sliding around on its own.
  // `lastTileChange` is bumped by conquer/relinquish, so this ships on the
  // tick the border actually changes and skips every tick it does not.
  let myBorder: Uint32Array | undefined;
  if (me && me.lastTileChange() !== lastBorderChangeSent) {
    lastBorderChangeSent = me.lastTileChange();
    myBorder = Uint32Array.from(me.borderTiles());
  }
  const frame: ShellSimFrame = {
    development: developmentUpdates.read(g),
    matchResult:
      g.config().paintedEconomy() && !ambient
        ? simpleFrontResult(g, me?.id() ?? null)
        : null,
    type: "frame",
    tick: g.ticks(),
    inSpawn: g.inSpawnPhase(),
    mySmallID: me ? me.smallID() : 0,
    owner,
    plot,
    front,
    density,
    damage,
    supply,
    burns,
    stats,
    transportShips,
    names,
    myStats,
    paintResults: pending?.updates[GameUpdateType.PaintResult].filter(
      (result) => result.player === me?.id(),
    ),
    simplePlots: runtime?.plotFrame?.(),
    fronts: labels.length ? labels : null,
    spawnAnchor,
    nationSpawns,
    myBorder,
  };
  const transfer: Transferable[] = [stats.buffer, transportShips.buffer];
  if (frame.development) transfer.push(frame.development.tiles.buffer);
  if (frame.simplePlots) transfer.push(frame.simplePlots.buffer);
  for (const a of [
    owner,
    plot,
    front,
    density,
    damage,
    supply,
    burns,
    myBorder,
  ]) {
    if (a) transfer.push(a.buffer);
  }
  return { frame, transfer };
}

/** Confirm compact plot intents from the core's post-tick state, not preflight. */
function postPlotActionResults(): void {
  if (!game || pendingPlotActions.length === 0) return;
  const pendingActions = pendingPlotActions;
  pendingPlotActions = [];
  const claimedUnits = new Set<number>();
  const claimedLevels = new Map<number, number>();
  const claimedDeletes = new Set<number>();
  const retry: PendingPlotAction[] = [];
  for (const pendingAction of pendingActions) {
    const plot = game.plotAt(pendingAction.tile);
    const owned = plot?.owner().id() === pendingAction.playerID;
    let ok = false;
    if (
      pendingAction.unitID === undefined &&
      plot === undefined &&
      !pendingAction.checks
    ) {
      retry.push({ ...pendingAction, checks: 1 });
      continue;
    }
    if (pendingAction.action === "raze") {
      ok =
        pendingAction.unitID !== undefined &&
        !claimedDeletes.has(pendingAction.unitID) &&
        (plot === undefined ||
          plot.id() !== pendingAction.unitID ||
          plot.isMarkedForDeletion());
      if (ok && pendingAction.unitID !== undefined) {
        claimedDeletes.add(pendingAction.unitID);
      }
    } else {
      const unit =
        pendingAction.action === "city"
          ? UnitType.Settlement
          : UnitType.Farmland;
      if (owned && plot?.type() === unit) {
        if (pendingAction.unitID === undefined) {
          // A build exposes one new unit; claim it once so competing intents
          // on the same tile cannot both report success.
          ok = !claimedUnits.has(plot.id());
          if (ok) claimedUnits.add(plot.id());
        } else if (plot.id() === pendingAction.unitID) {
          const level =
            claimedLevels.get(plot.id()) ?? pendingAction.level ?? 0;
          ok = plot.level() > level;
          if (ok) claimedLevels.set(plot.id(), level + 1);
        }
      }
    }
    post({
      type: "action_result",
      action: pendingAction.action,
      tile: pendingAction.tile,
      ok,
      ...(!ok ? { message: "Action was rejected" } : {}),
    });
  }
  pendingPlotActions = retry;
}

async function stepAndPost(generation: number): Promise<void> {
  if (!gr || !game) return;
  await runtime?.beforeTick();
  if (!running || !gr || !game || generation !== runGeneration) return;
  gr.addTurn({ turnNumber: turn++, intents: queued });
  queued = [];
  pending = null;
  gr.executeNextTick();
  await runtime?.afterTick?.();
  postPlotActionResults();
  const { frame, transfer } = buildFrame(game);
  post(frame, transfer);
  if (!ambient && frame.matchResult) {
    queued = [];
    pendingPlotActions = [];
    setRunning(false, turbo);
  }
}

async function loop(generation: number): Promise<void> {
  if (!running || !gr || generation !== runGeneration) return;
  if (stepInFlight) {
    await stepInFlight;
    if (!running || !gr || generation !== runGeneration) return;
  }
  const start = performance.now();
  const step = stepAndPost(generation).catch((err: unknown) => {
    setRunning(false, turbo);
    post({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
  stepInFlight = step;
  await step;
  if (stepInFlight === step) stepInFlight = null;
  if (!running || !gr || generation !== runGeneration) return;
  const budget = ambient ? TICK_MS * AMBIENT_TICK_SCALE : TICK_MS;
  const delay = turbo ? 0 : Math.max(0, budget - (performance.now() - start));
  timer = setTimeout(() => void loop(generation), delay);
}

function setRunning(run: boolean, tb: boolean): void {
  if (run && !ambient && game?.config().paintedEconomy() && game.getWinner())
    return;
  turbo = tb;
  if (run && !running) {
    running = true;
    void loop(++runGeneration);
  } else if (!run) {
    running = false;
    runGeneration += 1;
    if (timer) clearTimeout(timer);
    timer = null;
  }
}

function stamp(intent: Intent): void {
  if (!ambient && game?.config().paintedEconomy() && game.getWinner()) return;
  queued.push({ ...intent, clientID } as StampedIntent);
}

ctx.onmessage = (e: MessageEvent<ShellSimIn>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "init":
        void init(msg).catch((error: Error) =>
          post({ type: "error", message: error.message }),
        );
        break;
      case "running":
        setRunning(msg.running, msg.turbo);
        break;
      case "act": {
        const me = myPlayer();
        if (!me || !me.isAlive() || !game) break;
        const troops = Math.max(1, Math.round(me.troops() * msg.ratio));
        if (me.canAttack(msg.tile)) {
          const o = game.ownerID(msg.tile);
          const targetID =
            o === 0 ? null : (game.playerBySmallID(o) as Player).id();
          // Concentrated push (ClientGameRunner parity): the click aims a
          // segment of OUR border nearest the clicked cell; distance sets
          // its breadth. Whole-border advance when unresolvable.
          const seg = borderSegment(
            Array.from(me.borderTiles()),
            game.x(msg.tile),
            game.y(msg.tile),
            (t) => game!.x(t),
            (t) => game!.y(t),
          );
          stamp({
            type: "attack",
            targetID,
            troops,
            sourceTiles: seg?.sourceTiles ?? null,
          });
        } else if (me.bestTransportShipSpawn(msg.tile) !== false) {
          stamp({ type: "boat", troops, dst: msg.tile });
        }
        break;
      }
      case "intent":
        stamp(msg.intent);
        break;
      case "plot_action": {
        const me = myPlayer();
        const result =
          me && runtime?.resolvePlotAction?.(me, msg.action, msg.tile);
        if (!result) break;
        if (result.ok) {
          const plot = game?.plotAt(msg.tile);
          pendingPlotActions.push({
            action: msg.action,
            tile: msg.tile,
            playerID: me.id(),
            ...(plot ? { unitID: plot.id(), level: plot.level() } : {}),
          });
          stamp(result.intent);
        } else {
          post({
            type: "action_result",
            action: msg.action,
            tile: msg.tile,
            ok: false,
            message: result.message,
          });
        }
        break;
      }
      case "preview": {
        // Placement preview (rework-settlement-ecology): the sim's own canBuild
        // verdict + (Farmland) the site's climate-suitability fraction (0..1) —
        // the Gompertz ripening ceiling the plot will converge to.
        const me = myPlayer();
        if (!me || !game) break;
        const ok = me.canBuild(msg.unit, msg.tile) !== false;
        let fraction = 0;
        if (msg.unit === UnitType.Farmland && !game.config().paintedEconomy()) {
          fraction = climateSuitability(game, msg.tile);
        }
        post({ type: "preview", tile: msg.tile, unit: msg.unit, ok, fraction });
        break;
      }
    }
  } catch (err) {
    post({ type: "error", message: (err as Error).message });
  }
};

export {};
