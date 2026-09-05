import { readFileSync } from "fs";
import { globSync } from "glob";
import { relative } from "path";
import { describe, expect, test } from "vitest";

describe("core dependency boundary", () => {
  test("src/core does not import client, renderer, hud, server, or app shell modules", () => {
    const root = process.cwd();
    const files = globSync("src/core/**/*.ts", {
      cwd: root,
      absolute: true,
      nodir: true,
    });

    const violations: string[] = [];
    const banned = [
      /from\s+["'][^"']*(?:^|\/|\.\.\/)client(?:\/|["'])/,
      /from\s+["'][^"']*(?:^|\/|\.\.\/)server(?:\/|["'])/,
      /from\s+["'][^"']*client\/hud(?:\/|["'])/,
      /from\s+["'][^"']*client\/render(?:\/|["'])/,
      /from\s+["'][^"']*client\/view(?:\/|["'])/,
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");
      for (let index = 0; index < lines.length; index++) {
        if (banned.some((pattern) => pattern.test(lines[index]))) {
          violations.push(
            `${relative(root, file)}:${index + 1}: ${lines[index].trim()}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("live game runtimes stay isolated from the worker host", () => {
    const workerSource = readFileSync(
      "src/client/webgpu/ShellSim.worker.ts",
      "utf8",
    );
    const openfrontSource = readFileSync(
      "src/client/games/openfront/runtime.ts",
      "utf8",
    );
    const registrySource = readFileSync("src/client/games/registry.ts", "utf8");
    const leanfrontSystemSource = readFileSync(
      "src/client/games/leanfront/system.ts",
      "utf8",
    );
    const urbanGrowthSource = readFileSync(
      "src/core/execution/utils/UrbanGrowth.ts",
      "utf8",
    );

    expect(workerSource).not.toContain('=== "leanfront"');
    expect(workerSource).not.toContain("GpuEconomy");
    expect(workerSource).not.toMatch(
      /(?:from|import\()[^\n]*leanfront\/runtime/,
    );
    expect(openfrontSource).not.toMatch(/leanfront|GpuEconomy/);
    expect(registrySource).not.toMatch(/^import .*leanfront\/runtime/m);
    expect(registrySource).not.toContain("GpuEconomy");
    expect(registrySource).toContain('import("./leanfront/runtime")');
    expect(registrySource).toContain('import("./leanfront-simple/runtime")');
    expect(workerSource).not.toMatch(/leanfront-simple\/runtime|SimpleEconomy/);
    expect(urbanGrowthSource).not.toMatch(/leanfront-simple|SimpleEconomy/);
    expect(leanfrontSystemSource).toContain(
      'import.meta.glob("./layers/**/*.wesl"',
    );
    expect(leanfrontSystemSource).not.toContain(
      'import.meta.glob("./**/*.wesl"',
    );
  });
});
