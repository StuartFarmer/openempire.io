## Context

Vanilla OpenFront had a two-part flag system: a WebGL name-pass renderer (`FlagAtlasArray` + `name-pass/index.ts`) and a selection/cosmetics half (picker UI, `resolveFlagUrl`, `resources/flags/*.svg`, `countries.json`). Two commits stripped this fork:

- `b39d3061b` deleted `resources/flags/` (760 SVGs) and `resources/countries.json`.
- `a87e6ff04` deleted `FlagInput.ts`, `FlagInputModal.ts`, and `Cosmetics.ts` (which held `resolveFlagUrl`).

What survives and still works: the flag schema/validators (`Schemas.ts`), the persistence API (`UserSettings.getFlag/setFlag/clearFlag`, key `"flag"`), and — importantly — the **WebGL** name-pass renderer. But the `#shell` (the real in-game view, `GameShellPage.ts`) is **WebGPU** and does **not** use the WebGL name-pass. In the shell, nation names are a **DOM overlay** (`<div id="shell-labels">`) positioned each frame; the flag there is just an `<img>`.

Two more facts shape the design:

1. The per-nation `flag?: string` field **already exists** on the manifest `Nation`/`AdditionalNation` interfaces (`TerrainMapLoader.ts:74-84`) and real-world maps populate it (earthmini `"flag": "va"`), but `toNation` (`NationCreation.ts:34-40`) reads only `coordinates`+`name`, dropping `flag`. So per-nation flags are half-plumbed.
2. The external asset source is a reviewer's folder at `/Users/stuart/Developer/scraping` with `flag_review_decisions.json` — `{ decisions: { <relpath>: "keep"|"pass"|"auto-pass" }, order: [...] }`. There are **10,256 `keep`** entries (all present under `downloads/`), median 5.4 KB, 7,000 under 20 KB, a long raster-heavy tail up to ~14 MB. Total ~92k SVGs / ~2.5 GB — far too large to ship whole.

## Goals / Non-Goals

**Goals:**

- One flag beside every nation in the `#shell` (hover chip + spawn markers).
- A front-page emoji-picker-style popover: random 49 (7×7) slice + dice reroll, persisted selection with preview.
- Bake ~10k approved, optimized flags into `resources/flags/` + a `flags.manifest.json` index, via a repeatable `npm run gen-flags` step (twin of `gen-maps`).
- Keep the deterministic core sim flag-agnostic; per-nation authored flags (specific / historical list) plumbed through as opaque cosmetic data.

**Non-Goals:**

- Re-introducing the stripped cosmetics store/catalog/unlockables, the WebGL `FlagAtlasArray`, or `countries.json`.
- Flags in the legacy WebGL game view (`GameView` deliberately renders nations unflagged; out of scope).
- Shipping the full 92k library or the external source folder in the repo.
- Age-progression of historical flags (a list resolves to one flag now; per-age switching is future work).

## Decisions

### D1. Bake a curated, optimized subset — not dev-alias, not ship-all

`gen-flags` reads `flag_review_decisions.json`, keeps `status === "keep"`, drops files above a size threshold (embedded raster), runs each through **SVGO**, and copies to `resources/flags/<slug>.svg`. It emits `flags.manifest.json`. Mirrors the `gen-maps` pattern (offline, deterministic, committed outputs).

- **Alternatives considered.** _Dev-alias the source folder_ — zero copy but nothing ships in prod (rejected: the shell/front-page must work in a static build). _Ship all 92k optimized_ — ~0.5-1 GB, bloats repo and build (rejected). _Curated ~10k_ — matches the reviewer's already-approved set and stays a manageable size after SVGO + tail-drop.
- Source path + decisions path are **CLI args** (no committed absolute path). `svgo` is a new **dev-only** dependency.
- **Slug**: sanitize the source basename (strip `Flag_of_`-style noise minimally, lowercase, collapse to `[a-z0-9-]`); disambiguate collisions with a numeric suffix. Manifest carries the original title as display name.

### D2. Manifest shape + ordering

`flags.manifest.json` = `{ version, flags: [{ id: "flag:<slug>", name, bytes }] }`, ordered **size-ascending** so a "purest vector first" prefix is cheaply available and the picker can bias toward simple flags if desired. The picker samples uniformly by default (spec: whole library); ordering is an affordance, not a filter. ~10k entries ≈ a few hundred KB JSON — loaded once by the front page and the shell.

### D3. Client-side resolver, reusing the `flag:` namespace

Rebuild the deleted `resolveFlagUrl` as a small client util: `flag:<slug>` → `assetUrl("/flags/<slug>.svg")`. It loads `flags.manifest.json` (fetch once, cache) to (a) validate a slug exists and (b) enumerate for the picker + random assignment. Reuse `UserSettings` `"flag"` key so the existing persistence/migration path is untouched. Bare country codes on old maps (`"va"`) are normalized to a `flag:` slug or resolved directly to `/flags/va.svg` if such a slug is baked.

### D4. Flag assignment split: authored → core pass-through; random → client

The precedence (human pick → specific → historical list → deterministic-random) is split by where the data lives:

