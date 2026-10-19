# SimpleFront Incremental Map Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reduce map colour computation and plot uploads while preserving SimpleFront's current appearance and simulation.

**Architecture:** Retain the baked terrain and persistent combined map texture. Track changes in 32×32 tile chunks, skip unchanged views, and dispatch the existing colour body only for dirty chunks. Preserve a full-grid fallback for global invalidation and broad updates.

**Tech Stack:** TypeScript, existing WESL compiler, WebGPU, Vitest, local Playwright benchmark. No new runtime dependencies.

**Spec:** [Design, measured results and constraints](../specs/2026-09-09-simplefront-render-cache-design.md).

## Global constraints

- Scope changes to SimpleFront; preserve existing simulation, rules, city sprites, camera, boats, fire and other field-system behaviour.
- Add no runtime dependencies.
- Preserve pixel output, including alpha metadata, border neighbours, hover, mask fades, farm maturity, ownership, damage and highlights.
- A changed tile invalidates its clipped 3×3 neighbourhood; chunk rounding may include extra pixels.
- Never discard invalidation arriving while prior GPU work is in flight.
- Do not exceed the adapter's existing storage-buffer limit.
- Re-read the working tree before implementing; do not overwrite or revert unrelated work. The implementation started from a clean `leanfront` checkout.

## Evidence and expected payoff

The completed probe measured Earth XL's full-map colour pass at 1.619 ms median versus 0.045 ms for dispersed chunks covering 1.56% of the map on an M2 Max. That is a 35.8× isolated pass speedup, with no measured full-game FPS result. At exactly 10 updates/second, the implied GPU saving is about 0.262 ms per displayed frame averaged across 60 frames, before CPU/upload costs. Prioritize a small implementation over a renderer rewrite.

- [x] Run real GPU timestamps against the existing shaders.
- [x] Check sparse output against the full shader for the static synthetic scene.
- [x] Preserve [raw samples](../../../simplefront/docs/performance/2026-09-09-renderer-benchmark.json) and the [reproducer](../../../simplefront/docs/performance/2026-09-09-renderer-benchmark.mjs).
- [x] Implement Tasks 1–3 below. Production optimization is applied; validation evidence is recorded in [the implementation report](../../../simplefront/docs/performance/render-cache-validation.md).

## Task 1: Track visual invalidation and skip unchanged view dispatches

**Files:**

- Create `simplefront/src/client/shell/RenderInvalidation.ts`.
- Modify `simplefront/src/client/GameShellPage.ts` (`onWorkerFrame`, `markDirty`, parameter/terrain changes and `renderOpenfront`).
- Modify `simplefront/src/client/viewer/FieldViewerBase.ts` only if a protected hook is needed for shared parameter/player writes.
- Create `simplefront/tests/RenderInvalidation.test.ts` and `simplefront/tests/RenderCache.test.ts`.

**Interface:**

```ts
export type ViewUpdate =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "chunks"; ids: Uint32Array };

export class RenderInvalidation {
  constructor(width: number, height: number);
  markTile(tile: number): void;
  markAll(): void;
  take(): ViewUpdate;
}
```

Use a chunk-sized byte array for deduplication plus an array of marked IDs. The constructor starts fully invalidated. `take()` snapshots and resets only the pending state; new changes populate the next snapshot. Return `full` when marked chunks reach `ceil(totalChunks / 4)` or exceed 2,048 IDs. Reset by creating a new tracker when map dimensions change. Bounds-check tile indices before marking the clipped one-tile halo.

- [x] Write and run the following behavioural tests before implementation:

```ts
it("includes all chunks touched by a border neighbour", () => {
  const dirty = new RenderInvalidation(128, 128);
  expect(dirty.take()).toEqual({ kind: "full" });
  dirty.markTile(32 * 128 + 32);
  const update = dirty.take();
  expect(update.kind).toBe("full"); // 4 of 16 chunks meets 25% fallback
});

it("preserves changes queued after a snapshot", () => {
  const dirty = new RenderInvalidation(1024, 1024);
  dirty.take();
  dirty.markTile(40 * 1024 + 40);
  const first = dirty.take();
  dirty.markTile(400 * 1024 + 400);
  const second = dirty.take();
  expect(first).toEqual({ kind: "chunks", ids: new Uint32Array([33]) });
  expect(second).toEqual({ kind: "chunks", ids: new Uint32Array([396]) });
  expect(dirty.take()).toEqual({ kind: "none" });
});
```

