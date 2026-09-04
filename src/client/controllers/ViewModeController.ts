/**
 * ViewModeController — forwards map view-mode toggles to the WebGL view.
 *
 * - AlternateViewEvent: space-hold (and the settings-modal toggle) drives the
 *   affiliation recolor + grid overlay + hides names.
 * - ToggleCoordinateGridEvent: persistent coordinate-grid toggle (M keybind);
 *   grid shows but names stay visible.
 */

import { EventBus } from "../../core/EventBus";
import { Controller } from "../Controller";
import {
  AlternateViewEvent,
  ToggleCoordinateGridEvent,
  ToggleFertilityOverlayEvent,
} from "../InputHandler";
import { MapRenderer } from "../render/gl";

export class ViewModeController implements Controller {
  constructor(
    private eventBus: EventBus,
    private view: MapRenderer,
  ) {}

  init() {
    this.eventBus.on(AlternateViewEvent, (e) =>
      this.view.setAltView(e.alternateView),
    );
    this.eventBus.on(ToggleCoordinateGridEvent, (e) =>
      this.view.setGridView(e.enabled),
    );
    // Baked soil tints (fertility/suitability; cycled from the BuildBar).
    this.eventBus.on(ToggleFertilityOverlayEvent, (e) =>
      this.view.setSoilOverlay(e.mode),
    );
  }
}
