# Shell Transport Ship Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show active troop transport ships moving across water in `#shell` with the live client's sprite, size, colors, and between-tick interpolation.

**Architecture:** The worker serializes active `TransportShip` units into four-word records. `GameShellPage` joins them with its existing exact theme palette, and `CameraRenderer` uploads one compact instance buffer and draws it after terrain with an instanced WebGPU pipeline.

**Tech Stack:** TypeScript, Vitest, Web Workers, WebGPU/WGSL, existing `unit-atlas.png`.

## Global Constraints

- Render `TransportShip` only; exclude trade ships and warships.
- Reuse the unit atlas and ThemeProvider-derived fill/border colors.
- Match the live client's 13-tile cell, nearest sampling, gray bands, and 100 ms interpolation.
- Add no dependency and no generalized mobile-unit framework.
- Sprite-load failure must leave terrain and simulation operational.

---

### Task 1: Serialize transport ships

**Files:**

- Modify: `src/client/webgpu/ShellSimProtocol.ts`
- Modify: `src/client/webgpu/ShellSim.worker.ts`
- Test: `tests/ShellTransportShips.test.ts`

**Interfaces:**

- Produces `SHELL_TRANSPORT_STRIDE = 4`.
- Produces `packTransportShips(units): Int32Array` records `[id, tile, lastTile, ownerSmallID]`.
- Extends `ShellSimFrame` with `transportShips: Int32Array`.

- [ ] **Step 1: Write the failing serializer test**

```ts
import { describe, expect, test } from "vitest";
import { UnitType } from "../src/core/game/Game";
import {
  packTransportShips,
  SHELL_TRANSPORT_STRIDE,
} from "../src/client/webgpu/ShellSimProtocol";

const unit = (type: UnitType, active: boolean, id: number) => ({
  type: () => type,
  isActive: () => active,
  id: () => id,
  tile: () => 102,
  lastTile: () => 101,
  owner: () => ({ smallID: () => 3 }),
});

describe("shell transport ships", () => {
  test("packs only active troop transports", () => {
    const packed = packTransportShips([
      unit(UnitType.TransportShip, true, 7),
      unit(UnitType.TransportShip, false, 8),
      unit(UnitType.TradeShip, true, 9),
      unit(UnitType.Warship, true, 10),
    ]);
    expect(SHELL_TRANSPORT_STRIDE).toBe(4);
    expect([...packed]).toEqual([7, 102, 101, 3]);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/ShellTransportShips.test.ts`

Expected: FAIL because both exports are missing.

- [ ] **Step 3: Add the minimal serializer**

```ts
export const SHELL_TRANSPORT_STRIDE = 4;

export function packTransportShips(units: readonly ShellTransportSource[]) {
  const out: number[] = [];
  for (const unit of units) {
    if (unit.type() !== UnitType.TransportShip || !unit.isActive()) continue;
    out.push(
      unit.id(),
      Number(unit.tile()),
      Number(unit.lastTile()),
      unit.owner().smallID(),
    );
  }
  return Int32Array.from(out);
}
```

Define `ShellTransportSource` beside the function with exactly the six methods used above. Import `UnitType` as a runtime value. Add `transportShips` to `ShellSimFrame`; in `buildFrame`, call `packTransportShips(g.units(UnitType.TransportShip))`, place it on the frame, and transfer its buffer.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/ShellTransportShips.test.ts`

Expected: PASS, one test.

---

### Task 2: Draw exact transport sprites

**Files:**

- Modify: `src/client/shell/CameraRenderer.ts`
- Modify: `tests/ShellTransportShips.test.ts`

**Interfaces:**

- Produces `buildTransportShipInstances(ships, mapWidth, fill, border): ArrayBuffer`.
- Produces `CameraRenderer.setTransportShips(ships, fill, border): void`.

- [ ] **Step 1: Add the failing instance-layout test**

```ts
import { buildTransportShipInstances } from "../src/client/shell/CameraRenderer";