Also test `(0,0)` without wrapping to the previous row, repeated marks without duplicates, non-multiple-of-32 dimensions and a four-chunk corner below the full-render threshold (use 1024×1024 and expect IDs 0, 1, 32, 33).

- [x] Integrate `markTile()` at the existing conduit invalidation point. Compare old and incoming values before marking owner/pair/byte updates; unchanged worker data must not manufacture visual work. Preserve development reset semantics and existing uploads.
- [x] Mark the whole view dirty after map/reset/view changes, successful baked-tint upload, terrain derivation, full owner replacement, player-colour/mine changes and changes to any view uniform. Set `needsRedraw` when invalidating, including hover transitions while paused, so the base loop visits `advance()`. City palette changes only need camera presentation unless they change compute inputs.
- [x] In `renderOpenfront`, advance mask/camera/ambient bookkeeping before deciding whether compute is necessary. Compare final parameter values to the last submitted values. If `take()` is `none`, return before `beginFrame()` and leave the camera/effect presentation loop active. Initially render both `full` and `chunks` using the original full pass.

The control flow should have this ordering:

```ts
// Mask/ambient/camera steps, changed-uniform checks and terrain invalidation
// happen before taking this snapshot.
const invalidation = this.renderInvalidation;
const kernel = this.kernel;
const update = invalidation.take();
if (update.kind === "none") return;
this.inFlight = true;
const frame = kernel.beginFrame();
this.compiled.runView(frame, this.view);
void frame
  .finish()
  .catch(() => {
    if (this.kernel === kernel) {
      invalidation.markAll();
      this.needsRedraw = true;
    }
  })
  .finally(() => {
    if (this.kernel === kernel) this.inFlight = false;
  });
```

Keep the existing error status reporting. Bind async completion to the kernel/tracker generation it submitted against so a stale map's completion cannot alter the new map. Never clear pending dirty state from `finally`.

- [x] With the kernel mocked at the submission boundary, prove that a HUD-only worker frame submits no colour pass; one changed plot submits one; identical repeated data submits none; a hover/mask change submits even while paused; a delta received in flight submits afterward. Verify the camera still presents in all no-compute cases.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/RenderInvalidation.test.ts tests/RenderCache.test.ts`. Keep the task files reviewable in the working tree.

## Task 2: Add a sparse entry point without changing colour semantics

**Files:**

- Modify `simplefront/src/client/webgpu/FieldDynamics.ts` (`FieldViewSpec`, source view compilation and `runView`).
- Modify `simplefront/src/client/webgpu/FieldKernel.ts` (`FieldPassSpec`, optional region pipeline and `FieldFrame`).
- Modify `simplefront/src/client/games/simplefront/system.ts` to opt the SimpleFront view in.
- Modify `simplefront/src/client/GameShellPage.ts` to consume the chunk snapshot.
- Create `simplefront/tests/FieldViewRegions.test.ts`.
- Extend the existing benchmark artifact to exercise the implemented path.

**Interfaces:**

```ts
// Optional additions; existing callers keep their full-grid behaviour.
// FieldViewSpec:
incremental?: boolean;
// FieldPassSpec:
regionCode?: string;
// CompiledFieldSystem:
runView(frame: FieldFrame, view: string, chunks?: Uint32Array): void;
// FieldFrame:
passRegions(name: string, chunks: Uint32Array): void;
```

Only `views.simplefront` sets `incremental: true`. Generate both entry points from the same source-view imports/body; do not maintain two copies of territory/city logic. The ordinary pipeline remains unchanged. `regionCode` uses the same group 0 and adds group 1 with one uniform binding:

```wgsl
struct ViewRegions { ids: array<vec4u, 512>, }
@group(1) @binding(0) var<uniform> REGIONS: ViewRegions;

