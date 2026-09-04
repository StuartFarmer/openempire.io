/**
 * rework-ai-war-strategy: readiness gates on achievable population, war
 * intelligence (total power / committed share / food runway), campaign
 * persistence with +EV pacing, dogpiling, threat drift, famine warfare,
 * strength trend memory, and food-runway war-share scaling.
 */
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { AiAttackBehavior } from "../src/core/execution/utils/AiAttackBehavior";
import { deployableTroops } from "../src/core/execution/utils/EconomyModel";
import {
  committedShare,
  effectiveMaxTroops,
  foodRunwayTicks,
  totalPower,
} from "../src/core/execution/utils/WarIntel";
import {
  Difficulty,
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  Relation,
  UnitType,
} from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

function makeBehavior(
  game: Game,
  player: Player,
  seed = 42,
  ratios: [number, number, number] = [0.5, 0.3, 0.2],
): AiAttackBehavior {
  const mockEmoji = {
    maybeSendAttackEmoji: vi.fn(),
    sendEmoji: vi.fn(),
  } as any;
  const mockAlliance = {
    maybeBetray: vi.fn().mockReturnValue(false),
    maybeSendAllianceRequests: vi.fn(),
  } as any;
  return new AiAttackBehavior(
    new PseudoRandom(seed),
    game,
    player,
    ratios[0],
    ratios[1],
    ratios[2],
    mockAlliance,
    mockEmoji,
  );
}

// Players spawn with food().startPopulation troops — zero them so each
// test's addTroops sets an exact count.
function addNation(game: Game, name: string): Player {
  game.addPlayer(new PlayerInfo(name, PlayerType.Nation, null, name));
  const p = game.player(name);
  p.removeTroops(p.troops());
  return p;
}

function addHuman(game: Game, name: string): Player {
  game.addPlayer(new PlayerInfo(name, PlayerType.Human, null, name));
  const p = game.player(name);
  p.removeTroops(p.troops());
  return p;
}

/** Assign every land tile round-robin so all players share borders and no
 *  TerraNullius remains (keeps maybeAttack off the TN fast path). */
function assignAllLand(game: Game, players: Player[]) {
  let i = 0;
  game.map().forEachTile((tile) => {
    if (!game.map().isLand(tile)) return;
    players[i++ % players.length].conquer(tile);
  });
}

function attackExecutions(spy: ReturnType<typeof vi.spyOn>): AttackExecution[] {
  return spy.mock.calls
    .map((c: unknown[]) => c[0])
    .filter((e: unknown): e is AttackExecution => e instanceof AttackExecution);
}

describe("WarIntel helpers", () => {
  test("effectiveMaxTroops: capacity, living floor, housing clamp, non-finite fallback", async () => {
    const game = await setup("big_plains", {});
    const p = addNation(game, "n1");
    const housing = game.config().maxTroops(p);
    expect(housing).toBeGreaterThan(0);

    // No troops, finite capacity below housing → capacity wins
    (p as any)._foodFlow.capacity = Math.max(1, housing - 10);
    expect(effectiveMaxTroops(game, p)).toBe(Math.max(1, housing - 10));

    // Living population above capacity → living wins (still clamped)
    p.addTroops(housing + 500);
    expect(effectiveMaxTroops(game, p)).toBe(housing);

    // Non-finite capacity (inert configs divide by zero) → housing
    p.removeTroops(p.troops());
    (p as any)._foodFlow.capacity = NaN;
    expect(effectiveMaxTroops(game, p)).toBe(housing);
    (p as any)._foodFlow.capacity = Infinity;
    expect(effectiveMaxTroops(game, p)).toBe(housing);
  });

  test("foodRunwayTicks: stock over consumption, Infinity when nobody eats", async () => {
    const game = await setup("big_plains", {});
    const p = addNation(game, "n1");
    p.removeFood(p.food());

    expect(foodRunwayTicks(p)).toBe(Infinity);

    (p as any)._foodFlow.consumption = 10;
    p.addFood(500n);
    expect(foodRunwayTicks(p)).toBe(50);
  });

  test("totalPower and committedShare see deployed troops", async () => {
    const game = await setup("big_plains", {});
    const a = addNation(game, "a");
    const b = addHuman(game, "b");
    assignAllLand(game, [a, b]);
    a.addTroops(10_000);
    b.addTroops(1_000);

    expect(totalPower(a)).toBe(10_000);
    expect(committedShare(a)).toBe(0);

    game.addExecution(new AttackExecution(5_000, a, b.id()));
    game.executeNextTick();

    expect(a.troops()).toBeLessThan(6_000);
    expect(totalPower(a)).toBeGreaterThan(9_000);
    expect(committedShare(a)).toBeGreaterThan(0.4);
  });
});

