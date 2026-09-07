import { Difficulty } from "../game/Game";

export interface PaintedAIConfig {
  decisionTicks: number;
  reserveMin: number;
  reserveMax: number;
  cityFill: number;
  neutralShare: number;
  enemyShare: number;
  budgetHorizonTicks: number;
  campaignSampleTicks: number;
  stallSamples: number;
  candidateBudget: number;
  coastRadius: number;
}

export function paintedAIConfig(
  difficulty: Difficulty,
): Readonly<PaintedAIConfig> {
  return {
    decisionTicks:
      { Easy: 30, Medium: 20, Hard: 15, Impossible: 10 }[difficulty] ?? 20,
    reserveMin: 0.3,
    reserveMax: 0.4,
    cityFill: 0.75,
    neutralShare: 0.15,
    enemyShare: 0.3,
    budgetHorizonTicks: 200,
    campaignSampleTicks: 100,
    stallSamples: 2,
    candidateBudget: 256,
    coastRadius: 96,
  };
}