@compute @workgroup_size(8, 8)
fn main(@builtin(workgroup_id) wg: vec3u,
        @builtin(local_invocation_id) local: vec3u) {
  let region = wg.x / 16u;
  let chunk = REGIONS.ids[region / 4u][region % 4u];
  let columns = (GRID.size.x + 31u) / 32u;
  let sub = wg.x % 16u;
  let xy = vec2u(chunk % columns, chunk / columns) * 32u
         + vec2u(sub % 4u, sub / 4u) * 8u + local.xy;
  if (any(xy >= GRID.size)) { return; }
  let x = i32(xy.x);
  let y = i32(xy.y);
  textureStore(out_tex, vec2i(x, y), color(x, y, refOf(x, y)));
}
```

Use the compiler's current import/binding generation for `GRID`, `color`, `refOf` and `out_tex`. Upload packed Uint32 IDs to an 8 KiB uniform buffer; this adds no storage-buffer binding. Dispatch `chunks.length * 16` workgroups, at most 32,768. Allow only one region dispatch per `FieldFrame` in this initial API, so subsequent `queue.writeBuffer` calls cannot overwrite IDs needed by an earlier dispatch in the same submission. Preserve the output texture between updates. Build/release the optional uniform and pipeline with their owning kernel and invalidate bind groups on resize.

- [x] Test zero regions (no dispatch), one region (16 workgroups), two regions (32), the 2,048 maximum and edge clipping on a 65×33 map. Verify the extra bind group is uniform and the original view storage-buffer count is unchanged.
- [x] Reject an invalid/out-of-range chunk ID and an oversized list before dispatch; `RenderInvalidation` normally prevents both. A view without `regionCode` falls back to its full pass for a nonempty list.
- [x] Implement the optional compiled view and kernel dispatch, then route `chunks` snapshots through it. `full` keeps the ordinary `runView` call.
- [x] In a GPU parity probe, seed both outputs with an initial full render, mutate plot/owner/damage values, render one output fully and the other incrementally, and compare every output byte. Include owner changes on chunk boundaries, city level changes, clearing highlights, farm maturity and map edges. Use the actual production region list and upload path, not the benchmark's arithmetic permutation wrapper.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/FieldViewRegions.test.ts tests/RenderInvalidation.test.ts tests/RenderCache.test.ts`. Re-run the GPU benchmark and record partial CPU/upload costs separately from shader timestamps. Keep the task files reviewable after parity passes.

## Task 3: Stop full plot-texture uploads for isolated changes

**Files:**

- Modify `simplefront/src/client/GameShellPage.ts` (`plotBytesDirty` handling in `onWorkerFrame`).
- Modify `simplefront/src/client/shell/CameraRenderer.ts` (add partial plot upload beside `writePlotPlane`).
- Create `simplefront/tests/PlotPlaneUpload.test.ts`.

**Interface:**

```ts
writePlotTiles(bytes: Uint8Array, width: number, height: number,
               tiles: readonly number[]): void;
```

Collect tile IDs only when their plot TYPE changes. Keep plot maturity changes in the compute conduit. Sort/deduplicate the changed IDs, merge adjacent IDs within a row, and upload each row run using `queue.writeTexture`. Use `bytes.subarray(start, endExclusive)`, origin `[start % width, floor(start / width)]`, extent `[runLength, 1]` and an empty layout for the single-row data. Keep full upload for reset and when changed types exceed 1/16 of the plane; this is an initial heuristic, not a measured crossover. Reuse `applyCityDevelopment`'s row-run pattern without creating a generic upload framework.

