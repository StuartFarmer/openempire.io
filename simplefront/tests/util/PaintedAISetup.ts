import { SpawnExecution } from "../../src/core/execution/SpawnExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../../src/core/game/Game";
import { createGame } from "../../src/core/game/GameImpl";
import type { GameMap } from "../../src/core/game/GameMap";
import {
  SimpleFrontCityConfig,
  SimpleFrontConfig,
} from "../../src/core/game/Rulesets";
import { setup } from "./Setup";

export async function aiFixture(
  options: {
    inertResources?: boolean;
    playerType?: PlayerType.Bot | PlayerType.Nation | PlayerType.Human;
    inSpawn?: boolean;
    organic?: boolean;
    map?: GameMap;
  } = {},
): Promise<{ game: Game; player: Player }> {
  const base = await setup("plains");
  const BaseConfig: typeof SimpleFrontConfig = options.organic
    ? SimpleFrontCityConfig
    : SimpleFrontConfig;
  class AIConfig extends BaseConfig {
    override paintedEconomy() {
      const c = super.paintedEconomy();
      return options.inertResources
        ? {
            ...c,
            foodBootstrapFraction: 0,
            troopBootstrapFraction: 0,
            foodGrowthRate: 0,
            troopGrowthRate: 0,
          }
        : c;
    }
  }
  const game = createGame(
    [],
    [],
    options.map ?? base.map(),
    base.miniMap(),
    new AIConfig(base.config().gameConfig(), null, false),
  );
  const info = new PlayerInfo(
    "Painter AI",
    options.playerType ?? PlayerType.Bot,
    null,
    "painted-ai",
  );
  game.addExecution(new SpawnExecution("ai-test", info, game.ref(50, 50)));
  game.executeNextTick();
  game.executeNextTick();
  if (!options.inSpawn) game.endSpawnPhase();
  return { game, player: game.player(info.id) };
}
