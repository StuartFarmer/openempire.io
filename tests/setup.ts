// Add global mocks or configuration here if needed
import "vitest-canvas-mock";

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: window._localStorage,
});
