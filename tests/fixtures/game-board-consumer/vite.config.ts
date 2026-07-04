import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      resources: path.join(repoRoot, "resources"),
      src: path.join(repoRoot, "src"),
    },
  },
  define: {
    __ASSET_MANIFEST__: "{}",
  },
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
  },
});
