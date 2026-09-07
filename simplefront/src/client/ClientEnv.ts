import { GameID } from "../core/Schemas";
import { simpleHash } from "../core/Util";
import { GameEnv, parseGameEnv } from "../core/configuration/Config";

export class ClientEnv {
  private static values: ClientEnvValues | null = null;

  /** Test-only. */
  static reset(): void {
    ClientEnv.values = null;
  }

  private static get(): ClientEnvValues {
    if (ClientEnv.values) return ClientEnv.values;
    if (typeof window === "undefined") {
      throw new Error("ClientEnv is only available on the browser main thread");
    }
    const bc = window.BOOTSTRAP_CONFIG;
    if (
      !bc ||
      bc.gameEnv === undefined ||
      bc.numWorkers === undefined ||
      bc.instanceId === undefined ||
      bc.gitCommit === undefined
    ) {
      throw new Error("Missing BOOTSTRAP_CONFIG");
    }
    ClientEnv.values = {
      gameEnv: parseGameEnv(bc.gameEnv),
      numWorkers: bc.numWorkers,
      instanceId: bc.instanceId,
      gitCommit: bc.gitCommit,
    };
    return ClientEnv.values;
  }

  // TODO: the following methods are duplicated on ServerEnv. The two classes
  // read from different sources (window.BOOTSTRAP_CONFIG vs process.env) but
  // the derived logic is identical. Consolidate into a shared helper that
  // takes a source so we don't have to keep them in sync by hand.
  static env(): GameEnv {
    return ClientEnv.get().gameEnv;
  }
  static numWorkers(): number {
    return ClientEnv.get().numWorkers;
  }
  static instanceId(): string {
    return ClientEnv.get().instanceId;
  }
  static gitCommit(): string {
    return ClientEnv.get().gitCommit;
  }
  static turnIntervalMs(): number {
    return 100;
  }
  static gameCreationRate(): number {
    return ClientEnv.env() === GameEnv.Dev ? 5 * 1000 : 2 * 60 * 1000;
  }
  static workerIndex(gameID: GameID): number {
    return simpleHash(gameID) % ClientEnv.numWorkers();
  }
  static workerPath(gameID: GameID): string {
    return `w${ClientEnv.workerIndex(gameID)}`;
  }
}
/**
 * Values that flow from server → client via index.html. Set on the server from
 * process.env, then re-hydrated on the client from window.BOOTSTRAP_CONFIG.
 */

export interface ClientEnvValues {
  gameEnv: GameEnv;
  numWorkers: number;
  instanceId: string;
  gitCommit: string;
}
