import type { Nation as ManifestNation } from "../../core/game/TerrainMapLoader";
import { conquest } from "../lab/systems/conquest/system";
import { empire } from "../lab/systems/empire/system";
import type { FieldSystem } from "../webgpu/FieldDynamics";
import { LIVE_GAMES, type LiveGameDefinition } from "./registry";

export interface GameNation {
  id: number;
  name: string;
  x?: number;
  y?: number;
  flag?: string | string[];
  color?: string;
}

export interface FieldGameStats {
  population?: string;
  populationLabel?: string;
  troops?: string;
  food?: string;
  tiles: string;
}

export interface FieldHoverValue {
  key: string;
  label: string;
  layer: string;
  type: "f32" | "u32";
}

export type FieldSpawn =
  | { kind: "output"; spawned: string; anchor: string }
  | { kind: "brush"; brushes: Readonly<Record<number, string>> };

export interface FieldGameExperience {
  spawn: FieldSpawn;
  stats: FieldGameStats;
  hover: { owner: string; values: readonly FieldHoverValue[] };
  actions?: readonly { id: string; label: string; brush: string }[];
  commitment?: { field: string; label: string };
}

export type WorkerGameDefinition = LiveGameDefinition & { backend: "worker" };

export interface FieldGameDefinition {
  id: string;
  backend: "field";
  system: FieldSystem;
  view: string;
  experience: FieldGameExperience;
}

export type GameDefinition = WorkerGameDefinition | FieldGameDefinition;

export function fieldNationsFromManifest(
  nations: readonly ManifestNation[],
): GameNation[] {
  return [
    { id: 1, name: "You" },
    ...nations.map((nation, index) => ({
      id: index + 2,
      name: nation.name,
      x: nation.coordinates?.[0],
      y: nation.coordinates?.[1],
      flag: nation.flag,
    })),
  ];
}

export function seedFieldNationOwners(
  width: number,
  height: number,
  water: Uint32Array,
  players: readonly GameNation[],
  radius = 5,
): Uint32Array {
  const owner = new Uint32Array(width * height);
  for (const player of players) {
    if (player.id === 1 || player.x === undefined || player.y === undefined)
      continue;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x: number = player.x + dx;
        const y: number = player.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const tile = y * width + x;
        if (water[tile] === 0 && owner[tile] === 0) owner[tile] = player.id;
      }
    }
  }
  return owner;
}

const fieldGame = (
  system: FieldSystem,
  experience: FieldGameExperience,
): FieldGameDefinition => {
  if (system.kind !== "game" || system.defaultView === undefined) {
    throw new Error(`incomplete field game: ${system.id}`);
  }
  return {
    id: system.id,
    backend: "field",
    system,
    view: system.defaultView,
    experience,
  };
};

export const PLAYABLE_GAMES: readonly GameDefinition[] = [
  ...LIVE_GAMES.map((game) => ({ ...game, backend: "worker" as const })),
];

// Copied field experiments remain available in source, outside the game picker.
export const FIELD_EXPERIMENTS: readonly FieldGameDefinition[] = [
  fieldGame(conquest, {
    spawn: {
      kind: "brush",
      brushes: { 1: "spawnP1", 2: "spawnP2", 3: "spawnP3", 4: "spawnP4" },
    },
    stats: {
      population: "totalPop",
      troops: "totalTroops",
      tiles: "tilesOwned",
    },
    hover: {
      owner: "owner",
      values: [
        { key: "population", label: "population", layer: "pop", type: "f32" },
        { key: "troops", label: "troops", layer: "troops", type: "f32" },
      ],
    },
    commitment: { field: "commit", label: "attack" },
  }),
  fieldGame(empire, {
    spawn: {
      kind: "brush",
      brushes: { 1: "spawnP1", 2: "spawnP2", 3: "spawnP3", 4: "spawnP4" },
    },
    stats: {
      population: "totalPop",
      troops: "totalTroops",
      food: "totalFood",
      tiles: "tilesOwned",
    },
    hover: {
      owner: "owner",
      values: [
        { key: "population", label: "population", layer: "pop", type: "f32" },
        { key: "troops", label: "troops", layer: "troops", type: "f32" },
        { key: "food", label: "food", layer: "food", type: "f32" },
      ],
    },
    commitment: { field: "commit", label: "attack" },
  }),
];

export function getGameDefinition(id: string): GameDefinition | undefined {
  return PLAYABLE_GAMES.find((game) => game.id === id);
}
