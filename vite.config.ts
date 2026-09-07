import tailwindcss from "@tailwindcss/vite";
import { execSync } from "child_process";
import fs from "fs";
import { lookup as lookupMime } from "mrmime";
import path from "path";
import { fileURLToPath } from "url";
import { build, createServer, defineConfig, loadEnv, type Plugin } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { configDefaults } from "vitest/config";
import {
  type AssetManifest,
  buildAssetUrl,
  rewriteAssetsForCdn,
} from "./src/core/AssetUrls";
import {
  buildPublicAssetManifest,
  copyRootPublicFiles,
  createHashedPublicAssetFiles,
  getProprietaryDir,
  getResourcesDir,
  writePublicAssetManifest,
} from "./src/server/PublicAssetManifest";

// Vite already handles these, but its good practice to define them explicitly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname })
      .toString()
      .trim();
  } catch {
    return "LOCAL";
  }
}

// Serve/build the independent app without importing any of its gameplay code.
function simplefrontApp(): Plugin {
  const configFile = path.join(__dirname, "simplefront/vite.config.ts");
  let outDir: string;
  let building = false;
  return {
    name: "simplefront-app",
    enforce: "pre", // Route before the root HTML fallback rewrites requests.
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir, "simplefront");
      building = config.command === "build";
    },
    async configureServer(server) {
      if (!server.httpServer) return;
      const app = await createServer({
        configFile,
        base: "/simplefront/",
        server: { middlewareMode: true, hmr: { server: server.httpServer } },
      });
      server.middlewares.use((req, res, next) => {
        if (/^\/simplefront(?:\/|\?|$)/.test(req.url ?? "")) {
          app.middlewares(req, res, next);
        } else next();
      });
      server.httpServer?.once("close", () => void app.close());
    },
    async closeBundle() {
      if (building) {
        await build({ configFile, base: "/simplefront/", build: { outDir } });
      }
    },
  };
}

/**
 * Dev-only: serve the ingested Earth fields to the #earth tuning page.
 *
 * fields.bin is ~112 MB of raw float32 and lives OUTSIDE the repo (in the
 * world-maps sibling, or $WORLD_MAPS_DIR) precisely because it must never be
 * committed or bundled. This exposes it at /earth-data/* for localhost only.
 * Absent in production builds — the page is a dev tool, not a shipped feature.
 */
function serveEarthData(): Plugin {
  const root =
    process.env.WORLD_MAPS_DIR ??
    path.resolve(__dirname, "..", "world-maps", "derived");
  return {
    name: "serve-earth-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/earth-data/")) return next();

        // Enumerate the ingested datasets so the page can offer a picker
        // (global-2048x1024, global-4096x2048, spqr-2048x1024, ...).
        if (req.url === "/earth-data/index.json") {
          const dirs = fs.existsSync(root)
            ? fs
                .readdirSync(root, { withFileTypes: true })
                .filter(
                  (e) =>
                    e.isDirectory() &&
                    fs.existsSync(path.join(root, e.name, "fields.bin")),
                )
                .map((e) => e.name)
                .sort()
            : [];
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(dirs));
          return;
        }

        const rel = decodeURIComponent(
          new URL(req.url, "http://x").pathname,
        ).replace(/^\/earth-data\//, "");
        if (rel.includes("..")) return next();
        const filePath = path.join(root, rel);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.statusCode = 404;
          res.end(
            `no ingested field data at ${filePath}\n` +
              `run: map-generator/earth/.venv/bin/python map-generator/earth/ingest.py`,
          );
          return;
        }
        res.setHeader(
          "Content-Type",
          filePath.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
        );
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

