import { html, LitElement, nothing } from "lit";
import { state } from "lit/decorators.js";
import { GameMapType } from "../../core/game/Game";
import type { MapData } from "../../core/game/GameMapLoader";
import { LAB_SYSTEMS } from "../lab/systems";
import { CameraRenderer, type CameraState } from "../shell/CameraRenderer";
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

// Shared machinery for the field viewer (unify-field-viewer / codify-game-
// systems): a LitElement base that owns the device + a pan/zoom CameraRenderer,
// the headless FieldKernel, the compiled system, the fixed-clock tick loop, and
// the shared input (drag-to-pan, wheel-zoom, tile hover, click-to-stamp/command,
// AI). A FieldKernel runs HEADLESS on `renderer.device`; the camera is pointed
// at the kernel's `outView`. `#shell` (GameShellPage) is the concrete viewer;
// it adds the terrain derivation, climate knobs, and a rich hover readout (via
// `hoverRows`).

// Fixed-clock death-spiral clamp: at most this many catch-up ticks per frame.
export const MAX_TICKS_PER_FRAME = 8;
// Turbo: adapt ticks-per-command-buffer toward this much GPU time per batch.
const TURBO_TARGET_MS = 25;
// Camera zoom clamp (framebuffer px per tile).
const MAX_SCALE = 32;
// Movement (framebuffer px, squared) beyond which a press is a drag/pan, not a
// click — the WebGL model: drag pans, a click that doesn't move acts.
const CLICK_DRAG_THRESHOLD_SQ = 6 * 6;

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
  /** Zoom readout (framebuffer px per tile), and the tile under the cursor. */
  @state() protected zoomReadout = 1;
  @state() protected hoverTile: { x: number; y: number } | null = null;
  /** Cursor position in client coords — for UI that follows the pointer. */
  protected hoverClient: { x: number; y: number } | null = null;

  protected systems: readonly FieldSystem[] = LAB_SYSTEMS;
  protected renderer: CameraRenderer | null = null;
  protected kernel: FieldKernel | null = null;
  protected compiled: CompiledFieldSystem | null = null;
  protected mapWidth = 0;
  protected mapHeight = 0;
  protected seed = 1337;

  // Shared pan/zoom camera — every page gets drag-to-pan, wheel-zoom, hover.
  protected camera: CameraState = { cx: 0, cy: 0, scale: 1 };
  protected pendingFit = false;
  /** Pointer tool: "pan" drags the camera, "brush" drags to stamp/command. */
  @state() protected tool: "pan" | "brush" = "pan";
  private dragging = false;
  private painting = false;
  private lastPointer = { x: 0, y: 0 };
  /** Press-point (framebuffer) + pressed tile + whether it became a drag —
   * used to tell a click (act) from a drag (pan). */
  private downPoint = { x: 0, y: 0 };
  private downTile = { x: 0, y: 0 };
  private moved = false;

  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  protected inFlight = false;
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
  /** Whether the sim's out texture should be shown this frame (subclass may
   * suppress it — e.g. the shell shows the derivation instead). Default: yes. */
  protected shouldRenderSimView(): boolean {
    return true;
  }
  /** Hook after a system mounts. Default: point the camera at the sim's out
   * texture and fit. The shell overrides for the terrain derivation. */
  protected async onSystemMounted(_mapData: MapData): Promise<void> {
    if (this.renderer && this.kernel?.outView) {
      this.renderer.setLiveTexture(
        this.kernel.outView,
        this.mapWidth,
        this.mapHeight,
      );
    }
    this.pendingFit = true;
  }

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
  protected async loadWorld(
    preserved?: Map<string, ArrayBuffer>,
  ): Promise<void> {
    const system = this.currentSystem();
    const canvas = this.querySelector<HTMLCanvasElement>(`#${this.canvasId()}`);
    if (!system || !canvas) return;
    this.running = false;
    this.status = "Loading…";
    try {
      this.renderer ??= await CameraRenderer.create(canvas);
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
      if (this.isDeriveSystem() && compiled.layerNames.length === 0) {
        // A PURE derivation (terrain-only, no game layers) owns its uniform +
        // inputs + run — the subclass drives it in onSystemMounted; no sim
        // init / generic P. A composed game (derive + layers) takes the sim
        // path below AND runs the derivation in onSystemMounted.
        await this.onSystemMounted(mapData);
        this.status = "";
        this.tickReadout = 0;
        this.scalarReadout = {};
        return;
      }
      kernel.writeUniform(
        "P",
        compiled.writeParams(this.paramValues, this.seed),
      );
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

  /** Present one frame under the shared pan/zoom camera. Every page gets this. */
  protected present(): void {
    const r = this.renderer;
    if (!r) return;
    r.syncSize();
    if (this.pendingFit && r.mapWidth > 0) {
      this.pendingFit = false;
      this.camera = {
        cx: this.mapWidth / 2,
        cy: this.mapHeight / 2,
        scale: r.fitScale() * 0.95,
      };
    }
    this.clampCamera();
    r.render(this.camera);
    const zoom = Math.round(this.camera.scale * 100) / 100;
    if (zoom !== this.zoomReadout) this.zoomReadout = zoom;
  }

  // --- shared pan / zoom / hover (all pages) ----------------------------------

  private framebufferPoint(event: PointerEvent | WheelEvent): {
    x: number;
    y: number;
  } {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  }

  private cursorToMap(event: PointerEvent): { x: number; y: number } {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const p = this.framebufferPoint(event);
    return {
      x: this.camera.cx + (p.x - canvas.width / 2) / this.camera.scale,
      y: this.camera.cy + (p.y - canvas.height / 2) / this.camera.scale,
    };
  }

  private clampCamera(): void {
    const r = this.renderer;
    if (!r || r.mapWidth === 0) return;
    const minScale = r.fitScale() * 0.5;
    this.camera.scale = Math.min(
      MAX_SCALE,
      Math.max(minScale, this.camera.scale),
    );
    this.camera.cx = Math.min(r.mapWidth, Math.max(0, this.camera.cx));
    this.camera.cy = Math.min(r.mapHeight, Math.max(0, this.camera.cy));
  }

  /** Systems that PAINT tiles continuously (declared brushes) — these get the
   * Pan/Brush tool toggle, and dragging in the brush tool paints. */
  protected hasBrushPainting(): boolean {
    return (this.compiled?.brushNames.length ?? 0) > 0;
  }

  /** Systems that act on a DISCRETE click (spawn/attack/build/command). These
   * need no tool: dragging pans, a click (no drag) fires onTileGesture.
   * Subclasses override (the shell adds OpenFront-live). */
  protected hasClickAction(): boolean {
    return !!this.compiled?.system.input?.onTile;
  }

  /** Back-compat: "the map has a tile interaction of some kind." */
  protected canBrush(): boolean {
    return this.hasBrushPainting() || this.hasClickAction();
  }

  /** Painting mode: a brush-painting system with the brush tool selected. */
  private paintTool(): boolean {
    return this.hasBrushPainting() && this.tool === "brush";
  }

  protected onPointerDown = (event: PointerEvent): void => {
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(
      event.pointerId,
    );
    this.lastPointer = this.framebufferPoint(event);
    // Brush-painting systems (in the brush tool) paint on drag.
    if (this.paintTool()) {
      this.onStrokeStart();
      this.painting = true;
      const { x, y } = this.cursorToMap(event);
      this.onTileGesture(Math.floor(x), Math.floor(y), event);
      return;
    }
    // Otherwise: drag always pans; a click that doesn't drag acts (WebGL model).
    this.dragging = true;
    this.moved = false;
    this.downPoint = this.lastPointer;
    const { x, y } = this.cursorToMap(event);
    this.downTile = { x: Math.floor(x), y: Math.floor(y) };
  };

  protected onPointerMove = (event: PointerEvent): void => {
    this.updateHover(event);
    if (this.painting) {
      const { x, y } = this.cursorToMap(event);
      this.onTileGesture(Math.floor(x), Math.floor(y), event);
      return;
    }
    if (!this.dragging) return;
    const point = this.framebufferPoint(event);
    if (!this.moved) {
      const dx = point.x - this.downPoint.x;
      const dy = point.y - this.downPoint.y;
      if (dx * dx + dy * dy > CLICK_DRAG_THRESHOLD_SQ) this.moved = true;
    }
    this.camera.cx -= (point.x - this.lastPointer.x) / this.camera.scale;
    this.camera.cy -= (point.y - this.lastPointer.y) / this.camera.scale;
    this.lastPointer = point;
  };

  /** Called when a brush/act stroke begins (pointer down in brush tool).
   * Subclasses override to reset per-stroke state. */
  protected onStrokeStart(): void {}

  protected onPointerUp = (event: PointerEvent): void => {
    // A click that didn't turn into a drag → act on the pressed tile.
    if (
      this.dragging &&
      !this.moved &&
      !this.painting &&
      this.hasClickAction()
    ) {
      this.onStrokeStart();
      this.onTileGesture(this.downTile.x, this.downTile.y, event);
    }
    this.dragging = false;
    this.painting = false;
  };

  protected onPointerLeave = (): void => {
    this.hoverTile = null;
    this.hoverClient = null;
  };

  protected onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const r = this.renderer;
    if (!r) return;
    const point = this.framebufferPoint(event);
    const canvas = event.currentTarget as HTMLCanvasElement;
    const mapX =
      this.camera.cx + (point.x - canvas.width / 2) / this.camera.scale;
    const mapY =
      this.camera.cy + (point.y - canvas.height / 2) / this.camera.scale;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const minScale = r.fitScale() * 0.5;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(minScale, this.camera.scale * factor),
    );
    this.camera = {
      scale,
      cx: mapX - (point.x - canvas.width / 2) / scale,
      cy: mapY - (point.y - canvas.height / 2) / scale,
    };
  };

  private updateHover(event: PointerEvent): void {
    this.hoverClient = { x: event.clientX, y: event.clientY };
    const { x: mapX, y: mapY } = this.cursorToMap(event);
    const x = Math.floor(mapX);
    const y = Math.floor(mapY);
    if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight) {
      if (this.hoverTile !== null) this.hoverTile = null;
      this.hoverClient = null;
      return;
    }
    if (this.hoverTile?.x !== x || this.hoverTile?.y !== y) {
      this.hoverTile = { x, y };
    }
  }

  /** Rows for the hover readout. Generic default (tile + normalized position);
   * subclasses override for richer, domain-specific info. */
  protected hoverRows(x: number, y: number): [string, string][] {
    return [
      ["tile", `${x}, ${y}`],
      [
        "pos",
        `${(((x + 0.5) / this.mapWidth) * 100).toFixed(0)}%, ${(((y + 0.5) / this.mapHeight) * 100).toFixed(0)}%`,
      ],
    ];
  }

  /** The hover readout panel — used by every page's render(). */
  protected renderHover() {
    const tile = this.hoverTile;
    if (!tile) return nothing;
    return html`
      <div
        class="absolute bottom-3 left-3 text-xs text-white bg-black/70 backdrop-blur px-3 py-2 rounded font-mono leading-5 min-w-[12rem] pointer-events-none"
      >
        ${this.hoverRows(tile.x, tile.y).map(
          ([label, value]) => html`
            <div class="flex justify-between gap-4">
              <span class="text-white/50">${label}</span>
              <span class="text-white/90">${value}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

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
}
