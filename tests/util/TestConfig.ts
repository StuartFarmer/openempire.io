import {
  Config,
  FoodConfig,
  NukeMagnitude,
} from "../../src/core/configuration/Config";
import {
  Game,
  Player,
  TerraNullius,
  Tick,
  UnitType,
} from "../../src/core/game/Game";
import { TileRef } from "../../src/core/game/GameMap";

export class TestConfig extends Config {
  private _proximityBonusPortsNb: number = 0;
  private _inertFood: boolean = false;

  /**
   * Neutralize the food economy for tests that exercise other systems:
   * nobody eats, ages, breeds, or bleeds to supply attrition, so troop
   * counts only change when the test changes them. Setup() enables this
   * automatically for games created without explicit layer data; economy
   * tests pass a layersFill and get the real knobs.
   */
  setInertFood(inert: boolean): void {
    this._inertFood = inert;
  }

  food(): FoodConfig {
    const base = super.food();
    if (!this._inertFood) return base;
    return {
      ...base,
      idleConsumptionMilli: 0,
      moveConsumptionMilli: 0,
      fightConsumptionMilli: 0,
      warSupplyAttrition: 0,
      decayNumer: 0,
      avgLifespanTicks: Number.MAX_SAFE_INTEGER,
      baseBirthRate: 0,
      urbanGrowthRate: 0,
      // Nobody eats, so food-runway war-share scaling would read "rich"
      // (infinite runway) — pin the scales flat so inert games keep the
      // legacy maxWarShare exactly (rework-ai-war-strategy).
      warShareLeanScale: 1,
      warShareRichScale: 1,
    };
  }
  private _defaultNukeSpeed: number = 4;
  private _spawnImmunityDuration: number = 0;
  private _nationSpawnImmunityDuration: number = 0;

  disableNavMesh(): boolean {
    return this.gameConfig().disableNavMesh ?? true;
  }

  radiusPortSpawn(): number {
    return 1;
  }

  proximityBonusPortsNb(totalPorts: number): number {
    return this._proximityBonusPortsNb;
  }

  // Specific to TestConfig
  setProximityBonusPortsNb(nb: number): void {
    this._proximityBonusPortsNb = nb;
  }

  nukeMagnitudes(_: UnitType): NukeMagnitude {
    return { inner: 1, outer: 1 };
  }

  setDefaultNukeSpeed(speed: number): void {
    this._defaultNukeSpeed = speed;
  }

  defaultNukeSpeed(): number {
    return this._defaultNukeSpeed;
  }

  defaultNukeTargetableRange(): number {
    return 20;
  }

  deletionMarkDuration(): number {
    return 5;
  }

  defaultSamRange(): number {
    return 20;
  }

  samRange(level: number): number {
    return 20;
  }

  setSpawnImmunityDuration(duration: Tick) {
    this._spawnImmunityDuration = duration;
  }

  spawnImmunityDuration(): Tick {
    return this._spawnImmunityDuration;
  }

  setNationSpawnImmunityDuration(duration: Tick) {
    this._nationSpawnImmunityDuration = duration;
  }

  nationSpawnImmunityDuration(): Tick {
    return this._nationSpawnImmunityDuration;
  }

  attackLogic(
    gm: Game,
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    tileToConquer: TileRef,
  ): {
    attackerTroopLoss: number;
    defenderTroopLoss: number;
    tilesPerTickUsed: number;
  } {
    return { attackerTroopLoss: 1, defenderTroopLoss: 1, tilesPerTickUsed: 1 };
  }

  attackTilesPerTick(
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    numAdjacentTilesWithEnemy: number,
  ): number {
    return 1;
  }
}
export class UseRealAttackLogic extends TestConfig {
  attackLogic(
    gm: Game,
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    tileToConquer: TileRef,
  ): {
    attackerTroopLoss: number;
    defenderTroopLoss: number;
    tilesPerTickUsed: number;
  } {
    return Config.prototype.attackLogic.call(
      this,
      gm,
      attackTroops,
      attacker,
      defender,
      tileToConquer,
    );
  }
}
