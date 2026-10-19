import { expect, test, vi } from "vitest";
import palette from "../docs/city-local-palette.json";
import { CityAges } from "../src/client/games/simplefront/visuals/CityAges";
import {
  CityStreets,
  spritePixels,
  StreetLayout,
} from "../src/client/games/simplefront/visuals/CityStreets";
import { CityDevelopmentUpdates } from "../src/client/webgpu/CityDevelopmentUpdates";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import {
  cityDevelopmentState,
  foundCityDevelopment,
  tickCityDevelopment,
} from "../src/core/development/CityDevelopmentExecution";
import { PlayerInfo, PlayerType } from "../src/core/game/Game";
import type { CityDevelopmentUpdate } from "../src/core/game/GameUpdates";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { SimpleFrontCityConfig } from "../src/core/game/Rulesets";
import { setup } from "./util/Setup";
import type { TestConfig } from "./util/TestConfig";

const update = (
  tiles: number[],
  reset = false,
  width = 5,
  height = 3,
): CityDevelopmentUpdate => ({
  reset,
  width,
  height,
  seed: 42,
  tiles: Uint32Array.from(tiles),
});

test("2×2 streets deterministically retain buildings and age metadata at every level", () => {
  const reference = new CityStreets();
  const streets = new CityStreets();
  for (let level = 1; level <= 100; level++) {
    const batch = update(
      [6, level, 1, 0, 7, level, 2, 0, 11, level, 1, 0],
      level === 1,
    );
    reference.apply(batch);
    streets.apply(batch);
    for (const [tile, detail] of reference.layout!.tiles) {
      expect(streets.layout!.tiles.get(tile)).toEqual(detail);
      const words = streets.sprite(tile);
      expect(words[1] >>> 24).toBe(level);
      expect(spritePixels(words)).toHaveLength(4);
      expect(spritePixels(words).some((code) => code >= 2)).toBe(true);
      expect(
        [...detail.roads, ...detail.buildings.keys()].every(
          (pixel) => pixel >= 0 && pixel < 4,
        ),
      ).toBe(true);
    }
  }
});

test.each([
  { neighbours: [1, 3], bridge: 2 },
  { neighbours: [2, 6, 8, 12], bridge: 7 },
])(
  "bridge $bridge joins every distinct adjacent street network",
  ({ neighbours, bridge }) => {
    const streets = new CityStreets();
    streets.apply(
      update(
        neighbours.flatMap((tile, index) => [tile, 1, index + 1, 0]),
        true,
      ),
    );
    const dirty = streets.apply(update([bridge, 1, 0, 0]));
    expect(streets.layout!.tiles.get(bridge)!.connections).toEqual(
      new Set(neighbours),
    );
    expect(dirty).toEqual(new Set([...neighbours, bridge]));
    for (const tile of neighbours) {
      const existing = streets.layout!.tiles.get(tile)!;
      expect(existing.connections.has(bridge)).toBe(true);
      const direction =
        tile === bridge - 5
          ? 2
          : tile === bridge + 5
            ? 0
            : tile === bridge - 1
              ? 1
              : 3;
      expect(
        existing.paths[direction].every((cell) => existing.roads.has(cell)),
      ).toBe(true);
    }
  },
);

test("branching zero still leaves optional loops out of an already connected network", () => {
  const levels = new Map<number, number>();
  const layout = new StreetLayout(
    {
      width: 5,
      height: 3,
      level: (tile) => levels.get(tile) ?? 0,
      elevation: () => 0,
    },
    42,
    { branching: 0, straightness: 0.55 },
  );
  for (const tile of [6, 7, 12, 11]) {
    levels.set(tile, 1);
    layout.sync([tile]);
  }
  expect(layout.tiles.get(11)!.connections.size).toBe(1);
  // A physical removal can split the network; re-adding its bridge must see
  // the two distinct components rather than a stale connectivity index.
  levels.delete(7);
  layout.sync([7]);
  levels.set(7, 1);
  layout.sync([7]);
  expect(layout.tiles.get(7)!.connections).toEqual(new Set([6, 12]));
});

test("2×2 street pixels connect across opposing ownership and preserve topology on capture and loss", () => {
  const streets = new CityStreets();
  streets.apply(update([6, 3, 1, 0, 7, 3, 2, 0], true));
  const a = streets.layout!.tiles.get(6)!,
    b = streets.layout!.tiles.get(7)!;
  expect(a.connections.has(7)).toBe(true);
  const pixels = spritePixels(streets.sprite(6));
  expect(pixels).toHaveLength(4);
  expect(pixels.every((p) => p >= 0 && p <= 5)).toBe(true);
  const gates = [...a.roads]
    .filter((cell) => cell % 2 === 1)
    .map((cell) => Math.floor(cell / 2));
  expect(gates.length).toBeGreaterThan(0);
  expect(gates.every((row) => b.roads.has(row * 2))).toBe(true);
  const before = [streets.sprite(6), streets.sprite(7)];
  streets.apply(update([6, 3, 2, 0, 7, 3, 0, 0]));
  expect([streets.sprite(6), streets.sprite(7)]).toEqual(before);
  expect(streets.owner(6)).toBe(2);
  expect(streets.owner(7)).toBe(0);
});

