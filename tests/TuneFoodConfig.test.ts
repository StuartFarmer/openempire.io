import { FOOD_DEFAULTS } from "../src/core/configuration/FoodConfig";
import { TuneFoodConfigExecution } from "../src/core/execution/TuneFoodConfigExecution";
import { Game, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { TuneFoodConfigIntentSchema } from "../src/core/Schemas";
import { setup } from "./util/Setup";

const humanInfo = new PlayerInfo("tuner", PlayerType.Human, null, "tuner_id");

async function game(): Promise<Game> {
  // Explicit layersFill → real (non-inert) food config, like economy tests.
  return setup(
    "plains",
    { instantBuild: true },
    [humanInfo],
    undefined,
    undefined,
    true,
    () => 128,
  );
}

describe("tune_food_config (add-sim-tuning-panel)", () => {
  test("an override changes the live config; other knobs stay default", async () => {
    const g = await game();
    expect(g.config().food().farmOutputMilli).toBe(
      FOOD_DEFAULTS.farmOutputMilli,
    );

    g.addExecution(new TuneFoodConfigExecution("farmOutputMilli", 999));
    g.executeNextTick();

    expect(g.config().food().farmOutputMilli).toBe(999);
    expect(g.config().food().idleConsumptionMilli).toBe(
      FOOD_DEFAULTS.idleConsumptionMilli,
    );
    expect(g.config().food().granaryBase).toBe(FOOD_DEFAULTS.granaryBase);
  });

  test("setting the default value un-pins the override", async () => {
    const g = await game();
    g.addExecution(new TuneFoodConfigExecution("granaryBase", 500));
    g.executeNextTick();
    expect(g.config().food().granaryBase).toBe(500);
    expect(Object.keys(g.config().foodOverrides())).toEqual(["granaryBase"]);

    g.addExecution(
      new TuneFoodConfigExecution("granaryBase", FOOD_DEFAULTS.granaryBase),
    );
    g.executeNextTick();
    expect(g.config().food().granaryBase).toBe(FOOD_DEFAULTS.granaryBase);
    expect(Object.keys(g.config().foodOverrides())).toEqual([]);
  });

  test("a hostile value in a hand-crafted turn is ignored by the execution", async () => {
    const g = await game();
    g.addExecution(new TuneFoodConfigExecution("farmOutputMilli", -5));
    g.addExecution(new TuneFoodConfigExecution("granaryBase", Number.NaN));
    g.executeNextTick();
    expect(g.config().food().farmOutputMilli).toBe(
      FOOD_DEFAULTS.farmOutputMilli,
    );
    expect(g.config().food().granaryBase).toBe(FOOD_DEFAULTS.granaryBase);
  });

  test("zod schema accepts known keys and rejects unknown/invalid ones", () => {
    const ok = TuneFoodConfigIntentSchema.safeParse({
      type: "tune_food_config",
      key: "kSlope",
      value: 0.02,
    });
    expect(ok.success).toBe(true);

    for (const bad of [
      { type: "tune_food_config", key: "notAKnob", value: 1 },
      { type: "tune_food_config", key: "granaryBase", value: -1 },
      { type: "tune_food_config", key: "granaryBase", value: Infinity },
      { type: "tune_food_config", key: "granaryBase", value: "60" },
    ]) {
      expect(TuneFoodConfigIntentSchema.safeParse(bad).success).toBe(false);
    }
  });

  test("the inert-food test layer still wins over tuning overrides", async () => {
    // Legacy tests (no layersFill) get inert food; an override on a knob the
    // inert layer pins must not reactivate consumption.
    const g = await setup("plains", {}, [humanInfo]);
    g.addExecution(new TuneFoodConfigExecution("idleConsumptionMilli", 50));
    g.executeNextTick();
    expect(g.config().food().idleConsumptionMilli).toBe(0);
    // But knobs the inert layer does not pin show the override.
    g.addExecution(new TuneFoodConfigExecution("granaryPerFarm", 77));
    g.executeNextTick();
    expect(g.config().food().granaryPerFarm).toBe(77);
  });
});
