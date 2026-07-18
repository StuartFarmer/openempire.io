import { LitElement } from "lit";
import { state } from "lit/decorators.js";
import { GameMapType } from "../../core/game/Game";
import type { MapData } from "../../core/game/GameMapLoader";
import { LAB_SYSTEMS } from "../lab/systems";
import { terrainMapFileLoader } from "../TerrainMapFileLoader";
import {
  compileFieldSystem,
  type AIContext,
  type CompiledFieldSystem,
  type FieldSystem,
  type InputContext,
} from "../webgpu/FieldDynamics";
import { FieldKernel } from "../webgpu/FieldKernel";
import { uploadMapLayers } from "../webgpu/MapLayerUpload";
import type { ViewerRenderer } from "./ViewerRenderer";

// Shared machinery for the field viewers (unify-field-viewer phase 4): a
// LitElement base that owns the device/renderer, the headless FieldKernel, the
// compiled system, and the fixed-clock tick loop — everything both the #lab
// playground and the #shell world view need. A FieldKernel runs HEADLESS on
// `renderer.device`; the renderer (BlitRenderer or CameraRenderer, chosen by
// the subclass) is pointed at the kernel's `outView`. Subclasses add their
// bespoke layer: the lab keeps brush/turbo/bots/HMR; the shell adds the camera,
// the terrain derivation, hover, and climate knobs.

// Fixed-clock death-spiral clamp: at most this many catch-up ticks per frame.
export const MAX_TICKS_PER_FRAME = 8;
// Turbo: adapt ticks-per-command-buffer toward this much GPU time per batch.
const TURBO_TARGET_MS = 25;

export abstract class FieldViewerBase extends LitElement {
  @state() protected systemId = LAB_SYSTEMS[0]?.id ?? "";
  @state() protected mapKey = "Verdantia";
  @state() protected view = "";
  @state() protected brush = "";
  @state() protected paramValues: Record<string, number> = {};
  @state() protected running = false;
  // OpenFront ticks every 100ms → 10/s default.
  @state() protected ticksPerSecond = 10;
  @state() protected turbo = false;
  @state() protected status = "";
  @state() protected scalarReadout: Record<string, number | number[]> = {};
  @state() protected tickReadout = 0;
  @state() protected gpuMs = 0;
  @state() protected ticksPerSec = 0;

  protected systems: readonly FieldSystem[] = LAB_SYSTEMS;
  protected renderer: ViewerRenderer | null = null;
  protected kernel: FieldKernel | null = null;
  protected compiled: CompiledFieldSystem | null = null;
  protected mapWidth = 0;
  protected mapHeight = 0;
  protected seed = 1337;

  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private inFlight = false;
  protected needsRedraw = false;
  private readbackTimer = 0;
  private pumpActive = false;
  private lastPresent = 0;
  private turboBatch = 8;

  createRenderRoot() {
    return this;
  }

  // --- subclass surface -------------------------------------------------------

  /** The <canvas> id this viewer renders into. */
  protected abstract canvasId(): string;
  /** Create the presentation renderer (blit or camera) for the canvas. */
  protected abstract createRenderer(
    canvas: HTMLCanvasElement,
  ): Promise<ViewerRenderer>;
  /** Present one frame to the screen (subclass supplies camera / no camera). */
  protected abstract present(): void;
  /** Whether the sim's out texture should be shown this frame (subclass may
   * suppress it — e.g. the shell shows the derivation instead). Default: yes. */
  protected shouldRenderSimView(): boolean {
    return true;
  }
  /** Hook after a system mounts (subclass points the renderer at outView, runs
   * its derivation, etc.). */
  protected async onSystemMounted(_mapData: MapData): Promise<void> {}

  // --- player intents (input + AI write here) ---------------------------------
  private playerIntents: (Record<string, number> | undefined)[] = [];
  private playersDirty = false;
  private aiClock = 0;

  /** Merge fields into a player's next intent record (input + ai both call). */
  protected mergePlayerIntent(p: number, fields: Record<string, number>): void {
    this.playerIntents[p] = { ...this.playerIntents[p], ...fields };
    this.playersDirty = true;
  }

