import { clamp } from "./config";
import { GrowthModel } from "./model";
import { Terrain } from "./terrain";

export type Overlay =
  | "combined"
  | "elevation"
  | "suitability"
  | "density"
  | "candidates";
const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * clamp(t))).join(",")})`;
export function densityColour(maturity: number): string {
  return maturity < 0.45
    ? mix([199, 167, 98], [223, 123, 70], maturity / 0.45)
    : mix([223, 123, 70], [250, 239, 216], (maturity - 0.45) / 0.55);
}
export function drawMap(
  canvas: HTMLCanvasElement,
  terrain: Terrain,
  model: GrowthModel | null,
  overlay: Overlay,
  hover: number | null,
  brushRadius: number | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width,
    cell = size / terrain.width;
  const candidates =
    overlay === "candidates" && model
      ? new Map(model.candidates().map((c) => [c.tile, c]))
      : null;
  for (let i = 0; i < terrain.height.length; i++) {
    const x = (i % terrain.width) * cell,
      y = Math.floor(i / terrain.width) * cell,
      h = terrain.height[i];
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
          ctx.fillStyle = densityColour(info.maturity);
        else if (overlay === "density") ctx.fillStyle = "#25382f";
        const candidate = candidates?.get(i);
        if (candidate)
          ctx.fillStyle = candidate.kind === "expand" ? "#78c7af" : "#c496d8";
      }
    }
    ctx.fillRect(x, y, cell, cell);
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
    if (model?.capacity[i] && overlay === "combined") {
      const d = model.inspect(i).maturity;
      ctx.fillStyle = "rgba(42,45,38,.45)";
      const n = d > 0.7 ? 3 : d > 0.3 ? 2 : 1;
      for (let k = 0; k < n; k++)
        ctx.fillRect(x + 3 + k * 3, y + 3 + (k % 2) * 4, 2, d > 0.7 ? 6 : 3);
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
    ctx.fillStyle = "#13272a";
    ctx.strokeStyle = "#ffe5a6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffe5a6";
    ctx.font = `bold ${cell}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+", cx, cy);
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
}
export function drawChart(
  canvas: HTMLCanvasElement,
  model: GrowthModel | null,
  kind: "area" | "density",
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
  const series =
    kind === "area"
      ? [
          {
            colour: "#a9cab2",
            read: (v: (typeof values)[number]) => v.area / areaMax,
          },
        ]
      : [
          {
            colour: "#76d0c2",
            read: (v: (typeof values)[number]) =>
              v.capacity / model.config.ceiling,
          },
          {
            colour: "#e8b176",
            read: (v: (typeof values)[number]) =>
              v.meanDensity / model.config.urbanCapacity,
          },
        ];
  for (const s of series) {
    ctx.strokeStyle = s.colour;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = pad + ((w - pad * 2) * (v.seconds - start)) / (end - start),
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
