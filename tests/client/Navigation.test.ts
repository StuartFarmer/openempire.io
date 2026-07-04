import { afterEach, describe, expect, test } from "vitest";
import { initNavigation } from "../../src/client/Navigation";

describe("initNavigation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/");
  });

  test("opens the alternative sandbox page for #alternative", () => {
    document.body.innerHTML = `
      <div id="page-play"></div>
      <alternative-sandbox-page id="page-alternative-sandbox" class="hidden page-content"></alternative-sandbox-page>
    `;
    history.replaceState(null, "", "/#alternative");

    initNavigation();

    expect(
      document.getElementById("page-play")?.classList.contains("hidden"),
    ).toBe(true);
    expect(
      document
        .getElementById("page-alternative-sandbox")
        ?.classList.contains("hidden"),
    ).toBe(false);
  });

  test("opens the alternative sandbox page when hash changes to #alternative", () => {
    document.body.innerHTML = `
      <div id="page-play"></div>
      <alternative-sandbox-page id="page-alternative-sandbox" class="hidden page-content"></alternative-sandbox-page>
    `;

    initNavigation();
    history.replaceState(null, "", "/#alternative");
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(
      document.getElementById("page-play")?.classList.contains("hidden"),
    ).toBe(true);
    expect(
      document
        .getElementById("page-alternative-sandbox")
        ?.classList.contains("hidden"),
    ).toBe(false);
  });
});
