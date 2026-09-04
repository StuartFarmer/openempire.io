import {
  LEAN_ACTION,
  LEAN_RESULT,
  decodeLeanResult,
} from "../../../src/client/games/leanfront/actions";
import { leanfront } from "../../../src/client/games/leanfront/system";
import {
  compileFieldSystem,
  type CompiledFieldSystem,
} from "../../../src/client/webgpu/FieldDynamics";
import { FieldKernel } from "../../../src/client/webgpu/FieldKernel";

const WIDTH = 16;
const HEIGHT = 16;
const TILES = WIDTH * HEIGHT;
const PLAYERS = 5;
const DEFAULT_SEED = 0x4c45414e;
// Diffusion needs 178 ticks to carry city-born people across the spawn radius.
const ATTACK_TICKS = 178;
const GAMEPLAY_PLANES = [
  "owner",
  "troops",
  "cityLevel",
  "farmLevel",
  "food",
] as const;

type PlayerInput = Record<string, number>;

interface Totals {
  people: number[];
  food: number[];
  ownedTiles: number[];
  cityLevels: number[];
  farmLevels: number[];
}

interface Snapshot {
  owner: Uint32Array;
  troops: Float32Array;
  cityLevel: Uint32Array;
  farmLevel: Uint32Array;
  food: Float32Array;
  S: ArrayBuffer;
  PO: ArrayBuffer;
  totals: Totals;
  tick: number;
}

export interface LeanFrontProbeResult {
  hash: string;
  initial: Totals;
  final: Totals;
  totalSpend: number;
  averageGpuMsPerTick: number;
  ticks: number;
  capturedFarm: number;
  captureTicks: number;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const at = (x: number, y: number): number => y * WIDTH + x;

function defaultParams(compiled: CompiledFieldSystem): Record<string, number> {
  return Object.fromEntries(
    compiled.paramList.map(({ name, value }) => [name, value]),
  );
}

async function createKernel(
  compiled: CompiledFieldSystem,
): Promise<FieldKernel> {
  const kernel = await FieldKernel.create(null, compiled.kernelConfig);
  kernel.resize(WIDTH, HEIGHT);
  const land = new Float32Array(TILES).fill(1);
  land[0] = 0;
  kernel.writeBuffer("land", land);
  kernel.writeBuffer("elevation", new Float32Array(TILES).fill(0.5));
  kernel.writeUniform(
    "P",
    compiled.writeParams(defaultParams(compiled), DEFAULT_SEED),
  );
  kernel.writeBuffer(
    "PL",
    new Uint32Array(PLAYERS * compiled.playerFieldNames.length),
  );
  kernel.clearBuffer("S");
  kernel.clearBuffer("PO");
  const frame = kernel.beginFrame();
  compiled.runInit(frame);
  await frame.finish();
  return kernel;
}

async function readSnapshot(
  kernel: FieldKernel,
  compiled: CompiledFieldSystem,
): Promise<Snapshot> {
  const [owner, troops, cityLevel, farmLevel, food, S, PO] = await Promise.all([
    kernel.readBuffer("owner"),
    kernel.readBuffer("troops"),
    kernel.readBuffer("cityLevel"),
    kernel.readBuffer("farmLevel"),
    kernel.readBuffer("food"),
    kernel.readBuffer("S"),
    kernel.readBuffer("PO"),
  ]);
  const scalar = compiled.decodeScalars(S);
  const values = scalar.values;
  const snapshot: Snapshot = {
    owner: new Uint32Array(owner),
    troops: new Float32Array(troops),
    cityLevel: new Uint32Array(cityLevel),
    farmLevel: new Uint32Array(farmLevel),
    food: new Float32Array(food),
    S,
    PO,
    tick: scalar.tick,
    totals: {
      people: values.totalPeople as number[],
      food: values.totalFood as number[],
      ownedTiles: values.tilesOwned as number[],
      cityLevels: values.totalCityLevels as number[],
      farmLevels: values.totalFarmLevels as number[],
    },
  };
  assert(
    snapshot.food.every((value) => Number.isFinite(value) && value >= 0),
    "food became negative or non-finite",
  );
  assert(
    snapshot.cityLevel.every(
      (city, tile) => city === 0 || snapshot.farmLevel[tile] === 0,
    ),
    "plot fields lost mutual exclusivity",
  );
  assert(
    snapshot.food.every(
      (value, tile) => snapshot.farmLevel[tile] !== 0 || value === 0,
    ),
    "a non-farm tile stores food",
  );
  return snapshot;
}

function sumFood(snapshot: Snapshot, player: number): number {
  let total = 0;
  for (let tile = 0; tile < TILES; tile += 1) {
    if (snapshot.owner[tile] === player) total += snapshot.food[tile];
  }
  return total;
}

function sameBytes(a: ArrayBufferView, b: ArrayBufferView): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return left.every((value, index) => value === right[index]);
}

