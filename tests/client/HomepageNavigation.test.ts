import { render } from "lit";
import { expect, test } from "vitest";
import { PlayPage } from "../../src/client/components/PlayPage";
import { translateText } from "../../src/client/Utils";

test("homepage exposes the separate demos gallery without replacing Start Game", () => {
  const page = new PlayPage();
  const container = document.createElement("div");
  render(page.render(), container);
  const demos = container.querySelector<HTMLAnchorElement>("a[data-demos]");
  expect(demos?.getAttribute("href")).toBe("/simplefront/demos/");
  expect(demos?.textContent).toContain(translateText("play_page.demos"));
  expect(container.querySelector("button")?.textContent).toContain(
    translateText("play_page.start_game"),
  );
});
