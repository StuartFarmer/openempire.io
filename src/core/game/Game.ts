import { Config } from "../configuration/Config";
import { AbstractGraph } from "../pathfinding/algorithms/AbstractGraph";
import { PathFinder } from "../pathfinding/types";
import { AllPlayersStats, ClientID } from "../Schemas";
import { formatPlayerDisplayName } from "../Util";
import { GameMap, TileRef } from "./GameMap";
import {
  GameUpdate,
  GameUpdateType,
  PlayerUpdate,
  UnitUpdate,
} from "./GameUpdates";
import { MotionPlanRecord } from "./MotionPlans";
import { RailNetwork } from "./RailNetwork";
import { Stats } from "./Stats";
import { UnitPredicate } from "./UnitGrid";

function isEnumValue<T extends Record<string, string | number>>(
  enumObj: T,
  value: unknown,
): value is T[keyof T] {
  return Object.values(enumObj).includes(value as T[keyof T]);
}

export type PlayerID = string;
export type Tick = number;
export type Gold = bigint;

export type WarshipState = {
  state: "patrolling" | "retreating" | "docked";
  patrolTile?: TileRef;
  retreatPort?: TileRef;
  isInCombat?: boolean;
  lastCombatTick: number;
  // Veterancy level (0–max) plus a shared integer progress meter fed by
  // transport kills and trade captures (see UnitImpl.addVeterancyProgress).
  veterancy: number;
  veterancyProgress: number;
};

export type TransportShipState = {
  isRetreating: boolean;
  troops: number;
};

export const AllPlayers = "AllPlayers" as const;

// export type GameUpdates = Record<GameUpdateType, GameUpdate[]>;
// Create a type that maps GameUpdateType to its corresponding update type
type UpdateTypeMap<T extends GameUpdateType> = Extract<GameUpdate, { type: T }>;

// Then use it to create the record type
export type GameUpdates = {
  [K in GameUpdateType]: UpdateTypeMap<K>[];
};

export interface MapPos {
  x: number;
  y: number;
}

export enum Difficulty {
  Easy = "Easy",
  Medium = "Medium",
  Hard = "Hard",
  Impossible = "Impossible",
}
export const isDifficulty = (value: unknown): value is Difficulty =>
  isEnumValue(Difficulty, value);

export type Team = string;

export interface SpawnArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TeamGameSpawnAreas = Record<string, SpawnArea[]>;

export const Duos = "Duos" as const;
export const Trios = "Trios" as const;
export const Quads = "Quads" as const;
export const HumansVsNations = "Humans Vs Nations" as const;

export const ColoredTeams: Record<string, Team> = {
  Red: "Red",
  Blue: "Blue",
  Teal: "Teal",
  Purple: "Purple",
  Yellow: "Yellow",
  Orange: "Orange",
  Green: "Green",
  Bot: "Bot",
  Humans: "Humans",
  Nations: "Nations",
} as const;

// GameMapType and the maps list are generated from
// map-generator/assets/maps/<map>/info.json by the map-generator
// (`npm run gen-maps`).
export {
  GameMapType,
  mapCategoryOrder,
  maps,
  type GameMapName,
  type MapCategory,
  type MapInfo,
} from "./Maps.gen";

export enum GameType {
  Singleplayer = "Singleplayer",
  Public = "Public",
  Private = "Private",
}
export const isGameType = (value: unknown): value is GameType =>
  isEnumValue(GameType, value);

export enum GameMode {
  FFA = "Free For All",
  Team = "Team",
}

export enum RankedType {
  OneVOne = "1v1",
}

export const isGameMode = (value: unknown): value is GameMode =>
  isEnumValue(GameMode, value);

export interface PublicGameModifiers {
  isCompact?: boolean;
  isRandomSpawn?: boolean;
  isCrowded?: boolean;
  isHardNations?: boolean;
  startingGold?: number;
  goldMultiplier?: number;
  isAlliancesDisabled?: boolean;
  isPortsDisabled?: boolean;
  isNukesDisabled?: boolean;
  isSAMsDisabled?: boolean;
  isPeaceTime?: boolean;
  isWaterNukes?: boolean;
}

export interface UnitInfo {
  cost: (game: Game, player: Player) => Gold;
  /**
   * Which resource the cost is paid from. Defaults to gold. Tribal-age
   * buildings cost food; later ages add metal/oil entries here rather than
   * new plumbing.
   */
  costResource?: "gold" | "food";
  maxHealth?: number;
  damage?: number;
  constructionDuration?: number;
  upgradable?: boolean;
}

function unitTypeGroup<T extends readonly UnitType[]>(types: T) {
  return {
    types,
    has(type: UnitType): type is T[number] {
      return (types as readonly UnitType[]).includes(type);
    },
  };
}