describe("War share scales with food runway", () => {
  async function scalingSetup() {
    const game = await setup("big_plains", {});
    (game.config() as TestConfig).setInertFood(false);
    const p = addNation(game, "n1");
    p.addTroops(10_000);
    p.removeFood(p.food());
    return { game, p };
  }

  test("empty stores → lean share", async () => {
    const { game, p } = await scalingSetup();
    (p as any)._foodFlow.consumption = 10;
    // runway 0 → share = 0.2 × 0.5 = 0.1
    expect(deployableTroops(game, p)).toBe(1_000);
  });

  test("full barns → rich share", async () => {
    const { game, p } = await scalingSetup();
    (p as any)._foodFlow.consumption = 10;
    p.addFood(10_000n); // runway 1000 ≥ 500 → share = 0.2 × 1.75 = 0.35
    expect(deployableTroops(game, p)).toBe(3_500);
  });

  test("scales at 1 reproduce the flat legacy share", async () => {
    const { game, p } = await scalingSetup();
    const config = game.config() as TestConfig;
    config.setFoodOverride("warShareLeanScale", 1);
    config.setFoodOverride("warShareRichScale", 1);
    (p as any)._foodFlow.consumption = 10;
    expect(deployableTroops(game, p)).toBe(2_000); // 0.2 flat, any stock
    p.addFood(10_000n);
    expect(deployableTroops(game, p)).toBe(2_000);
  });

  test("inert test config keeps the legacy flat share", async () => {
    const game = await setup("big_plains", {});
    const p = addNation(game, "n1");
    p.addTroops(10_000);
    expect(deployableTroops(game, p)).toBe(2_000);
  });
});

describe("Send cap judges total power", () => {
  test("Hard cap counts a neighbor's deployed troops", async () => {
    const game = await setup("big_plains", { difficulty: Difficulty.Hard });
    const attacker = addNation(game, "attacker");
    const neighbor = addHuman(game, "neighbor");
    const third = addHuman(game, "third");
    assignAllLand(game, [attacker, neighbor, third]);

    attacker.addTroops(100_000);
    neighbor.addTroops(90_000);
    third.addTroops(1_000);

    // Let the war share not be the binding constraint (inert → flat share)
    (game.config() as TestConfig).setFoodOverride("maxWarShare", 0.6);

    // Neighbor commits 50k elsewhere: home pool drops to ~40k, but their
    // total power is still ~90k — the cap must retain against THAT.
    game.addExecution(new AttackExecution(50_000, neighbor, third.id()));
    game.executeNextTick();
    expect(neighbor.troops()).toBeLessThan(45_000);
    expect(totalPower(neighbor)).toBeGreaterThan(85_000);

    const behavior = makeBehavior(game, attacker);
    const spy = vi.spyOn(game, "addExecution");
    expect(behavior.sendAttack(neighbor)).toBe(true);
    const exec = attackExecutions(spy)[0];
    expect(exec).toBeDefined();
    // totalPower-based cap ≈ 100k − ceil(0.75 × ~90k) ≈ 32.5k. The old
    // home-pool cap would have allowed ~70k (and the 0.6 share 60k).
    expect((exec as any).startTroops).toBeLessThanOrEqual(33_000);
    expect((exec as any).startTroops).toBeGreaterThan(25_000);
  });
});

