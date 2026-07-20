// OpenFront-live simulation worker (move-shell-sim-to-worker). Runs the real
// src/core sim off the main thread and ships the render conduits + a small
// per-tick summary to GameShellPage. Owns EVERY Game read; the main thread has
// no Game access.
import { assetUrl } from "../../core/AssetUrls";
import { climateSuitability } from "../../core/execution/utils/FarmGrowth";
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
  type Game,
  type Player,
} from "../../core/game/Game";
import type {
  ErrorUpdate,
  GameUpdateViewData,
} from "../../core/game/GameUpdates";
import { createGameRunner, GameRunner } from "../../core/GameRunner";
import type { GameStartInfo, Intent, StampedIntent } from "../../core/Schemas";
import { generateID } from "../../core/Util";
import type {
  ShellFrontLabel,
  ShellSimFrame,
  ShellSimIn,
  ShellSimOut,
} from "./ShellSimProtocol";

const ctx: Worker = self as unknown as Worker;
const post = (msg: ShellSimOut, transfer?: Transferable[]) =>
  transfer ? ctx.postMessage(msg, transfer) : ctx.postMessage(msg);

const TICK_MS = 100; // game clock — 10 ticks/s
const UNIT_DIFF_EVERY = 6;

let gr: GameRunner | null = null;
let game: Game | null = null;
let clientID = "";
let turn = 0;
let running = false;
let turbo = false;
let timer: ReturnType<typeof setTimeout> | null = null;

let W = 0;
let H = 0;
let popPerDensity = 10000;

let queued: StampedIntent[] = [];
let plotState: Uint8Array | null = null;
/** Worked-field mask (restore-organic-growth): 1 = worked by a farm. Applied
 *  from packedFieldUpdates; worked tiles render as Farmland in `plot`. */
let fieldState: Uint8Array | null = null;
let frontState: Uint8Array | null = null;
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

// Per-tick capture from the GameRunner callback.
let pending: GameUpdateViewData | null = null;

function myPlayer(): Player | null {
  return game && clientID ? game.playerByClientID(clientID) : null;
}

function computePlot(g: Game, tile: number): number {
  const plot = g.plotAt(tile);
  if (plot) {
    const ty = plot.type();
    return ty === UnitType.Settlement ? 1 : ty === UnitType.Barn ? 3 : 2;
  }
  // Worked field tiles (no structure) draw with the Farmland plot look.
  if (fieldState && fieldState[tile] !== 0) return 2;
  return 0;
}