export enum UnitType {
  TransportShip = "Transport",
  Warship = "Warship",
  Shell = "Shell",
  SAMMissile = "SAMMissile",
  Port = "Port",
  AtomBomb = "Atom Bomb",
  HydrogenBomb = "Hydrogen Bomb",
  TradeShip = "Trade Ship",
  MissileSilo = "Missile Silo",
  DefensePost = "Defense Post",
  SAMLauncher = "SAM Launcher",
  City = "City",
  MIRV = "MIRV",
  MIRVWarhead = "MIRV Warhead",
  Train = "Train",
  Factory = "Factory",
  // Tribal-age food economy (layered maps only — see add-tribal-food-economy)
  Settlement = "Settlement",
  Farmland = "Farmland",
  Barn = "Barn",
}

/** Tribal-age buildings — placed from awarded seeds (rework-settlement-
 *  ecology). The Barn is GONE as a buildable: storage is grown from stable
 *  farmland (task 4.3); the enum member survives only for old references. */
export const TribalStructures = unitTypeGroup([
  UnitType.Settlement,
  UnitType.Farmland,
] as const);

export enum TrainType {
  Engine = "Engine",
  TailEngine = "TailEngine",
  Carriage = "Carriage",
}

export const Nukes = unitTypeGroup([
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRVWarhead,
  UnitType.MIRV,
] as const);

export const BuildableAttacks = unitTypeGroup([
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.Warship,
] as const);

export const Structures = unitTypeGroup([
  UnitType.City,
  UnitType.DefensePost,
  UnitType.SAMLauncher,
  UnitType.MissileSilo,
  UnitType.Port,
  UnitType.Factory,
  ...TribalStructures.types,
] as const);

export const BuildMenus = unitTypeGroup([
  ...Structures.types,
  ...BuildableAttacks.types,
] as const);

export const PlayerBuildable = unitTypeGroup([
  ...BuildMenus.types,
  UnitType.TransportShip,
] as const);

export type PlayerBuildableUnitType = (typeof PlayerBuildable.types)[number];

export interface OwnerComp {
  owner: Player;
}

export type TrajectoryTile = {
  tile: TileRef;
  targetable: boolean;
};
export interface UnitParamsMap {
  [UnitType.TransportShip]: {
    troops?: number;
    targetTile?: TileRef;
  };

  [UnitType.Warship]: {
    patrolTile: TileRef;
  };

  [UnitType.Shell]: Record<string, never>;

  [UnitType.SAMMissile]: Record<string, never>;

  [UnitType.Port]: Record<string, never>;

  [UnitType.AtomBomb]: {
    targetTile?: number;
    trajectory: TrajectoryTile[];
  };

  [UnitType.HydrogenBomb]: {
    targetTile?: number;
    trajectory: TrajectoryTile[];
  };

  [UnitType.TradeShip]: {
    targetUnit: Unit;
    lastSetSafeFromPirates?: number;
  };

  [UnitType.Train]: {
    trainType: TrainType;
    targetUnit?: Unit;
    loaded?: boolean;
  };

  [UnitType.Factory]: Record<string, never>;

  [UnitType.MissileSilo]: Record<string, never>;

  [UnitType.DefensePost]: Record<string, never>;

  [UnitType.SAMLauncher]: Record<string, never>;

  [UnitType.City]: Record<string, never>;

  [UnitType.MIRV]: {
    targetTile?: number;
  };

  [UnitType.MIRVWarhead]: {
    targetTile?: number;
  };

  [UnitType.Settlement]: Record<string, never>;

  [UnitType.Farmland]: Record<string, never>;

  [UnitType.Barn]: Record<string, never>;
}

// Type helper to get params type for a specific unit type
export type UnitParams<T extends UnitType> = UnitParamsMap[T];

export type AllUnitParams = UnitParamsMap[keyof UnitParamsMap];

export enum Relation {
  Hostile = 0,
  Distrustful = 1,
  Neutral = 2,
  Friendly = 3,
}

export class Nation {
  constructor(
    public readonly spawnCell: Cell | undefined,
    public readonly playerInfo: PlayerInfo,
    /** Resolved cosmetic flag ref for this nation's shell label (a single
     *  `flag:<slug>`/ISO code). Undefined → the shell assigns a deterministic
     *  one. The sim never reads this. */
    public readonly flag?: string,
  ) {}
}

export class Cell {
  public index: number;

  private strRepr: string;

  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {
    this.strRepr = `Cell[${this.x},${this.y}]`;
  }

  pos(): MapPos {
    return {
      x: this.x,
      y: this.y,
    };
  }

  toString(): string {
    return this.strRepr;
  }
}

