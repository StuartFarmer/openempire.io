import { assetUrl } from "../../core/AssetUrls";

/**
 * The curated flag library (baked into resources/flags/ + flags.manifest.json by
 * `npm run gen-flags`). This is the client-only cosmetic catalog — the deterministic
 * sim never sees it. Flag refs are strings of the form `flag:<slug>`; the slug is the
 * SVG basename under /flags/. `country:<code>` is accepted as a legacy alias and
 * resolved the same way (real-world map manifests carry bare codes).
 */
export interface FlagEntry {
  id: string; // "flag:<slug>"
  name: string; // display name
}

interface FlagManifest {
  version: number;
  flags: FlagEntry[];
}

let manifestPromise: Promise<FlagEntry[]> | null = null;

/** Fetch + cache the flag manifest once. Returns [] if it can't be loaded. */
export function loadFlagCatalog(): Promise<FlagEntry[]> {
  manifestPromise ??= fetch(assetUrl("/flags/flags.manifest.json"))
    .then((r) => (r.ok ? (r.json() as Promise<FlagManifest>) : null))
    .then((m) => m?.flags ?? [])
    .catch(() => []);
  return manifestPromise;
}

/** Turn a flag ref into a fetchable SVG URL, or null for none/unknown. */
export function resolveFlagUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const slug = ref.startsWith("flag:")
    ? ref.slice("flag:".length)
    : ref.startsWith("country:")
      ? ref.slice("country:".length)
      : ref;
  if (!slug || slug === "xx") return null;
  return assetUrl(`/flags/${slug}.svg`);
}

/** N flags drawn at random (no repeats), clamped to the library size. */
export function sampleFlags(all: FlagEntry[], n: number): FlagEntry[] {
  if (all.length <= n) return all.slice();
  const picked = new Set<number>();
  while (picked.size < n) picked.add(Math.floor(Math.random() * all.length));
  return [...picked].map((i) => all[i]);
}

/**
 * Deterministically map an arbitrary seed string to a flag ref from the catalog.
 * Used to give every nation a stable flag when it has no authored one. Same seed +
 * same catalog → same flag, so labels never flicker.
 */
export function flagForSeed(all: FlagEntry[], seed: string): string | null {
  if (all.length === 0) return null;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return all[(h >>> 0) % all.length].id;
}
