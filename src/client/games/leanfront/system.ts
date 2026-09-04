import { defineFieldSystem } from "../../webgpu/FieldDynamics";
import liveGameView from "../shared/live-game.wesl?raw";

// LeanFront — a FORK of the `openfront` system, selectable alongside it in the
// shell picker so mechanics can be simplified here without disturbing the
// reference game. Today it is a faithful clone: the same live CPU simulation
// (one `ShellSim` worker), the same maps, the same conduits and the same
// overlay shader — the two entries render identically. The point is the seam,
// not a difference: this folder's layers are LeanFront's own copies, free to
// diverge, while the shell treats any registered live game generically.
//
// Divergence guide:
//   • rendering / legibility → this folder's wesl + `params` below;
//   • actual game RULES (src/core) → an OpenSpec change, per CLAUDE.md; a
//     ruleset flag would ride along on the worker's `init` message.
export const leanfront = defineFieldSystem({
  id: "leanfront",
  name: "LeanFront (live)",
  description: "OpenFront's rules with a simpler surface — the fork to trim.",
  kind: "game",
  // Same map set as OpenFront (every baked map stays in the map picker); this
  // is only the map selecting the game switches to.
  defaultMap: "Verdantia",
  defaultView: "leanfront",

  // Cloned verbatim from `openfront`. The page writes `maskFade`,
  // `hoveredPlayer` and `ambientView` by name, so those three must survive any
  // trimming here; the rest are free.
  params: {
    supplyOverlay: { value: 0, min: 0, max: 1, step: 1 },
    maskDarkness: { value: 0.62, min: 0, max: 1, step: 0.02 },
    maskBorderBoost: { value: 0.1, min: 0, max: 1, step: 0.02 },
    maskFade: { value: 0, min: 0, max: 1, step: 0.01, hidden: true },
    ownFocusDim: { value: 0.3, min: 0, max: 1, step: 0.02 },
    hoveredPlayer: { value: 0, min: 0, max: 255, step: 1, hidden: true },
    ambientView: { value: 0, min: 0, max: 1, step: 1, hidden: true },
  },

  players: {
    count: 256,
    fields: { fill: "u32", border: "u32", mine: "u32" },
  },

  views: {
    leanfront: { source: liveGameView },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