export enum TerrainType {
  Plains,
  Highland,
  Mountain,
  Ocean,
  Impassable,
}

export enum PlayerType {
  Bot = "BOT",
  Human = "HUMAN",
  Nation = "NATION",
}

/**
 * Persistent zoning of a DEVELOPED tile. Once a tile is BUILT — urbanized by
 * the city CA or cultivated as a claimed field — it keeps its zone forever.
 * Death (the population starves out; crops senesce) clears the live density /
 * maturity but NOT the zone: dead city ground stays reserved for the city and
 * regrows as city, dead field ground stays reserved for the farm and regrows
 * as field. The two automata never poach each other's ground, living OR dead —
 * a built tile never reverts to wild. Only losing the tile itself (conquest or
 * relinquish) clears the zone.
 */
export enum LandUse {
  Urban = 1,
  Field = 2,
}

export interface Execution {
  isActive(): boolean;
  activeDuringSpawnPhase(): boolean;
  init(mg: Game, ticks: number): void;
  tick(ticks: number): void;
}

export interface Attack {
  id(): string;
  retreating(): boolean;
  retreated(): boolean;
  orderRetreat(): void;
  executeRetreat(): void;
  target(): Player | TerraNullius;
  attacker(): Player;
  troops(): number;
  setTroops(troops: number): void;
  isActive(): boolean;
  delete(): void;
  // The tile the attack originated from, mostly used for boat attacks.
  sourceTile(): TileRef | null;
  // Most recently conquered tile — the attack's supply-line anchor
  // (add-supply-lines). Null until the first conquest.
  frontTile(): TileRef | null;
  setFrontTile(tile: TileRef): void;
  addBorderTile(tile: TileRef): void;
  removeBorderTile(tile: TileRef): void;
  clearBorder(): void;
  borderSize(): number;
  /** Force at one front tile (front-line-troops). `troops()` is the sum of
   *  this field plus any unplaced reserve. */
  troopsAt(tile: TileRef): number;
  addTroopsAt(tile: TileRef, n: number): void;
  /** Take up to `n` from a tile; returns how many were actually there. */
  spendAt(tile: TileRef, n: number): number;
  frontTiles(): IterableIterator<TileRef>;
  /** Troops not yet placed on a front tile. */
  reserve(): number;
  /** Spread the reserve over the current front (once per tick). */
  flushReserve(): void;
  /** Spread `n` troops evenly and deterministically over `tiles`. */
  distributeOver(tiles: readonly TileRef[], n: number): void;
  clusteredPositions(): TileRef[];
}

export interface AllianceRequest {
  accept(): void;
  reject(): void;
  requestor(): Player;
  recipient(): Player;
  createdAt(): Tick;
  status(): "pending" | "accepted" | "rejected";
}

export interface Alliance {
  requestor(): Player;
  recipient(): Player;
  createdAt(): Tick;
  expiresAt(): Tick;
  other(player: Player): Player;
}

export interface MutableAlliance extends Alliance {
  expire(): void;
  other(player: Player): Player;
  bothAgreedToExtend(): boolean;
  addExtensionRequest(player: Player): void;
  id(): number;
  extend(): void;
  onlyOneAgreedToExtend(): boolean;

  agreedToExtend(player: Player): boolean;
}

export class PlayerInfo {
  public readonly displayName: string;

  constructor(
    public readonly name: string,
    public readonly playerType: PlayerType,
    // null if tribe.
    public readonly clientID: ClientID | null,
    // TODO: make player id the small id
    public readonly id: PlayerID,
    public readonly isLobbyCreator: boolean = false,
    public readonly clanTag: string | null = null,
    public readonly friends: ClientID[] = [],
  ) {
    this.displayName = formatPlayerDisplayName(this.name, this.clanTag);
  }
}

export function isUnit(unit: unknown): unit is Unit {
  return (
    unit &&
    typeof unit === "object" &&
    "isUnit" in unit &&
    typeof unit.isUnit === "function" &&
    unit.isUnit()
  );
}

export interface Unit {
  isUnit(): this is Unit;

  // Common properties.
  id(): number;
  type(): UnitType;
  owner(): Player;
  info(): UnitInfo;
  isMarkedForDeletion(): boolean;
  markForDeletion(): void;
  isOverdueDeletion(): boolean;
  delete(displayMessage?: boolean, destroyer?: Player): void;
  tile(): TileRef;
  lastTile(): TileRef;
  move(tile: TileRef): void;
  isActive(): boolean;
  setOwner(owner: Player): void;
  touch(): void;
  hash(): number;
  toUpdate(): UnitUpdate;
  hasTrainStation(): boolean;
  setTrainStation(trainStation: boolean): void;
  wasDestroyedByEnemy(): boolean;
  destroyer(): Player | undefined;

