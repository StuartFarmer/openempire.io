import { render } from "lit";
import { expect, test } from "vitest";
import { PlayPage } from "../src/client/components/PlayPage";
import { translateText } from "../src/client/Utils";

test("copied homepage links to demos within its application base", () => {
  const container = document.createElement("div");
  render(new PlayPage().render(), container);
  expect(container.querySelector("a[data-demos]")?.getAttribute("href")).toBe(
    "/demos/",
  );
  expect(container.querySelector("button")?.textContent).toContain(
    translateText("play_page.start_game"),
  );
});
