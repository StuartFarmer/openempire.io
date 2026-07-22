import { defineFieldSystem } from "../../../webgpu/FieldDynamics";

// OpenFront (live) — the REAL CPU simulation rendered over the GPU terrain
// (bridge-core-sim-to-shell). This "system" carries no game rules: it is a
// thin render conduit. The shell runs an actual `GameRunner` in-process, ticks
// it, and uploads its per-tile ownership into the `owner` field each frame; the
// `openfront` overlay washes each player's colour over the rendered terrain.
// CPU simulates (the game), GPU renders (the world) — the standard split.
export const openfront = defineFieldSystem({
  id: "openfront",
  name: "OpenFront (live)",
  description: "The real CPU simulation, rendered over the terrain world.",
  kind: "game",
  // The sim ticks on the main thread here (no worker); a moderate map keeps it
  // responsive. Larger maps still work, just slower per tick.
  defaultMap: "Verdantia",
  defaultView: "openfront",

  // A single legibility toggle: flip `supplyOverlay` to 1 to swap the normal
  // territory view for the human's front→core supply-quality heatmap, so the
  // logistics field that governs war attrition stops being invisible.
  params: {
    supplyOverlay: { value: 0, min: 0, max: 1, step: 1 },
    // How hard everything that is not yours is pushed toward black. 0 shows
    // the whole world at full brightness (no mask); 1 is nearly opaque.
    maskDarkness: { value: 0.62, min: 0, max: 1, step: 0.02 },
    // How much DARKER a foreign nation's border is than the mask around it,
    // so you can still read where countries begin and end. Kept low on
    // purpose: at high values the outlines go solid black and read as ink
    // drawn ON the map rather than as a hint through it.
    maskBorderBoost: { value: 0.1, min: 0, max: 1, step: 0.02 },
    // 0..1 fade driven by the page: 0 before you settle (the whole world is
    // visible while you choose a spawn), easing to 1 once you have land.
    maskFade: { value: 0, min: 0, max: 1, step: 0.01, hidden: true },
    // How far YOUR OWN land dips while you are inspecting someone else, so the
    // eye settles on the country you are looking into rather than on home.
    ownFocusDim: { value: 0.3, min: 0, max: 1, step: 0.02 },
    // smallID of the nation under the cursor (0 = none). Page-driven.
    hoveredPlayer: { value: 0, min: 0, max: 255, step: 1, hidden: true },
  },

  // Per-player palette slots (WebGL-parity colors): the page computes each
  // player's EXACT theme colors (ThemeProvider territory/border) as it
  // learns of them and writes packed 0xRRGGBB values here — the view then
  // renders the same fills/borders as the game's TerritoryPass. Slot 0
  // (neutral) stays zero; a zero fill falls back to the hue-hash palette.
  // Framework cap is 256 slots; smallIDs beyond keep the hue-hash fallback.
  players: {
    count: 256,
    // `mine` marks the human's own slot, so the view can darken everything
    // that is not theirs without the shader needing to know a player id.
    fields: { fill: "u32", border: "u32", mine: "u32" },
  },

  views: {
    openfront: { source: "views/openfront.wesl" },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
