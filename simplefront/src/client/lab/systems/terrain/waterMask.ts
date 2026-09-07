// The terrain system's CPU prep: turn the shipped water classification
// (map.bin) plus decoded elevation into a per-tile sea/lake/land mask. This is
// the connected-components step the derivation can't do on the GPU — a body is
// sea when the map's ocean bit marks it OR it holds genuinely deep water; every
// other enclosed water body (the Great Lakes, ponds) is a lake. Moved here from
// TerrainDerivation (unify-field-viewer phase 3.2) so it lives with the system
// whose `prepare` hook runs it; TerrainDerivation re-exports it until phase 5.

/** The shipped water classification, one entry per tile. */
export const WATER_LAND = 0;
export const WATER_SEA = 1;
export const WATER_LAKE = 2;

/**
 * Build the per-tile water mask from map.bin + decoded elevation. Water
 * bodies are classified whole (connected components): a body is SEA when the
 * map's ocean bit (bit 5) says so anywhere in it, or when it holds genuinely
 * deep water (real bathymetry well below sea level — the Mediterranean and
 * the Caspian, which the baker's largest-body-only ocean rule misses);
 * shallow bodies (the Great Lakes, ponds) are lakes.
 */
export function buildWaterMask(
  terrain: Uint8Array,
  elevation: Float32Array,
  seaLevel: number,
  width: number,
  height: number,
): Uint32Array {
  const total = width * height;
  const mask = new Uint32Array(total);
  const deepCut = seaLevel * 0.75;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const body: number[] = [];
  for (let start = 0; start < total; start += 1) {
    if ((terrain[start] & 0x80) !== 0 || visited[start] === 1) continue;
    // BFS this water body, tracking whether anything marks it as sea.
    let head = 0;
    let tail = 0;
    let isSea = false;
    body.length = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++];
      body.push(cur);
      if ((terrain[cur] & 0x20) !== 0 || elevation[cur] < deepCut) {
        isSea = true;
      }
      const x = cur % width;
      const y = (cur / width) | 0;
      const neighbors = [
        x > 0 ? cur - 1 : -1,
        x < width - 1 ? cur + 1 : -1,
        y > 0 ? cur - width : -1,
        y < height - 1 ? cur + width : -1,
      ];
      for (const n of neighbors) {
        if (n < 0 || visited[n] === 1 || (terrain[n] & 0x80) !== 0) continue;
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    const value = isSea ? WATER_SEA : WATER_LAKE;
    for (const tile of body) mask[tile] = value;
  }
  return mask;
}