  // Train
  trainType(): TrainType | undefined;
  isLoaded(): boolean | undefined;
  setLoaded(loaded: boolean): void;

  // Targeting
  setTargetTile(cell: TileRef | undefined): void;
  targetTile(): TileRef | undefined;
  setTrajectoryIndex(i: number): void;
  trajectoryIndex(): number;
  trajectory(): TrajectoryTile[];
  setTargetUnit(unit: Unit | undefined): void;
  targetUnit(): Unit | undefined;
  setTargetedBySAM(targeted: boolean): void;
  targetedBySAM(): boolean;
  setReachedTarget(): void;
  reachedTarget(): boolean;
  isTargetable(): boolean;
  setTargetable(targetable: boolean): void;

  // Health
  hasHealth(): boolean;
  warshipState(): WarshipState;
  updateWarshipState(update: Partial<WarshipState>): void;
  transportShipState(): TransportShipState;
  updateTransportShipState(update: Partial<TransportShipState>): void;
  health(): number;
  /** Effective max health, including any warship veterancy bonus. */
  maxHealth(): number;
  modifyHealth(delta: number, attacker?: Player): void;

  // Warship veterancy
  /** Current veterancy level from warshipState (0 for non-warships). */
  veterancy(): number;
  /** Record this warship destroying an enemy unit (drives veterancy gain). */
  recordKill(targetType: UnitType): void;
  /** Record this warship capturing a trade ship (drives veterancy gain). */
  recordTradeCapture(): void;

  // Troops
  setTroops(troops: number): void;
  troops(): number;

  // --- UNIT SPECIFIC ---

  // SAMs & Missile Silos
  launch(): void;
  reloadMissile(): void;
  isInCooldown(): boolean;
  missileTimerQueue(): number[];

  // Trade Ships
  setSafeFromPirates(): void; // Only for trade ships
  isSafeFromPirates(): boolean; // Only for trade ships

  // Construction phase on structures
  isUnderConstruction(): boolean;
  setUnderConstruction(underConstruction: boolean): void;

  // Upgradable Structures
  level(): number;
  increaseLevel(): void;
  decreaseLevel(destroyer?: Player): void;
}

export interface TerraNullius {
  isPlayer(): false;
  id(): null;
  clientID(): ClientID;
  smallID(): number;
}

export interface Embargo {
  createdAt: Tick;
  isTemporary: boolean;
  target: Player;
}

export interface Player {
  // Basic Info
  smallID(): number;
  info(): PlayerInfo;
  name(): string;
  displayName(): string;
  clientID(): ClientID | null;
  id(): PlayerID;
  type(): PlayerType;
  isPlayer(): this is Player;
  toString(): string;
  isLobbyCreator(): boolean;

  // State & Properties
  isAlive(): boolean;
  isTraitor(): boolean;
  markTraitor(): void;
  // Doomsday Clock (anti-stall): marked when below the rising territory bar.
  inDoomsdayClock(): boolean;
  doomsdayClockTicks(): number;
  enterDoomsdayClock(): void;
  clearDoomsdayClock(): void;
  largestClusterBoundingBox: { min: Cell; max: Cell } | null;
  lastTileChange(): Tick;

  isDisconnected(): boolean;
  markDisconnected(isDisconnected: boolean): void;

  hasSpawned(): boolean;
  setSpawnTile(spawnTile: TileRef): void;
  spawnTile(): TileRef | undefined;

  // Territory
  tiles(): ReadonlySet<TileRef>;
  borderTiles(): ReadonlySet<TileRef>;
  numTilesOwned(): number;
  conquer(tile: TileRef): void;
  relinquish(tile: TileRef): void;

  // Resources & Troops
  gold(): Gold;
  addGold(toAdd: Gold, tile?: TileRef): void;
  removeGold(toRemove: Gold): Gold;
  troops(): number;
  setTroops(troops: number): void;
  addTroops(troops: number): void;
  removeTroops(troops: number): number;

  // Food economy (see add-tribal-food-economy)
  /** Food stock in display units. */
  food(): Gold;
  addFood(toAdd: Gold): void;
  removeFood(toRemove: Gold): Gold;
  /** Sum of owned tiles' crop-layer bytes (production input). */
  fertilitySum(): number;
  /** Last food tick's flow breakdown, display units. */
  foodFlow(): {
    production: number;
    consumption: number;
    starvedTroops: number;
    /** Food-supported population = productionMilli / idleConsumptionMilli. */
    capacity: number;
    /** Total living population (idle + deployed) after this tick's births and
     *  deaths — drives the city footprint and the population-death loss. */
    population: number;
  };
  /** Allocation slider: production fraction fed to the population (0..1). */
  foodPopulationShare(): number;
  setFoodPopulationShare(share: number): void;

