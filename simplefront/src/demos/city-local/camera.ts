import { clamp } from "./config";

export interface MapCamera {
  x: number;
  y: number;
  zoom: number;
}
export function zoomCamera(
  camera: MapCamera,
  zoom: number,
  width: number,
): MapCamera {
  zoom = clamp(zoom, 1, 12);
  const half = width / (2 * zoom);
  return {
    x: clamp(camera.x, half, width - half),
    y: clamp(camera.y, half, width - half),
    zoom,
  };
}
export function mapPoint(
  x: number,
  y: number,
  camera: MapCamera,
  width: number,
) {
  return {
    x: camera.x + ((x - 0.5) * width) / camera.zoom,
    y: camera.y + ((y - 0.5) * width) / camera.zoom,
  };
}
