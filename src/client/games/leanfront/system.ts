import { playerIntent } from "../../lab/shared";
import { defineFieldSystem } from "../../webgpu/FieldDynamics";
import { LEAN_ACTION } from "./actions";

const players = playerIntent(5);

export const leanfront = defineFieldSystem({
  id: "leanfront",
  name: "LeanFront",
  description: "A small GPU-native territory economy.",
  kind: "game",
  defaultMap: "Verdantia",
  defaultView: "leanfront",

  input: {
    cursor: "crosshair",
    onTile(ctx, x, y) {
      const p = ctx.localPlayer;
      const commit = ctx.player(p).commit ?? 0.6;
      const owned = (ctx.scalars.tilesOwned as number[] | undefined)?.[p] ?? 0;
      if (owned === 0) {
        ctx.setPlayer(p, { alive: 1, attacking: 0, commit });
        ctx.queuePlayer(p, {
          actionKind: LEAN_ACTION.spawn,
          actionTile: y * ctx.mapWidth + x,
        });
      } else {
        ctx.setPlayer(p, {
          alive: 1,
          attacking: 1,
          commit,
          targetX: x,
          targetY: y,
        });
      }
      return true;
    },
    onKey(ctx, ev) {
      if (ev.key !== "Escape") return false;
      ctx.setPlayer(ctx.localPlayer, { attacking: 0 });
      return true;
    },
  },

  ai: {
    decide(ctx) {
      const owned = ctx.scalars.tilesOwned as number[] | undefined;
      const food = ctx.scalars.totalFood as number[] | undefined;
      for (let p = 1; p < ctx.playerCount; p += 1) {
        if (p === ctx.localPlayer) continue;
        const q = p - 1;
        const anchorX = (q % 2 === 0 ? 0.25 : 0.75) * ctx.mapWidth;
        const anchorY = (q < 2 ? 0.25 : 0.75) * ctx.mapHeight;
        const x = Math.min(
          ctx.mapWidth - 1,
          Math.max(0, Math.floor(anchorX + (ctx.rand() - 0.5) * 8)),
        );
        const y = Math.min(
          ctx.mapHeight - 1,
          Math.max(0, Math.floor(anchorY + (ctx.rand() - 0.5) * 8)),
        );
        if ((owned?.[p] ?? 0) === 0) {
          ctx.setPlayer(p, { alive: 1, attacking: 0, commit: 0.6 });
          ctx.queuePlayer(p, {
            actionKind: LEAN_ACTION.spawn,
            actionTile:
              Math.floor(anchorY) * ctx.mapWidth + Math.floor(anchorX),
          });
          continue;
        }
        const canAttack = (food?.[p] ?? 0) >= 0.5;
        ctx.setPlayer(p, {
          alive: 1,
          attacking: canAttack ? 1 : 0,
          commit: 0.6,
          targetX: canAttack ? ctx.rand() * ctx.mapWidth : anchorX,
          targetY: canAttack ? ctx.rand() * ctx.mapHeight : anchorY,
        });
        ctx.queuePlayer(p, {
          actionKind: canAttack ? LEAN_ACTION.city : LEAN_ACTION.farm,
          actionTile: y * ctx.mapWidth + x,
        });
      }
    },
  },

  params: {
    cityCapacityPerLevel: { value: 1, min: 0.1, max: 8, step: 0.1 },
    farmCapacityPerLevel: { value: 1, min: 0.1, max: 8, step: 0.1 },
    cityGrowthRate: { value: 0.03, min: 0, max: 0.25, step: 0.005 },
    farmGrowthRate: { value: 0.06, min: 0, max: 0.25, step: 0.005 },
    seedFraction: { value: 0.05, min: 0.005, max: 0.25, step: 0.005 },
    cityLevelCost: { value: 0.4, min: 0, max: 4, step: 0.05 },
    farmLevelCost: { value: 0.25, min: 0, max: 4, step: 0.05 },
    razeCost: { value: 0.05, min: 0, max: 1, step: 0.01 },
    attackCostPerPerson: {
      value: 0.002,
      min: 0,
      max: 0.05,
      step: 0.001,
    },
    seaLevel: { value: 0.46, min: 0.2, max: 0.8, step: 0.01 },
    attackPower: { value: 2, min: 0, max: 6 },
    attrition: { value: 0.06, min: 0, max: 0.5 },
    conquestGarrison: { value: 0.7, min: 0, max: 1 },
    neutralDefense: { value: 0.06, min: 0, max: 0.5 },
    terrainWeight: { value: 0.5, min: 0, max: 2 },
    flipMargin: { value: 1.6, min: 1, max: 3 },
  },

  players: {
    ...players,
    localPlayer: 1,
    fields: {
      ...players.fields,
      actionKind: "u32",
      actionTile: "u32",
      actionTick: "u32",
    },
    outputs: [
      "actionResult",
      "foodSpendFx",
      "resolvedResult",
      "resolvedCostFx",
      "resolvedLevel",
      "resolvedActionKind",
      "resolvedActionTile",
      "spawnCityTile",
      "spawnFarmTile",
      "hasSpawned",
      "foodSpendBits",
      "foodInverseTotalBits",
      "attackCommitBits",
    ],
  },

  phases: [
    ["command"],
    ["spawnLatch"],
    ["incursion"],
    ["owner", "troops", "cityLevel", "farmLevel", "food"],
  ],

  scalars: {
    totalFood: { reduce: "sum", layer: "food", groupBy: "owner" },
    totalPeople: { reduce: "sum", layer: "troops", groupBy: "owner" },
    tilesOwned: { reduce: "count", groupBy: "owner" },
    totalCityLevels: {
      reduce: "sum",
      layer: "cityLevel",
      groupBy: "owner",
    },
    totalFarmLevels: {
      reduce: "sum",
      layer: "farmLevel",
      groupBy: "owner",
    },
  },

  brushes: {
    city: { intent: LEAN_ACTION.city, radius: 0 },
    farm: { intent: LEAN_ACTION.farm, radius: 0 },
    raze: { intent: LEAN_ACTION.raze, radius: 0 },
  },

  views: { leanfront: { source: "views/leanfront.wesl" } },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
