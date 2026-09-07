import { Difficulty, Game, isDifficulty, PlayerID } from "../../core/game/Game";

export interface SimpleFrontMatchResult {
  winnerID: PlayerID | null;
  winnerName: string;
  humanWon: boolean;
  elapsedSeconds: number;
}

export function parseSimpleFrontDifficulty(value: unknown): Difficulty {
  return isDifficulty(value) ? value : Difficulty.Medium;
}

export function simpleFrontResult(
  game: Game,
  humanID: PlayerID | null,
): SimpleFrontMatchResult | null {
  const winner = game.getWinner();
  if (winner === null) return null;
  return {
    winnerID: typeof winner === "string" ? null : winner.id(),
    winnerName: typeof winner === "string" ? winner : winner.displayName(),
    humanWon: typeof winner !== "string" && winner.id() === humanID,
    elapsedSeconds: game.elapsedGameSeconds(),
  };
}

export function readSimpleFrontDifficulty(): Difficulty {
  try {
    return parseSimpleFrontDifficulty(
      localStorage.getItem("simplefront:match.difficulty"),
    );
  } catch {
    return Difficulty.Medium;
  }
}
