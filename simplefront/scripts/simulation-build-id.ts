import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const SIMULATION_BUILD_INPUTS = [
  "src/core",
  "src/client/games/simplefront/runtime.ts",
  "src/client/webgpu/ShellSim.worker.ts",
  "resources/QuickChat.json",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "scripts/simulation-build-id.ts",
];

/** Shared by Vite and headless replay; includes dirty source, not just Git HEAD. */
export async function computeSimulationBuildID(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(relative: string): Promise<void> {
    const location = path.join(root, relative);
    if ((await stat(location)).isDirectory()) {
      for (const entry of (await readdir(location)).sort())
        await visit(`${relative}/${entry}`);
    } else files.push(relative);
  }
  for (const input of SIMULATION_BUILD_INPUTS) await visit(input);
  const manifest = await Promise.all(
    files.sort().map(async (name) => [
      name,
      createHash("sha256")
        .update(await readFile(path.join(root, name)))
        .digest("hex"),
    ]),
  );
  return createHash("sha256")
    .update(JSON.stringify(["simplefront-build-v1", manifest]))
    .digest("hex");
}
