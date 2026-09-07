// Warped multi-octave value noise → base elevation (port of the CPU engine's
// generateWorldEngineElevation).
import package::kernel::{GRID, clamp01, fbm};
import package::bindings::{P, elevation};

fn tile(x: i32, y: i32, i: u32) {
  let nx = f32(x) / f32(GRID.size.x);
  let ny = f32(y) / f32(GRID.size.y);
  let continentFrequency = 2.15 / P.continentScale;
  let broadFrequency = 0.92 / P.continentScale;
  let detailFrequency = 7.5 / P.continentScale;
  let warpFrequency = 1.1 / P.continentScale;
  let warpStrength = 0.34 * P.continentScale;
  let warpX = (fbm(P.seed + 501, nx, ny, warpFrequency, 3, 0.55) - 0.5) * warpStrength;
  let warpY = (fbm(P.seed + 907, nx, ny, warpFrequency, 3, 0.55) - 0.5) * warpStrength;
  let sx = nx + warpX;
  let sy = ny + warpY;
  let continent = fbm(P.seed + 11, sx, sy, continentFrequency, 5, 0.58);
  let broad = fbm(P.seed + 37, sx + 8.3, sy - 3.1, broadFrequency, 3, 0.55);
  let landform = continent * 0.74 + broad * 0.26;
  let ridgeBase = fbm(P.seed + 97, sx, sy, detailFrequency, 5, 0.48);
  let ridges = 1.0 - abs(ridgeBase * 2.0 - 1.0);
  let edgeDistance = min(min(nx, 1.0 - nx), min(ny, 1.0 - ny));
  let edgeWaterBias = pow(clamp01((0.1 - edgeDistance) / 0.1), 2.2) * P.coastFalloff * 0.24;
  let baseHeight = landform * 0.88
    + pow(ridges, 2.2) * P.mountainStrength * 0.48
    - edgeWaterBias
    - 0.14;
  let coastBand = pow(clamp01(1.0 - abs(baseHeight - P.seaLevel) / 0.2), 1.7);
  let shoreNoise =
    (fbm(P.seed + 1601, sx + 4.7, sy - 2.9, 18.0 / P.continentScale, 3, 0.56) - 0.5) * 0.7 +
    (fbm(P.seed + 2203, sx - 7.2, sy + 5.1, 42.0 / P.continentScale, 2, 0.5) - 0.5) * 0.3;
  let shoreDetail = shoreNoise * P.coastRoughness * coastBand * 0.14;
  elevation[i] = clamp01(baseHeight + shoreDetail);
}
