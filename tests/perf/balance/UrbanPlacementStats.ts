/**
 * Stage 2 pre-check: can a per-tile CA stand in for the CPU's placement?
 *
 * `addCityTiles` places `n` city tiles per player per tick by SEQUENTIAL
 * weighted sampling without replacement — and the frontier GROWS as it goes: a
 * placed tile promotes its eligible neighbours, so later picks in the same tick
 * can land on ground that only became available because of earlier picks. A GPU
 * CA cannot do that. It evaluates every frontier tile independently and
 * simultaneously, so it can only ever advance the front by one ring per tick.
 *
 * Whether that matters is an empirical question with a simple answer: how big
 * is `n` next to the frontier it draws from?
 *
 *   n ≪ |frontier|  → picks almost never chain within a tick; a CA with
 *                     p = n·suit/Σsuit is a faithful substitute.
 *   n ≈ |frontier|  → the tick's growth is mostly chaining, and a CA would
 *                     produce visibly different city shapes.
 *
 * This reconstructs the same suit map and frontier the sim builds (from the
 * exported pieces, same predicates) and reports the ratio over a real game.
 *
 *   npx tsx tests/perf/balance/UrbanPlacementStats.ts --map spqr --ticks 3000
 */
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "../../../src/core/configuration/Config";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import {
  foodShedField,
  foodShedPotential,
} from "../../../src/core/execution/utils/FoodShed";
import { supplyField } from "../../../src/core/execution/utils/SupplyField";
import {
  foodTargetTiles,
  urbanSuitability,
} from "../../../src/core/execution/utils/UrbanGrowth";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  LandUse,
  Player,
  UnitType,
} from "../../../src/core/game/Game";
import { createGame } from "../../../src/core/game/GameImpl";
import { TileRef } from "../../../src/core/game/GameMap";
import { decodeLayers } from "../../../src/core/game/MapLayers";
import { createNationsForGame } from "../../../src/core/game/NationCreation";
import { genTerrainFromBin } from "../../../src/core/game/TerrainMapLoader";
import { UserSettings } from "../../../src/core/game/UserSettings";
import { GameRunner } from "../../../src/core/GameRunner";
import { PseudoRandom } from "../../../src/core/PseudoRandom";
import { GameConfig, GameStartInfo } from "../../../src/core/Schemas";
import { simpleHash } from "../../../src/core/Util";
import { NodeGameMapLoader } from "../fullgame/NodeGameMapLoader";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

class StatsConfig extends Config {
  constructor(gc: GameConfig) {
    super(gc, new UserSettings(), false);
  }
  override isReplay(): boolean {
    return false;
  }
}

/** The frontier and its weight, rebuilt with the sim's own predicates. */
function frontierOf(
  mg: ReturnType<typeof createGame>,
  player: Player,
): { size: number; weightSum: number; eligible: number } {
  const f = mg.config().food();
  const map = mg.map();
  const smallID = player.smallID();
  const CITY = f.popPerDensity;
  const supply = supplyField(mg, player);
  const shed = foodShedField(mg, player);
  const nbuf: TileRef[] = [0, 0, 0, 0];

  const localDensity = (tile: TileRef): number => {
    const k = map.neighbors4(tile, nbuf);
    let sum = 0;
    for (let i = 0; i < k; i++) sum += player.density(nbuf[i]) / CITY;
    return k > 0 ? sum / k : 0;
  };

  const suit = new Map<TileRef, number>();
  for (const [tile] of supply.dist) {
    if (map.ownerID(tile) !== smallID) continue;
    if (!map.isLand(tile) || map.isImpassable(tile)) continue;
    if (player.density(tile) >= CITY) continue;
    if (player.isFieldTile(tile)) continue;
    if (player.landUse(tile) === LandUse.Field) continue;
    if (mg.tileDamage(tile) > 0) continue;
    const base = urbanSuitability(mg, player, supply, tile, localDensity(tile));
    if (base <= 0) continue;
    const gate = Math.min(1, f.wFoodShed * foodShedPotential(mg, shed, tile));
    const sp = base * gate;
    if (sp <= 0) continue;
    suit.set(tile, sp);
  }

  const isCity = (t: TileRef): boolean => player.density(t) >= CITY;
  const touchesCity = (t: TileRef): boolean => {
    const k = map.neighbors4(t, nbuf);
    for (let i = 0; i < k; i++) if (isCity(nbuf[i])) return true;
    return false;
  };
  const nuclei = new Set<TileRef>();
  const core = player.core();
  if (core !== null) nuclei.add(core);
  for (const s of player.units(UnitType.Settlement)) {
    if (!s.isUnderConstruction()) nuclei.add(s.tile());
  }
  const nearNucleus = (t: TileRef): boolean => {
    if (nuclei.has(t)) return true;
    const k = map.neighbors4(t, nbuf);
    for (let i = 0; i < k; i++) if (nuclei.has(nbuf[i])) return true;
    return false;
  };

  let size = 0;
  let weightSum = 0;
  for (const [tile, w] of suit) {
    if (touchesCity(tile) || nearNucleus(tile)) {
      size += 1;
      weightSum += w;
    }
  }
  return { size, weightSum, eligible: suit.size };
}

