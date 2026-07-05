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
});
