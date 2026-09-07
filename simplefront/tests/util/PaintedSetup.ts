import { Config } from "../../src/core/configuration/Config";
import { PAINTED_DEFAULTS } from "../../src/core/configuration/PaintedEconomyConfig";
import { PlayerInfo, PlayerType } from "../../src/core/game/Game";
import { setup } from "./Setup";
import { TestConfig } from "./TestConfig";

export async function paintedFixture(active = false, legacy = false) {
  class PaintedTestConfig extends TestConfig {
    override paintedEconomy() {
      if (legacy) return null;
      return active
        ? PAINTED_DEFAULTS
        : {
            ...PAINTED_DEFAULTS,
            foodBootstrapFraction: 0,
            troopBootstrapFraction: 0,
            foodGrowthRate: 0,
            troopGrowthRate: 0,
          };
    }
    override attackLogic(...args: Parameters<Config["attackLogic"]>) {
      return Config.prototype.attackLogic.apply(this, args);
    }
    override attackTilesPerTick(
      ...args: Parameters<Config["attackTilesPerTick"]>
    ) {
      return Config.prototype.attackTilesPerTick.apply(this, args);
    }
  }
  const infos = ["painter", "rival"].map(
    (id) => new PlayerInfo(id, PlayerType.Human, null, id),
  );
  const game = await setup("plains", {}, infos, undefined, PaintedTestConfig);
  const [player, rival] = infos.map((info) => game.player(info.id));
  for (const [i, p] of [player, rival].entries()) {
    const x0 = 10 + i * 10;
    for (let y = 10; y < 20; y++)
      for (let x = x0; x < x0 + 10; x++) p.conquer(game.ref(x, y));
    p.setSpawnTile(game.ref(x0, 10));
  }
  return { game, player, rival };
}