async function init(msg: Extract<ShellSimIn, { type: "init" }>): Promise<void> {
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
      difficulty: Difficulty.Medium,
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
  gr = await createGameRunner(gameStart, clientID, loader, (gu) => {
    if (!(gu as ErrorUpdate).errMsg) pending = gu as GameUpdateViewData;
  });
  game = gr.game;
  W = game.width();
  H = game.height();
  const food = game.config().food();
  popPerDensity = food.popPerDensity;
  const n = W * H;
  plotState = new Uint8Array(n);
  fieldState = new Uint8Array(n);
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
    suitability[t] = Math.round(climateSuitability(game, t) * 255);
  }
  post({ type: "ready", popPerDensity, fertility, suitability }, [
    fertility.buffer,
    suitability.buffer,
  ]);
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
      fieldState[t] = fld[k] >>> 24 !== 0 ? 1 : 0;
      touch(t);
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
      if (!prevUnitTiles.has(t)) touch(t);
    }
    for (const t of prevUnitTiles) if (!cur.has(t)) touch(t);
    prevUnitTiles = cur;
  }
  return out.length ? Uint32Array.from(out) : null;
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
    const encoded = new Map<number, number>();
    for (const a of me.outgoingAttacks()) {
      const target = a.target();
      if (!target.isPlayer()) continue;
      const def = target as Player;
      const local =
        (def.troops() * a.borderSize()) / Math.max(1, def.numTilesOwned());
      encoded.set(def.smallID(), encode(bal(a.troops(), local)));
      labels.push({
        tiles: a.clusteredPositions(),
        delta: Math.round(a.troops() - local),
      });
    }
    for (const a of me.incomingAttacks()) {
      const local =
        (me.troops() * a.borderSize()) / Math.max(1, me.numTilesOwned());
      encoded.set(a.attacker().smallID(), encode(bal(local, a.troops())));
      labels.push({
        tiles: a.clusteredPositions(),
        delta: Math.round(local - a.troops()),
      });
    }
    if (encoded.size > 0) {
      for (const b of me.borderTiles()) {
        const bx = g.x(b);
        const by = g.y(b);
        for (let d = 0; d < 4; d += 1) {
          const nx = bx + (d === 0 ? 1 : d === 1 ? -1 : 0);
          const ny = by + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          const v = encoded.get(g.ownerID(ni));
          if (v !== undefined) {
            paint(b, v);
            painted.push(b);
            paint(ni, v);
            painted.push(ni);
          }
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

/** Compact per-player stats + names for newly-seen players. */
function playerSummary(g: Game): {
  stats: Int32Array;
  names: { id: number; name: string }[] | null;
} {
  const players = g.players();
  const stats = new Int32Array(players.length * 4);
  let names: { id: number; name: string }[] | null = null;
  let i = 0;
  for (const p of players) {
    const id = p.smallID();
    stats[i++] = id;
    stats[i++] = Math.round(p.troops());
    stats[i++] = p.numTilesOwned();
    stats[i++] = p.isAlive() ? 1 : 0;
    if (!knownNames.has(id)) {
      knownNames.add(id);
      (names ??= []).push({ id, name: p.displayName() });
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
  const supply = supplyDelta(g);
  const { stats, names } = playerSummary(g);
  const me = myPlayer();
  const myStats = me
    ? {
        troops: Math.round(me.troops()),
        food: Number(me.food()),
        population: Math.round(me.foodFlow().population),
        starved: Math.round(me.foodFlow().starvedTroops),
        tiles: me.numTilesOwned(),
        alive: me.isAlive(),
        farmSeeds: me.farmSeeds(),
        settlementSeeds: me.settlementSeeds(),
      }
    : null;
  let spawnAnchor: number | null = null;
  if (!spawnAnchorSent && me && me.numTilesOwned() > 0) {
    spawnAnchor = me.core() ?? [...me.tiles()][0] ?? null;
    if (spawnAnchor !== null) spawnAnchorSent = true;
  }
  // Re-key the placeName anchors from PlayerID → smallID (the main thread joins
  // them with the smallID-keyed player table).
  let nameAnchors: ShellSimFrame["nameAnchors"] = null;
  if (pending?.playerNameViewData) {
    nameAnchors = {};
    for (const [pid, a] of Object.entries(pending.playerNameViewData)) {
      if (g.hasPlayer(pid)) nameAnchors[String(g.player(pid).smallID())] = a;
    }
  }
  const frame: ShellSimFrame = {
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
    stats,
    names,
    myStats,
    fronts: labels.length ? labels : null,
    nameAnchors,
    spawnAnchor,
  };
  const transfer: Transferable[] = [stats.buffer];
  for (const a of [owner, plot, front, density, damage, supply]) {
    if (a) transfer.push(a.buffer);
  }
  return { frame, transfer };
}

function stepAndPost(): void {
  if (!gr || !game) return;
  gr.addTurn({ turnNumber: turn++, intents: queued });
  queued = [];
  pending = null;
  gr.executeNextTick();
  const { frame, transfer } = buildFrame(game);
  post(frame, transfer);
}

function loop(): void {
  if (!running || !gr) return;
  const start = performance.now();
  stepAndPost();
  const delay = turbo ? 0 : Math.max(0, TICK_MS - (performance.now() - start));
  timer = setTimeout(loop, delay);
}

function setRunning(run: boolean, tb: boolean): void {
  turbo = tb;
  if (run && !running) {
    running = true;
    loop();
  } else if (!run) {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
  }
}

function stamp(intent: Intent): void {
  queued.push({ ...intent, clientID } as StampedIntent);
}

ctx.onmessage = (e: MessageEvent<ShellSimIn>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "init":
        void init(msg);
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
          stamp({ type: "attack", targetID, troops, sourceTiles: null });
        } else if (me.bestTransportShipSpawn(msg.tile) !== false) {
          stamp({ type: "boat", troops, dst: msg.tile });
        }
        break;
      }
      case "intent":
        stamp(msg.intent);
        break;
      case "preview": {
        // Placement preview (rework-settlement-ecology): the sim's own canBuild
        // verdict + (Farmland) the site's climate-suitability fraction (0..1) —
        // the Gompertz ripening ceiling the plot will converge to.
        const me = myPlayer();
        if (!me || !game) break;
        const ok = me.canBuild(msg.unit, msg.tile) !== false;
        let fraction = 0;
        if (msg.unit === UnitType.Farmland) {
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