  // Urban core growth (add-urban-core-growth): the city is a self-growing
  // density field founded from a Core, replacing painted plots.
  core(): TileRef | null;
  setCore(tile: TileRef): void;
  /** Urban density on a tile in milliunits (0..1000); absent = 0. */
  density(tile: TileRef): number;
  setDensity(tile: TileRef, milli: number): void;
  densityEntries(): IterableIterator<[TileRef, number]>;
  /** Urban area in tile-equivalents (Σ density). */
  urbanArea(): number;
  /** Extra housing from tile tenure (rework-settlement-ecology): old city
   *  tiles hold more people. Refreshed each tick by TileTenure.tenureTick. */
  tenureCapacityBonus(): number;
  /** Banked farm seeds — half of each founding pair awarded at
   *  peak-population milestones, spent by placement
   *  (rework-settlement-ecology). */
  farmSeeds(): number;
  /** Banked Settlement seeds — the other half of each founding pair. */
  settlementSeeds(): number;
  /** Farm maturity M∈[0,1] on a Farmland tile in milliunits (0..1000). */
  farmMaturity(tile: TileRef): number;
  setFarmMaturity(tile: TileRef, milli: number): void;
  farmMaturityEntries(): IterableIterator<[TileRef, number]>;
  /** True when the tile is a CLAIMED field tile of this player (farm CA,
   *  rework-settlement-ecology §1b): establishment ≥ fieldClaimMilli, or the
   *  tile hosts one of this player's Farmland nuclei. Claimed field tiles are
   *  invisible to the city CA and vice versa — first claim holds; a tile
   *  merely establishing (below the threshold) counts as wild. */
  isFieldTile(tile: TileRef): boolean;
  /** Persistent zoning of a developed tile (LandUse), or undefined if the tile
   *  was never built. Survives the tile's DEATH — a starved-out city tile
   *  stays LandUse.Urban, a senesced field stays LandUse.Field — so the ground
   *  regrows as its own type and is never poached by the other automaton. Only
   *  conquest / relinquish clears it. */
  landUse(tile: TileRef): LandUse | undefined;

  // Units
  units(...types: UnitType[]): Unit[];
  unitCount(type: UnitType): number;
  unitsConstructed(type: UnitType): number;
  unitsOwned(type: UnitType): number;
  buildableUnits(
    tile: TileRef | null,
    units?: readonly PlayerBuildableUnitType[],
  ): BuildableUnit[];
  canBuild(
    type: UnitType,
    targetTile: TileRef,
    validTiles?: TileRef[] | null,
  ): TileRef | false;
  buildUnit<T extends UnitType>(
    type: T,
    spawnTile: TileRef,
    params: UnitParams<T>,
  ): Unit;

  // Returns the existing unit that can be upgraded,
  // or false if it cannot be upgraded.
  // New units of the same type can upgrade existing units.
  // e.g. if a place a new city here, can it upgrade an existing city?
  findUnitToUpgrade(type: UnitType, targetTile: TileRef): Unit | false;
  canUpgradeUnit(unit: Unit): boolean;
  upgradeUnit(unit: Unit): void;
  captureUnit(unit: Unit): void;

  // Relations & Diplomacy
  nearby(): (Player | TerraNullius)[];
  sharesBorderWith(other: Player | TerraNullius): boolean;
  relation(other: Player): Relation;
  allRelationsSorted(): { player: Player; relation: Relation }[];
  updateRelation(other: Player, delta: number): void;
  decayRelations(): void;
  isOnSameTeam(other: Player): boolean;
  // Either allied or on same team.
  isFriendly(other: Player, treatAFKFriendly?: boolean): boolean;
  team(): Team | null;
  incomingAllianceRequests(): AllianceRequest[];
  outgoingAllianceRequests(): AllianceRequest[];
  alliances(): MutableAlliance[];
  expiredAlliances(): Alliance[];
  allies(): Player[];
  isAlliedWith(other: Player): boolean;
  allianceWith(other: Player): MutableAlliance | null;
  allianceInfo(other: Player): AllianceInfo | null;
  canSendAllianceRequest(other: Player): boolean;
  breakAlliance(alliance: Alliance): void;
  removeAllAlliances(): void;
  createAllianceRequest(recipient: Player): AllianceRequest | null;
  betrayals(): number;

  // Targeting
  canTarget(other: Player): boolean;
  target(other: Player): void;
  targets(): Player[];
  transitiveTargets(): Player[];

