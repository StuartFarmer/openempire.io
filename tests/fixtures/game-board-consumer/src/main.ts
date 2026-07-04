import { createBoardDom } from "openfront-client/board";

const app = document.querySelector("#app");
if (!(app instanceof HTMLElement)) {
  throw new Error("missing app root");
}

const boardDom = createBoardDom(app);
boardDom.dispose();
