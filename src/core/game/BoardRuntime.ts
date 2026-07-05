import {
  type BoardMap,
  type TileLayerData,
  type TileLayers,
  validateBoardMap,
} from "./BoardMap";

export type BoardCommand = { type: string } & Record<string, unknown>;
export type BoardOverlay = { type: string } & Record<string, unknown>;

export interface BoardEntity {
  id: string;
  type: string;
  tileRef?: number;
  components?: Record<string, unknown>;
}

export interface BoardSystem {
  id: string;
  canHandle?(command: BoardCommand, runtime: BoardRuntime): boolean;
  handle?(command: BoardCommand, runtime: BoardRuntime): void;
  tick?(runtime: BoardRuntime): void;
  overlays?(runtime: BoardRuntime): readonly BoardOverlay[];
}

export interface BoardRuntime {
  map: BoardMap;
  layers: TileLayers;
  globals: Record<string, unknown>;
  entities: Map<string, BoardEntity>;
  systems: BoardSystem[];
}

export interface CreateBoardRuntimeOptions {
  layers?: TileLayers;
  globals?: Record<string, unknown>;
  entities?: Iterable<readonly [string, BoardEntity]>;
  systems?: BoardSystem[];
}

export function createBoardRuntime(
  map: BoardMap,
  options: CreateBoardRuntimeOptions = {},
): BoardRuntime {
  validateBoardMap(map);
  map.layers ??= {};
  const runtime: BoardRuntime = {
    map,
    layers: map.layers,
    globals: { ...(options.globals ?? {}) },
    entities: new Map(options.entities),
    systems: [...(options.systems ?? [])],
  };

  for (const [id, layer] of Object.entries(options.layers ?? {})) {
    setBoardRuntimeLayer(runtime, id, layer);
  }

  return runtime;
}

export function setBoardRuntimeLayer(
  runtime: BoardRuntime,
  id: string,
  data: TileLayerData,
): void {
  assertRuntimeLayerLength(runtime, id, data);
  runtime.layers[id] = data;
  runtime.map.layers = runtime.layers;
}

export function dispatchBoardCommand(
  runtime: BoardRuntime,
  command: BoardCommand,
): void {
  for (const system of runtime.systems) {
    if (system.canHandle?.(command, runtime) === true) {
      system.handle?.(command, runtime);
    }
  }
}

export function tickBoardRuntime(runtime: BoardRuntime): void {
  for (const system of runtime.systems) {
    system.tick?.(runtime);
  }
}

export function collectBoardRuntimeOverlays(
  runtime: BoardRuntime,
): BoardOverlay[] {
  return runtime.systems.flatMap((system) => system.overlays?.(runtime) ?? []);
}

function assertRuntimeLayerLength(
  runtime: BoardRuntime,
  id: string,
  data: { length: number },
): void {
  const expected = runtime.map.width * runtime.map.height;
  if (data.length !== expected) {
    throw new Error(
      `layer ${id} length ${data.length} does not match ${runtime.map.width}x${runtime.map.height}`,
    );
  }
}
