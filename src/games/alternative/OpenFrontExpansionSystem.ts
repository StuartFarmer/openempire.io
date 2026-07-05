import type { BoardMap } from "../../core/game/BoardMap";
import {
  createBoardRuntime,
  type BoardCommand,
  type BoardRuntime,
  type BoardSystem,
} from "../../core/game/BoardRuntime";
import { PseudoRandom } from "../../core/PseudoRandom";
import { createAlternativeWorldEngineMap } from "./world";

const LAND = 0x80;
const OWNER_MASK = 0x0fff;

export interface AlternativeMapOptions {
  width?: number;
  height?: number;
  seed?: number;
}

interface ActiveExpansion {
  ownerId: number;
  troops: number;
  frontier: FrontierTile[];
  queued: Set<number>;
}

interface FrontierTile {
  ref: number;
  priority: number;
}

export class AlternativeOpenFrontExpansionSystem implements BoardSystem {
  readonly id = "alternative.openfront-expansion";
  private active: ActiveExpansion | null = null;
  private random = new PseudoRandom(123);
  private ticks = 0;

  canHandle(command: BoardCommand): boolean {
    return (
      command.type === "alternative.place" ||
      command.type === "alternative.expand"
    );
  }

  handle(command: BoardCommand, runtime: BoardRuntime): void {
    if (command.type === "alternative.place") {
      this.place(runtime.map, command.ref, command.ownerId);
      return;
    }
    this.startExpansion(
      runtime.map,
      command.ref,
      command.ownerId,
      command.troops,
    );
  }

  tick(runtime: BoardRuntime): void {
    this.ticks++;
    if (!this.active) return;
    const expansion = this.active;
    const tilesThisTick = Math.max(
      1,
      Math.min(12, Math.floor(expansion.troops / 400)),
    );

    for (let i = 0; i < tilesThisTick && expansion.frontier.length > 0; i++) {
      const ref = dequeueNext(expansion);
      expansion.queued.delete(ref);
      if (
        !canClaim(runtime.map, ref) ||
        !touchesOwner(runtime.map, ref, expansion.ownerId)
      ) {
        continue;
      }
      runtime.map.state[ref] = expansion.ownerId;
      this.enqueueNeutralNeighbors(runtime.map, expansion, ref);
    }

    if (expansion.frontier.length === 0) this.active = null;
  }

  private place(map: BoardMap, ref: unknown, ownerId: unknown): void {
    if (!validRef(map, ref) || !validOwner(ownerId) || !canClaim(map, ref))
      return;
    map.state[ref] = ownerId;
  }

  private startExpansion(
    map: BoardMap,
    ref: unknown,
    ownerId: unknown,
    troops: unknown,
  ): void {
    if (!validRef(map, ref) || !validOwner(ownerId) || !canClaim(map, ref))
      return;
    if (!hasOwner(map, ownerId)) return;
    const expansion: ActiveExpansion = {
      ownerId,
      troops:
        typeof troops === "number" && Number.isFinite(troops) ? troops : 2_000,
      frontier: [],
      queued: new Set(),
    };
    for (let tile = 0; tile < map.state.length; tile++) {
      if ((map.state[tile] & OWNER_MASK) === ownerId) {
        this.enqueueNeutralNeighbors(map, expansion, tile);
      }
    }
    this.active = expansion.frontier.length > 0 ? expansion : null;
  }

  private enqueueNeutralNeighbors(
    map: BoardMap,
    expansion: ActiveExpansion,
    ref: number,
  ): void {
    for (const neighbor of neighbors4(map, ref)) {
      if (!canClaim(map, neighbor) || expansion.queued.has(neighbor)) continue;
      expansion.queued.add(neighbor);
      expansion.frontier.push({
        ref: neighbor,
        priority: this.priority(map, neighbor, expansion.ownerId),
      });
    }
  }

  private priority(map: BoardMap, ref: number, ownerId: number): number {
    let ownedNeighbors = 0;
    for (const neighbor of neighbors4(map, ref)) {
      if ((map.state[neighbor] & OWNER_MASK) === ownerId) ownedNeighbors++;
    }
    return (
      (this.random.nextInt(0, 7) + 10) *
        (1 - ownedNeighbors * 0.5 + terrainPriorityMagnitude(map, ref) / 2) +
      this.ticks
    );
  }
}

export function createAlternativeOpenFrontRuntime(
  options: AlternativeMapOptions = {},
): BoardRuntime {
  return createBoardRuntime(createAlternativeWorldEngineMap(options).map, {
    systems: [new AlternativeOpenFrontExpansionSystem()],
  });
}

function dequeueNext(expansion: ActiveExpansion): number {
  let bestIndex = 0;
  let bestPriority = expansion.frontier[0].priority;
  for (let i = 1; i < expansion.frontier.length; i++) {
    const priority = expansion.frontier[i].priority;
    if (priority < bestPriority) {
      bestPriority = priority;
      bestIndex = i;
    }
  }
  const [frontierTile] = expansion.frontier.splice(bestIndex, 1);
  return frontierTile.ref;
}

function terrainPriorityMagnitude(map: BoardMap, ref: number): number {
  const magnitude = map.terrain[ref] & 0x1f;
  if (magnitude < 10) return 1;
  if (magnitude < 20) return 1.5;
  return 2;
}

function canClaim(map: BoardMap, ref: number): boolean {
  return (map.terrain[ref] & LAND) !== 0 && (map.state[ref] & OWNER_MASK) === 0;
}

function touchesOwner(map: BoardMap, ref: number, ownerId: number): boolean {
  return neighbors4(map, ref).some(
    (neighbor) => (map.state[neighbor] & OWNER_MASK) === ownerId,
  );
}

function hasOwner(map: BoardMap, ownerId: number): boolean {
  return map.state.some((state) => (state & OWNER_MASK) === ownerId);
}

function neighbors4(
  map: Pick<BoardMap, "width" | "height">,
  ref: number,
): number[] {
  const x = ref % map.width;
  const y = Math.floor(ref / map.width);
  const out: number[] = [];
  if (x > 0) out.push(ref - 1);
  if (x < map.width - 1) out.push(ref + 1);
  if (y > 0) out.push(ref - map.width);
  if (y < map.height - 1) out.push(ref + map.width);
  return out;
}

function validRef(map: BoardMap, value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < map.state.length
  );
}

function validOwner(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= OWNER_MASK
  );
}
