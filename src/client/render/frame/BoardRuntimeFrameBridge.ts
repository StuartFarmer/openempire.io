import type { BoardRuntime } from "../../../core/game/BoardRuntime";
import type { FrameData, TilePair } from "../types";

export class BoardRuntimeFrameBridge {
  private tick = 0;
  private previousState: Uint16Array | null = null;
  private readonly changedTiles: TilePair[] = [];
  private readonly trailState: Uint16Array;
  private readonly railroadState: Uint8Array;
  private readonly emptyMap = new Map();
  private readonly emptyRelationMatrix = new Uint8Array(0);

  constructor(private readonly runtime: BoardRuntime) {
    const tileCount = runtime.map.width * runtime.map.height;
    this.trailState = new Uint16Array(tileCount);
    this.railroadState = new Uint8Array(tileCount);
  }

  nextFrame(): FrameData {
    return {
      tick: this.tick++,
      inSpawnPhase: false,
      tileState: this.runtime.map.state,
      trailState: this.trailState,
      railroadState: this.railroadState,
      units: this.emptyMap,
      players: this.emptyMap,
      names: this.emptyMap,
      events: {
        deadUnits: [],
        conquestEvents: [],
        bonusEvents: [],
      },
      changedTiles: this.collectChangedTiles(),
      railroadDirty: false,
      revealedRailTiles: [],
      trailDirtyRowMin: 0,
      trailDirtyRowMax: -1,
      playerStatus: this.emptyMap,
      relationMatrix: this.emptyRelationMatrix,
      relationSize: 0,
      relationsDirty: false,
      allianceClusters: this.emptyMap,
      nukeTelegraphs: [],
      attackRings: [],
      structuresDirty: false,
    };
  }

  private collectChangedTiles(): TilePair[] | null {
    const state = this.runtime.map.state;
    if (this.previousState === null) {
      this.previousState = new Uint16Array(state);
      return null;
    }

    this.changedTiles.length = 0;
    for (let ref = 0; ref < state.length; ref++) {
      if (this.previousState[ref] === state[ref]) continue;
      this.previousState[ref] = state[ref];
      this.changedTiles.push({ ref, state: 0 });
    }
    return this.changedTiles;
  }
}
