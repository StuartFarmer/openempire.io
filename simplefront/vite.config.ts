import tailwindcss from "@tailwindcss/vite";
import { execSync } from "child_process";
import fs from "fs";
import { lookup as lookupMime } from "mrmime";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { type AssetManifest, buildAssetUrl } from "./src/core/AssetUrls";
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

function serveProprietaryDir(
  proprietaryDir: string,
  resourcesDir: string,
): Plugin {
  let base = "/";
  return {
    name: "serve-proprietary-dir",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      // Must run before Vite's htmlFallback; skip when resources/ has the file
      // so publicDir keeps precedence.
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const rel = decodeURIComponent(
          new URL(req.url, "http://x").pathname,
        ).slice(base.length);
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
  const env = loadEnv(mode, __dirname, "");
  const isProduction = mode === "production";
  const resourcesDir = getResourcesDir(__dirname);
  const proprietaryDir = getProprietaryDir(__dirname);
  const sourceDirs = [resourcesDir, proprietaryDir];
  const assetManifest: AssetManifest = isProduction
    ? buildPublicAssetManifest(sourceDirs)
    : {};
  // Inline workers receive absolute asset URLs from this app's bootstrap.
  const cdnBase = env.CDN_BASE ?? "";
  let outDir = path.join(__dirname, "static");
  const htmlAssetData = {
    gitCommit: JSON.stringify(isProduction ? gitCommit() : "DEV"),
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

  let viteBundleFiles: string[] = [];
  const syncHashedPublicAssets = (): Plugin => ({
    name: "sync-hashed-public-assets",
    apply: "build" as const,
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle(_options, bundle) {
      viteBundleFiles = Object.keys(bundle);
    },
    closeBundle() {
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
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
    root: __dirname,
    base: "/",
    publicDir: isProduction ? false : "resources",

    resolve: {
      tsconfigPaths: true,
      alias: {
        resources: path.resolve(__dirname, "resources"),
      },
    },

    plugins: [
      {
        name: "simplefront-asset-base",
        configResolved(config) {
          // The host mounts this app at /simplefront/; standalone uses /.
          const assetBase = cdnBase || config.base.replace(/\/$/, "");
          htmlAssetData.cdnBase = JSON.stringify(assetBase);
          for (const key of [
            "manifestHref",
            "faviconHref",
            "gameplayScreenshotUrl",
            "backgroundImageUrl",
            "desktopLogoImageUrl",
            "mobileLogoImageUrl",
          ] as const) {
            if (!cdnBase)
              htmlAssetData[key] = `${assetBase}${htmlAssetData[key]}`;
          }
        },
      },
      ...(!isProduction
        ? [serveProprietaryDir(proprietaryDir, resourcesDir)]
        : []),
      {
        name: "simplefront-html-values",
        // The game keeps its existing raw template values. The separate demo
        // entry needs no game bootstrap or globals. Native per-file injection
        // also works when this config is hosted from the parent project's cwd.
        transformIndexHtml: {
          order: "pre",
          handler(html, context) {
            if (
              path.resolve(context.filename) !==
              path.join(__dirname, "index.html")
            )
              return html;
            return html.replace(/<%-\s*(\w+)\s*%>/g, (_match, key: string) => {
              if (!(key in htmlAssetData))
                throw new Error(`Unknown HTML value: ${key}`);
              return htmlAssetData[key as keyof typeof htmlAssetData];
            });
          },
        },
      },
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
        input: {
          game: path.resolve(__dirname, "index.html"),
          demos: path.resolve(__dirname, "demos/index.html"),
        },
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
      port: 9010,
      strictPort: true,
      host: process.env.VITE_HOST === "lan",
      // Automatically open the browser when the server starts
      open: process.env.SKIP_BROWSER_OPEN !== "true",
    },
  };
});