async function main(): Promise<void> {
  console.debug = () => {};
  console.warn = () => {};
  console.error = () => {};
  const log = console.log;
  console.log = () => {};

  const mapName = arg("map", "spqr");
  const ticks = Number(arg("ticks", "3000"));
  const sample = Number(arg("sample", "250"));
  const seed = arg("seed", "urbanstats");

  const map = GameMapType[
    Object.keys(GameMapType).find(
      (k) => k.toLowerCase() === mapName.toLowerCase(),
    ) as keyof typeof GameMapType
  ] as GameMapType;

  const gameConfig: GameConfig = {
    gameMap: map,
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    difficulty: Difficulty.Medium,
    nations: "default",
    donateGold: false,
    donateTroops: false,
    bots: 40,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  };
  const gameStart: GameStartInfo = {
    gameID: seed,
    lobbyCreatedAt: 0,
    config: gameConfig,
    players: [],
  };
  const loader = new NodeGameMapLoader(
    path.join(PROJECT_ROOT, "resources/maps"),
  );
  const data = loader.getMapData(map);
  const manifest = await data.manifest();
  const { width, height } = manifest.map;
  const layers = decodeLayers(await data.layersBin!(), width, height);
  const gameMap = await genTerrainFromBin(
    manifest.map,
    await data.mapBin(),
    layers,
  );
  const mini = await genTerrainFromBin(manifest.map4x, await data.map4xBin());
  const random = new PseudoRandom(simpleHash(seed));
  const nations = createNationsForGame(
    gameStart,
    manifest.nations,
    manifest.additionalNations ?? [],
    0,
    random,
  );
  const game = createGame(
    [],
    nations,
    gameMap,
    mini,
    new StatsConfig(gameConfig),
    manifest.teamGameSpawnAreas,
  );
  const runner = new GameRunner(
    game,
    new Executor(game, gameStart.gameID, undefined),
    () => {},
  );
  runner.init();
  let turn = 0;
  const tick = () => {
    runner.addTurn({ turnNumber: turn++, intents: [] });
    runner.executeNextTick();
  };
  while (game.inSpawnPhase()) tick();

  const f = game.config().food();
  log(`map=${mapName} ticks=${ticks} urbanGrowthRate=${f.urbanGrowthRate}`);
  log(
    "window | growing(player-ticks) | n: mean/max | frontier: mean/max | n/frontier: mean/p90",
  );

  // Growth is BURSTY: a city sits at its food-bounded target most ticks and
  // grows only when the target moves. Spot-checking single ticks reports zero,
  // so accumulate over every tick and report per window. `foodTargetTiles` is
  // cheap enough to call each tick; the frontier rebuild is not, so it is
  // sampled from the growing players only.
  let growingPT = 0;
  const nSamples: number[] = [];
  const frontierSamples: number[] = [];
  const ratios: number[] = [];
  let frontierBudget = 40; // frontier rebuilds allowed per window

  for (let i = 0; i < ticks; i++) {
    tick();
    for (const p of game.players()) {
      if (!p.isAlive()) continue;
      const area = Math.round(p.urbanArea());
      const target = foodTargetTiles(game, p);
      if (area >= target) continue;
      growingPT += 1;
      const gap = target - area;
      // Pace, per growUrbanArea. nucleusPaceBoost is private; it only ever
      // RAISES the pace, so this is a lower bound on n — which makes the
      // n/frontier ratio reported here conservative in the CA's favour.
      const n = Math.min(gap, Math.max(1, Math.floor(gap * f.urbanGrowthRate)));
      nSamples.push(n);
      if (frontierBudget > 0) {
        frontierBudget -= 1;
        const fr = frontierOf(game, p);
        frontierSamples.push(fr.size);
        if (fr.size > 0) ratios.push(n / fr.size);
      }
    }
    if ((i + 1) % sample !== 0) continue;
    const stat = (xs: number[]): string => {
      if (xs.length === 0) return "—/—";
      const sorted = xs.slice().sort((a, b) => a - b);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return `${mean.toFixed(2)}/${sorted[sorted.length - 1].toFixed(2)}`;
    };
    const ratioStat = (xs: number[]): string => {
      if (xs.length === 0) return "—/—";
      const sorted = xs.slice().sort((a, b) => a - b);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return `${mean.toFixed(3)}/${sorted[Math.floor(sorted.length * 0.9)].toFixed(3)}`;
    };
    log(
      `${game.ticks()} | ${growingPT} | ${stat(nSamples)} | ${stat(frontierSamples)} | ${ratioStat(ratios)}`,
    );
    growingPT = 0;
    nSamples.length = 0;
    frontierSamples.length = 0;
    ratios.length = 0;
    frontierBudget = 40;
  }
}

void main();
