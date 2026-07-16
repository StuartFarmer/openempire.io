/**
 * Growth-loop diagnostic probe (rework-settlement-ecology task 10): one
 * seeded headless game, dumping the full growth loop for the top nations
 * every N ticks — population → capacity → field size (acre/tilled/ranked) →
 * labor (people vs staffing gate) → room (claim-viable BFS + exact
 * placePatch frontier eligibility with per-gate block counts) → urban
 * target/area → awards and banked seeds — to find which link binds.
 * Companion to BalanceRun: BalanceRun measures WHETHER nations grow, this
 * shows WHY one doesn't (it found the task-10 ignition chain).
 *
 *   npx tsx tests/perf/balance/GrowthProbe.ts [--ticks 1500] [--every 150]
 */
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "../../../src/core/configuration/Config";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import { climateSuitability } from "../../../src/core/execution/utils/FarmGrowth";
import { foodShedField } from "../../../src/core/execution/utils/FoodShed";
import { foodTargetTiles } from "../../../src/core/execution/utils/UrbanGrowth";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  Player,
  UnitType,
} from "../../../src/core/game/Game";
import { createGame } from "../../../src/core/game/GameImpl";
import { decodeLayers } from "../../../src/core/game/MapLayers";
import { createNationsForGame } from "../../../src/core/game/NationCreation";
import { genTerrainFromBin } from "../../../src/core/game/TerrainMapLoader";
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

