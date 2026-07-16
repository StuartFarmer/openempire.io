import type { FieldSystem } from "../../webgpu/FieldDynamics";
import { grazing } from "./grazing";

// Registry consumed by the #lab page. Add a system here and it appears in
// the picker; edits hot-swap into a running lab with field state preserved.
export const LAB_SYSTEMS: readonly FieldSystem[] = [grazing];