function adjacentToOwner(
  owner: Uint32Array,
  tile: number,
  player: number,
): boolean {
  const x = tile % WIDTH;
  const y = Math.floor(tile / WIDTH);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (
        (dx === 0 && dy === 0) ||
        x + dx < 0 ||
        x + dx >= WIDTH ||
        y + dy < 0 ||
        y + dy >= HEIGHT
      )
        continue;
      if (owner[at(x + dx, y + dy)] === player) return true;
    }
  }
  return false;
}

function gompertz(stock: number, capacity: number, rate: number): number {
  if (capacity <= 0 || stock <= 0) return 0;
  const safe = Math.min(stock, capacity);
  return Math.min(capacity, safe + rate * safe * Math.log(capacity / safe));
}

function peopleMovement(snapshot: Snapshot, tile: number): number {
  const x = tile % WIDTH;
  const y = Math.floor(tile / WIDTH);
  const stock = snapshot.troops[tile];
  let neighborDifference = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (
        (dx === 0 && dy === 0) ||
        x + dx < 0 ||
        x + dx >= WIDTH ||
        y + dy < 0 ||
        y + dy >= HEIGHT
      ) {
        continue;
      }
      const neighbor = at(x + dx, y + dy);
      if (snapshot.owner[neighbor] === snapshot.owner[tile]) {
        neighborDifference += snapshot.troops[neighbor] - stock;
      }
    }
  }
  return (neighborDifference * 0.08) / 8;
}

