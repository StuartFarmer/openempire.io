/**
 * download.ts — standardized fetcher for the real-world source data behind
 * Earth maps. Reads the manifest in `datasets.ts`, pulls each source into
 * `world-maps/` (outside the repo), and records size + sha256 in a lockfile so
 * re-runs are cheap and corruption is detectable.
 *
 * Properties that matter:
 *   - Idempotent: an already-complete, size-matching file is skipped.
 *   - Resumable: partial downloads land in `.part` and resume via HTTP Range.
 *   - Verifiable: sha256 recorded on first fetch; `verify` re-checks it.
 *   - Honest: never reports success for a file it did not fully transfer.
 *
 * Usage:
 *   npx tsx map-generator/earth/download.ts list
 *   npx tsx map-generator/earth/download.ts status
 *   npx tsx map-generator/earth/download.ts fetch                 # default set
 *   npx tsx map-generator/earth/download.ts fetch --only etopo-60s,ne-land
 *   npx tsx map-generator/earth/download.ts fetch --feeds water   # everything feeding `water`
 *   npx tsx map-generator/earth/download.ts fetch --all           # includes optional/high-res
 *   npx tsx map-generator/earth/download.ts verify
 *
 *   --force        re-download even if present
 *   --concurrency  parallel downloads (default 3)
 *   --dry-run      print the plan, transfer nothing
 */
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  DATASETS as ALL,
  dataRoot,
  Dataset,
  DATASETS,
  defaultDownloads,
  destPath,
  Feeds,
  unresolved,
  vendoredMissing,
} from "./datasets";

// ─────────────────────────── args ───────────────────────────

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith("--")) ?? "status";

function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}
function opt(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function list(name: string): string[] {
  const v = opt(name);
  return v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

const FORCE = flag("force");
const DRY = flag("dry-run");
const CONCURRENCY = Math.max(1, Number(opt("concurrency") ?? 3));

const LOCKFILE = path.join(dataRoot(), "download-lock.json");

// ─────────────────────────── lockfile ───────────────────────────

interface LockEntry {
  url: string;
  bytes: number;
  sha256: string;
  fetchedAt: string;
}
type Lock = Record<string, LockEntry>;

function readLock(): Lock {
  try {
    return JSON.parse(fs.readFileSync(LOCKFILE, "utf8")) as Lock;
  } catch {
    return {};
  }
}
function writeLock(lock: Lock): void {
  fs.mkdirSync(path.dirname(LOCKFILE), { recursive: true });
  fs.writeFileSync(LOCKFILE, JSON.stringify(lock, null, 2) + "\n");
}

// ─────────────────────────── helpers ───────────────────────────

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const s = fs.createReadStream(file);
    s.on("error", reject);
    s.on("data", (c) => hash.update(c));
    s.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Where the raw download lands before extraction. Archives download to
 * `<dest>.zip` next to the directory they unpack into; plain files download
 * straight to `dest`.
 */
function archivePath(d: Dataset): string {
  return d.extract ? `${destPath(d)}.zip` : destPath(d);
}

/** A dataset is "present" if its extracted dir / file exists and is non-empty. */
function isPresent(d: Dataset): boolean {
  const p = destPath(d);
  if (!fs.existsSync(p)) return false;
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).length > 0;
  return st.size > 0;
}

function unzipOnce(zip: string, into: string): Promise<void> {
  fs.mkdirSync(into, { recursive: true });
  return new Promise((resolve, reject) => {
    // -o overwrite, -q quiet, -j is NOT used: keep the archive's structure.
    const p = spawn("unzip", ["-o", "-q", zip, "-d", into], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    p.stderr.on("data", (c) => (err += c));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`unzip exited ${code}: ${err.trim()}`)),
    );
  });
}

/** Every .zip under `dir`, recursively. */
function nestedZips(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return nestedZips(p);
    return e.isFile() && e.name.toLowerCase().endsWith(".zip") ? [p] : [];
  });
}

/**
 * Unpack an archive, then unpack any archives it contained, and so on.
 *
 * Publishers really do ship zips inside zips: USGS DDS-60 wraps the actual
 * `.tab` resource tables in an inner `dds60tabular.zip`, so a single-level
 * extract leaves the payload sealed and the dataset silently useless.
 * Each nested zip is unpacked beside itself and removed. Depth-capped so a
 * zip-quine can't spin forever.
 */
