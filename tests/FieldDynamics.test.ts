import { grazing } from "../src/client/lab/systems/grazing";
import {
  compileFieldSystem,
  FieldDynamicsError,
  type FieldSystem,
} from "../src/client/webgpu/FieldDynamics";

function passByName(
  compiled: ReturnType<typeof compileFieldSystem>,
  name: string,
) {
  const pass = compiled.kernelConfig.passes.find((p) => p.name === name);
  expect(pass, `pass "${name}" should exist`).toBeDefined();
  return pass!;
}

describe("compileFieldSystem", () => {
  const compiled = compileFieldSystem(grazing);

  test("emits init, stock, reduce, brush, and view passes", () => {
    const names = compiled.kernelConfig.passes.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "init/grass",
        "init/herd",
        "sim/zero",
        "stock/grass",
        "stock/herd",
        "reduce/totalHerd",
        "reduce/peakGrass",
        "brush/seedHerds",
        "view/herds",
      ]),
    );
  });

  test("infers binds from raw WGSL bodies", () => {
    // grass update reads P, crop, grass_in, herd_in; writes grass_out.
    expect(passByName(compiled, "stock/grass").binds).toEqual([
      "P",
      "crop",
      "grass.read",
      "herd.read",
      "grass.write",
    ]);
    // herd update additionally reads land and uses avg8_herd (→ herd.read).
    expect(passByName(compiled, "stock/herd").binds).toEqual([
      "P",
      "land",
      "grass.read",
      "herd.read",
      "herd.write",
    ]);
    // init/grass reads only the crop plane.
    expect(passByName(compiled, "init/grass").binds).toEqual([
      "crop",
      "grass.write",
    ]);
  });

  test("stock passes do not advance (synchronous commit is the tick's job)", () => {
    expect(passByName(compiled, "stock/grass").advances).toBeUndefined();
    expect(passByName(compiled, "stock/herd").advances).toBeUndefined();
    expect(passByName(compiled, "init/grass").advances).toEqual(["grass"]);
    expect(passByName(compiled, "brush/seedHerds").advances).toEqual(["herd"]);
  });

  test("injects neighbor helper for avg8_herd", () => {
    const code = passByName(compiled, "stock/herd").code;
    expect(code).toContain("fn avg8_herd(px: i32, py: i32) -> f32");
    expect(code).toContain("herd_in[refOf(q.x, q.y)]");
  });

  test("collects only the referenced map planes", () => {
    expect(compiled.mapFields).toEqual(["crop", "land"]);
  });

  test("reduce passes bind the atomic Sim view", () => {
    expect(passByName(compiled, "reduce/totalHerd").binds).toContain(
      "S:SimAtomic!",
    );
    expect(passByName(compiled, "reduce/totalHerd").binds).not.toContain(
      "S:Sim",
    );
  });

  test("params pack in declaration order with trailing seed", () => {
    const data = compiled.writeParams({ grazeRate: 0.5 }, 1337);
    const view = new DataView(data);
    expect(data.byteLength % 16).toBe(0);
    expect(view.getFloat32(0, true)).toBeCloseTo(0.04); // grassGrowth default
    expect(view.getFloat32(4, true)).toBeCloseTo(0.5); // grazeRate override
    expect(view.getInt32(5 * 4, true)).toBe(1337); // seed after 5 params
  });

  test("scalar codec round-trips fixed-point sums and bitcast maxes", () => {
    const bytes = new ArrayBuffer(4 * (1 + compiled.scalarNames.length));
    const view = new DataView(bytes);
    view.setUint32(0, 42, true); // tick
    view.setInt32(4, Math.round(123.5 * 256), true); // totalHerd sum, fx 256
    view.setFloat32(8, 0.75, true); // peakGrass max, raw f32 bits
    const decoded = compiled.decodeScalars(bytes);
    expect(decoded.tick).toBe(42);
    expect(decoded.values.totalHerd).toBeCloseTo(123.5);
    expect(decoded.values.peakGrass).toBeCloseTo(0.75);
  });

  test("brush encoding carries spec values and overrides radius", () => {
    const view = new DataView(compiled.encodeBrush("seedHerds", 10, 20, 6));
    expect(view.getFloat32(0, true)).toBe(10);
    expect(view.getFloat32(4, true)).toBe(20);
    expect(view.getFloat32(8, true)).toBe(6);
    expect(view.getFloat32(12, true)).toBe(1);
    expect(view.getUint32(16, true)).toBe(0); // set mode
  });

  test("stock layers are ping-pong and migratable; map planes are static uploads", () => {
    const buffer = (name: string) =>
      compiled.kernelConfig.buffers.find((b) => b.name === name);
    expect(buffer("herd")).toMatchObject({
      pingPong: true,
      clearable: true,
      readable: true,
    });
    expect(buffer("crop")).toMatchObject({ clearable: true });
    expect(buffer("crop")?.pingPong).toBeUndefined();
    expect(buffer("S")).toMatchObject({ count: 3 }); // tick + 2 scalars
  });
});

describe("compileFieldSystem diagnostics", () => {
  const base: FieldSystem = {
    id: "t",
    name: "t",
    fields: { a: { init: "0.0", update: "a_out[i] = a_in[i];" } },
    views: { a: { expr: "a_in[i]", ramp: ["#000000", "#ffffff"] } },
  };

  test("unknown field reference in an update body", () => {
    expect(() =>
      compileFieldSystem({
        ...base,
        fields: {
          a: { init: "0.0", update: "a_out[i] = ghost_in[i];" },
        },
      }),
    ).toThrow(FieldDynamicsError);
  });

  test("update body that never assigns its own _out", () => {
    expect(() =>
      compileFieldSystem({
        ...base,
        fields: { a: { init: "0.0", update: "let v = a_in[i];" } },
      }),
    ).toThrow(/never assigns/);
  });

  test("brush targeting an unknown field", () => {
    expect(() =>
      compileFieldSystem({
        ...base,
        brushes: { b: { target: "ghost", mode: "set", value: 1, radius: 2 } },
      }),
    ).toThrow(FieldDynamicsError);
  });

  test("reserved field name", () => {
    expect(() =>
      compileFieldSystem({
        ...base,
        fields: {
          ...base.fields,
          crop: { init: "0.0" },
        },
      }),
    ).toThrow(/reserved/);
  });

  test("invalid ramp color", () => {
    expect(() =>
      compileFieldSystem({
        ...base,
        views: { a: { expr: "a_in[i]", ramp: ["#000000", "chartreuse"] } },
      }),
    ).toThrow(/invalid ramp color/);
  });
});