  /** Upload the accumulated per-player intents to the PL buffer. */
  protected flushPlayers(): void {
    if (
      !this.playersDirty ||
      !this.kernel ||
      !this.compiled ||
      this.compiled.playerCount === 0
    ) {
      return;
    }
    const bots = Array.from(
      { length: this.compiled.playerCount },
      (_, p): Record<string, number> => this.playerIntents[p] ?? {},
    );
    this.kernel.writeBuffer(
      "PL",
      new Uint8Array(this.compiled.writePlayers(bots)),
    );
    this.playersDirty = false;
  }

  /** Run the mounted system's AI (if any) once, then upload intents. */
  protected runAI(): void {
    const ai = this.compiled?.system.ai;
    if (!ai || !this.kernel || !this.compiled) return;
    if (this.compiled.playerCount === 0) return;
    let seed = (this.tickReadout * 2654435761) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const ctx: AIContext = {
      playerCount: this.compiled.playerCount,
      tick: this.tickReadout,
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight,
      localPlayer: 0,
      scalars: this.scalarReadout,
      rand,
      setPlayer: (p, fields) => this.mergePlayerIntent(p, fields),
    };
    ai.decide(ctx);
    this.flushPlayers();
  }

  private inputContext(): InputContext {
    return {
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight,
      running: this.running,
      localPlayer: 0,
      stamp: (brush, x, y) => this.stampBrush(brush, x, y),
      setPlayer: (p, fields) => this.mergePlayerIntent(p, fields),
    };
  }

  // --- lifecycle --------------------------------------------------------------

