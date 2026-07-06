import type { BoardMap } from "../../core/game/BoardMap";

export function withTerrainColorSidecar(
  map: BoardMap,
  colors: Uint8Array | undefined,
): BoardMap {
  const expected = map.width * map.height * 4;
  if (!colors || colors.length !== expected) {
    return map;
  }
  return {
    ...map,
    colorizer: () => colors,
  };
}

export async function loadTerrainColorSidecar(
  path: string | undefined,
  width: number,
  height: number,
): Promise<Uint8Array | undefined> {
  if (!path) return undefined;

  try {
    const response = await fetch(path);
    if (response.status === 404) return undefined;
    if (!response.ok) return undefined;

    const bitmap = await createImageBitmap(await response.blob());
    if (bitmap.width !== width || bitmap.height !== height) {
      bitmap.close();
      return undefined;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return undefined;
    }

    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Uint8Array(context.getImageData(0, 0, width, height).data);
  } catch {
    return undefined;
  }
}
