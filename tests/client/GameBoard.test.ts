import { describe, expect, test } from "vitest";
import { createBoardDom } from "../../src/client/board/GameBoard";

describe("createBoardDom", () => {
  test("attaches and disposes board-owned DOM nodes within the provided container", () => {
    const container = document.createElement("div");

    const dom = createBoardDom(container);

    expect(dom.inputOverlay.parentElement).toBe(container);
    expect(dom.glCanvas.parentElement).toBe(container);

    dom.dispose();

    expect(container.children).toHaveLength(0);
  });
});