async function main(): Promise<void> {
  const ticks = Number(arg("ticks", "1500"));
  const every = Number(arg("every", "150"));
  const gameConfig: GameConfig = {
    gameMap:
      GameMapType[
        Object.keys(GameMapType).find(
          (k) => k.toLowerCase() === "verdantia",
        ) as keyof typeof GameMapType
      ],
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    difficulty: Difficulty.Medium,
    nations: 25,
    donateGold: false,
    donateTroops: false,
    bots: 40,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  };
  const gameStart: GameStartInfo = {
    gameID: "probe",
    lobbyCreatedAt: 0,
    config: gameConfig,
    players: [],
  };
  const config = new Config(gameConfig, null, false);
  const mapLoader = new NodeGameMapLoader(
    path.join(PROJECT_ROOT, "resources/maps"),
  );
  const mapData = mapLoader.getMapData(gameConfig.gameMap);
  const manifest = await mapData.manifest();
  const layers = decodeLayers(
    await mapData.layersBin!(),
    manifest.map.width,
    manifest.map.height,
  );
  const gameMap = await genTerrainFromBin(
    manifest.map,
    await mapData.mapBin(),
    layers,
  );
  const miniGameMap = await genTerrainFromBin(
    manifest.map4x,
    await mapData.map4xBin(),
  );
  const random = new PseudoRandom(simpleHash("probe"));
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
    miniGameMap,
    config,
    manifest.teamGameSpawnAreas,
  );
  const runner = new GameRunner(
    game,
    new Executor(game, "probe", undefined),
    () => {},
  );
  runner.init();
  let turn = 0;
  const runTick = () => {
    runner.addTurn({ turnNumber: turn++, intents: [] });
    runner.executeNextTick();
  };
  while (game.inSpawnPhase()) runTick();

  const f = config.food();
  const claim = f.fieldClaimMilli;

  const dump = (p: Player): void => {
    const flow = p.foodFlow();
    const shed = foodShedField(game, p);
    const farms = p
      .units(UnitType.Farmland)
      .filter((u) => !u.isUnderConstruction());
    // Field census straight off the maturity plane.
    let claimed = 0;
    for (const [, m] of p.farmMaturityEntries()) if (m >= claim) claimed++;
    const perFarm = farms.slice(0, 4).map((u) => {
      const t = u.tile();
      let acreage = 0;
      for (const [tile, m] of p.farmMaturityEntries()) {
        if (m >= claim && (shed.cellOf.get(tile) ?? tile) === t) acreage++;
      }
      const residents = Math.round(shed.peopleByFarm.get(t) ?? 0);
      const laborOK = residents >= (acreage + 1) * f.farmersPerFieldTile;
      // Claim-viable connected room: how big a field COULD grow here —
      // owned, wild-or-field, suit ≥ claim, 4-connected from the nucleus.
      const seen = new Set([t]);
      const queue = [t];
      const nbuf: number[] = [0, 0, 0, 0];
      const map = game.map();
      while (queue.length > 0 && seen.size < 400) {
        const cur = queue.pop()!;
        const k = map.neighbors4(cur, nbuf);
        for (let j = 0; j < k; j++) {
          const nb = nbuf[j];
          if (seen.has(nb)) continue;
          if (game.owner(nb) !== p) continue;
          if (!map.isLand(nb) || map.isImpassable(nb)) continue;
          if (p.density(nb) > 0) continue;
          if (climateSuitability(game, nb) * 1000 < claim) continue;
          seen.add(nb);
          queue.push(nb);
        }
      }
      // Exact placePatch eligibility over the field's 4-neighbor frontier:
      // how many candidate plots COULD place right now?
      const fieldTiles: number[] = [t];
      for (const [tile, m] of p.farmMaturityEntries()) {
        if (m >= claim && (shed.cellOf.get(tile) ?? tile) === t) {
          fieldTiles.push(tile);
        }
      }
      let frontier = 0;
      const fseen = new Set<number>();
      const why = {
        owner: 0,
        land: 0,
        city: 0,
        plot: 0,
        dmg: 0,
        mat: 0,
        ranked: 0,
        suit: 0,
      };
      for (const ft of fieldTiles) {
        const k = map.neighbors4(ft, nbuf);
        for (let j = 0; j < k; j++) {
          const nb = nbuf[j];
          if (fseen.has(nb)) continue;
          fseen.add(nb);
          if (map.ownerID(nb) !== p.smallID()) {
            why.owner++;
            continue;
          }
          if (!map.isLand(nb) || map.isImpassable(nb)) {
            why.land++;
            continue;
          }
          if (p.density(nb) > 0) {
            why.city++;
            continue;
          }
          if (game.plotAt(nb) !== undefined) {
            why.plot++;
            continue;
          }
          if (game.tileDamage(nb) > 0) {
            why.dmg++;
            continue;
          }
          if (p.farmMaturity(nb) > 0) {
            why.mat++;
            continue;
          }
          if (shed.ranked.has(nb)) {
            why.ranked++;
            continue;
          }
          if (climateSuitability(game, nb) * 1000 < claim) {
            why.suit++;
            continue;
          }
          frontier++;
        }
      }
      return (
        `farm@${game.x(t)},${game.y(t)} acre=${acreage} people=${residents} laborOK=${laborOK} ` +
        `roomBFS=${seen.size} frontier=${frontier} blocked=${JSON.stringify(why)}`
      );
    });
    const impl = p as Player & {
      _peakPopulation: number;
      _settlementsAwarded: number;
    };
    console.log(
      `  ${p.name()}: pop=${Math.round(flow.population)} cap=${flow.capacity} prod=${flow.production} ` +
        `troops=${p.troops()} peak=${Math.round(impl._peakPopulation ?? 0)} awards=${impl._settlementsAwarded ?? 0} ` +
        `seeds=${p.farmSeeds()}/${p.settlementSeeds()} tiles=${p.numTilesOwned()} urban=${Math.round(p.urbanArea())} ` +
        `urbanTarget=${foodTargetTiles(game, p)} farms=${farms.length} fieldClaimed=${claimed} ` +
        `tilled=${shed.tilled.size} ranked=${shed.ranked.size}`,
    );
    for (const line of perFarm) console.log(`    ${line}`);
  };

  for (let i = 0; i < ticks; i++) {
    runTick();
    if (i % every === 0 || i === ticks - 1) {
      const alive = game
        .players()
        .filter((p) => p.isAlive())
        .sort((a, b) => b.foodFlow().population - a.foodFlow().population);
      console.log(`tick ${game.ticks()} alive=${alive.length}`);
      for (const p of alive.slice(0, 3)) dump(p);
    }
  }
}

void main();
