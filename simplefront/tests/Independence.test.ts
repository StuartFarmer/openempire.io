import { globSync } from "glob";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { PLAYABLE_GAMES } from "../src/client/games/experience";
import { getLiveGame } from "../src/client/games/registry";
import { composeTerrain } from "../src/client/lab/systems/terrain/system";
import { compileFieldSystem } from "../src/client/webgpu/FieldDynamics";
import { buildAssetUrl } from "../src/core/AssetUrls";
import { Config } from "../src/core/configuration/Config";
import {
  createRulesetConfig,
  DEFAULT_RULESET,
} from "../src/core/game/Rulesets";
import { UserSettings } from "../src/core/game/UserSettings";

const root = path.resolve(__dirname, "..");
const insideApp = (file: string) => {
  const relative = path.relative(root, file);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

describe("independent SimpleFront application", () => {
  test("hosted assets and settings stay separate from OpenFront", () => {
    expect(buildAssetUrl("maps/spqr/map.bin", {}, "/simplefront/")).toBe(
      "/simplefront/maps/spqr/map.bin",
    );
    expect(
      buildAssetUrl(
        "maps/spqr/map.bin",
        { "maps/spqr/map.bin": "/_assets/map.hash.bin" },
        "/simplefront",
      ),
    ).toBe("/simplefront/_assets/map.hash.bin");
    expect(buildAssetUrl("maps/spqr/map.bin")).toBe("/maps/spqr/map.bin");
    localStorage.setItem("settings.emojis", "false");
    const settings = new UserSettings();
    settings.removeCached("settings.emojis");
    expect(settings.emojis()).toBe(true);
    settings.toggleEmojis();
    expect(localStorage.getItem("simplefront:settings.emojis")).toBe("false");
    settings.removeCached("settings.emojis");
    expect(localStorage.getItem("settings.emojis")).toBe("false");
    localStorage.removeItem("settings.emojis");
  });
  test("source imports and asset files stay inside this application", () => {
    const violations: string[] = [];
    const files = globSync(
      ["src/**/*", "tests/perf/**/*.ts", "resources/**/*", "proprietary/**/*"],
      {
        cwd: root,
        nodir: true,
      },
    );
    for (const file of files) {
      const absolute = path.join(root, file);
      if (!insideApp(realpathSync(absolute)))
        violations.push(`${file}: external symlink`);
      if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(absolute, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const check = (value: string) => {
        const specifier = value.split("?")[0];
        let resolved: string | undefined;
        if (specifier.startsWith("."))
          resolved = path.resolve(path.dirname(absolute), specifier);
        else if (
          specifier.startsWith("src/") ||
          specifier.startsWith("resources/")
        )
          resolved = path.resolve(root, specifier);
        else if (specifier.startsWith("/"))
          violations.push(`${file}: absolute import ${specifier}`);
        else if (specifier.startsWith("openfront-client"))
          violations.push(`${file}: parent package ${specifier}`);
        if (resolved && !insideApp(resolved))
          violations.push(`${file}: ${specifier}`);
      };
      const visit = (node: ts.Node) => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          check(node.moduleSpecifier.text);
        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          check(node.argument.literal.text);
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            node.expression.getText(source) === "import.meta.glob")
        ) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteral(argument)) check(argument.text);
        }
        if (
          ts.isNewExpression(node) &&
          node.expression.getText(source) === "URL"
        ) {
          const argument = node.arguments?.[0];
          if (argument && ts.isStringLiteral(argument)) check(argument.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
    const config = ts.readConfigFile(
      path.join(root, "tsconfig.json"),
      ts.sys.readFile,
    ).config;
    expect(config.extends).toBeUndefined();
    expect(config.compilerOptions.paths["src/*"]).toEqual(["./src/*"]);
    expect(config.compilerOptions.paths["resources/*"]).toEqual([
      "./resources/*",
    ]);
  });

  test("defaults to the local CPU game and compiles its copied shader", async () => {
    expect(DEFAULT_RULESET).toBe("simplefront");
    expect(PLAYABLE_GAMES.map(({ id }) => id)).toEqual(["simplefront"]);
    const game = getLiveGame("simplefront")!;
    const config = createRulesetConfig(
      DEFAULT_RULESET,
      {} as never,
      null,
      false,
    );
    expect(config).toBeInstanceOf(Config);
    expect(config.simplePlotEconomy()).toBeNull();
    const runtime = await game.createRuntime({} as never);
    await runtime.beforeTick();
    runtime.dispose();
    const compiled = await compileFieldSystem(composeTerrain(game.system));
    expect(compiled.layerNames).toEqual([
      "damage",
      "density",
      "front",
      "highlight",
      "owner",
      "plot",
      "supply",
    ]);
    expect(
      compiled.kernelConfig.passes.find(
        ({ name }) => name === "view/simplefront",
      )?.code,
    ).toContain("unpackTint");
  });
});
