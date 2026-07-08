// Re-export the boundary contract type
export type { FrameData } from "../types";

// BoardRuntime bridge
export { BoardRuntimeFrameBridge } from "./BoardRuntimeFrameBridge";

// Upload
export type { RelationMatrixResult } from "./derive/RelationMatrix";
export { uploadFrameData } from "./Upload";
export type { FrameUploadTarget } from "./Upload";
