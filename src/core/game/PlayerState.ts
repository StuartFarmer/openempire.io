export interface AttackData {
  attackerID: number;
  targetID: number;
  troops: number;
  id: string;
  retreating: boolean;
}

export interface AllianceData {
  id: number;
  other: string;
  createdAt: number;
  expiresAt: number;
  hasExtensionRequest: boolean;
}

export interface EmojiData {
  message: string;
  senderID: number;
  recipientID: number | "AllPlayers";
  createdAt: number;
}

export interface PlayerState {
  smallID: number;
  isAlive: boolean;
  isDisconnected: boolean;
  tilesOwned: number;
  gold: number;
  troops: number;
  /** Food economy (layered games only; zero elsewhere), display units. */
  food: number;
  foodProduction: number;
  foodConsumption: number;
  foodStarved: number;
  foodCapacity: number;
  urbanArea: number;
  farmSeeds: number;
  settlementSeeds: number;
  nextSeedRung: number;
  isTraitor: boolean;
  traitorRemainingTicks: number;
  inDoomsdayClock: boolean;
  markedDoomsdayClockTick: number;
  betrayals: number;
  hasSpawned: boolean;
  spawnTile?: number;
  lastDeleteUnitTick: number;
  allies: number[];
  embargoes: number[];
  targets: number[];
  outgoingAttacks: AttackData[];
  incomingAttacks: AttackData[];
  outgoingAllianceRequests: string[];
  alliances: AllianceData[];
  outgoingEmojis: EmojiData[];
}