- **Authored specific / historical-list flags** live in the map manifest (core loads it). Thread `flag` through: widen the manifest `Nation` type to `flag?: string | string[]`, and have `toNation` copy it onto the runtime `Nation` (a cosmetic passthrough on the wrapper — **not** onto sim state that combat/economy read). A **list** is resolved to one id using the **seeded sim PRNG** already threaded into `createNationsForGame` (deterministic, no new randomness source). This is the only core touch and is pure data carriage — covered by a determinism test (D-test below).
- **Deterministic-random fallback + human override** happen **client-side** in the shell worker/main, where the ~10k-id manifest already lives (keeping a 10k cosmetic id list out of the deterministic core). The worker, when emitting a nation's identity, resolves: if the nation carries an authored id → use it; else derive a stable index into the manifest from the nation's stable id (e.g. a hash of smallID/PlayerID) → `flag:<slug>`. The human's nation uses the front-page `getFlag()` value.

- **Alternatives considered.** _All assignment in core_ — would force the 10k-slug list into the deterministic sim module and revive per-player cosmetics that this fork deliberately blanks (rejected). _All assignment client-side incl. authored data_ — the worker would have to re-read the raw manifest separately from core's loaded copy (rejected: duplicative; the `flag` field is already in core's `MapManifest`).

### D5. Protocol + rendering

- Extend the `names` entries (`ShellSimProtocol.ts:100-102`) and `nationSpawns` (`:106-108`) with a `flag?: string` (resolved ref/slug). Populate in `ShellSim.worker.ts` `playerSummary` (`:418-454`) and the spawn builder (`:488-503`); thread the human's flag through the hardcoded init player (`:138`).
- Main thread: add `playerFlag: Map<number,string>` beside `playerName` (`GameShellPage.ts:277`), populate at name intake (`:957-960`).
- Render: prepend an `<img>` in `updateHoverChip` (`:488-509`) and `updateNationSpawnMarkers` (`:1834-1840`). CSS: fixed height (matching the text line), `width:auto`, `object-fit:contain` to handle non-3:2 flags; `onerror` hides the img so a failed load degrades to name-only (spec requirement).

### D6. Picker component

New Lit component (e.g. `FlagPicker.ts`) mounted in `PlayPage.ts` / `UsernameInput.ts` next to the name input. State: current 49-sample (indices into the manifest array), reroll button (dice icon from the existing icon set / inline SVG). Uses `Math.random` (pure UI, non-sim — determinism rules don't apply here). Click a cell → `setFlag("flag:<slug>")`, close, update preview `<img>`. A clear/none affordance → `clearFlag()`. New `en.json` keys via `translateText()`.

## Risks / Trade-offs

- **Repo/build size of ~10k SVGs** → Mitigation: size-threshold tail-drop + SVGO; report kept/dropped counts; revisit threshold if `resources/flags/` is still heavy. The full source stays external.
- **Prod asset serving** (prod sets `publicDir:false`, copies via asset-manifest) → Mitigation: verify `resources/flags/` is covered by the prod copy/manifest path (`vite.config.ts` `copyRootPublicFiles` / asset manifest); may need to register the folder. Dev is automatic (`publicDir:"resources"`).
- **Non-uniform flag aspect ratios** distorting labels → Mitigation: constant-height + `object-fit:contain`; verified visually in the shell.
- **Core determinism regression** from touching `NationCreation` → Mitigation: the only core change is copying an opaque field + one seeded list-pick; a test asserts identical sim outcome with/without flag data, and existing NationCreation tests stay green.
- **10k flags fetched individually** for labels/picker → each `<img>` fetches its own SVG on demand (browser-cached); the manifest is the only always-loaded file. Acceptable; no atlas needed for a DOM overlay. Reroll fetches ≤49 small SVGs.
- **Slug collisions / renames** across gen-flags runs → Mitigation: deterministic slug + suffix; manifest is the source of truth, regenerated wholesale.

## Migration Plan

1. Add `svgo` dev dep; author `gen-flags` + `npm run gen-flags`; run it against the external folder to populate `resources/flags/` + `flags.manifest.json`.
2. Land the client resolver + picker (front page usable standalone).
3. Thread `flag` through core (`TerrainMapLoader` type, `toNation`) + tests.
4. Extend shell protocol/worker + label rendering.
5. Rollback: revert client + protocol commits; the baked `resources/flags/` assets and the (unused) `flag` passthrough are inert without the renderer, so partial rollback is safe.

## Open Questions

- **Size threshold** for the pure-vector tail-drop — pick empirically from the size histogram (e.g. exclude > ~100-200 KB) to keep `resources/flags/` reasonable; confirm the resulting count/total with the user.
- **Slug scheme** for display — how aggressively to prettify names for the picker tooltip (basename vs. de-underscored title). Default: de-underscored title from the manifest `title`.
- **Real-world map codes** (`"va"`, `"us"`): do the approved slugs include ISO-code flags so old manifests resolve, or do we map codes → slugs? Resolve when the baked slug set is known.
- **Prod asset-manifest coverage** for a ~10k-file folder — confirm the deploy copy handles it without per-file manifest entries.
