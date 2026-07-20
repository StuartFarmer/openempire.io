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