  // Communication
  canSendEmoji(recipient: Player | typeof AllPlayers): boolean;
  outgoingEmojis(): EmojiMessage[];
  sendEmoji(recipient: Player | typeof AllPlayers, emoji: string): void;
  canSendQuickChat(recipient: Player): boolean;
  recordQuickChat(recipient: Player): void;

  // Donation
  canDonateGold(recipient: Player): boolean;
  canDonateTroops(recipient: Player): boolean;
  donateTroops(recipient: Player, troops: number): boolean;
  donateGold(recipient: Player, gold: Gold): boolean;
  canDeleteUnit(): boolean;
  recordDeleteUnit(): void;
  canEmbargoAll(): boolean;
  recordEmbargoAll(): void;

  // Embargo
  hasEmbargoAgainst(other: Player): boolean;
  tradingPartners(): Player[];
  addEmbargo(other: Player, isTemporary: boolean): void;
  getEmbargoes(): Embargo[];
  stopEmbargo(other: Player): void;
  endTemporaryEmbargo(other: Player): void;
  canTrade(other: Player): boolean;

  // Attacking.
  canAttack(tile: TileRef): boolean;
  canAttackPlayer(player: Player, treatAFKFriendly?: boolean): boolean;
  isImmune(): boolean;

  createAttack(
    target: Player | TerraNullius,
    troops: number,
    sourceTile: TileRef | null,
    border: Set<number>,
  ): Attack;
  outgoingAttacks(): Attack[];
  incomingAttacks(): Attack[];
  orderRetreat(attackID: string): void;
  executeRetreat(attackID: string): void;

  // Misc
  toUpdate(
    statsOut?: number[],
    attackTroopsOut?: number[],
  ): PlayerUpdate | null;
  playerProfile(): PlayerProfile;
  // WARNING: this operation is expensive.
  bestTransportShipSpawn(tile: TileRef): TileRef | false;
}

export interface Game extends GameMap {
  // Map & Dimensions
  isOnMap(cell: Cell): boolean;
  width(): number;
  height(): number;
  map(): GameMap;
  miniMap(): GameMap;
  forEachTile(fn: (tile: TileRef) => void): void;
  // Zero-allocation neighbor iteration (cardinal only) to avoid creating arrays
  forEachNeighbor(tile: TileRef, callback: (neighbor: TileRef) => void): void;
  // Zero-allocation neighbor iteration for performance-critical cluster calculation
  // Alternative to neighborsWithDiag() that returns arrays
  // Avoids creating intermediate arrays and uses a callback for better performance
  forEachNeighborWithDiag(
    tile: TileRef,
    callback: (neighbor: TileRef) => void,
  ): void;

  // Player Management
  player(id: PlayerID): Player;
  players(): Player[];
  allPlayers(): Player[];
  playerByClientID(id: ClientID): Player | null;
  playerBySmallID(id: number): Player | TerraNullius;
  hasPlayer(id: PlayerID): boolean;
  addPlayer(playerInfo: PlayerInfo): Player;
  terraNullius(): TerraNullius;
  owner(ref: TileRef): Player | TerraNullius;

  teams(): Team[];
  teamSpawnArea(team: Team): SpawnArea | undefined;

  // Alliances
  expireAlliance(alliance: Alliance): void;

  // Immunity timer
  isSpawnImmunityActive(): boolean;
  isNationSpawnImmunityActive(): boolean;
  elapsedGameSeconds(): number;

  // Game State
  ticks(): Tick;
  inSpawnPhase(): boolean;
  endSpawnPhase(): void;
  executeNextTick(): GameUpdates;
  drainPackedTileUpdates(): Uint32Array;
  recordMotionPlan(record: MotionPlanRecord): void;
  drainPackedMotionPlans(): Uint32Array | null;
  drainPackedPlayerUpdates(): Float64Array | null;
  drainPackedAttackUpdates(): Float64Array | null;
  // Urban density render deltas (add-urban-core-growth): packed
  // `tile | (byte<<24)`, byte = round(density/1000·255).
  recordDensityUpdate(tile: TileRef, byte: number): void;
  drainPackedDensityUpdates(): Uint32Array | null;
  // Tile combat-damage render deltas (rework-settlement-ecology): same
  // packing, byte = round(damage/1000·255); byte 0 = fully healed.
  drainPackedDamageUpdates(): Uint32Array | null;
  /** Field-maturity render deltas (rework-settlement-ecology §1b): packed
   *  `tile | (byte<<24)`, byte = round(maturity/1000·255). */
  drainPackedFieldUpdates(): Uint32Array | null;
  /** Burn events (rework-persistent-tiles-and-burn): raw TileRefs of tiles set
   *  ablaze this tick (every tile taken in combat) — each lights a one-shot
   *  fire in the renderers. */
  drainPackedBurns(): Uint32Array | null;
  setWinner(winner: Player | Team, allPlayersStats: AllPlayersStats): void;
  getWinner(): Player | Team | null;
  config(): Config;
  isPaused(): boolean;
  setPaused(paused: boolean): void;

