import { describe, expect, test } from "vitest";
import "../../src/client/AlternativeSandboxPage";

describe("alternative-sandbox-page", () => {
  test("renders the sandbox element", async () => {
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.querySelector("canvas")).toBeTruthy();
    expect(el.textContent).toContain("Alternative Sandbox");

    el.remove();
  });

  test("reset replaces the generated map", async () => {
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    const before = el.map;
    el.querySelectorAll("button")[1].click();
    await el.updateComplete;

    expect(el.map).not.toBe(before);

    el.remove();
  });

  test("clicking the board places the first owned tile", async () => {
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    const canvas = el.querySelector("canvas")!;
    const landRef = el.map.terrain.findIndex(
      (tile: number) => (tile & 0x80) !== 0,
    );
    const landX = landRef % el.map.width;
    const landY = Math.floor(landRef / el.map.width);
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 640,
        height: 640,
        right: 640,
        bottom: 640,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    canvas.dispatchEvent(
      new MouseEvent("click", {
        clientX: ((landX + 0.5) / el.map.width) * 640,
        clientY: ((landY + 0.5) / el.map.height) * 640,
        bubbles: true,
      }),
    );
    await el.updateComplete;

    expect(el.textContent).toContain("Owned tiles: 1");

    el.remove();
  });
});
