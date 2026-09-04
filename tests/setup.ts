// Add global mocks or configuration here if needed
import "vitest-canvas-mock";

const storageFrame = document.createElement("iframe");
document.body.append(storageFrame);
const storage = storageFrame.contentWindow?.localStorage;
storageFrame.remove();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});
