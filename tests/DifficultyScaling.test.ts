import {
  Difficulty,
  Game,
  PlayerInfo,
  PlayerType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

const DIFFICULTIES = [
  Difficulty.Easy,
  Difficulty.Medium,
  Difficulty.Hard,
  Difficulty.Impossible,
];

async function gameAt(difficulty: Difficulty): Promise<Game> {
  return setup("plains", { difficulty }, [
    new PlayerInfo("human", PlayerType.Human, null, "human_id"),
  ]);
}

describe("Difficulty scaling (unify-layered-path)", () => {
  test("nation population multiplier rises with difficulty; humans stay at 1", async () => {
    let prev = 0;
    for (const d of DIFFICULTIES) {
      const game = await gameAt(d);
      const ai = game.config().aiDifficulty(PlayerType.Nation);
      expect(ai.populationMultiplier).toBeGreaterThan(prev);
      prev = ai.populationMultiplier;

      const human = game.config().aiDifficulty(PlayerType.Human);
      expect(human.populationMultiplier).toBe(1);
    }
  });

  test("AI cadence tightens with difficulty (pulse interval falls, budget rises)", async () => {
    let prevPulse = Infinity;
    let prevBudget = 0;
    for (const d of DIFFICULTIES) {
      const game = await gameAt(d);
      const ai = game.config().aiDifficulty(PlayerType.Nation);
      expect(ai.tribePulseTicks).toBeLessThan(prevPulse);
      expect(ai.nationBuildBudget).toBeGreaterThanOrEqual(prevBudget);
      prevPulse = ai.tribePulseTicks;
      prevBudget = ai.nationBuildBudget;
    }
  });

  test("AI precision sharpens with difficulty: top-k shrinks to argmax, resource focus rises", async () => {
    let prevK = Infinity;
    let prevFocus = 0;
    for (const d of DIFFICULTIES) {
      const game = await gameAt(d);
      const ai = game.config().aiDifficulty(PlayerType.Nation);
      expect(ai.precisionTopK).toBeLessThanOrEqual(prevK);
      expect(ai.resourceFocus).toBeGreaterThan(prevFocus);
      prevK = ai.precisionTopK;
      prevFocus = ai.resourceFocus;

      // Humans always place at argmax precision.
      expect(game.config().aiDifficulty(PlayerType.Human).precisionTopK).toBe(
        1,
      );
    }
    // Highest difficulty is exact argmax and full focus.
    const impossible = await gameAt(Difficulty.Impossible);
    const ai = impossible.config().aiDifficulty(PlayerType.Nation);
    expect(ai.precisionTopK).toBe(1);
    expect(ai.resourceFocus).toBe(1);
  });

  test("maxTroops applies the multiplier to AI capacity but never to humans", async () => {
    const easy = await gameAt(Difficulty.Easy);
    const impossible = await gameAt(Difficulty.Impossible);

    const capacity = (game: Game, type: PlayerType) => {
      const stub = {
        type: () => type,
        isLobbyCreator: () => false,
        numTilesOwned: () => 100,
        troops: () => 1000,
        units: () => [],
        urbanArea: () => 5,
        tenureCapacityBonus: () => 0,
      };
      return game.config().maxTroops(stub as never);
    };

    const humanEasy = capacity(easy, PlayerType.Human);
    const humanImpossible = capacity(impossible, PlayerType.Human);
    expect(humanEasy).toBe(humanImpossible);

    const nationEasy = capacity(easy, PlayerType.Nation);
    const nationImpossible = capacity(impossible, PlayerType.Nation);
    expect(nationEasy).toBeLessThan(humanEasy);
    expect(nationImpossible).toBeGreaterThan(humanImpossible);

    const botCapacity = capacity(easy, PlayerType.Bot);
    expect(botCapacity).toBeLessThan(nationEasy);
  });
});