  connectedCallback(): void {
    super.connectedCallback();
    this.readbackTimer = window.setInterval(() => void this.readScalars(), 500);
    this.raf = requestAnimationFrame(this.loop);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.readbackTimer);
    cancelAnimationFrame(this.raf);
    this.kernel?.destroy();
    this.kernel = null;
    this.renderer?.destroy();
    this.renderer = null;
  }

  protected currentSystem(): FieldSystem | undefined {
    return this.systems.find((s) => s.id === this.systemId);
  }

  protected mapData(): MapData {
    const mapType = GameMapType[this.mapKey as keyof typeof GameMapType];
    return terrainMapFileLoader.getMapData(mapType);
  }

  // --- mount ------------------------------------------------------------------

  /** Compile the current system, (re)create the headless kernel on the shared
   * device, upload map layers, reconcile the declared view/brush/params, init
   * state, and hand off to the subclass's onSystemMounted. */
  protected async loadWorld(preserved?: Map<string, ArrayBuffer>): Promise<void> {
    const system = this.currentSystem();
    const canvas = this.querySelector<HTMLCanvasElement>(`#${this.canvasId()}`);
    if (!system || !canvas) return;
    this.running = false;
    this.status = "Loading…";
    try {
      this.renderer ??= await this.createRenderer(canvas);
      const compiled = await compileFieldSystem(system);
      const mapData = this.mapData();
      const manifest = await mapData.manifest();
      const width: number = manifest.map.width;
      const height: number = manifest.map.height;

      this.kernel?.destroy();
      this.kernel = null;
      const kernel = await FieldKernel.create(null, compiled.kernelConfig, {
        device: this.renderer.device,
      });
      kernel.resize(width, height);
      await uploadMapLayers(kernel, compiled.mapLayers, mapData, width, height);

      this.compiled = compiled;
      this.kernel = kernel;
      this.mapWidth = width;
      this.mapHeight = height;
      if (!compiled.viewNames.includes(this.view)) {
        this.view = compiled.viewNames[0] ?? "";
      }
      if (!compiled.brushNames.includes(this.brush)) {
        this.brush = compiled.brushNames[0] ?? "";
      }
      this.paramValues = Object.fromEntries(
        compiled.paramList.map((p) => [
          p.name,
          this.paramValues[p.name] ?? p.value,
        ]),
      );
      this.turboBatch = 8;
      if (this.isDeriveSystem()) {
        // A derive system (terrain) owns its own uniform + inputs + run — the
        // subclass drives it in onSystemMounted; no sim init / generic P.
        await this.onSystemMounted(mapData);
        this.status = "";
        this.tickReadout = 0;
        this.scalarReadout = {};
        return;
      }
      kernel.writeUniform("P", compiled.writeParams(this.paramValues, this.seed));
      this.playerIntents = [];
      this.aiClock = 0;
      this.runAI(); // seed the system's bots (no-op without an `ai` hook)
      await this.resetState();

      if (preserved) {
        for (const name of compiled.layerNames) {
          const data = preserved.get(name);
          if (data && data.byteLength === width * height * 4) {
            kernel.writeBuffer(name, new Float32Array(data));
          }
        }
        this.needsRedraw = true;
      }
      await this.onSystemMounted(mapData);
      this.status = "";
      this.tickReadout = 0;
      this.scalarReadout = {};
    } catch (error) {
      this.status = (error as Error).message;
    }
  }

  protected async resetState(): Promise<void> {
    if (!this.kernel || !this.compiled) return;
    this.kernel.clearBuffer("S");
    const frame = this.kernel.beginFrame();
    this.compiled.runInit(frame);
    this.compiled.runView(frame, this.view);
    await frame.finish();
    this.needsRedraw = true;
  }

  // --- loop -------------------------------------------------------------------

  private loop = (time: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.classList.contains("hidden")) {
      this.lastTime = 0;
      return;
    }
    const dt =
      this.lastTime === 0 ? 0 : Math.min(0.25, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (this.kernel && this.compiled && !this.inFlight) {
      if (this.turbo && this.running && !this.isDeriveSystem()) {
        void this.pump();
      } else {
        let ticks = 0;
        if (this.running) {
          this.accumulator = Math.min(
            this.accumulator + dt * this.ticksPerSecond,
            MAX_TICKS_PER_FRAME,
          );
          ticks = Math.floor(this.accumulator);
          this.accumulator -= ticks;
        }
        if (ticks > 0 || this.needsRedraw) {
          this.needsRedraw = false;
          this.advance(ticks);
        }
        if (ticks > 0) this.tickAI(ticks);
      }
    }
    // The renderer presents every display frame (camera animation, resize).
    this.present();
  };

  /** Drive the system's AI on its tick cadence (default 40 ticks ≈ 4s). */
  private tickAI(ticks: number): void {
    const ai = this.compiled?.system.ai;
    if (!ai) return;
    this.aiClock += ticks;
    const cadence = ai.cadenceTicks ?? 40;
    if (this.aiClock >= cadence) {
      this.aiClock = 0;
      this.runAI();
    }
  }

  /** Per-frame advance while running (or on a redraw). Default: tick the sim
   * `ticks` steps and re-render the view. A derive system (the terrain view)
   * overrides this to advance its own clock instead of ticking layers. */
  protected advance(ticks: number): void {
    this.encodeFrame(ticks);
  }

  /** Whether the mounted system is an on-demand derivation (no per-tick sim). */
  protected isDeriveSystem(): boolean {
    return !!this.compiled?.system.derive;
  }

  private encodeFrame(ticks: number): void {
    if (!this.kernel || !this.compiled) return;
    this.inFlight = true;
    const frame = this.kernel.beginFrame();
    for (let t = 0; t < ticks; t += 1) {
      this.compiled.runTick(this.kernel, frame);
    }
    if (this.shouldRenderSimView()) this.compiled.runView(frame, this.view);
    frame
      .finish()
      .then((result) => {
        this.gpuMs = result.gpuMs;
        this.tickReadout += ticks;
      })
      .catch((error: unknown) => {
        this.status = (error as Error).message;
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  /** Public single-step (Step button / external step). */
  step(ticks = 1): void {
    this.encodeFrame(ticks);
  }

  // Turbo: GPU-bound batches back to back, paced by completion; adapts the
  // batch toward TURBO_TARGET_MS so presents/pause/brushes stay responsive.
  private async pump(): Promise<void> {
    if (this.pumpActive) return;
    this.pumpActive = true;
    try {
      while (this.turbo && this.running && this.kernel && this.compiled) {
        const kernel = this.kernel;
        const compiled = this.compiled;
        const batch = this.turboBatch;
        const frame = kernel.beginFrame();
        for (let t = 0; t < batch; t += 1) compiled.runTick(kernel, frame);
        const now = performance.now();
        if (now - this.lastPresent > 16 && this.shouldRenderSimView()) {
          compiled.runView(frame, this.view);
          this.lastPresent = now;
        }
        const result = await frame.finish();
        if (this.kernel !== kernel) break;
        this.tickReadout += batch;
        this.ticksPerSec = Math.round((batch / result.gpuMs) * 1000);
        this.gpuMs = result.gpuMs;
        const ideal = (batch * TURBO_TARGET_MS) / Math.max(0.5, result.gpuMs);
        this.turboBatch = Math.round(
          Math.min(1024, Math.max(1, batch * 0.5 + ideal * 0.5)),
        );
      }
    } catch (error) {
      this.status = (error as Error).message;
    } finally {
      this.pumpActive = false;
    }
  }

  private async readScalars(): Promise<void> {
    if (!this.kernel || !this.compiled || this.inFlight) return;
    if (this.compiled.scalarNames.length === 0) return;
    try {
      const data = await this.kernel.readBuffer("S");
      const decoded = this.compiled.decodeScalars(data);
      this.scalarReadout = decoded.values;
      this.tickReadout = decoded.tick;
    } catch {
      // Torn down mid-read; ignore.
    }
  }

  // --- shared controls --------------------------------------------------------

  protected toggleRunning(): void {
    this.running = !this.running;
    this.accumulator = 0;
    if (this.running && this.turbo) void this.pump();
  }

  protected setTurbo(on: boolean): void {
    this.turbo = on;
    this.accumulator = 0;
    if (this.running && this.turbo) void this.pump();
  }

  protected updateParam(name: string, value: number): void {
    this.paramValues = { ...this.paramValues, [name]: value };
    if (this.kernel && this.compiled) {
      this.kernel.writeUniform(
        "P",
        this.compiled.writeParams(this.paramValues, this.seed),
      );
      this.needsRedraw = true;
    }
  }

  /** Stamp a declared brush at map-tile coords — the base brush pass. */
  protected stampBrush(brush: string, x: number, y: number): void {
    if (!this.kernel || !this.compiled || brush === "") return;
    this.kernel.writeUniform("B", this.compiled.encodeBrush(brush, x, y));
    const frame = this.kernel.beginFrame();
    frame.pass(this.compiled.brushPass(brush));
    if (!this.running && this.shouldRenderSimView()) {
      this.compiled.runView(frame, this.view);
      this.needsRedraw = true;
    }
    void frame.finish();
  }

  /**
   * A tile gesture (pointer at map-tile coords). Routes to the system's `input`
   * hook if declared (which stamps brushes / writes player intents), else falls
   * back to stamping the active brush. Returns true when it did something —
   * callers (the camera shell) pan only when it returns false.
   */
  protected onTileGesture(x: number, y: number, event: PointerEvent): boolean {
    const input = this.compiled?.system.input;
    if (input?.onTile) {
      const consumed = input.onTile(this.inputContext(), x, y, event);
      this.flushPlayers();
      return consumed !== false;
    }
    if (this.brush !== "") {
      this.stampBrush(this.brush, x, y);
      return true;
    }
    return false;
  }

  /** Route a key event to the system's `input.onKey`; returns true if consumed. */
  protected onKeyGesture(event: KeyboardEvent): boolean {
    const input = this.compiled?.system.input;
    if (!input?.onKey) return false;
    const consumed = input.onKey(this.inputContext(), event);
    this.flushPlayers();
    return consumed !== false;
  }

  /** Convenience for the blit lab: map a pointer event to a tile gesture. */
  protected stamp(event: PointerEvent): void {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.mapWidth;
    const y = ((event.clientY - rect.top) / rect.height) * this.mapHeight;
    this.onTileGesture(x, y, event);
  }
}