test("builds aligned camera instances with exact palette colors", () => {
  const fill = new Uint32Array(256);
  const border = new Uint32Array(256);
  fill[3] = 0x112233;
  border[3] = 0x445566;
  const buffer = buildTransportShipInstances(
    new Int32Array([7, 102, 101, 3]),
    10,
    fill,
    border,
  );
  expect(buffer.byteLength).toBe(32);
  expect([...new Float32Array(buffer).slice(0, 4)]).toEqual([2, 10, 1, 10]);
  expect([...new Uint32Array(buffer).slice(4, 8)]).toEqual([
    0x112233, 0x445566, 3, 0,
  ]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/ShellTransportShips.test.ts`

Expected: FAIL because `buildTransportShipInstances` is missing.

- [ ] **Step 3: Add the 32-byte instance builder**

```ts
export function buildTransportShipInstances(
  ships: Int32Array,
  mapWidth: number,
  fill: Uint32Array,
  border: Uint32Array,
): ArrayBuffer {
  const buffer = new ArrayBuffer((ships.length / 4) * 32);
  const floats = new Float32Array(buffer);
  const words = new Uint32Array(buffer);
  for (let s = 0, i = 0; s < ships.length; s += 4, i += 8) {
    const current = ships[s + 1];
    const previous = ships[s + 2];
    const owner = ships[s + 3];
    floats.set(
      [
        current % mapWidth,
        Math.floor(current / mapWidth),
        previous % mapWidth,
        Math.floor(previous / mapWidth),
      ],
      i,
    );
    words.set([fill[owner] ?? 0, border[owner] ?? 0, owner], i + 4);
  }
  return buffer;
}
```

- [ ] **Step 4: Verify the builder is GREEN**

Run: `npm test -- tests/ShellTransportShips.test.ts`

Expected: PASS, two tests.

- [ ] **Step 5: Add the minimal WebGPU pass**

Add `BOAT_WGSL` beside `RENDER_WGSL`. It shares the camera uniform, reads 32-byte storage records, interpolates previous/current using `CAM.boatAlpha`, and emits a 13-by-13 tile quad. The fragment stage samples the first 13-by-13 atlas cell with nearest filtering, discards transparent pixels, and copies the live shader thresholds: `> 0.6` fill, `> 0.45` midpoint, `> 0.34` fill, otherwise border. Copy the existing `ownerColor` fallback from `openfront.wesl` for zero palette slots.

In `CameraRenderer.create`, load `assetUrl("atlases/unit-atlas.png")`, crop its first 13-by-13 cell, and build an alpha-blended pipeline. Catch loading/pipeline errors and retain a null boat pass. Add a grow-on-demand storage buffer. `setTransportShips` builds/uploads instances and records `performance.now()`; `render` writes `min(1, elapsed / 100)` to camera uniform word 6 and calls `pass.draw(6, boatCount)` after terrain.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- tests/ShellTransportShips.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

---

### Task 3: Join worker snapshots to exact shell colors

**Files:**

- Modify: `src/client/GameShellPage.ts`

**Interfaces:**

- Consumes `ShellSimFrame.transportShips` and `CameraRenderer.setTransportShips`.

- [ ] **Step 1: Mirror the existing palette and forward each snapshot**

Add `playerFill` and `playerBorder` as 256-entry `Uint32Array`s. In `assignPaletteSlot`, store the already-packed fill and border in those arrays before `mergePlayerIntent`. In `onWorkerFrame`, process names first and then call:

```ts
this.renderer?.setTransportShips(
  f.transportShips,
  this.playerFill,
  this.playerBorder,
);
```

In `destroySim`, send an empty transport snapshot and zero both palette arrays.

- [ ] **Step 2: Format touched files**

Run: `npx prettier --write src/client/webgpu/ShellSimProtocol.ts src/client/webgpu/ShellSim.worker.ts src/client/shell/CameraRenderer.ts src/client/GameShellPage.ts tests/ShellTransportShips.test.ts`

Expected: no errors.

- [ ] **Step 3: Verify the focused behavior and branch baseline**

Run: `npx tsc --noEmit`

Expected: PASS.

Run: `npm test -- tests/ShellTransportShips.test.ts tests/BorderSegment.test.ts`

Expected: PASS.

Run: `npm test`

Expected: no new failure beyond the documented pre-existing `AiAttackBehavior` failure.

- [ ] **Step 4: Commit implementation**

Run: `git add src/client/webgpu/ShellSimProtocol.ts src/client/webgpu/ShellSim.worker.ts src/client/shell/CameraRenderer.ts src/client/GameShellPage.ts tests/ShellTransportShips.test.ts`

Run: `git commit -m "feat: render transport ships in shell"`
