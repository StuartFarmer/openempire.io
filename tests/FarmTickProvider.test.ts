import { afterEach, describe, expect, test } from "vitest";
import {
  farmTick,
  setFarmTickProvider,
  type FarmTickProvider,
} from "../src/core/execution/utils/FarmGrowth";
import { foodShedField } from "../src/core/execution/utils/FoodShed";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

/**
 * The farm CA's injection point (port-economy-to-gpu). The rule that matters is
 * ALL OR NOTHING: ripening and patch placement both write maturity and the
 * second reads what the first produced, so a provider serves the whole tick or
 * the CPU does.
 */
const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");
const good: LayersFill = (n) => (n === "temperature" ? 153 : 255);

async function game(): Promise<[Game, Player]> {
  const g = await setup(
    "plains",
    {},
    [info],
    undefined,
    TestConfig,
    true,
    good,
  );
  const p = g.player(info.id);
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) p.conquer(g.ref(x, y));
  return [g, p];
}

describe("FarmTickProvider", () => {
  afterEach(() => setFarmTickProvider(null));

  test("a provider that claims the tick stops the CPU advancing maturity", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    p.setFarmMaturity(t, 400);
    const claimed: FarmTickProvider = { apply: () => true };
    setFarmTickProvider(claimed);
    farmTick(g, p, foodShedField(g, p));
    expect(p.farmMaturity(t)).toBe(400); // untouched: the provider owns it
  });

  test("a provider that declines falls back to the CPU", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    p.setFarmMaturity(t, 400);
    setFarmTickProvider({ apply: () => false });
    farmTick(g, p, foodShedField(g, p));
    // The CPU ripened or senesced it — either way it moved off the seed value.
    expect(p.farmMaturity(t)).not.toBe(400);
  });

  test("clearing the provider restores the CPU path", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    p.setFarmMaturity(t, 400);
    setFarmTickProvider({ apply: () => true });
    setFarmTickProvider(null);
    farmTick(g, p, foodShedField(g, p));
    expect(p.farmMaturity(t)).not.toBe(400);
  });

  test("the provider is handed the player and its shed", async () => {
    const [g, p] = await game();
    const seen: string[] = [];
    setFarmTickProvider({
      apply: (mg, player, shed) => {
        seen.push(`${player.id()}:${shed.smallID}:${mg.ticks()}`);
        return true;
      },
    });
    const shed = foodShedField(g, p);
    farmTick(g, p, shed);
    expect(seen).toEqual([`${info.id}:${p.smallID()}:${g.ticks()}`]);
  });
});
