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
});
