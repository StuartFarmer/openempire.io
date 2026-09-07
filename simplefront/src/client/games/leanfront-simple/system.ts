import { defineFieldSystem } from "../../webgpu/FieldDynamics";
import { openfront } from "../openfront/system";
import liveGameView from "../shared/live-game.wesl?raw";

// The CPU worker owns LeanFront Simple's simulation. This only supplies the
// same render conduit as OpenFront under a separate live-game identity.
export const leanfrontSimple = defineFieldSystem({
  id: "leanfront-simple",
  name: "LeanFront Simple (live)",
  description: "The CPU simulation rendered over the terrain world.",
  kind: "game",
  defaultMap: "Verdantia",
  defaultView: "leanfront-simple",
  params: openfront.params,
  players: openfront.players,
  views: { "leanfront-simple": { source: "views/livegame.wesl" } },
  modules: { ...openfront.modules, "views/livegame.wesl": liveGameView },
});
