import fs from "fs";
import { globSync } from "glob";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

/**
 * Guardrails for the lean fork. These subsystems were deliberately stripped
 * (see CLAUDE.md "Boundaries"); an import of one of these packages means a
 * stripped subsystem is creeping back in.
 */
const BANNED_IMPORTS = [
  "express",
  "compression",
  "express-rate-limit",
  "winston",
  "@opentelemetry/",
  "pixi.js",
  "pixi-filters",
  "ejs",
  "node-html-parser",
];

const IMPORT_RE = /(?:from\s+|require\()\s*["']([^"']+)["']/g;

describe("Lean fork boundaries", () => {
  test("src/ does not import stripped subsystems", () => {
    const files = globSync("src/**/*.ts", { cwd: ROOT, absolute: true });
    const errors: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const match of content.matchAll(IMPORT_RE)) {
        const spec = match[1];
        for (const banned of BANNED_IMPORTS) {
          if (spec === banned || spec.startsWith(banned)) {
            errors.push(`${path.relative(ROOT, file)} imports "${spec}"`);
          }
        }
      }
    }
    expect(errors).toEqual([]);
  });

  test("src/server contains only the vite build helper", () => {
    const files = fs.readdirSync(path.join(ROOT, "src", "server")).sort();
    expect(files).toEqual(["PublicAssetManifest.ts"]);
  });

  test("the games module only exposes the world generator", () => {
    // src/games/alternative gameplay experiments are parked in git history;
    // only the world generator surface may be re-exported from the index.
    const index = fs.readFileSync(
      path.join(ROOT, "src", "games", "alternative", "index.ts"),
      "utf8",
    );
    for (const match of index.matchAll(IMPORT_RE)) {
      expect(match[1]).toMatch(/^\.\/world/);
    }
  });
});