test("only changed neighbourhoods become dirty; a reset clears stale pixels on rectangular maps", () => {
  const streets = new CityStreets();
  streets.apply(update([6, 1, 1, 0, 7, 1, 1, 0, 13, 1, 1, 0], true));
  expect(streets.apply(update([6, 2, 1, 0]))).toEqual(new Set([6]));
  const dirty = streets.apply(update([8, 1, 1, 0]));
  expect(dirty.has(6)).toBe(false);
  expect(dirty.has(8)).toBe(true);
  const rectangular = new CityStreets();
  rectangular.apply(update([13, 1, 1, 0, 8, 1, 1, 0], true));
  expect(rectangular.layout!.tiles.get(13)!.connections.has(8)).toBe(true);
  streets.apply(update([], true, 2, 2));
  expect(streets.layout!.tiles.size).toBe(0);
  expect(streets.sprite(6)).toEqual([0, 0]);
});

test("approved age palettes repaint independently of street codes and reset to their defaults", () => {
  const streets = new CityStreets();
  streets.apply(update([6, 1, 1, 0], true));
  const sprite = streets.sprite(6);
  const ages = new CityAges();
  expect(ages.color(1, 0)).toBe(palette.palettes[0].ground);
  expect(ages.color(1, 1)).toBe(palette.palettes[0].road);
  expect(ages.color(16, 2)).toBe("#ff2600");
  ages.setPalette(
    palette.palettes.map((p, i) => (i === 0 ? { ...p, ground: "#112233" } : p)),
  );
  expect(ages.color(1, 0)).toBe("#112233");
  ages.setAgeLevels([1, 2, 3, 4, 5, 6]);
  expect(ages.color(6, 2)).toBe("#ff2600");
  expect(streets.sprite(6)).toEqual(sprite);
  expect(() => ages.setAgeLevels([1, 1, 3, 4, 5, 6])).toThrow();
  expect(() =>
    ages.setPalette([{ ...palette.palettes[0], road: "oops" }]),
  ).toThrow();
  ages.reset();
  expect(ages.color(1, 0)).toBe("#5e7c46");
  expect(ages.color(16, 2)).toBe("#ff2600");
});

class Config extends SimpleFrontCityConfig {
  setInertFood(): void {}
  override cityDevelopment() {
    return { ...DEFAULT_CONFIG, rate: 2000 };
  }
}

async function fixture() {
  const infos = ["alice", "bob"].map(
    (id) => new PlayerInfo(id, PlayerType.Human, null, id),
  );
  const game = await setup(
    "plains",
    {},
    infos,
    undefined,
    Config as unknown as typeof TestConfig,
  );
  const [a, b] = infos.map((info) => game.player(info.id));
  for (const [i, p] of [a, b].entries()) {
    const tile = game.ref(30 + 20 * i, 30);
    p.conquer(tile);
    p.setSpawnTile(tile);
    p.setTroops(100);
    foundCityDevelopment(game, p, tile);
    game.forEachNeighbor(tile, (next) => p.conquer(next));
  }
  return { game, a, b };
}

test("worker observer includes capture and neutral ownership without resetting physical levels", async () => {
  const { game, a, b } = await fixture();
  const observer = new CityDevelopmentUpdates();
  const initial = observer.read(game)!;
  expect(initial.reset).toBe(true);
  expect(observer.read(game)).toBeUndefined();
  const tile = game.ref(30, 30);
  b.conquer(tile);
  expect(Array.from(observer.read(game)!.tiles).slice(0, 3)).toEqual([
    tile,
    1,
    b.smallID(),
  ]);
  b.relinquish(tile);
  expect(Array.from(observer.read(game)!.tiles).slice(0, 3)).toEqual([
    tile,
    1,
    0,
  ]);
  expect(a.troops()).toBe(100);
});

test("independent visual readers inspect changes without rescanning every city", async () => {
  const { game, a, b } = await fixture();
  const model = cityDevelopmentState(a)!.model;
  const first = new CityDevelopmentUpdates();
  const second = new CityDevelopmentUpdates();
  const original = model.deterministicState();
  expect(first.read(game)).toEqual(second.read(game));
  const scan = vi.spyOn(model, "developedTiles");
  try {
    expect(first.read(game)).toBeUndefined();
    expect(scan).not.toHaveBeenCalled();
    const tile = game.ref(30, 30);
    b.conquer(tile);
    const capture = first.read(game);
    expect(capture!.tiles.slice(0, 3)).toEqual(
      new Uint32Array([tile, 1, b.smallID()]),
    );
    expect(second.read(game)).toEqual(capture);
    expect(scan).not.toHaveBeenCalled();

    const extra = game.ref(31, 30);
    foundCityDevelopment(game, a, extra);
    expect(first.read(game)!.tiles[0]).toBe(extra);
    model.restore(original);
    const removal = first.read(game)!;
    expect(Array.from(removal.tiles)).toContain(extra);
    expect(removal.tiles[Array.from(removal.tiles).indexOf(extra) + 1]).toBe(0);
    expect(scan).toHaveBeenCalled();
  } finally {
    scan.mockRestore();
  }
});

