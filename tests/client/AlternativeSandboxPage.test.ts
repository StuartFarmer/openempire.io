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
});
