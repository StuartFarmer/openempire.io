import { MapCamera } from "./camera";
import { clamp, levelCapacity } from "./config";
import { CityModel as GrowthModel } from "./model";
import { drawStreetTile } from "./street-render";
import { StreetLayout } from "./streets";
import { Terrain } from "./terrain";

export type Overlay =
  | "combined"
  | "streets"
  | "elevation"
  | "suitability"
  | "density"
  | "candidates";
const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * clamp(t))).join(",")})`;
export function levelColour(level: number): string {
  // Fixed categorical hues keep adjacent levels distinct, even at levels 1–3.
  // Never normalize to the current maximum: an existing level keeps its colour.
  const hue = Math.round((42 + (level - 1) * 137.508) % 360);
  return `hsl(${hue}, 65%, 70%)`;
}
export function drawMap(
  canvas: HTMLCanvasElement,
  terrain: Terrain,
  model: GrowthModel | null,
  overlay: Overlay,
  hover: number | null,
  brushRadius: number | null,
  view?: {
    camera: MapCamera;
    streets: StreetLayout | null;
    showLevels: boolean;
    ageLevels?: readonly number[];
  },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width,
    cell = size / terrain.width;
  ctx.save();
  if (view) {
    const { x, y, zoom } = view.camera;
    ctx.translate(size / 2 - x * cell * zoom, size / 2 - y * cell * zoom);
    ctx.scale(zoom, zoom);
  }
  const occupancy = model ? model.stats().occupancy : 0;
  const candidates =
    overlay === "candidates" && model
      ? new Map(model.candidates().map((c) => [c.tile, c]))
      : null;
  for (let i = 0; i < terrain.height.length; i++) {
    const x = (i % terrain.width) * cell,
      y = Math.floor(i / terrain.width) * cell,
      h = terrain.height[i];
    if (view) {
      const half = terrain.width / (2 * view.camera.zoom);
      if (
        (i % terrain.width) + 1 < view.camera.x - half ||
        i % terrain.width > view.camera.x + half ||
        Math.floor(i / terrain.width) + 1 < view.camera.y - half ||
        Math.floor(i / terrain.width) > view.camera.y + half
      )
        continue;
    }
    if (terrain.water[i]) ctx.fillStyle = mix([33, 72, 88], [75, 125, 136], h);
    else {
      const west = i % terrain.width ? terrain.height[i - 1] : h;
      const light = clamp(h * 0.75 + 0.18 + (west - h) * 2);
      ctx.fillStyle = mix([53, 80, 65], [185, 188, 153], light);
      if (overlay === "elevation")
        ctx.fillStyle = mix([34, 61, 63], [231, 216, 182], h);
      if (model) {
        const info = model.inspect(i);
        if (overlay === "suitability")
          ctx.fillStyle = mix(
            [98, 55, 45],
            [103, 192, 148],
            info.suitability / 2,
          );
        if (
          (overlay === "combined" ||
            overlay === "density" ||
            overlay === "candidates") &&
          info.capacity > 0
        )
          ctx.fillStyle = levelColour(info.level);
        else if (overlay === "density") ctx.fillStyle = "#25382f";
        const candidate = candidates?.get(i);
        if (candidate)
          ctx.fillStyle = candidate.kind === "expand" ? "#78c7af" : "#c496d8";
      }
    }
    ctx.fillRect(x, y, cell, cell);
    if (overlay === "streets" && view?.streets && model)
      drawStreetTile(ctx, view.streets, i, cell, occupancy, view.ageLevels);
    // Sparse contour boundaries make elevation legible without a 3D camera.
    if (
      !terrain.water[i] &&
      overlay !== "density" &&
      i % terrain.width &&
      Math.floor(h * 16) !== Math.floor(terrain.height[i - 1] * 16)
    ) {
      ctx.strokeStyle = "rgba(17,33,29,.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + cell);
      ctx.stroke();
    }
    if (model?.level(i) && (overlay !== "streets" || view?.showLevels)) {
      ctx.strokeStyle = "rgba(19,37,43,.25)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.25, y + 0.25, cell - 0.5, cell - 0.5);
      ctx.font = `bold ${cell * 0.7}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = String(model.level(i));
      // A light halo keeps dark numbers readable on terrain/candidate overlays.
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.strokeText(label, x + cell / 2, y + cell / 2, cell - 4);
      ctx.fillStyle = "#13252b";
      ctx.fillText(label, x + cell / 2, y + cell / 2, cell - 4);
    }
  }
  if (model) {
    const cx = ((model.centre % terrain.width) + 0.5) * cell,
      cy = (Math.floor(model.centre / terrain.width) + 0.5) * cell;
    ctx.strokeStyle = "rgba(246,235,208,.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, model.config.reach * cell, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Outline only: keep the centre's own level colour and number visible.
    ctx.strokeStyle = "#13252b";
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - cell / 2 + 1, cy - cell / 2 + 1, cell - 2, cell - 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - cell / 2 + 1, cy - cell / 2 + 1, cell - 2, cell - 2);
    if (model.pendingTile !== null) {
      const i = model.pendingTile;
      ctx.strokeStyle = "#f8de9d";
      ctx.strokeRect(
        (i % terrain.width) * cell + 1,
        Math.floor(i / terrain.width) * cell + 1,
        cell - 2,
        cell - 2,
      );
    }
  }
  if (hover !== null) {
    const x = ((hover % terrain.width) + 0.5) * cell,
      y = (Math.floor(hover / terrain.width) + 0.5) * cell;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    if (brushRadius !== null) {
      ctx.beginPath();
      ctx.arc(x, y, (brushRadius + 0.5) * cell, 0, Math.PI * 2);
      ctx.stroke();
    } else ctx.strokeRect(x - cell / 2, y - cell / 2, cell, cell);
  }
  ctx.restore();
}
export function drawChart(
  canvas: HTMLCanvasElement,
  model: GrowthModel | null,
  kind: "area" | "density" | "population",
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width,
    h = canvas.height,
    pad = 20;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#2b3d43";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const y = pad + ((h - pad * 2) * i) / 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }
  if (!model || model.history.length < 2) return;
  const values = model.history,
    start = values[0].seconds,
    end = values[values.length - 1].seconds;
  const areaMax = Math.max(1, ...values.map((v) => v.area));
  const housingMax = Math.max(1, ...values.map((v) => v.capacity));
  const series =
    kind === "area"
      ? [
          {
            colour: "#a9cab2",
            read: (v: (typeof values)[number]) => v.area / areaMax,
          },
        ]
      : kind === "population"
        ? [
            {
              colour: "#76d0c2",
              read: (v: (typeof values)[number]) => v.population / housingMax,
            },
            {
              colour: "#e8b176",
              read: (v: (typeof values)[number]) => v.capacity / housingMax,
            },
          ]
        : [
            {
              colour: "#76d0c2",
              read: (v: (typeof values)[number]) => v.capacity / housingMax,
            },
            {
              colour: "#e8b176",
              read: (v: (typeof values)[number]) =>
                v.meanDensity / levelCapacity(100, model.config),
            },
          ];
  for (const s of series) {
    ctx.strokeStyle = s.colour;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x =
          pad +
          ((w - pad * 2) * (v.seconds - start)) / Math.max(1, end - start),
        y = h - pad - (h - pad * 2) * clamp(s.read(v));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.fillStyle = "#95aaa9";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${Math.round(start)}s`, pad, h - 2);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(end)}s`, w - pad, h - 2);
}