function hashBuffers(buffers: readonly ArrayBufferLike[]): string {
  let hash = 0x811c9dc5;
  for (const buffer of buffers) {
    for (const byte of new Uint8Array(buffer)) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

async function proveGrowthMicrocase(
  compiled: CompiledFieldSystem,
): Promise<void> {
  const kernel = await createKernel(compiled);
  try {
    const cityLevel = new Uint32Array(TILES);
    const troops = new Float32Array(TILES);
    const owner = new Uint32Array(TILES);
    const levelOne = at(2, 2);
    const levelTwo = at(12, 12);
    const empty = at(8, 8);
    cityLevel[levelOne] = 1;
    cityLevel[levelTwo] = 2;
    cityLevel[empty] = 1;
    troops[levelOne] = 0.2;
    troops[levelTwo] = 0.4;
    owner[levelOne] = owner[levelTwo] = owner[empty] = 1;
    kernel.writeBuffer("cityLevel", cityLevel);
    kernel.writeBuffer("troops", troops);
    kernel.writeBuffer("owner", owner);

    const frame = kernel.beginFrame();
    compiled.runTick(kernel, frame);
    await frame.finish();
    const after = await readSnapshot(kernel, compiled);
    const deltaOne = after.troops[levelOne] - 0.2;
    const deltaTwo = after.troops[levelTwo] - 0.4;
    assert(
      after.troops[levelOne] >= 0.2 && after.troops[levelOne] <= 1,
      "level-1 city growth was not monotonic and bounded",
    );
    assert(
      after.troops[levelTwo] >= 0.4 && after.troops[levelTwo] <= 2,
      "level-2 city growth was not monotonic and bounded",
    );
    assert(
      Math.abs(deltaTwo - 2 * deltaOne) <= 1e-5,
      "level-2 city growth was not twice level-1 growth",
    );
    assert(after.troops[empty] === 0, "zero-stock city growth supplied a seed");
  } finally {
    kernel.destroy();
  }
}

export async function runLeanFrontGpuProbe(): Promise<LeanFrontProbeResult> {
  const probeSystem = {
    ...leanfront,
    views: {
      owner: {
        layer: "owner",
        ramp: ["#000000", "#ffffff"],
        oceanMask: false,
      },
    },
  };
  const compiled = await compileFieldSystem(probeSystem);
  await proveGrowthMicrocase(compiled);
  const kernel = await createKernel(compiled);
  const params = defaultParams(compiled);
  const persistent: PlayerInput[] = Array.from({ length: PLAYERS }, () => ({}));
  persistent[1] = {
    alive: 1,
    attacking: 0,
    commit: 0.6,
    targetX: 0,
    targetY: 0,
  };
  persistent[2] = {
    alive: 1,
    attacking: 0,
    commit: 0.6,
    targetX: 0,
    targetY: 0,
  };
  const gpuTimes: number[] = [];
  let totalSpendFx = 0;

  const submitTick = async (
    targetKernel: FieldKernel,
    logicalTick: number,
    actions: Readonly<Record<number, PlayerInput>> = {},
    recordTiming = false,
  ): Promise<void> => {
    const players = persistent.map((player, index) => ({
      ...player,
      actionKind: LEAN_ACTION.none,
      actionTile: 0,
      actionTick: 0,
      ...(actions[index] ?? {}),
    }));
    targetKernel.writeBuffer(
      "PL",
      new Uint32Array(compiled.writePlayers(players)),
    );
    const frame = targetKernel.beginFrame();
    compiled.runTick(targetKernel, frame);
    const result = await frame.finish();
    const outputs = compiled.decodePlayerOutputs(
      await targetKernel.readBuffer("PO"),
    );
    if (recordTiming) {
      gpuTimes.push(result.gpuMs);
      totalSpendFx += outputs.reduce(
        (sum, output) => sum + output.foodSpendFx,
        0,
      );
    }
    const state = compiled.decodeScalars(await targetKernel.readBuffer("S"));
    assert(
      state.tick === logicalTick,
      `expected logical tick ${logicalTick}, got ${state.tick}`,
    );
  };

  const tick = (
    logicalTick: number,
    actions: Readonly<Record<number, PlayerInput>> = {},
  ): Promise<void> => submitTick(kernel, logicalTick, actions, true);

  const actionResult = async (
    player: number,
    logicalTick: number,
    code: number,
  ): Promise<void> => {
    const outputs = compiled.decodePlayerOutputs(await kernel.readBuffer("PO"));
    const result = decodeLeanResult(outputs[player].actionResult);
    assert(
      result.tick === logicalTick && result.code === code,
      `tick ${logicalTick} player ${player} result was ${result.code}, expected ${code}`,
    );
  };

  try {
    await tick(1, {
      1: { actionKind: LEAN_ACTION.spawn, actionTile: at(4, 8), actionTick: 1 },
      2: {
        actionKind: LEAN_ACTION.spawn,
        actionTile: at(12, 8),
        actionTick: 1,
      },
    });
    await actionResult(1, 1, LEAN_RESULT.accepted);
    await actionResult(2, 1, LEAN_RESULT.accepted);
    const afterSpawn = await readSnapshot(kernel, compiled);
    assert(
      afterSpawn.owner[at(8, 8)] === 1,
      "same-tick spawn overlap did not honor player-ID priority",
    );
    for (const player of [1, 2]) {
      assert(
        afterSpawn.totals.cityLevels[player] === 1,
        `accepted player ${player} spawn did not create exactly one city`,
      );
      assert(
        afterSpawn.totals.farmLevels[player] === 1,
        `accepted player ${player} spawn did not create exactly one farm`,
      );
    }

    for (let logicalTick = 2; logicalTick <= 61; logicalTick += 1)
      await tick(logicalTick);
    const afterGrowth = await readSnapshot(kernel, compiled);
    assert(
      afterGrowth.totals.ownedTiles[1] === afterSpawn.totals.ownedTiles[1],
      "growth expanded ownership without an attack",
    );
    assert(
      afterGrowth.totals.cityLevels[1] === afterSpawn.totals.cityLevels[1],
      "city growth painted or upgraded a tile",
    );
    assert(
      afterGrowth.totals.farmLevels[1] === afterSpawn.totals.farmLevels[1],
      "farm growth painted or upgraded a tile",
    );
    assert(
      afterGrowth.totals.people[1] > afterSpawn.totals.people[1],
      "city people did not grow",
    );
    assert(
      afterGrowth.totals.food[1] > afterSpawn.totals.food[1],
      "farm food did not grow",
    );

    await tick(62, {
      1: { actionKind: LEAN_ACTION.farm, actionTile: at(5, 8), actionTick: 62 },
    });
    await actionResult(1, 62, LEAN_RESULT.accepted);

    const beforeUpgrade = await readSnapshot(kernel, compiled);
    const contributingFarmCount = beforeUpgrade.farmLevel.reduce(
      (count, level, tile) =>
        count + (level !== 0 && beforeUpgrade.owner[tile] === 1 ? 1 : 0),
      0,
    );
    const beforeFood = sumFood(beforeUpgrade, 1);
    const cityTile = at(4, 8);
    const oldCityLevel = beforeUpgrade.cityLevel[cityTile];
    const oldCityStock = beforeUpgrade.troops[cityTile];
    params.farmGrowthRate = 0;
    kernel.writeUniform("P", compiled.writeParams(params, DEFAULT_SEED));
    await tick(63, {
      1: { actionKind: LEAN_ACTION.city, actionTile: cityTile, actionTick: 63 },
    });
    await actionResult(1, 63, LEAN_RESULT.accepted);
    const afterUpgrade = await readSnapshot(kernel, compiled);
    const output = compiled.decodePlayerOutputs(afterUpgrade.PO)[1];
    const foodRemoved = beforeFood - sumFood(afterUpgrade, 1);
    const reportedSpend = output.foodSpendFx / 256;
    assert(
      Math.abs(foodRemoved - reportedSpend) < contributingFarmCount / 256,
      "proportional debit exceeded one fixed-point quantum per contributing farm",
    );
    assert(
      afterUpgrade.cityLevel[cityTile] === oldCityLevel + 1,
      "city upgrade did not increment its level exactly once",
    );
    const preGrowthStock =
      oldCityStock + peopleMovement(beforeUpgrade, cityTile);
    const grownOldStock = gompertz(
      preGrowthStock,
      afterUpgrade.cityLevel[cityTile] * params.cityCapacityPerLevel,
      params.cityGrowthRate,
    );
    assert(
      Math.abs(afterUpgrade.troops[cityTile] - grownOldStock) <= 1e-5,
      "upgrade granted another seed",
    );
    assert(
      (afterUpgrade.cityLevel[cityTile] - oldCityLevel) *
        params.cityCapacityPerLevel ===
        params.cityCapacityPerLevel,
      "city upgrade changed capacity by the wrong amount",
    );
    params.farmGrowthRate = 0.06;
    kernel.writeUniform("P", compiled.writeParams(params, DEFAULT_SEED));

    await tick(64, {
      1: { actionKind: LEAN_ACTION.raze, actionTile: at(5, 8), actionTick: 64 },
    });
    await actionResult(1, 64, LEAN_RESULT.accepted);
    const afterRaze = await readSnapshot(kernel, compiled);
    const razed = at(5, 8);
    assert(
      afterRaze.owner[razed] === 0 &&
        afterRaze.troops[razed] === 0 &&
        afterRaze.cityLevel[razed] === 0 &&
        afterRaze.farmLevel[razed] === 0 &&
        afterRaze.food[razed] === 0,
      "raze left tile state behind",
    );

    const validEmpty = afterRaze.owner.findIndex(
      (owner, tile) =>
        owner === 1 &&
        afterRaze.cityLevel[tile] === 0 &&
        afterRaze.farmLevel[tile] === 0,
    );
    assert(
      validEmpty > 0,
      "could not find an owned empty tile for rejection checks",
    );
    assert(
      sumFood(afterRaze, 1) < params.cityLevelCost,
      "scenario did not leave player 1 below the city cost",
    );
    params.cityGrowthRate = 0;
    params.farmGrowthRate = 0;
    kernel.writeUniform("P", compiled.writeParams(params, DEFAULT_SEED));

    const rejected = async (
      logicalTick: number,
      player: number,
      actionKind: number,
      actionTile: number,
      code: number,
    ): Promise<void> => {
      const before = await readSnapshot(kernel, compiled);
      const layerState = await Promise.all(
        compiled.layerNames.map((name) => kernel.readBuffer(name)),
      );
      const control = await createKernel(compiled);
      control.writeUniform("P", compiled.writeParams(params, DEFAULT_SEED));
      compiled.layerNames.forEach((name, index) =>
        control.writeBuffer(name, new Uint32Array(layerState[index])),
      );
      control.writeBuffer("S", new Uint32Array(before.S));
      control.writeBuffer("PO", new Uint32Array(before.PO));
      await tick(logicalTick, {
        [player]: { actionKind, actionTile, actionTick: logicalTick },
      });
      await actionResult(player, logicalTick, code);
      const after = await readSnapshot(kernel, compiled);
      try {
        await submitTick(control, logicalTick);
        const controlAfter = await readSnapshot(control, compiled);
        const changed = GAMEPLAY_PLANES.filter(
          (name) => !sameBytes(controlAfter[name], after[name]),
        );
        assert(
          changed.length === 0,
          `rejected action at tick ${logicalTick} differed from its control: ${changed.join(", ")}`,
        );
      } finally {
        control.destroy();
      }
    };

    await rejected(
      65,
      1,
      LEAN_ACTION.city,
      validEmpty,
      LEAN_RESULT.unaffordable,
    );
    await rejected(66, 1, LEAN_ACTION.farm, cityTile, LEAN_RESULT.wrongType);
    await rejected(67, 1, LEAN_ACTION.city, at(12, 8), LEAN_RESULT.notOwned);
    await rejected(68, 1, LEAN_ACTION.city, 0, LEAN_RESULT.impassable);

    params.cityGrowthRate = 0.03;
    params.farmGrowthRate = 0.06;
    kernel.writeUniform("P", compiled.writeParams(params, DEFAULT_SEED));
    const beforeBorderFarm = await readSnapshot(kernel, compiled);
    const borderFarm = beforeBorderFarm.owner.findIndex(
      (owner, tile) =>
        owner === 2 && adjacentToOwner(beforeBorderFarm.owner, tile, 1),
    );
    assert(
      borderFarm >= 0,
      "could not find a player-2 border tile adjacent to player 1",
    );
    assert(
      beforeBorderFarm.cityLevel[borderFarm] === 0 &&
        beforeBorderFarm.farmLevel[borderFarm] === 0,
      "lowest-index player-2 border tile was not empty",
    );
    await tick(69, {
      2: {
        actionKind: LEAN_ACTION.farm,
        actionTile: borderFarm,
        actionTick: 69,
      },
    });
    await actionResult(2, 69, LEAN_RESULT.accepted);
    const afterBorderFarm = await readSnapshot(kernel, compiled);
    assert(
      afterBorderFarm.farmLevel[borderFarm] === 1 &&
        afterBorderFarm.food[borderFarm] >=
          params.seedFraction * params.farmCapacityPerLevel,
      "accepted border farm did not create its seeded plot",
    );
    await tick(70);
    let current = await readSnapshot(kernel, compiled);
    assert(
      current.food[borderFarm] >
        params.seedFraction * params.farmCapacityPerLevel,
      "border farm did not grow before combat",
    );

    params.attackPower = 6;
    params.flipMargin = 1;
    kernel.writeUniform("P", compiled.writeParams(params, DEFAULT_SEED));
    persistent[1] = {
      ...persistent[1],
      attacking: 1,
      commit: 1,
      targetX: borderFarm % WIDTH,
      targetY: Math.floor(borderFarm / WIDTH),
    };
    let captureBefore = 0;
    let captureAfter = 0;
    let captureTick = 0;
    for (
      let logicalTick = 71;
      logicalTick <= 70 + ATTACK_TICKS;
      logicalTick += 1
    ) {
      const totalFoodFx = Math.round(current.totals.food[1] * 256);
      await tick(logicalTick);
      const outputs = compiled.decodePlayerOutputs(
        await kernel.readBuffer("PO"),
      );
      assert(
        outputs[1].foodSpendFx <= totalFoodFx,
        "attack spend exceeded available food",
      );
      const after = await readSnapshot(kernel, compiled);
      if (current.owner[borderFarm] === 2 && after.owner[borderFarm] === 1) {
        captureBefore = current.food[borderFarm];
        captureAfter = after.food[borderFarm];
        captureTick = logicalTick;
      }
      current = after;
    }
    const seed = params.seedFraction * params.farmCapacityPerLevel;
    const incursion = new Uint32Array(await kernel.readBuffer("incursion"));
    const maxPressure =
      incursion.reduce(
        (maximum, packed) => Math.max(maximum, packed & 0xffffff),
        0,
      ) / 4096;
    assert(
      current.owner[borderFarm] === 1,
      `attack did not capture border farm ${borderFarm}: owner=${current.owner[borderFarm]}, player1Tiles=${afterSpawn.totals.ownedTiles[1]}->${current.totals.ownedTiles[1]}, cityTroops=${current.troops[cityTile]}, maxPressure=${maxPressure}, player1Food=${current.totals.food[1]}`,
    );
    assert(
      captureAfter >= seed && captureAfter < captureBefore,
      "captured farm did not restart from seed",
    );

    params.attackPower = 2;
    params.flipMargin = 1.6;
    kernel.writeUniform("P", compiled.writeParams(params, DEFAULT_SEED));
    const final = current;
    const averageGpuMsPerTick =
      gpuTimes.reduce((sum, value) => sum + value, 0) / gpuTimes.length;
    return {
      hash: hashBuffers([
        final.owner.buffer,
        final.troops.buffer,
        final.cityLevel.buffer,
        final.farmLevel.buffer,
        final.food.buffer,
        final.S,
        final.PO,
      ]),
      initial: afterSpawn.totals,
      final: final.totals,
      totalSpend: totalSpendFx / 256,
      averageGpuMsPerTick,
      ticks: final.tick,
      capturedFarm: borderFarm,
      captureTicks: captureTick - 70,
    };
  } finally {
    kernel.destroy();
  }
}