  // Units
  unit(id: number): Unit | undefined;
  units(...types: UnitType[]): Unit[];
  unitCount(type: UnitType): number;
  unitInfo(type: UnitType): UnitInfo;
  hasUnitNearby(
    tile: TileRef,
    searchRange: number,
    type: UnitType,
    playerId?: PlayerID,
    includeUnderConstruction?: boolean,
  ): boolean;
  anyUnitNearby(
    tile: TileRef,
    searchRange: number,
    types: readonly UnitType[],
    predicate: (unit: Unit) => boolean,
    playerId?: PlayerID,
    includeUnderConstruction?: boolean,
  ): boolean;
  nearbyUnits(
    tile: TileRef,
    searchRange: number,
    types: UnitType | readonly UnitType[],
    predicate?: UnitPredicate,
    includeUnderConstruction?: boolean,
  ): Array<{ unit: Unit; distSquared: number }>;

  addExecution(...exec: Execution[]): void;
  displayMessage(
    message: string,
    type: MessageType,
    playerID: PlayerID | null,
    goldAmount?: bigint,
    params?: Record<string, string | number>,
    unitID?: number,
    focusPlayerID?: PlayerID,
  ): void;
  displayIncomingUnit(
    unitID: number,
    message: string,
    type: MessageType,
    playerID: PlayerID | null,
  ): void;

  displayChat(
    message: string,
    category: string,
    target: PlayerID | undefined,
    playerID: PlayerID | null,
    isFrom: boolean,
    recipient: string,
  ): void;

  // Nations
  nations(): Nation[];

  numTilesWithFallout(): number;
  stats(): Stats;

  // Tribal single-tile plots (add-tile-painted-structures)
  /** The footprint tiles of a plot at `anchor` (currently just [anchor]). */
  plotTiles(anchor: TileRef): TileRef[];
  /** The tribal plot (if any) covering this tile. */
  plotAt(tile: TileRef): Unit | undefined;

  // Tile combat damage (rework-settlement-ecology): battle-worn ground.
  /** Remaining combat damage on a tile (milli, 0..1000; 0 = fully healed). */
  tileDamage(tile: TileRef): number;
  /** Add combat damage to a tile (milli, clamped to 1000). */
  addTileDamage(tile: TileRef, milli: number): void;
  /** All tiles with damage > 0 (sparse; deterministic insertion order). */
  tileDamageEntries(): IterableIterator<[TileRef, number]>;

  // Tile stability (rework-settlement-ecology): the demand-gated tenure
  // clock. Owner-agnostic — stability is the tile's continuous life; an
  // ownership flip hard-resets it, vacancy decays it slowly.
  /** Accrued tenure of a tile (milli-ticks; 0 = raw land). */
  tileTenure(tile: TileRef): number;
  /** Set a tile's tenure (milli-ticks; ≤0 deletes the entry). */
  setTileTenure(tile: TileRef, milli: number): void;
  /** All tiles with tenure > 0 (sparse; deterministic insertion order). */
  tileTenureEntries(): IterableIterator<[TileRef, number]>;

  addUpdate(update: GameUpdate): void;
  railNetwork(): RailNetwork;
  conquerPlayer(conqueror: Player, conquered: Player): void;
  miniWaterHPA(): PathFinder<number> | null;
  miniWaterGraph(): AbstractGraph | null;
  getWaterComponent(tile: TileRef): number | null;
  hasWaterComponent(tile: TileRef, component: number): boolean;
  /**
   * Returns the approximate number of water tiles in the component
   * containing `tile`, or null if the tile has no water component. Useful for
   * filtering tiny water bodies (e.g. preventing AI port placement on ponds).
   */
  getWaterComponentSize(tile: TileRef): number | null;
  /**
   * Returns the set of water components that `player` shares with at least one
   * valid trade partner (cached). Used by nation AI for port-placement
   * heuristics. `null` means no usable water body for ports.
   */
  sharedWaterComponents(player: Player): Set<number> | null;
  /** Incremented each time the water navigation graph is rebuilt (e.g. after nuke terrain change). */
  waterGraphVersion(): number;

  /** Queue a land tile for conversion to water (batched every few ticks). Tile must be unowned. */
  queueWaterConversion(tile: TileRef): void;
}

export interface PlayerActions {
  canAttack: boolean;
  buildableUnits: BuildableUnit[];
  canSendEmojiAllPlayers: boolean;
  canEmbargoAll?: boolean;
  interaction?: PlayerInteraction;
}

