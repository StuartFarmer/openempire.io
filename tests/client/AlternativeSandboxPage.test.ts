import { afterEach, describe, expect, test, vi } from "vitest";
import "../../src/client/AlternativeSandboxPage";

describe("alternative-sandbox-page", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  test("renders the sandbox element", async () => {
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.querySelector("canvas")).toBeTruthy();
    expect(el.textContent).toContain("Alternative Sandbox");
  });

  test("reset replaces the generated map", async () => {
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    const before = el.map;
    el.querySelectorAll("button")[1].click();
    await el.updateComplete;

    expect(el.map).not.toBe(before);
  });

  test("clicking the board places the first owned tile", async () => {
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    clickTile(el, firstLand(el.map.terrain));
    await el.updateComplete;

    expect(el.textContent).toContain("Owned tiles: 1");
  });

  test("initial settlement starts food production display", async () => {
    vi.useFakeTimers();
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    clickTile(el, firstLand(el.map.terrain));
    await vi.advanceTimersByTimeAsync(100);
    await el.updateComplete;

    expect(el.textContent).toContain("Food:");
    expect(el.textContent).toContain("Food/tick:");
    expect(el.textContent).toContain("Settlements: 1");
  });

  test("tuning panel updates runtime knobs", async () => {
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.textContent).toContain("Tuning");
    const input = el.querySelector(
      'input[name="baseMoveWork"]',
    ) as HTMLInputElement;
    input.value = "120";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await el.updateComplete;

    expect(el.runtime.globals["alternative.tuning"].baseMoveWork).toBe(120);
  });

  test("clicking to expand starts a timer that grows owned tiles", async () => {
    vi.useFakeTimers();
    const el = document.createElement("alternative-sandbox-page") as any;

    document.body.appendChild(el);
    await el.updateComplete;

    const start = firstLand(el.map.terrain);
    clickTile(el, start);
    await vi.advanceTimersByTimeAsync(400);
    await el.updateComplete;

    clickTile(el, nearestNeutralLand(el.map, start));
    await el.updateComplete;

    expect(el.textContent).toContain("Move work:");

    await vi.advanceTimersByTimeAsync(1000);
    await el.updateComplete;

    expect(countOwned(el.map.state)).toBeGreaterThan(1);
  });
});

function clickTile(el: any, ref: number): void {
  const canvas = el.querySelector("canvas")!;
  const x = ref % el.map.width;
  const y = Math.floor(ref / el.map.width);
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
      clientX: ((x + 0.5) / el.map.width) * 640,
      clientY: ((y + 0.5) / el.map.height) * 640,
      bubbles: true,
    }),
  );
}

function countOwned(state: Uint16Array): number {
  let count = 0;
  for (const tileState of state) {
    if ((tileState & 0x0fff) !== 0) count++;
  }
  return count;
}

function firstLand(terrain: Uint8Array): number {
  const ref = terrain.findIndex((tile) => (tile & 0x80) !== 0);
  if (ref < 0) throw new Error("missing land tile");
  return ref;
}

function nearestNeutralLand(
  map: {
    width: number;
    height: number;
    terrain: Uint8Array;
    state: Uint16Array;
  },
  start: number,
): number {
  const startX = start % map.width;
  const startY = Math.floor(start / map.width);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let ref = 0; ref < map.terrain.length; ref++) {
    if (ref === start || (map.terrain[ref] & 0x80) === 0) continue;
    if ((map.state[ref] & 0x0fff) !== 0) continue;
    const x = ref % map.width;
    const y = Math.floor(ref / map.width);
    const distance = Math.abs(x - startX) + Math.abs(y - startY);
    if (distance < bestDistance) {
      best = ref;
      bestDistance = distance;
    }
  }
  if (best < 0) throw new Error("missing neutral land tile");
  return best;
}
