import type { FieldSystem } from "../../webgpu/FieldDynamics";
import { empire } from "./empire/system";
import { grazing } from "./grazing/system";
import { settlement } from "./settlement/system";
import { territory } from "./territory/system";
import { world } from "./world/system";

// Registry consumed by the #lab page (and the shell, which runs `world` as
// its resident sim). Add a system folder (manifest + layers/*.wesl) and
// register it here; edits hot-swap into a running lab with field state
// preserved.
export const LAB_SYSTEMS: readonly FieldSystem[] = [
  world,
  settlement,
  empire,
  grazing,
  territory,
];