export interface BuildableUnit {
  canBuild: TileRef | false;
  // unit id of the existing unit that can be upgraded, or false if it cannot be upgraded.
  canUpgrade: number | false;
  type: PlayerBuildableUnitType;
  cost: Gold;
  overlappingRailroads: TileRef[];
  ghostRailPaths: TileRef[][];
}

export interface PlayerProfile {
  relations: Record<number, Relation>;
  alliances: number[];
}

export interface PlayerBorderTiles {
  borderTiles: ReadonlySet<TileRef>;
}

export interface AllianceInfo {
  expiresAt: Tick;
  inExtensionWindow: boolean;
  myPlayerAgreedToExtend: boolean;
  otherAgreedToExtend: boolean;
  canExtend: boolean;
}

export interface PlayerInteraction {
  sharedBorder: boolean;
  canSendEmoji: boolean;
  canSendAllianceRequest: boolean;
  canBreakAlliance: boolean;
  canTarget: boolean;
  canDonateGold: boolean;
  canDonateTroops: boolean;
  canEmbargo: boolean;
  allianceInfo?: AllianceInfo;
}

export interface EmojiMessage {
  message: string;
  senderID: number;
  recipientID: number | typeof AllPlayers;
  createdAt: Tick;
}

export enum MessageType {
  ATTACK_FAILED,
  ATTACK_CANCELLED,
  ATTACK_REQUEST,
  CONQUERED_PLAYER,
  MIRV_INBOUND,
  NUKE_INBOUND,
  NUKE_DETONATED,
  HYDROGEN_BOMB_INBOUND,
  NAVAL_INVASION_INBOUND,
  SAM_MISS,
  SAM_HIT,
  CAPTURED_ENEMY_UNIT,
  UNIT_DESTROYED,
  ALLIANCE_ACCEPTED,
  ALLIANCE_REJECTED,
  ALLIANCE_REQUEST,
  ALLIANCE_BROKEN,
  ALLIANCE_EXPIRED,
  DONATION_SENT,
  DONATION_RECEIVED,
  CHAT,
  RENEW_ALLIANCE,
}

// Message categories used for filtering events in the EventsDisplay
export enum MessageCategory {
  ATTACK = "ATTACK",
  NUKE = "NUKE",
  ALLIANCE = "ALLIANCE",
  TRADE = "TRADE",
  CHAT = "CHAT",
}

// Ensures that all message types are included in a category
export const MESSAGE_TYPE_CATEGORIES: Record<MessageType, MessageCategory> = {
  [MessageType.ATTACK_FAILED]: MessageCategory.ATTACK,
  [MessageType.ATTACK_CANCELLED]: MessageCategory.ATTACK,
  [MessageType.ATTACK_REQUEST]: MessageCategory.ATTACK,
  [MessageType.CONQUERED_PLAYER]: MessageCategory.ATTACK,
  [MessageType.MIRV_INBOUND]: MessageCategory.NUKE,
  [MessageType.NUKE_INBOUND]: MessageCategory.NUKE,
  [MessageType.NUKE_DETONATED]: MessageCategory.NUKE,
  [MessageType.HYDROGEN_BOMB_INBOUND]: MessageCategory.NUKE,
  [MessageType.NAVAL_INVASION_INBOUND]: MessageCategory.ATTACK,
  [MessageType.SAM_MISS]: MessageCategory.ATTACK,
  [MessageType.SAM_HIT]: MessageCategory.ATTACK,
  [MessageType.CAPTURED_ENEMY_UNIT]: MessageCategory.ATTACK,
  [MessageType.UNIT_DESTROYED]: MessageCategory.ATTACK,
  [MessageType.ALLIANCE_ACCEPTED]: MessageCategory.ALLIANCE,
  [MessageType.ALLIANCE_REJECTED]: MessageCategory.ALLIANCE,
  [MessageType.ALLIANCE_REQUEST]: MessageCategory.ALLIANCE,
  [MessageType.ALLIANCE_BROKEN]: MessageCategory.ALLIANCE,
  [MessageType.ALLIANCE_EXPIRED]: MessageCategory.ALLIANCE,
  [MessageType.RENEW_ALLIANCE]: MessageCategory.ALLIANCE,
  [MessageType.DONATION_SENT]: MessageCategory.TRADE,
  [MessageType.DONATION_RECEIVED]: MessageCategory.TRADE,
  [MessageType.CHAT]: MessageCategory.CHAT,
} as const;

/**
 * Get the category of a message type
 */
export function getMessageCategory(messageType: MessageType): MessageCategory {
  return MESSAGE_TYPE_CATEGORIES[messageType];
}

export interface NameViewData {
  x: number;
  y: number;
  size: number;
}