function serveProprietaryDir(
  proprietaryDir: string,
  resourcesDir: string,
): Plugin {
  return {
    name: "serve-proprietary-dir",
    configureServer(server) {
      // Must run before Vite's htmlFallback; skip when resources/ has the file
      // so publicDir keeps precedence.
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const rel = decodeURIComponent(
          new URL(req.url, "http://x").pathname,
        ).replace(/^\//, "");
        if (rel.includes("..")) return next();
        if (fs.existsSync(path.join(resourcesDir, rel))) return next();
        const filePath = path.join(proprietaryDir, rel);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
          return next();
        const mime = lookupMime(filePath);
        if (mime) res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // "electron" is a production build for the desktop app: same hashed-asset
  // pipeline, but index.html's EJS placeholders are rendered at build time
  // (there is no request-time renderer in the .app) and no CDN rewrite.
  const isElectron = mode === "electron";
  const isProduction = mode === "production" || isElectron;
  const resourcesDir = getResourcesDir(__dirname);
  const proprietaryDir = getProprietaryDir(__dirname);
  const sourceDirs = [resourcesDir, proprietaryDir];
  const assetManifest: AssetManifest = isProduction
    ? buildPublicAssetManifest(sourceDirs)
    : {};
  // The sim worker is an inline Blob worker (WorkerClient), so its fetches
  // have no base URL — asset URLs must be absolute. In the .app the origin
  // is the app:// scheme served by electron/main.cjs.
  const cdnBase = isElectron ? "app://game" : (env.CDN_BASE ?? "");
  const htmlAssetData = {
    assetManifest: JSON.stringify(assetManifest),
    cdnBase: JSON.stringify(cdnBase),
    gameEnv: JSON.stringify(env.GAME_ENV ?? "dev"),
    numWorkers: JSON.stringify(parseInt(env.NUM_WORKERS ?? "2", 10)),
    instanceId: JSON.stringify(env.INSTANCE_ID ?? "DEV_ID"),
    manifestHref: buildAssetUrl("manifest.json", assetManifest, cdnBase),
    faviconHref: buildAssetUrl("images/Favicon.svg", assetManifest, cdnBase),
    gameplayScreenshotUrl: buildAssetUrl(
      "images/GameplayScreenshot.png",
      assetManifest,
      cdnBase,
    ),
    backgroundImageUrl: buildAssetUrl(
      "images/background.webp",
      assetManifest,
      cdnBase,
    ),
    desktopLogoImageUrl: buildAssetUrl(
      "images/OpenFront.png",
      assetManifest,
      cdnBase,
    ),
    mobileLogoImageUrl: buildAssetUrl("images/OF.png", assetManifest, cdnBase),
  };

  // Vite's HTML transform replaces the source <script src="/src/client/Main.ts">
  // with the hashed bundle URL and injects <link rel="modulepreload"> /
  // <link rel="stylesheet"> tags. rewriteAssetsForCdn rewrites those refs to
  // an EJS placeholder so RenderHtml.ts can prefix them with CDN_BASE at
  // request time.
  const injectCdnBaseTemplate = (): Plugin => ({
    name: "inject-cdn-base-template",
    apply: "build" as const,
    enforce: "post",
    transformIndexHtml: rewriteAssetsForCdn,
  });

  let viteBundleFiles: string[] = [];
  const syncHashedPublicAssets = (): Plugin => ({
    name: "sync-hashed-public-assets",
    apply: "build" as const,
    writeBundle(_options, bundle) {
      viteBundleFiles = Object.keys(bundle);
    },
    closeBundle() {
      const outDir = path.join(__dirname, "static");
      copyRootPublicFiles(resourcesDir, outDir);
      // Run the source→hashed copy first; createHashedPublicAssetFiles iterates
      // assetManifest and expects every key to resolve to a file in resources/
      // or proprietary/. Vite's bundle output (assets/...) doesn't, so it's
      // merged in after.
      createHashedPublicAssetFiles(sourceDirs, outDir, assetManifest);
      // Track Vite's own bundle output (vendor chunks, JS, CSS, workers under
      // static/assets/) in the manifest so the deploy-time R2 upload covers
      // them alongside the hashed source assets. Skip non-assets/ emits like
      // index.html — those are served by the app, not from R2.
      for (const fileName of viteBundleFiles) {
        if (!fileName.startsWith("assets/")) continue;
        assetManifest[fileName] = `/${fileName}`;
      }
      writePublicAssetManifest(outDir, assetManifest);
    },
  });

  return {
    test: {
      exclude: [...configDefaults.exclude, "simplefront/**"],
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
    root: "./",
    base: "/",
    publicDir: isProduction ? false : "resources",

    resolve: {
      tsconfigPaths: true,
      alias: {
        resources: path.resolve(__dirname, "resources"),
      },
    },

    plugins: [
      simplefrontApp(),
      ...(!isProduction
        ? [serveProprietaryDir(proprietaryDir, resourcesDir), serveEarthData()]
        : []),
      ...(isProduction && !isElectron
        ? []
        : [
            createHtmlPlugin({
              minify: false,
              // In electron builds index.html's own <script> entry is
              // processed by Vite; passing `entry` here too would inject it
              // twice.
              ...(isElectron ? {} : { entry: "/src/client/Main.ts" }),
              template: "index.html",
              inject: {
                data: {
                  gitCommit: JSON.stringify(isElectron ? gitCommit() : "DEV"),
                  ...htmlAssetData,
                },
              },
            }),
          ]),
      ...(isProduction && !isElectron ? [injectCdnBaseTemplate()] : []),
      ...(isProduction ? [syncHashedPublicAssets()] : []),
      tailwindcss(),
    ],

    define: {
      __ASSET_MANIFEST__: JSON.stringify(assetManifest),
      "process.env.GAME_ENV": JSON.stringify(isProduction ? "prod" : "dev"),
      // Add other process.env variables if needed, OR migrate code to import.meta.env
    },

    build: {
      outDir: "static", // Webpack outputs to 'static', assuming we want to keep this.
      emptyOutDir: true,
      assetsDir: "assets", // Sub-directory for assets
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            const vendorModules = ["howler", "zod"];
            if (vendorModules.some((module) => id.includes(module))) {
              return "vendor";
            }
          },
        },
      },
    },

    server: {
      port: 9000,
      host: process.env.VITE_HOST === "lan",
      // Automatically open the browser when the server starts
      open: process.env.SKIP_BROWSER_OPEN !== "true",
    },
  };
});
