// Desktop shell for the singleplayer game. Serves the `static/` build over a
// custom app:// scheme instead of file:// — the sim's Web Worker and the
// absolute /assets/... fetches need a real origin, which file:// can't give.
import { app, BrowserWindow, net, protocol, shell } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, "..", "static");
const SCHEME = "app";

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function resolveStaticFile(pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  const filePath = path.normalize(path.join(STATIC_DIR, rel));
  if (!filePath.startsWith(STATIC_DIR + path.sep)) return null;
  return filePath;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#0d1117",
    title: "OpenFront",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`${SCHEME}://game/index.html`);
  return win;
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, (request) => {
    let filePath = resolveStaticFile(new URL(request.url).pathname);
    if (filePath === null) return new Response("forbidden", { status: 403 });
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      // Extensionless paths are SPA routes (e.g. /game/<id> after a reload);
      // anything else is a genuinely missing asset and gets a real 404.
      if (path.extname(filePath) !== "") {
        return new Response("not found", { status: 404 });
      }
      filePath = path.join(STATIC_DIR, "index.html");
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
