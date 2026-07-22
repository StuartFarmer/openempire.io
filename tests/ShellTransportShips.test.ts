import { describe, expect, test } from "vitest";
import { buildTransportShipInstances } from "../src/client/shell/CameraRenderer";
import {
  packTransportShips,
  SHELL_TRANSPORT_STRIDE,
} from "../src/client/webgpu/ShellSimProtocol";
import { UnitType } from "../src/core/game/Game";

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
});
