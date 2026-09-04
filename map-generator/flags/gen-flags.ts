/**
 * Bake the flag library manifest from the curated SVGs already staged in
 * resources/flags/. Twin of `gen-maps`: deterministic, offline, committed output.
 *
 *   npx tsx map-generator/flags/gen-flags.ts [--svgo]
 *
 * The flags themselves were curated by hand (see flag-archive/ + flag-review.html);
 * this just (re)generates resources/flags/flags.manifest.json — the id→name index
 * the client picker samples and the shell resolves. `--svgo` additionally optimizes
 * every SVG in place (needs the optional `svgo` dev dep; skipped with a warning if
 * absent). Display names come from flags.review.json when present, else de-slugged.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAGS_DIR = path.resolve(__dirname, "..", "..", "resources", "flags");

function deslug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function maybeSvgo(files: string[]): Promise<void> {
  // svgo is an OPTIONAL dev dep; the `as string` specifier keeps tsc from
  // requiring it to be installed (dynamic import → Promise<any>).
  let optimize: (svg: string) => { data: string };
  try {
    optimize = (await import("svgo" as string)).optimize;
  } catch {
    console.warn("--svgo requested but 'svgo' is not installed; skipping.");
    return;
  }
  let saved = 0;
  for (const f of files) {
    const p = path.join(FLAGS_DIR, f);
    const before = fs.statSync(p).size;
    const out = optimize(fs.readFileSync(p, "utf8")).data;
    fs.writeFileSync(p, out);
    saved += before - Buffer.byteLength(out);
  }
  console.log(
    `svgo: optimized ${files.length} files, saved ${(saved / 1024) | 0} KB`,
  );
}

async function main() {
  const doSvgo = process.argv.includes("--svgo");
  const files = fs
    .readdirSync(FLAGS_DIR)
    .filter((f) => f.endsWith(".svg"))
    .sort();

  if (doSvgo) await maybeSvgo(files);

  // Optional display-name source from the review staging index.
  const names = new Map<string, string>();
  const reviewPath = path.join(FLAGS_DIR, "flags.review.json");
  if (fs.existsSync(reviewPath)) {
    for (const e of JSON.parse(fs.readFileSync(reviewPath, "utf8")).flags) {
      names.set(e.id.replace(/^flag:/, ""), e.name);
    }
  }

  const entries = files.map((f) => {
    const slug = f.slice(0, -4);
    return {
      id: `flag:${slug}`,
      name: names.get(slug) ?? deslug(slug),
      bytes: fs.statSync(path.join(FLAGS_DIR, f)).size,
    };
  });
  // Purest-vector-first: smallest files rank earliest.
  entries.sort((a, b) => a.bytes - b.bytes || a.id.localeCompare(b.id));

  const manifest = {
    version: 1,
    flags: entries.map((e) => ({ id: e.id, name: e.name })),
  };
  fs.writeFileSync(
    path.join(FLAGS_DIR, "flags.manifest.json"),
    JSON.stringify(manifest),
  );
  console.log(`wrote flags.manifest.json with ${entries.length} flags`);
}

void main();
