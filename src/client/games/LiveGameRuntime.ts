export interface LiveGameRuntime {
  beforeTick(): Promise<void>;
  dispose(): void;
}
