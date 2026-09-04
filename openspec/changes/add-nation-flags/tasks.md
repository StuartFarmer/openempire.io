## 1. Flag library bake (`gen-flags`)

NOTE: curation happened directly in `resources/flags/` (via `flag-review.html` +
`flag-archive/`), so `gen-flags` bakes the manifest FROM the curated staging folder
rather than re-reading the external decisions file. 5,949 flags staged.

- [x] 1.1 Added `gen-flags` npm script (`tsx map-generator/flags/gen-flags.ts`). SVGO is an OPTIONAL `--svgo` flag (dynamic import), not yet installed.
- [x] 1.2 Authored `map-generator/flags/gen-flags.ts` (reads the curated `resources/flags/` set; the external-decisions filtering already happened during manual curation).
- [~] 1.3 Size filtering happened during curation (7,000 under-20KB copied, then deduped/family-pruned). `--max-bytes` not re-implemented in gen-flags.
- [x] 1.4 Slugs already assigned during staging (collision-safe).
- [x] 1.5 SVGO optimization run (via `npx svgo` over the folder): 39 MB → 31 MB. Also quarantined 40 mis-scraped PNGs to `flag-archive/nonsvg/`. Restored 259 ISO-code nationals from git (`b39d3061b^`) so authored real-world-map codes resolve. Library now 6,168.
- [x] 1.6 Emits `resources/flags/flags.manifest.json` = `{ version, flags: [{ id, name }] }`, size-ascending; count matches files (5,949).
- [x] 1.7 `resources/flags/` populated; count confirmed (5,949) — user did the curation pass.
- [ ] 1.8 Confirm prod build copies `resources/flags/` (dev is automatic via `publicDir`).

## 2. Client flag resolver + manifest access

- [x] 2.1 `src/client/flags/FlagCatalog.ts` — `loadFlagCatalog()` (fetch+cache) + `resolveFlagUrl(ref)` (`flag:`/`country:` → URL; unknown/empty → null).
- [x] 2.2 `sampleFlags(all, n)` — uniform random, no dups, clamps to library size.
- [x] 2.3 `flagForSeed(all, seed)` — FNV hash → deterministic flag id for nation assignment.

## 3. Front-page flag picker

- [x] 3.1 `src/client/components/FlagPicker.ts` — flag button + preview + popover.
- [x] 3.2 7×7 grid of 49 flags from `sampleFlags(49)` (verified: 49 imgs render).
- [x] 3.3 Dice-icon (🎲) reroll, resamples in place.
- [x] 3.4 Click → `setFlag`, close, update preview; ✕ clear → `clearFlag`.
- [x] 3.5 Mounted next to `username-input` in `PlayPage.ts`; preview loads persisted flag.
- [x] 3.6 `en.json` `flag_picker.*` keys; `TranslationSystem.test.ts` passes.

## 4. Core: per-nation flag pass-through (tested)

- [x] 4.1 Widened manifest `Nation`/`AdditionalNation` `flag` type to `string | string[]`.
- [x] 4.2 `NationCreation` carries the flag onto the runtime `Nation` (new optional 3rd ctor arg); a list resolves via a HASH of the nation's id — NOT the sim PRNG — so flags never perturb the sim.
- [x] 4.3 Added `NationCreation.test.ts` cases: single flag carried, list → stable member, and identical nations (ids/names/cells) with vs. without flag data. 12/12 pass.
- [x] 4.4 Full suite: only the 5 known-baseline files fail; no regressions.

## 5. Shell protocol + worker

- [x] 5.1 `flag?: string` added to `names` + `nationSpawns` in `ShellSimProtocol.ts`.
- [x] 5.2 Worker builds a PlayerID→flag map from `g.nations()` and emits the authored flag in both `names` and `nationSpawns`.
- [x] 5.3 Human's flag read directly from `getFlag()` on the main thread, keyed by `mySmallID`. Main-thread precedence: human pick → authored → seed.

## 6. Shell rendering

- [x] 6.1 `playerFlagUrl` map + `flagUrlFor(id)` / `ensureFlagCatalog()` in `GameShellPage.ts`; recomputed at name intake.
- [x] 6.2 Flag `<img>` prepended in `updateHoverChip` (persistent img, src-diffed) and `updateNationSpawnMarkers`; constant height, `w-auto`, `onerror` hides (name-only fallback).
- [ ] 6.3 Visual in-shell confirm (headless WebGPU renders black — needs a real browser). Front-page picker visually confirmed.

## 7. Verification

- [x] 7.1 `tsc --noEmit` 0 errors; eslint clean on changed files; `TranslationSystem` + `CoreDependencyBoundary` green.
- [~] 7.2 Front-page picker verified (open/reroll/select, 49 imgs). In-shell nation flags need a real-browser pass.
- [ ] 7.3 Update `openspec` status to done and archive when complete.
