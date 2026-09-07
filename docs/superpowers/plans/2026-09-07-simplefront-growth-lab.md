# SimpleFront Growth Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. User requested direct execution; no subagents or commits.

**Goal:** A separate demos gallery with an editable, deterministic urban-growth experiment.

**Architecture:** A pure TypeScript model and scenario codec drive a Lit/Canvas demo. A separate HTML entry mounts a small gallery, without importing the game bootstrap. All production changes remain in `simplefront/`.

**Tech Stack:** Existing TypeScript, Lit, Canvas 2D, Vite and Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-simplefront-growth-lab-design.md`

## Global Constraints

- Gameplay remains unchanged; demos have their own entirely separate gallery.
- No additional dependencies, server, workers, commits or deployment.
- Execute inline in the existing checkout, preserving unrelated work.
- Heights normalized 0–1; fixed 0.25-second simulation steps.
- Population values are capacity, not actual residents or troops.

## Task 1: Pure growth and terrain model

Files: `simplefront/src/demos/urban-growth/{config,terrain,model,presets,scenario}.ts`,
`simplefront/tests/GrowthLabModel.test.ts`, `simplefront/tests/GrowthLabScenario.test.ts`.

Interfaces: `GrowthConfig`, `Terrain`, `GrowthModel(terrain,config,seed,centre)`;
`step():void`, `candidates()`, `inspect(tile)`, `stats()`; `PRESETS`,
`createScenario(presetId,seed?)`, `encodeScenario(scenario)`, `decodeScenario(text)`.

- [x] Write failing model/terrain/codec tests. Core fixture:
  ```ts
  const m = new GrowthModel(
    flatTerrain(9),
    { ...DEFAULT_CONFIG, reach: 0 },
    7,
    40,
  );
  for (let i = 0; i < 400; i++) m.step();
  expect(m.stats().area).toBe(1);
  expect(m.stats().capacity).toBeGreaterThan(100);
  ```
  Also assert hand-computed capacities 100/575/2000 at maturity 0/.5/1;
  BFS from centre reaches every developed tile; water never develops; capacity
  never exceeds cap; identical seeds replay; terrain influences suitability and
  development; all six scenarios run. Reject NaN, invalid dimensions and water centres.
- [x] Run `npm test -- tests/GrowthLabModel.test.ts tests/GrowthLabScenario.test.ts` from `simplefront/`; confirm missing-feature failure.
- [x] Implement finite validated settings; seeded terrain and slope/water fields;
      fixed-step shared-budget growth, weighted candidates, metrics and codec.
  ```ts
  const grant = Math.min(
    remaining,
    config.rate * suitability * (1 - capacity / config.ceiling) * 0.25,
  );
  ```
  A new tile accumulates `ruralCapacity` before appearing. Densification grants
  are clipped to the local target. No grant outside the shared budget.
- [x] Rerun focused tests and typecheck; correct any reproduced defects.

## Task 2: Interactive demo and separate gallery

Files: `simplefront/demos/index.html`, `simplefront/src/demos/{main,DemoGallery}.ts`,
`simplefront/src/demos/demos.css`, `simplefront/src/demos/urban-growth/{UrbanGrowthDemo,render}.ts`,
`simplefront/tests/GrowthLabUI.test.ts`, `simplefront/vite.config.ts`.

Interfaces: `<demo-gallery>` selects `#urban-growth`; `<urban-growth-demo>` owns
the scenario/model, paused terrain draft and animation lifecycle. Canvas renderer
consumes real model snapshots; no copy of simulation formulas in the UI.

- [x] Write failing real-element tests for gallery navigation, six presets,
      step/reset, settings apply, terrain edit/cancel/apply, import rejection and
      disconnection stopping animation.
  ```ts
  demo.querySelector<HTMLButtonElement>("[data-step]")!.click();
  await demo.updateComplete;
  expect(demo.model.stats().seconds).toBe(0.25);
  ```
- [x] Run `npm test -- tests/GrowthLabUI.test.ts`; observe expected failure.
- [x] Implement gallery and accessible Lit controls, responsive scoped styling,
      canvas layers/hover/chart rendering, bounded RAF stepping, scenario download
      and file import. Cancel RAF on pause, hidden document, gallery return and removal.
- [x] Add only the separate build input alongside the current game HTML:
  ```ts
  input: { game: path.resolve(__dirname, 'index.html'), demos: path.resolve(__dirname, 'demos/index.html') }
  ```
  Keep app bootstrap/picker/toolbars untouched. Verify the installed HTML plugin's
  multipage injection retains original game asset globals.
- [x] Rerun UI/model suites, typecheck and lint.

## Task 3: Verification and handoff

Files: `simplefront/docs/growth-lab.md`; update this checklist with evidence.

- [x] Run all copied tests, typecheck, `eslint src tests scripts`, production build
      and root picker/runtime-isolation tests. Preserve root tracked diff at 8 files,
      74 insertions, 1 deletion.
- [x] Browse `/simplefront/demos/` on the existing port-9000 server. Select lab;
      exercise all presets, Play/Pause/Step/speeds, terrain edits, setting changes,
      chart/overlay/inspector, reset, export/import and gallery return. Observe no
      page errors. Check narrow viewport and final screenshot.
- [x] Document exact URL, controls, formulas, limits and verification. Clearly
      distinguish this experimental lab from the unchanged playable game.

## Delivery evidence

Implemented inline without commits, deployment, a new server or gameplay changes.
205 copied tests / 31 suites and 35 root picker/isolation tests / 2 suites pass.
Typecheck, scoped ESLint and copied production build pass. Root tracked diff is
unchanged at 8 files, 74 insertions, 1 deletion.

Browser verification used the user's existing port-9000 server and an isolated
Chromium context. All six presets, timed 20× growth, all overlays, terrain brush
and apply, settings and zero rate, real JSON download/upload, 390-pixel layout
and gallery return passed with no page errors. Final river-valley observation:
300.25 simulated seconds, 24 tiles, 18697.27 capacity, 779.05 capacity/tile.

The installed HTML plugin selects pages relative to process cwd, incompatible
with sharing raw game template injection across hosted and standalone multipage
builds. The copied config now uses a small native, game-file-only substitution
hook preserving the existing template values, plus the separate demos input.
No game bootstrap, toolbar, picker, core, worker or root config was edited.

Inline review found the pending-construction allocation and final rounding
issues; failing regressions preceded both fixes. The approved qualitative
sprawl-to-density behaviour is now represented explicitly in the calibrated
category preference. See `simplefront/docs/growth-lab.md` for exact formulas,
variables, screenshots and measured comparisons.
