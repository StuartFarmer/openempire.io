import { afterEach, describe, expect, test } from "vitest";
import { initNavigation } from "../../src/client/Navigation";

describe("initNavigation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/");
  });

  test("opens the generator page when hash changes to #generator", () => {
    document.body.innerHTML = `
      <div id="page-play"></div>
      <generator-page id="page-generator" class="hidden page-content"></generator-page>
    `;

    initNavigation();
    history.replaceState(null, "", "/#generator");
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(
      document.getElementById("page-play")?.classList.contains("hidden"),
    ).toBe(true);
    expect(
      document.getElementById("page-generator")?.classList.contains("hidden"),
    ).toBe(false);
  });

  test("opens the generator page for #generator", () => {
    document.body.innerHTML = `
      <div id="page-play"></div>
      <generator-page id="page-generator" class="hidden page-content"></generator-page>
    `;
    history.replaceState(null, "", "/#generator");

    initNavigation();

    expect(
      document.getElementById("page-play")?.classList.contains("hidden"),
    ).toBe(true);
    expect(
      document.getElementById("page-generator")?.classList.contains("hidden"),
    ).toBe(false);
  });
});