describe("Campaign persistence", () => {
  async function campaignSetup() {
    const game = await setup("big_plains", { difficulty: Difficulty.Hard });
    const nation = addNation(game, "nation");
    const target = addHuman(game, "target");
    assignAllLand(game, [nation, target]);
    nation.addTroops(50_000);
    target.addTroops(5_000);
    const behavior = makeBehavior(game, nation);
    return { game, nation, target, behavior };
  }

  test("successful attack on a player opens the war goal", async () => {
    const { nation, target, behavior } = await campaignSetup();
    expect((behavior as any).campaign).toBeNull();
    expect(behavior.sendAttack(target)).toBe(true);
    const campaign = (behavior as any).campaign;
    expect(campaign).not.toBeNull();
    expect(campaign.targetID).toBe(target.id());
    expect(campaign.lastTiles).toBe(nation.numTilesOwned());
  });

  test("gaining tiles with stable population reinforces the same target", async () => {
    const { game, nation, target, behavior } = await campaignSetup();
    (behavior as any).campaign = {
      targetID: target.id(),
      lastTiles: nation.numTilesOwned() - 1, // net tiles grew
      lastPop: totalPower(nation),
      stalls: 0,
    };
    const spy = vi.spyOn(game, "addExecution");
    expect((behavior as any).tickCampaign()).toBe(true);
    const exec = attackExecutions(spy)[0];
    expect(exec).toBeDefined();
    expect((exec as any)._targetID).toBe(target.id());
    // Refreshed by the successful reinforcement
    expect((behavior as any).campaign.stalls).toBe(0);
    expect((behavior as any).campaign.lastTiles).toBe(nation.numTilesOwned());
  });

  test("population dropping below the floor ends the war immediately", async () => {
    const { game, nation, target, behavior } = await campaignSetup();
    (behavior as any).campaign = {
      targetID: target.id(),
      lastTiles: nation.numTilesOwned() - 1,
      lastPop: Math.ceil(totalPower(nation) / 0.9), // pop fell > 3%
      stalls: 0,
    };
    const spy = vi.spyOn(game, "addExecution");
    expect((behavior as any).tickCampaign()).toBe(false);
    expect((behavior as any).campaign).toBeNull();
    expect(attackExecutions(spy)).toHaveLength(0);
  });

  test("a stalled campaign is abandoned after campaignMaxStalls passes", async () => {
    const { nation, target, behavior } = await campaignSetup();
    (behavior as any).campaign = {
      targetID: target.id(),
      lastTiles: nation.numTilesOwned(), // no gain
      lastPop: totalPower(nation),
      stalls: 0,
    };
    expect((behavior as any).tickCampaign()).toBe(false);
    expect((behavior as any).campaign).not.toBeNull();
    expect((behavior as any).campaign.stalls).toBe(1);
    expect((behavior as any).tickCampaign()).toBe(false);
    expect((behavior as any).campaign).toBeNull();
  });

  test("a now-friendly target closes the campaign", async () => {
    const { nation, target, behavior } = await campaignSetup();
    (behavior as any).campaign = {
      targetID: target.id(),
      lastTiles: nation.numTilesOwned() - 1,
      lastPop: totalPower(nation),
      stalls: 0,
    };
    nation.createAllianceRequest(target)?.accept();
    expect(nation.isFriendly(target)).toBe(true);
    expect((behavior as any).tickCampaign()).toBe(false);
    expect((behavior as any).campaign).toBeNull();
  });
});

