/**
 * TerrainPass — renders the terrain map as a textured quad.
 *
 * The base texture is the baked terrain-colors sidecar (via the board
 * colorizer); per-tile updates flow through applyTerrainDelta() so
 * water-nuke conversions (land → water) are reflected live via the
 * procedural mutation encoder. Vertex shader transforms the map quad by the camera mat3; fragment
 * shader samples the RGBA8 terrain texture with nearest-neighbour filtering
 * so each terrain cell stays pixel-crisp at every zoom level.
 */

import type { BoardMap } from "../../../../core/game/BoardMap";
import terrainFragSrc from "../shaders/terrain/terrain.frag.glsl?raw";
import terrainVertSrc from "../shaders/terrain/terrain.vert.glsl?raw";
import {
  buildBoardMapTerrainRGBA,
  encodeTerrainTile,
  TerrainColorOverrides,
} from "../utils/ColorUtils";
import {
  createMapQuad,
  createProgram,
  createTexture2D,
  shaderSrc,
} from "../utils/GlUtils";

// ---------------------------------------------------------------------------
// TerrainPass
// ---------------------------------------------------------------------------

export class TerrainPass {
  private program: WebGLProgram;
  private tex: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private uCamera: WebGLUniformLocation;
  private mapW: number;
  private mapH: number;
  // Mutation palette: colors for tiles whose terrain CHANGES at runtime
  // (water nukes; future land modification). The base texture always comes
  // from the baked sidecar via the board colorizer.
  private terrainColors: TerrainColorOverrides | undefined;
  // Tiles mutated since load (ref → new terrain byte), so palette changes
  // can re-encode exactly these without touching the baked base.
  private readonly mutatedTiles = new Map<number, number>();
  // Scratch buffer for 1×1 sub-uploads; reused across applyTerrainDelta calls.
  private readonly pixelScratch = new Uint8Array(4);

  constructor(
    private gl: WebGL2RenderingContext,
    private terrainBytes: Uint8Array,
    mapW: number,
    mapH: number,
    terrainColors: TerrainColorOverrides | undefined,
    private boardMap: BoardMap,
  ) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.terrainColors = terrainColors;
    this.program = createProgram(
      gl,
      shaderSrc(terrainVertSrc, { MAP_W: mapW, MAP_H: mapH }),
      terrainFragSrc,
    );
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;

    this.tex = createTexture2D(gl, {
      width: mapW,
      height: mapH,
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      data: buildBoardMapTerrainRGBA(this.boardMap),
      filter: gl.NEAREST, // pixel-crisp at all zoom levels
    });

    this.vao = createMapQuad(gl, mapW, mapH);
  }

  /**
   * The base terrain color texture (RGBA8, one texel per tile). Shared with
   * PlotPass, which derives farmland's tilled-earth colors from the tile's
   * own terrain color so districts blend with the local biome.
   */
  texture(): WebGLTexture {
    return this.tex;
  }

  /**
   * Replace the mutation palette. The baked base texture is untouched —
   * only tiles whose terrain has changed at runtime are re-encoded.
   */
  setTerrainColors(terrainColors?: TerrainColorOverrides): void {
    this.terrainColors = terrainColors;
    for (const [ref, byte] of this.mutatedTiles) {
      this.encodeAndUploadTile(ref, byte);
    }
  }

  private encodeAndUploadTile(ref: number, byte: number): void {
    const gl = this.gl;
    const x = ref % this.mapW;
    const y = (ref - x) / this.mapW;
    encodeTerrainTile(byte, this.pixelScratch, 0, this.terrainColors);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      x,
      y,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.pixelScratch,
    );
  }

  /**
   * Update a subset of terrain tiles in-place (e.g. land→water from a water
   * nuke). `bytes[i]` is the new terrain byte for `refs[i]` (parallel arrays).
   * One 1×1 texSubImage2D per ref — fine for the small bursts a single nuke
   * produces.
   *
   * Also writes back into `terrainBytes` so a later full re-upload (e.g.
   * setTerrainColor) reflects these conversions instead of reverting them.
   */
  applyTerrainDelta(refs: readonly number[], bytes: Uint8Array): void {
    if (refs.length === 0) return;
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      this.terrainBytes[ref] = bytes[i];
      this.mutatedTiles.set(ref, bytes[i]);
      this.encodeAndUploadTile(ref, bytes[i]);
    }
  }

  /** Render the terrain. Call with depth test disabled, no blending. */
  draw(cameraMatrix: Float32Array): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.tex);
    // VAO + buffer leak is acceptable on dispose (context is being destroyed)
  }
}