- [x] Mock `queue.writeTexture` and assert that tile IDs 2, 3 and 65 in a width-64 texture produce two uploads, with origins `[2,0]`, `[1,1]` and widths 2, 1. Assert that duplicate IDs do not repeat uploads and IDs 63, 64 do not merge across rows.
- [x] Implement partial upload and collect actual type changes in `onWorkerFrame`. Initial/reset uploads must still initialize the entire texture; recreate row staging on dimension changes if retained.
- [x] Verify a maturity-only update sends no plot-texture bytes and a single type change sends one byte. Verify broad updates select the existing full upload.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/PlotPlaneUpload.test.ts tests/RenderCache.test.ts`. Keep the task files reviewable in the working tree.

## Task 4: Validate a running match and decide whether to stop

**Files:**

- Extend `simplefront/docs/performance/2026-09-09-renderer-benchmark.mjs` or add a sibling browser probe for the running app.
- Add `simplefront/docs/performance/render-cache-validation.md` and raw before/after JSON.
- Update this plan's checkboxes and measured conclusion.

- [x] Run `rtk proxy npm --prefix simplefront run typecheck` and the four new focused test files plus `tests/CityDevelopmentVisuals.test.ts`, `tests/CityDevelopmentWorker.test.ts`, `tests/CityStreetsSprite.test.ts` and `tests/SimpleFrontPaintedUI.test.ts`.
- [x] Run representative paired browser clips on Verdantia at 1920×1080 and Earth XL at 3840×2160. Each mode receives the same 200 events from a shared restored snapshot, split into four 50-event phases at 10 Hz. Verify real worker spawn/ticks, map and canvas dimensions, baked tint and absence of GPU/browser errors.
- [x] Record animation-frame p50/p95, worker-delta CPU handling, synchronous view encoding, render-completion wall time, conduit/plot uploads, dirty fractions, and full/partial/skipped views. Keep GPU compute timestamps in the separate production-path probe; do not present completion wall time as GPU time.
- [x] Compare every compute-output byte, including alpha, after owner/border, farm, city-level, damage/highlight and queued-frame mutations. Assert that selected border and city pixels actually change. Cover paused hover/fade, baked-load generations, reset and submission retry with regression tests.
- [x] Confirm isolated acceptance: zero output mismatches, no work for unchanged inputs, no dropped pending deltas, no storage-limit errors, and the 128-chunk GPU median below 25% of full. Paired browser clips also show lower worker-delta handling and render-completion times while retaining approximately 60 Hz presentation.
- [x] Retain the 25%/2,048-region and 1/16 plot-upload thresholds. The measurements do not establish optimal crossover points. Save all evidence in the working tree and stop the production optimization here.

### Original validation scope not exercised

The initial protocol called for a larger Cartesian matrix and broader lifecycle walkthrough. The implemented validation deliberately uses the representative protocol above. These remaining items are unmeasured, not passing acceptance claims:

- [ ] Both resolutions on both maps, recorded early/late match snapshots and separate 20-second clips for every scenario.
- [ ] Camera GPU timestamps, prolonged dense-update comparisons against the previous checkout, and complete end-to-end CPU-plus-GPU accounting.
- [ ] Fixed-animation-time framebuffer parity for all overlays, a newly created human city in the short smoke, and the full death/ambient/map-switch walkthrough.

The browser reference forces full view dispatch and full plot uploads on the current implementation; it is not an old-checkout FPS baseline. Full detail and timing limitations are in [the validation report](../../../simplefront/docs/performance/render-cache-validation.md).

## Follow-up only if measurements justify it

Move hover/ownership dimming into the camera only if global hover invalidation dominates the real measurements. That requires preserving border/plot/urban alpha semantics and overlay ordering; it is not part of the first optimization.

For new snow/weather/water visuals, start with a snow-free base texture, cached hillshade and water mask, low-frequency snow coverage and time-driven water sampling. Profile those features separately. Do not add them to the performance patch or claim the current test measured them.

## Execution notes

The user approved implementation in the current checkout. Changes remain uncommitted for review; no automatic commit, merge or push was requested. The initial full-only integration step was followed by the sparse backend in the same implementation session. Region IDs use an encoded staging-buffer copy, which also preserves ordering between multiple encoded but unsubmitted frames.

Production GPU validation passed seven byte-exact cases on the M2 Max. At 1.56% dirty coverage, the real region path measured 0.023 ms median versus 0.627 ms full (27.6× isolated compute speedup). See the validation report for raw data, timing boundaries and browser-test limitations.