describe("Threat drift by local power differential", () => {
  test("a 2×+ neighbor drifts to Hostile; a comparable one does not", async () => {
    const game = await setup("big_plains", { difficulty: Difficulty.Hard });
    const nation = addNation(game, "nation");
    const giant = addHuman(game, "giant");
    const peer = addHuman(game, "peer");
    assignAllLand(game, [nation, giant, peer]);
    nation.addTroops(1_000);
    giant.addTroops(5_000); // 5× — over the 2× threat ratio
    peer.addTroops(1_500); // 1.5× — under it

    const behavior = makeBehavior(game, nation);
    // −10/pass from 0 reaches Hostile (< −50) after 6 passes
    for (let i = 0; i < 6; i++) {
      (behavior as any).applyThreatDrift([giant, peer]);
    }
    expect(nation.relation(giant)).toBe(Relation.Hostile);
    expect(nation.relation(peer)).toBe(Relation.Neutral);
  });
});

describe("Strength trend memory", () => {
  test("surge and decline sets track total power across passes", async () => {
    const game = await setup("big_plains", { difficulty: Difficulty.Hard });
    const nation = addNation(game, "nation");
    const grower = addHuman(game, "grower");
    const shrinker = addHuman(game, "shrinker");
    assignAllLand(game, [nation, grower, shrinker]);
    grower.addTroops(2_000);
    shrinker.addTroops(2_000);

    const behavior = makeBehavior(game, nation);
    (behavior as any).updateTrendMemory([grower, shrinker]);
    // First sight — nobody is surging
    expect((behavior as any).surging.size).toBe(0);

    grower.addTroops(1_000); // +50% ≫ surgeGrowthFactor 1.1
    shrinker.removeTroops(500);
    (behavior as any).updateTrendMemory([grower, shrinker]);
    expect((behavior as any).surging.has(grower.id())).toBe(true);
    expect((behavior as any).surging.has(shrinker.id())).toBe(false);
    expect((behavior as any).powerDeclined.has(shrinker.id())).toBe(true);
  });

  test("victim window: mostly-deployed and declining counts as a victim", async () => {
    const game = await setup("big_plains", { difficulty: Difficulty.Hard });
    const nation = addNation(game, "nation");
    const enemy = addHuman(game, "enemy");
    const third = addHuman(game, "third");
    assignAllLand(game, [nation, enemy, third]);
    nation.addTroops(20_000);
    enemy.addTroops(10_000);
    third.addTroops(1_000);

    const behavior = makeBehavior(game, nation);
    // Not a victim while home and at full strength
    expect((behavior as any).findVictim([enemy])).toBeNull();

    // Enemy dumps 60% of its power into a third-party war…
    game.addExecution(new AttackExecution(6_500, enemy, third.id()));
    game.executeNextTick();
    expect(committedShare(enemy)).toBeGreaterThan(0.5);
    // …but only counts once its power is also declining
    expect((behavior as any).findVictim([enemy])).toBeNull();
    (behavior as any).powerDeclined.add(enemy.id());
    expect((behavior as any).findVictim([enemy])).toBe(enemy);
  });
});