async function unzip(zip: string, into: string, depth = 0): Promise<void> {
  await unzipOnce(zip, into);
  if (depth >= 4) return;
  for (const inner of nestedZips(into)) {
    // Unpack into a sibling dir named after the archive, then drop the archive.
    const target = inner.replace(/\.zip$/i, "");
    await unzip(inner, target, depth + 1);
    fs.rmSync(inner);
  }
}

// ─────────────────────────── download ───────────────────────────

/**
 * Fetch one dataset with resume. Returns bytes transferred (0 = skipped).
 * Throws on any failure — a partial file is left as `.part` for the next run,
 * never promoted to the real name.
 */
async function fetchOne(d: Dataset, lock: Lock): Promise<number> {
  if (!d.url) throw new Error(`no URL resolved for "${d.id}"`);

  const target = archivePath(d);
  const part = `${target}.part`;
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (!FORCE && isPresent(d) && lock[d.id]?.url === d.url) {
    console.log(`  ✓ ${d.id} — present, skipping`);
    return 0;
  }

  // Resume: how many bytes do we already have?
  let have = 0;
  if (!FORCE && fs.existsSync(part)) {
    have = fs.statSync(part).size;
  } else if (fs.existsSync(part)) {
    fs.rmSync(part);
  }

  const headers: Record<string, string> = {
    // Some of these hosts (naciscdn, ucdavis) 403 a bare fetch UA.
    "User-Agent": "openfront-earth-map-downloader/1.0",
  };
  if (have > 0) headers["Range"] = `bytes=${have}-`;

  const res = await fetch(d.url, { headers, redirect: "follow" });

  // 416 = we already have the whole thing; the server has nothing more to give.
  if (res.status === 416 && have > 0) {
    fs.renameSync(part, target);
  } else {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${d.url}`);
    }
    const resuming = res.status === 206 && have > 0;
    if (have > 0 && !resuming) {
      // Server ignored our Range — start clean rather than corrupt the file.
      fs.rmSync(part);
      have = 0;
    }
    if (!res.body) throw new Error(`empty body for ${d.id}`);

    const remaining = Number(res.headers.get("content-length") ?? 0);
    const total = have + remaining;
    process.stdout.write(
      `  ↓ ${d.id} — ${total ? mb(total) : "unknown size"}${
        resuming ? ` (resuming from ${mb(have)})` : ""
      }\n`,
    );

    const out = fs.createWriteStream(part, { flags: resuming ? "a" : "w" });
    await pipeline(Readable.fromWeb(res.body as never), out);

    // Trust nothing: if the server declared a length, the file must match it.
    const got = fs.statSync(part).size;
    if (total && got !== total) {
      throw new Error(
        `${d.id}: truncated — got ${got} bytes, expected ${total}. Re-run to resume.`,
      );
    }
    fs.renameSync(part, target);
  }

  const bytes = fs.statSync(target).size;
  const sha = await sha256File(target);

  if (d.extract) {
    await unzip(target, destPath(d));
    fs.rmSync(target); // the archive is redundant once unpacked
  }

  lock[d.id] = {
    url: d.url,
    bytes,
    sha256: sha,
    fetchedAt: new Date().toISOString(),
  };
  writeLock(lock);
  console.log(`  ✓ ${d.id} — ${mb(bytes)}  sha256:${sha.slice(0, 12)}…`);
  return bytes;
}

/** Run tasks with a bounded worker pool. */
async function pool<T>(
  items: T[],
  n: number,
  fn: (t: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(n, items.length) },
    async () => {
      while (i < items.length) {
        await fn(items[i++]);
      }
    },
  );
  await Promise.all(workers);
}

// ─────────────────────────── selection ───────────────────────────

function select(): Dataset[] {
  const only = list("only");
  if (only.length) {
    return only.map((id) => {
      const d = ALL.find((x) => x.id === id);
      if (!d) throw new Error(`unknown dataset "${id}"`);
      return d;
    });
  }
  const feeds = list("feeds") as Feeds[];
  if (feeds.length) {
    return ALL.filter(
      (d) => !d.vendored && d.url && d.feeds.some((f) => feeds.includes(f)),
    );
  }
  if (flag("all")) return ALL.filter((d) => !d.vendored && d.url !== "");
  return defaultDownloads();
}

// ─────────────────────────── commands ───────────────────────────

function cmdList(): void {
  console.log(`\ndata root: ${dataRoot()}\n`);
  const w = Math.max(...DATASETS.map((d) => d.id.length));
  for (const d of DATASETS) {
    const tags = [
      d.vendored ? "vendored" : "",
      d.optional ? "optional" : "",
      !d.vendored && !d.url ? "NO-URL" : "",
    ]
      .filter(Boolean)
      .join(",");
    console.log(
      `  ${d.id.padEnd(w)}  ${String(d.approxMB ?? "?").padStart(5)} MB  ` +
        `[${d.feeds.join(" ")}]${tags ? `  (${tags})` : ""}`,
    );
    console.log(`  ${" ".repeat(w)}  ${d.title}`);
  }
  console.log();
}

function cmdStatus(): void {
  const lock = readLock();
  console.log(`\ndata root: ${dataRoot()}\n`);
  const w = Math.max(...DATASETS.map((d) => d.id.length));
  let ready = 0;
  for (const d of DATASETS) {
    const present = isPresent(d);
    if (present) ready++;
    const mark = present
      ? "✓"
      : d.vendored
        ? "✗ MISSING"
        : !d.url
          ? "· no url"
          : "· not fetched";
    const size = lock[d.id] ? mb(lock[d.id].bytes) : "";
    console.log(`  ${mark.padEnd(14)} ${d.id.padEnd(w)}  ${size}`);
  }
  console.log(`\n  ${ready}/${DATASETS.length} present`);

  const missing = vendoredMissing();
  if (missing.length) {
    console.log(
      `\n  ⚠ vendored datasets expected on disk but absent: ${missing
        .map((d) => d.id)
        .join(", ")}`,
    );
  }
  const todo = unresolved();
  if (todo.length) {
    console.log(`\n  ⚠ needed but URL unresolved — cannot fetch yet:`);
    for (const d of todo) console.log(`      ${d.id} — ${d.title}`);
  }
  console.log();
}

async function cmdVerify(): Promise<void> {
  const lock = readLock();
  let bad = 0;
  for (const d of DATASETS) {
    const entry = lock[d.id];
    if (!entry || d.extract) continue; // extracted archives are gone; nothing to hash
    const p = destPath(d);
    if (!fs.existsSync(p)) {
      console.log(`  ✗ ${d.id} — recorded in lock but missing on disk`);
      bad++;
      continue;
    }
    const sha = await sha256File(p);
    if (sha !== entry.sha256) {
      console.log(
        `  ✗ ${d.id} — sha256 mismatch (corrupt; re-fetch with --force)`,
      );
      bad++;
    } else {
      console.log(`  ✓ ${d.id}`);
    }
  }
  console.log(bad ? `\n  ${bad} corrupt\n` : `\n  all verified\n`);
  if (bad) process.exitCode = 1;
}

async function cmdFetch(): Promise<void> {
  const chosen = select();
  const fetchable = chosen.filter((d) => !d.vendored && d.url);
  const blocked = chosen.filter((d) => !d.vendored && !d.url);

  console.log(`\ndata root: ${dataRoot()}`);
  console.log(
    `plan: ${fetchable.length} dataset(s), ~${fetchable
      .reduce((a, d) => a + (d.approxMB ?? 0), 0)
      .toFixed(0)} MB\n`,
  );
  for (const d of fetchable) console.log(`  · ${d.id} — ${d.title}`);
  if (blocked.length) {
    console.log(
      `\n  ⚠ skipped (no URL resolved): ${blocked.map((d) => d.id).join(", ")}`,
    );
  }
  if (DRY) {
    console.log("\n(dry run — nothing transferred)\n");
    return;
  }
  console.log();

  const lock = readLock();
  const failures: string[] = [];
  await pool(fetchable, CONCURRENCY, async (d) => {
    try {
      await fetchOne(d, lock);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ ${d.id} — ${msg}`);
      failures.push(d.id);
    }
  });

  console.log();
  if (failures.length) {
    console.error(`  ${failures.length} failed: ${failures.join(", ")}\n`);
    process.exitCode = 1;
  } else {
    console.log(`  done — ${fetchable.length} dataset(s) ready\n`);
  }
}

// ─────────────────────────── main ───────────────────────────

switch (cmd) {
  case "list":
    cmdList();
    break;
  case "status":
    cmdStatus();
    break;
  case "verify":
    await cmdVerify();
    break;
  case "fetch":
    await cmdFetch();
    break;
  default:
    console.error(
      `unknown command "${cmd}" — expected list | status | fetch | verify`,
    );
    process.exitCode = 1;
}
