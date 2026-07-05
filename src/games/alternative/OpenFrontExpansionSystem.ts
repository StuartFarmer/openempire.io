import type { BoardMap } from "../../core/game/BoardMap";
import {
  createBoardRuntime,
  type BoardCommand,
  type BoardRuntime,
  type BoardSystem,
} from "../../core/game/BoardRuntime";
import { PseudoRandom } from "../../core/PseudoRandom";
import {
  addAlternativeSettlement,
  produceAlternativeFood,
} from "./AlternativeFoodEconomy";
import {
  advanceAlternativeMovementJob,
  clearAlternativeMovementJob,
  createAlternativeMovementJob,
  getAlternativeMovementJob,
} from "./AlternativeMovementWork";
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
  energyBudgetRemaining: number;
  frontier: FrontierTile[];
  queued: Set<number>;
}

interface FrontierTile {
  ref: number;
  from: number;
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
      this.place(runtime, command.ref, command.ownerId);
      return;
    }
    this.startExpansion(
      runtime,
      command.ref,
      command.ownerId,
      command.troops,
      command.energyBudget,
    );
  }

  tick(runtime: BoardRuntime): void {
    this.ticks++;
    if (this.active) this.advanceExpansion(runtime, this.active);
    produceAlternativeFood(runtime, 1);
  }

  private advanceExpansion(
    runtime: BoardRuntime,
    expansion: ActiveExpansion,
  ): void {
    const job = getAlternativeMovementJob(runtime);
    if (!job) {
      this.createNextMovementJob(runtime, expansion);
      return;
    }

    const result = advanceAlternativeMovementJob(
      runtime,
      expansion.energyBudgetRemaining,
    );
    expansion.energyBudgetRemaining -= result.spent;
    if (!result.complete) {
      if (expansion.energyBudgetRemaining <= 0) this.stopExpansion(runtime);
      return;
    }

    clearAlternativeMovementJob(runtime);
    if (
      canClaim(runtime.map, job.to) &&
      touchesOwner(runtime.map, job.to, job.ownerId)
    ) {
      removeFrontier(expansion, job.to);
      runtime.map.state[job.to] = job.ownerId;
      this.enqueueNeutralNeighbors(runtime.map, expansion, job.to);
    }

    if (expansion.energyBudgetRemaining <= 0) {
      this.stopExpansion(runtime);
      return;
    }
    if (expansion.frontier.length === 0) this.active = null;
  }

  private createNextMovementJob(
    runtime: BoardRuntime,
    expansion: ActiveExpansion,
  ): void {
    while (expansion.frontier.length > 0) {
      const index = nextFrontierIndex(expansion);
      const frontier = expansion.frontier[index];
      const ref = frontier.ref;
      if (
        !canClaim(runtime.map, ref) ||
        !touchesOwner(runtime.map, ref, expansion.ownerId)
      ) {
        expansion.frontier.splice(index, 1);
        expansion.queued.delete(ref);
        continue;
      }
      createAlternativeMovementJob(
        runtime,
        expansion.ownerId,
        frontier.from,
        frontier.ref,
        expansion.troops,
      );
      return;
    }
    this.active = null;
  }

  private place(runtime: BoardRuntime, ref: unknown, ownerId: unknown): void {
    const map = runtime.map;
    if (!validRef(map, ref) || !validOwner(ownerId) || !canClaim(map, ref))
      return;
    map.state[ref] = ownerId;
    addAlternativeSettlement(runtime, ownerId, ref);
  }

  private startExpansion(
    runtime: BoardRuntime,
    ref: unknown,
    ownerId: unknown,
    troops: unknown,
    energyBudget: unknown,
  ): void {
    const map = runtime.map;
    if (!validRef(map, ref) || !validOwner(ownerId) || !canClaim(map, ref))
      return;
    if (!hasOwner(map, ownerId)) return;
    const budget = expansionEnergyBudget(energyBudget);
    if (budget <= 0) return;
    clearAlternativeMovementJob(runtime);
    const expansion: ActiveExpansion = {
      ownerId,
      troops:
        typeof troops === "number" && Number.isFinite(troops) ? troops : 2_000,
      energyBudgetRemaining: budget,
      frontier: [],
      queued: new Set(),
    };
    for (let tile = 0; tile < map.state.length; tile++) {
      if ((map.state[tile] & OWNER_MASK) === ownerId) {
        this.enqueueNeutralNeighbors(map, expansion, tile);
      }
    }
    this.active = expansion.frontier.length > 0 ? expansion : null;
    if (this.active) this.createNextMovementJob(runtime, this.active);
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
        from: ref,
        priority: this.priority(map, neighbor, expansion.ownerId),
      });
    }
  }

  private stopExpansion(runtime: BoardRuntime): void {
    clearAlternativeMovementJob(runtime);
    this.active = null;
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

function nextFrontierIndex(expansion: ActiveExpansion): number {
  let bestIndex = 0;
  let bestPriority = expansion.frontier[0].priority;
  for (let i = 1; i < expansion.frontier.length; i++) {
    const priority = expansion.frontier[i].priority;
    if (priority < bestPriority) {
      bestPriority = priority;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function removeFrontier(expansion: ActiveExpansion, ref: number): void {
  const index = expansion.frontier.findIndex(
    (frontier) => frontier.ref === ref,
  );
  if (index >= 0) expansion.frontier.splice(index, 1);
  expansion.queued.delete(ref);
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

function expansionEnergyBudget(value: unknown): number {
  if (value === undefined) return Number.POSITIVE_INFINITY;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}
