import type { BoardMap } from "../../core/game/BoardMap";

/**
 * Attach the baked terrain colors as the board's colorizer. The sidecar is
 * mandatory — there is exactly one shading path — so a missing or
 * wrong-sized color buffer is an error, never a silent fallback.
 */
export function withTerrainColorSidecar(
  map: BoardMap,
  colors: Uint8Array,
): BoardMap {
  const expected = map.width * map.height * 4;
  if (colors.length !== expected) {
    throw new Error(
      `terrain color sidecar has ${colors.length} bytes, expected ${expected} (${map.width}x${map.height} RGBA)`,
    );
  }
  return {
    ...map,
    colorizer: () => colors,
  };
}

export async function loadTerrainColorSidecar(
  path: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(
      `failed to load terrain color sidecar ${path}: ${response.status} ${response.statusText}`,
    );
  }

  const bitmap = await createImageBitmap(await response.blob());
  if (bitmap.width !== width || bitmap.height !== height) {
    const dims = `${bitmap.width}x${bitmap.height}`;
    bitmap.close();
    throw new Error(
      `terrain color sidecar ${path} is ${dims}, expected ${width}x${height}`,
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("could not create 2d context to decode terrain colors");
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Uint8Array(context.getImageData(0, 0, width, height).data);
}
