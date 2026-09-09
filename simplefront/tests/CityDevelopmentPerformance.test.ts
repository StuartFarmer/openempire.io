import { expect, test, vi } from "vitest";
import {
  cityDevelopmentEligibility,
  cityDevelopmentState,
  foundCityDevelopment,
  organicHousingCapacity,
  organicPopulationPerSecond,
  tickCityDevelopment,
} from "../src/core/development/CityDevelopmentExecution";
import { CityDevelopmentState } from "../src/core/development/CityDevelopmentState";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { SimpleFrontCityConfig } from "../src/core/game/Rulesets";
import { setup } from "./util/Setup";
import type { TestConfig } from "./util/TestConfig";

class Config extends SimpleFrontCityConfig {
  setInertFood(): void {}
}
async function fixture() {
  const infos = ["local", "remote"].map(
    (id) => new PlayerInfo(id, PlayerType.Human, null, id),
  );
  const game = await setup(
    "plains",
    {},
    infos,
    undefined,
    Config as unknown as typeof TestConfig,
    false,
  );
  const [local, remote] = infos.map((i) => game.player(i.id));
  const centre = game.ref(30, 30);
  local.conquer(centre);
  local.setSpawnTile(centre);
  for (const tile of game.neighbors(centre)) local.conquer(tile);
  foundCityDevelopment(game, local, centre);
  for (let y = 60; y < 80; y++)
    for (let x = 60; x < 80; x++) {
      const tile = game.ref(x, y);
      remote.conquer(tile);
      foundCityDevelopment(game, remote, tile);
    }
  remote.setSpawnTile(game.ref(60, 60));
  return { game, local, remote, centre };
}

test("local housing and births do not scan another player's developed territory", async () => {
  const { game, local } = await fixture();
  const owner = vi.spyOn(game, "owner");
  try {
    expect(organicHousingCapacity(game, local)).toBe(10000);
    expect(organicPopulationPerSecond(game, local, 8000, 10000)).toBeCloseTo(
      520,
      10,
    );
    expect(owner.mock.calls.length).toBeLessThan(10);
  } finally {
    owner.mockRestore();
  }
});

test("a local construction opportunity does not visit distant cities", async () => {
  const { game, local } = await fixture();
  const owner = vi.spyOn(game, "owner");
  try {
    for (let i = 0; i < 3; i++) tickCityDevelopment(game, local, 10000, 0);
    expect(
      cityDevelopmentState(local)!.model.pendingFor(
        (t) => game.owner(t) === local,
      ),
    ).not.toBeNull();
    expect(owner.mock.calls.length).toBeLessThan(100);
  } finally {
    owner.mockRestore();
  }
});

test("unchanged neighbourhoods reuse geometric growth checks", async () => {
  const { game, remote } = await fixture();
  const model = cityDevelopmentState(remote)!.model;
  const eligible = cityDevelopmentEligibility(game, remote);
  const scope = model.growthTiles(remote.smallID());
  const expected = model.candidates(eligible, Infinity, scope);
  const neighbours = vi.spyOn(model.terrain, "neighbours");
  try {
    expect(model.candidates(eligible, Infinity, scope)).toEqual(expected);
    expect(neighbours.mock.calls.length).toBeLessThan(5);
  } finally {
    neighbours.mockRestore();
  }
});

test("local geometry refreshes after founding, maturation and restore", async () => {
  const { game, local, remote, centre } = await fixture();
  const model = cityDevelopmentState(local)!.model;
  const check = () => {
    const snapshot = model.deterministicState();
    const fresh = new CityDevelopmentState(
      model.terrain,
      { ...model.config },
      snapshot.seed,
    );
    fresh.restore(snapshot);
    for (const player of [local, remote]) {
      const eligible = cityDevelopmentEligibility(game, player);
      expect(model.candidates(eligible)).toEqual(fresh.candidates(eligible));
    }
  };
  const start = model.deterministicState();
  check(); // Warm existing and wilderness neighbourhoods.
  for (const tile of game.neighbors(centre))
    foundCityDevelopment(game, local, tile);
  check();
  expect(
    model
      .candidates(cityDevelopmentEligibility(game, local))
      .some((c) => c.tile === centre && c.kind === "densify"),
  ).toBe(true);
  for (let i = 0; i < 500; i++) {
    tickCityDevelopment(game, local, organicHousingCapacity(game, local), 0);
    if (i % 20 === 0) check();
  }
  expect(model.level(centre)).toBeGreaterThan(1);
  check();
  model.restore(start);
  check();
});

test("owner-local queries match full scans through growth, capture, obstacles and snapshot restore", async () => {
  const { game, local, remote, centre } = await fixture();
  const model = cityDevelopmentState(local)!.model;
  const check = () => {
    for (const player of [local, remote]) {
      const owned = (tile: number) => game.owner(tile) === player;
      const eligible = cityDevelopmentEligibility(game, player);
      const housing = Math.max(10000, 100 * model.usableCapacity(owned));
      expect(organicHousingCapacity(game, player)).toBe(housing);
      expect(
        organicPopulationPerSecond(game, player, housing * 0.8, housing),
      ).toBe(
        100 *
          model.populationPerSecondFor(
            (housing * 0.8) / 100,
            housing / 100,
            owned,
          ),
      );
      expect(
        model.candidates(
          eligible,
          Infinity,
          model.growthTiles(player.smallID()),
        ),
      ).toEqual(model.candidates(eligible));
    }
  };
  const edge = game.neighbors(centre)[0];
  check();
  // A wilderness tile beside foreign development still has a growth candidate.
  remote.conquer(edge);
  check();
  local.relinquish(centre);
  check();
  local.conquer(centre);
  local.conquer(edge);
  check();
  // Capture an older developed tile after newer tiles; birth summation order must not change.
  remote.conquer(centre);
  check();
  local.conquer(centre);
  check();
  game.addTileDamage(edge, 900);
  check();
  const plot = game.neighbors(centre)[1];
  local.addFoodMilli(2_000_000n);
  const farm = local.buildUnit(UnitType.Farmland, plot, {});
  check();
  farm.delete(false);
  check();
  const snapshot = model.deterministicState();
  for (let i = 0; i < 200; i++) {
    tickCityDevelopment(game, local, organicHousingCapacity(game, local), 0);
    if (i % 10 === 0) check();
  }
  model.restore(snapshot);
  check();
  expect(model.deterministicState()).toEqual(snapshot);
});