test("a visual reader that misses the bounded history falls back to a full scan", async () => {
  const { game, a, b } = await fixture();
  const observer = new CityDevelopmentUpdates();
  observer.read(game);
  const tile = game.ref(30, 30);
  for (let i = 0; i < 5001; i++) (i % 2 ? a : b).conquer(tile);
  const update = observer.read(game)!;
  expect(update.reset).toBe(false);
  expect(Array.from(update.tiles).slice(0, 3)).toEqual([tile, 1, b.smallID()]);
  expect(observer.read(game)).toBeUndefined();
});

test("full snapshot after a large city replaces every old physical and visual tile", async () => {
  const { game, a } = await fixture();
  const model = cityDevelopmentState(a)!.model;
  for (let tile = 1000; tile < 3000; tile++) model.found(tile);
  const observer = new CityDevelopmentUpdates(),
    streets = new CityStreets();
  const large = observer.read(game)!;
  streets.apply(large);
  expect(streets.layout!.tiles.size).toBeGreaterThanOrEqual(2000);
  streets.apply({
    ...large,
    reset: true,
    tiles: new Uint32Array([6060, 1, 1, 0]),
  });
  expect([...streets.layout!.tiles.keys()]).toEqual([6060]);
  expect(streets.sprite(2020)).toEqual([0, 0]);
});

test("headless simulation hashes match frequent visual readers and live palette edits", async () => {
  const headless = await fixture(),
    rendered = await fixture();
  const observer = new CityDevelopmentUpdates(),
    streets = new CityStreets(),
    ages = new CityAges();
  for (let step = 0; step < 60; step++) {
    for (const { game, a, b } of [headless, rendered]) {
      tickCityDevelopment(game, a, 100, 0);
      tickCityDevelopment(game, b, 100, 0);
    }
    const frame = observer.read(rendered.game);
    if (frame) streets.apply(frame);
    for (let render = 0; render <= step % 5; render++) {
      ages.setAgeLevels(render % 2 ? [1, 2, 3, 4, 5, 6] : palette.ageLevels);
      for (const tile of streets.layout!.tiles.keys())
        spritePixels(streets.sprite(tile));
    }
    expect(rendered.game.executeNextTick()[GameUpdateType.Hash]).toEqual(
      headless.game.executeNextTick()[GameUpdateType.Hash],
    );
  }
});

test("actual page bridge preserves levels through plot updates and clears them on reset", async () => {
  const { GameShellPage } = await import("../src/client/GameShellPage");
  const page = new GameShellPage() as any;
  const streets = new CityStreets();
  page.systemId = "simplefront";
  page.mapWidth = 5;
  page.mapHeight = 3;
  page.ownerScratch = new Uint32Array(15);
  page.plotU32 = new Uint32Array(15);
  // Only the GPU transport is replaced: page composition and street replica run.
  page.kernel = { writeBuffer() {}, writeBufferU32Range() {} };
  page.renderer = {
    applyCityDevelopment: (u: CityDevelopmentUpdate) => streets.apply(u),
    setTransportShips() {},
  };
  const frame = {
    type: "frame",
    tick: 0,
    inSpawn: true,
    mySmallID: 0,
    owner: null,
    plot: null,
    front: null,
    density: null,
    damage: null,
    supply: null,
    burns: null,
    stats: null,
    transportShips: new Int32Array(),
    names: null,
    myStats: null,
    fronts: null,
    spawnAnchor: null,
    nationSpawns: null,
  };
  page.onWorkerFrame({ ...frame, development: update([6, 3, 1, 0], true) });
  expect(streets.layout!.tiles.get(6)!.level).toBe(3);
  expect(page.plotU32[6]).toBe(3 << 16);
  page.onWorkerFrame({ ...frame, plot: new Uint32Array([6, 1]) });
  expect(page.plotU32[6]).toBe((3 << 16) | 1);
  page.onWorkerFrame({ ...frame, development: update([], true) });
  expect(page.plotU32[6]).toBe(1);
  expect(streets.layout!.tiles.size).toBe(0);
});

test("next-match page configuration does not change the active worker contract until ready", async () => {
  const { GameShellPage } = await import("../src/client/GameShellPage");
  const page = new GameShellPage() as any;
  page.setNextCityDevelopment(DEFAULT_CONFIG);
  expect(page.cityDevelopmentConfig).toBeUndefined();
  page.onWorkerMessage({
    type: "ready",
    popPerDensity: 10000,
    fertility: new Uint8Array(),
    suitability: new Uint8Array(),
    cityDevelopment: DEFAULT_CONFIG,
  });
  expect(page.cityDevelopmentConfig).toEqual(DEFAULT_CONFIG);
  page.setNextCityDevelopment(undefined);
  expect(page.cityDevelopmentConfig).toEqual(DEFAULT_CONFIG);
  page.onWorkerMessage({
    type: "ready",
    popPerDensity: 10000,
    fertility: new Uint8Array(),
    suitability: new Uint8Array(),
  });
  expect(page.cityDevelopmentConfig).toBeUndefined();
});