describe("Strategy selection", () => {
  test("dogpile: joins a third-party war instead of hitting the weakest peaceful neighbor", async () => {
    const game = await setup("big_plains", { difficulty: Difficulty.Hard });
    const nation = addNation(game, "nation");
    const weakling = addHuman(game, "weakling");
    const embattled = addHuman(game, "embattled");
    const aggressor = addHuman(game, "aggressor");
    // Round-robin on this map borders the nation with indices 1 and 3 —
    // weakling and embattled; the aggressor is a non-neighbor third party.
    assignAllLand(game, [nation, weakling, aggressor, embattled]);
    nation.addTroops(50_000);
    weakling.addTroops(2_000);
    embattled.addTroops(4_000);
    aggressor.addTroops(5_000);

    // Aggressor wages war on embattled (small enough that victim detection's
    // 50%-incoming bar stays unmet). Being in a war — either side of it —
    // makes embattled a dogpile candidate; peaceful weakling, though weaker,
    // is not.
    game.addExecution(new AttackExecution(500, aggressor, embattled.id()));
    game.executeNextTick();
    expect(embattled.incomingAttacks().length).toBeGreaterThan(0);

    const behavior = makeBehavior(game, nation, 7);
    const spy = vi.spyOn(game, "addExecution");
    behavior.maybeAttack();
    const execs = attackExecutions(spy);
    expect(execs.length).toBeGreaterThan(0);
    expect((execs[0] as any)._targetID).toBe(embattled.id());
  });

  test("starving: a neighbor out of food is preferred over a weaker fed one", async () => {
    const game = await setup("big_plains", {
      difficulty: Difficulty.Impossible,
    });
    const nation = addNation(game, "nation");
    const fedWeak = addHuman(game, "fed_weak");
    const starving = addHuman(game, "starving_one");
    assignAllLand(game, [nation, fedWeak, starving]);
    nation.addTroops(50_000);
    fedWeak.addTroops(2_000);
    starving.addTroops(5_000);

    // Starving neighbor: eating with almost nothing stored → runway < 200
    (starving as any)._foodFlow.consumption = 100;
    starving.removeFood(starving.food());
    starving.addFood(1_000n); // runway 10 ticks
    expect(foodRunwayTicks(starving)).toBeLessThan(200);
    expect(foodRunwayTicks(fedWeak)).toBe(Infinity);

    const behavior = makeBehavior(game, nation, 7);
    const spy = vi.spyOn(game, "addExecution");
    behavior.maybeAttack();
    const execs = attackExecutions(spy);
    expect(execs.length).toBeGreaterThan(0);
    expect((execs[0] as any)._targetID).toBe(starving.id());
  });

  test("surge veto: the weakest strategy skips a surging enemy in FFA", async () => {
    const game = await setup("big_plains", { difficulty: Difficulty.Hard });
    const nation = addNation(game, "nation");
    const surger = addHuman(game, "surger");
    const steady = addHuman(game, "steady");
    assignAllLand(game, [nation, surger, steady]);
    nation.addTroops(50_000);
    surger.addTroops(2_000);
    steady.addTroops(4_000);

    const behavior = makeBehavior(game, nation, 7);
    (behavior as any).updateTrendMemory([surger, steady]);
    surger.addTroops(1_000); // +50% since last pass → surging

    const spy = vi.spyOn(game, "addExecution");
    behavior.maybeAttack();
    const execs = attackExecutions(spy);
    expect(execs.length).toBeGreaterThan(0);
    expect((execs[0] as any)._targetID).toBe(steady.id());
  });
});

describe("Famine front aiming", () => {
  test("aim tiles near enemy farmland are drawn preferentially", async () => {
    const game = await setup("big_plains", {
      difficulty: Difficulty.Impossible, // resourceFocus 1 → weight 4 vs 1
    });
    const nation = addNation(game, "nation");
    const target = addHuman(game, "target");
    assignAllLand(game, [nation, target]);
    target.addFood(1_000_000n);

    // A farm on a target-owned tile; contact tiles: a 30-tile row where only
    // the first few are within Chebyshev radius 4 of the farm.
    const farmTile = Array.from(target.tiles())[0];
    target.buildUnit(UnitType.Farmland, farmTile, {});
    const fx = game.x(farmTile);
    const fy = game.y(farmTile);
    const contact: number[] = [];
    for (let i = 0; i < 30; i++) {
      const x = Math.min(fx + i, game.width() - 1);
      contact.push(game.ref(x, Math.min(fy, game.height() - 1)));
    }

    const behavior = makeBehavior(game, nation);
    let near = 0;
    const draws = 300;
    for (let i = 0; i < draws; i++) {
      const aim = (behavior as any).weightedAimTile(contact, target);
      if (Math.abs(game.x(aim) - fx) <= 4 && Math.abs(game.y(aim) - fy) <= 4) {
        near++;
      }
    }
    // 5 of 30 tiles are near the farm. Uniform draw → ~17% of picks; with
    // weight 4 they get 20/45 ≈ 44%. Split the difference generously.
    expect(near / draws).toBeGreaterThan(0.3);
  });
});
