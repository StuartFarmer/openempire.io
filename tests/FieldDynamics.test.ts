import { grazing } from "../src/client/lab/systems/grazing/system";
import { terrain } from "../src/client/lab/systems/terrain/system";
import {
  compileFieldSystem,
  FieldDynamicsError,
  type CompiledFieldSystem,
  type FieldSystem,
} from "../src/client/webgpu/FieldDynamics";

function passByName(compiled: CompiledFieldSystem, name: string) {
  const pass = compiled.kernelConfig.passes.find((p) => p.name === name);
  expect(pass, `pass "${name}" should exist`).toBeDefined();
  return pass!;
}

describe("compileFieldSystem (unified layers)", () => {
  let compiled: CompiledFieldSystem;
  beforeAll(async () => {
    compiled = await compileFieldSystem(grazing);
  });

  test("discovers dynamic layers from layers/*.wesl and emits all pass kinds", () => {
    expect(compiled.layerNames).toEqual(["grass", "herd"]);
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
        "view/fertility",
        "view/pressure",
      ]),
    );
  });

  test("derives binds from the qualified registry references, layers sorted by name", () => {
    // grass.wesl references params:: plus layers::{crop, grass, herd}.
    expect(passByName(compiled, "stock/grass").binds).toEqual([
      "P",
      "crop",
      "grass.read",
      "herd.read",
      "grass.write",
    ]);
    // herd.wesl references params:: plus layers::{grass, herd, land}.
    expect(passByName(compiled, "stock/herd").binds).toEqual([
      "P",
      "grass.read",
      "herd.read",
      "land",
      "herd.write",
    ]);
  });

  test("dynamic and map layers get the identical state-module API", () => {
    const stock = passByName(compiled, "stock/herd");
    expect(stock.raw).toBe(true);
    expect(stock.code).toContain("@compute");
    // Self-reads via the aliased layer module resolve to the ping-pong read
    // buffer; the qualified accessors are mangled but present.
    expect(stock.code).toContain("fn update(");
    expect(stock.code).toMatch(/fn avg8/);
    expect(stock.code).toContain("out_field[refOf(x, y)] = update(");
    // land (map layer) is read through the same generated module as herd.
    expect(stock.code).toMatch(/fn val/);
  });

  test("stock passes do not advance (synchronous commit is the tick's job)", () => {
    expect(passByName(compiled, "stock/grass").advances).toBeUndefined();
    expect(passByName(compiled, "init/grass").advances).toEqual(["grass"]);
    expect(passByName(compiled, "brush/seedHerds").advances).toEqual(["herd"]);
  });

  test("a map layer is viewable exactly like a dynamic layer", () => {
    const view = passByName(compiled, "view/fertility");
    expect(view.binds).toEqual(["crop", "land", "out"]);
  });

  test("view from a .wesl source links value() and masks ocean", () => {
    const view = passByName(compiled, "view/pressure");
    expect(view.raw).toBe(true);
    expect(view.binds).toContain("out");
    expect(view.binds).toContain("land");
    expect(view.code).toContain("fn value(");
    expect(view.code).toContain("textureStore");
  });

  test("collects only the referenced map layers", () => {
    expect(compiled.mapLayers).toEqual(["crop", "land"]);
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

  test("dynamic layers are ping-pong and migratable; map layers are static uploads", () => {
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

describe("update phases", () => {
  const layer = (reads: string) => `
import package::layers;
fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
fn update(x: i32, y: i32, i: u32) -> f32 { return layers::${reads}::val(i); }
`;
  const twoLayers: FieldSystem = {
    id: "t",
    name: "t",
    views: { a: { layer: "a", ramp: ["#000000", "#ffffff"] } },
    modules: { "layers/a.wesl": layer("b"), "layers/b.wesl": layer("a") },
  };

  function recordTick(compiled: CompiledFieldSystem): string[] {
    const calls: string[] = [];
    const frame = { pass: (n: string) => calls.push(`pass:${n}`) };
    const kernel = { swap: (n: string) => calls.push(`swap:${n}`) };
    compiled.runTick(
      kernel as unknown as Parameters<typeof compiled.runTick>[0],
      frame as unknown as Parameters<typeof compiled.runTick>[1],
    );
    return calls;
  }

  test("default: one synchronous phase — all stocks, then one commit", async () => {
    const compiled = await compileFieldSystem(twoLayers);
    expect(recordTick(compiled)).toEqual([
      "pass:sim/zero",
      "pass:stock/a",
      "pass:stock/b",
      "swap:a",
      "swap:b",
    ]);
  });

  test("phases stage the commits so later phases read current-tick values", async () => {
    const compiled = await compileFieldSystem({
      ...twoLayers,
      phases: [["b"], ["a"]],
    });
    expect(recordTick(compiled)).toEqual([
      "pass:sim/zero",
      "pass:stock/b",
      "swap:b",
      "pass:stock/a",
      "swap:a",
    ]);
  });

  test("unlisted updated layers fall into a final implicit phase", async () => {
    const compiled = await compileFieldSystem({
      ...twoLayers,
      phases: [["b"]],
    });
    expect(recordTick(compiled)).toEqual([
      "pass:sim/zero",
      "pass:stock/b",
      "swap:b",
      "pass:stock/a",
      "swap:a",
    ]);
  });

  test("phases naming unknown or update-less layers are diagnostics", async () => {
    await expect(
      compileFieldSystem({ ...twoLayers, phases: [["ghost"]] }),
    ).rejects.toThrow(/phases\[0\]: "ghost" is not a dynamic layer/);
    await expect(
      compileFieldSystem({ ...twoLayers, phases: [["a"], ["a"]] }),
    ).rejects.toThrow(/appears more than once/);
  });
});

describe("typed layers, per-player scalars, players registry (phase 1)", () => {
  const OWNER = `
import package::layers;
fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }
fn update(x: i32, y: i32, i: u32) -> u32 {
  if (layers::owner::any8_ne(x, y, layers::owner::val(i))) {
    return layers::owner::val(i);
  }
  return layers::owner::val(i);
}
`;
  const TROOPS = `
import package::layers;
import package::players;
fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
fn update(x: i32, y: i32, i: u32) -> f32 {
  let owner = layers::owner::val(i);
  let alive = players::val(owner).alive;
  return layers::troops::val(i) * f32(alive) + f32(players::count()) * 0.0;
}
`;
  const territory: FieldSystem = {
    id: "territory",
    name: "Territory",
    players: {
      count: 8,
      fields: { alive: "u32", targetX: "f32", targetY: "f32" },
    },
    scalars: {
      tilesOwned: { reduce: "count", groupBy: "owner" },
      totalTroops: { reduce: "sum", layer: "troops", groupBy: "owner" },
      peakTroops: { reduce: "max", layer: "troops" },
    },
    views: { troops: { layer: "troops", ramp: ["#000000", "#ffffff"] } },
    modules: { "layers/owner.wesl": OWNER, "layers/troops.wesl": TROOPS },
  };

  let compiled: CompiledFieldSystem;
  beforeAll(async () => {
    compiled = await compileFieldSystem(territory);
  });

  test("layer type comes from the init signature", () => {
    const buffer = (name: string) =>
      compiled.kernelConfig.buffers.find((b) => b.name === name);
    expect(buffer("owner")?.type).toBe("u32");
    expect(buffer("troops")?.type).toBe("f32");
  });

  test("id layers get equality helpers; roots are typed", () => {
    const stock = passByName(compiled, "stock/owner");
    expect(stock.code).toContain("fn any8_ne(");
    expect(stock.code).toContain("array<u32>");
    expect(stock.code).toContain("out_field[refOf(x, y)] = update(");
  });

  test("players registry links get()/count() from the manifest struct", () => {
    const stock = passByName(compiled, "stock/troops");
    expect(stock.binds).toContain("PL");
    expect(stock.code).toContain("struct Player");
    expect(stock.code).toContain("targetX: f32");
    expect(stock.code).toMatch(/fn val\d*\(p: u32\) -> Player/);
  });

  test("grouped scalars take playerCount slots and decode as arrays", () => {
    // S = tick + tilesOwned[8] + totalTroops[8] + peakTroops = 18 words.
    const sim = compiled.kernelConfig.buffers.find((b) => b.name === "S");
    expect(sim?.count).toBe(18);

    const bytes = new ArrayBuffer(18 * 4);
    const view = new DataView(bytes);
    view.setUint32(0, 7, true); // tick
    view.setInt32(4 + 3 * 4, 5 * 256, true); // tilesOwned[3] = 5
    view.setInt32(4 + 8 * 4 + 2 * 4, Math.round(12.5 * 256), true); // totalTroops[2]
    view.setFloat32(4 + 16 * 4, 0.5, true); // peakTroops
    const decoded = compiled.decodeScalars(bytes);
    expect(decoded.tick).toBe(7);
    expect((decoded.values.tilesOwned as number[])[3]).toBeCloseTo(5);
    expect((decoded.values.totalTroops as number[])[2]).toBeCloseTo(12.5);
    expect(decoded.values.peakTroops).toBeCloseTo(0.5);
  });

  test("grouped reduce indexes by the group layer with a bounds guard", () => {
    const reduce = passByName(compiled, "reduce/totalTroops");
    expect(reduce.binds).toEqual(["troops.read", "owner.read", "S:SimAtomic!"]);
    expect(reduce.code).toContain("let g = u32(owner_in[i]);");
    expect(reduce.code).toContain("if (g >= 8u) { return; }");
  });

  test("writePlayers packs fields in declaration order", () => {
    expect(compiled.playerCount).toBe(8);
    const data = compiled.writePlayers([
      { alive: 1, targetX: 10.5, targetY: -3 },
      { alive: 0, targetX: 0, targetY: 0 },
    ]);
    expect(data.byteLength).toBe(8 * 3 * 4);
    const view = new DataView(data);
    expect(view.getUint32(0, true)).toBe(1);
    expect(view.getFloat32(4, true)).toBeCloseTo(10.5);
    expect(view.getFloat32(8, true)).toBeCloseTo(-3);
    expect(view.getUint32(12, true)).toBe(0); // player 1 alive
  });

  test("groupBy without a players block is a diagnostic", async () => {
    await expect(
      compileFieldSystem({
        ...territory,
        players: undefined,
        scalars: { t: { reduce: "count", groupBy: "owner" } },
      }),
    ).rejects.toThrow(/groupBy requires the "players" block/);
  });

  test("groupBy over an f32 layer is a diagnostic", async () => {
    await expect(
      compileFieldSystem({
        ...territory,
        scalars: { t: { reduce: "count", groupBy: "troops" } },
      }),
    ).rejects.toThrow(/must be a u32\/i32 dynamic layer/);
  });

  test("init/update type mismatch is a diagnostic", async () => {
    await expect(
      compileFieldSystem({
        ...territory,
        modules: {
          ...territory.modules,
          "layers/bad.wesl": `
fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }
fn update(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
`,
        },
      }),
    ).rejects.toThrow(/a layer has one type/);
  });
});

describe("compileFieldSystem diagnostics", () => {
  const LAYER_A = `
import package::layers;
fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
fn update(x: i32, y: i32, i: u32) -> f32 { return layers::a::val(i); }
`;
  const base: FieldSystem = {
    id: "t",
    name: "t",
    views: { a: { layer: "a", ramp: ["#000000", "#ffffff"] } },
    modules: { "layers/a.wesl": LAYER_A },
  };

  test("referencing an undeclared layer through the registry", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        modules: {
          "layers/a.wesl": LAYER_A.replace(
            "layers::a::val(i)",
            "layers::ghost::val(i)",
          ),
        },
      }),
    ).rejects.toThrow(/"ghost" is not a layer/);
  });

  test("referencing an undeclared param through the registry", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        modules: {
          "layers/a.wesl": LAYER_A.replace(
            "layers::a::val(i)",
            "layers::a::val(i) * params::ghost()",
          ).replace(
            "import package::layers;",
            "import package::layers;\nimport package::params;",
          ),
        },
      }),
    ).rejects.toThrow(/"params::ghost" is not a declared param/);
  });

  test("the retired namespaces point at the new ones", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        modules: {
          "layers/a.wesl": `import package::api::fields::a;\n${LAYER_A}`,
        },
      }),
    ).rejects.toThrow(/package::api is gone/);
  });

  test("a WESL-level unknown import fails at link with the real file path", async () => {
    // Note: wesl only resolves imports that are actually referenced, and the
    // internal dyn/ remap must not leak into error messages.
    await expect(
      compileFieldSystem({
        ...base,
        modules: {
          "layers/a.wesl": `import package::lib::missing;\n${LAYER_A.replace(
            "return layers::a::val(i);",
            "return layers::a::val(i) + missing();",
          )}`,
        },
      }),
    ).rejects.toThrow(/layers\/a\.wesl/);
  });

  test("layer file without fn init", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        modules: {
          "layers/a.wesl":
            "fn update(x: i32, y: i32, i: u32) -> f32 { return 0.0; }",
        },
      }),
    ).rejects.toThrow(/must define "fn init/);
  });

  test("a dynamic layer may not shadow a map layer", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        modules: { ...base.modules, "layers/crop.wesl": LAYER_A },
      }),
    ).rejects.toThrow(/invalid or reserved/);
  });

  test("brushing a map layer is rejected (read-only)", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        brushes: { b: { target: "crop", mode: "set", value: 1, radius: 2 } },
      }),
    ).rejects.toThrow(/map layer \(read-only\)/);
  });

  test("brush targeting an unknown layer", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        brushes: { b: { target: "ghost", mode: "set", value: 1, radius: 2 } },
      }),
    ).rejects.toThrow(FieldDynamicsError);
  });

  test("view without a valid layer or source", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        views: { bad: { layer: "ghost", ramp: ["#000000", "#ffffff"] } },
      }),
    ).rejects.toThrow(/needs "layer".*or "source"/);
  });

  test("invalid ramp color", async () => {
    await expect(
      compileFieldSystem({
        ...base,
        views: { a: { layer: "a", ramp: ["#000000", "chartreuse"] } },
      }),
    ).rejects.toThrow(/invalid ramp color/);
  });
});

describe("compileFieldSystem — derivation stage", () => {
  // A minimal on-demand derivation: one grid pass (copy·2) into a scratch
  // field, then an iterated ping-pong pass, plus a fixed-count accumulator.
  const deriveSystem: FieldSystem = {
    id: "d",
    name: "d",
    views: { probe: { layer: "probe", ramp: ["#000000", "#ffffff"] } },
    derive: {
      fields: {
        src: { type: "f32" },
        dst: { type: "f32" },
        hist: { type: "u32", count: 4 },
      },
      steps: [
        { pass: "copy", binds: ["src", "dst!"] },
        {
          pass: "relax",
          binds: ["dst.read", "dst.write"],
          iterate: 3,
          advances: ["dst"],
        },
      ],
      typeImports: "",
    },
    modules: {
      "layers/probe.wesl":
        "fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }",
      "passes/copy.wesl":
        "import package::bindings::{src, dst};\nfn tile(x: i32, y: i32, i: u32) { dst[i] = src[i] * 2.0; }",
      "passes/relax.wesl":
        "import package::bindings::{dst_in, dst_out};\nfn tile(x: i32, y: i32, i: u32) { dst_out[i] = dst_in[i]; }",
    },
  };

  let compiled: CompiledFieldSystem;
  beforeAll(async () => {
    compiled = await compileFieldSystem(deriveSystem);
  });

  test("links the derivation passes and reports derived fields", () => {
    const names = compiled.kernelConfig.passes.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["copy", "relax"]));
    expect(compiled.derivedNames).toEqual(["src", "dst", "hist"]);
  });

  test("derived buffers: advanced fields ping-pong, fixed-count preserved", () => {
    const buf = (name: string) =>
      compiled.kernelConfig.buffers.find((b) => b.name === name);
    expect(buf("dst")?.pingPong).toBe(true); // advanced by `relax`
    expect(buf("src")?.pingPong).toBeFalsy();
    expect(buf("hist")?.type).toBe("u32");
    expect(buf("hist")?.count).toBe(4);
  });

  test("runDerive emits the pipeline program (pass then iterate)", () => {
    const calls: string[] = [];
    const frame = {
      pass: (n: string) => calls.push(`pass:${n}`),
      iterate: (n: string, c: number) => calls.push(`iter:${n}:${c}`),
    };
    compiled.runDerive(
      frame as unknown as Parameters<typeof compiled.runDerive>[0],
    );
    expect(calls).toEqual(["pass:copy", "iter:relax:3"]);
  });

  test("the worldgen compiles as a derive system (no layers, custom uniform)", async () => {
    // Phase 2: the whole worldgen — its real .wesl pass bodies — links through
    // the derive stage. A successful compile means every pass's bindings,
    // iterate, atomic globals, and single-dispatch resolve.
    const compiled = await compileFieldSystem(terrain);
    const names = compiled.kernelConfig.passes.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "flags_from_mask",
        "histogram",
        "quantile",
        "climate",
        "fill_step",
        "flow_dir",
        "water_step",
        "irrigation_step",
        "humidity_biome",
        "color",
      ]),
    );
    // Custom Params uniform (worldgen layout), not the manifest-generated one.
    const p = compiled.kernelConfig.uniforms?.find((u) => u.name === "P");
    expect(p?.bytes).toBe(96);
    // Fixed-count accumulators and ping-pong scratch survive.
    const buf = (n: string) =>
      compiled.kernelConfig.buffers.find((b) => b.name === n);
    expect(buf("hist")?.count).toBe(256);
    expect(buf("G")?.count).toBe(4);
    expect(buf("fill")?.pingPong).toBe(true);
    // The dispatch program: iterated drainage/flow, single-dispatch quantile.
    const calls: string[] = [];
    compiled.runDerive({
      pass: (n: string) => calls.push(`p:${n}`),
      iterate: (n: string, c: number) => calls.push(`i:${n}:${c}`),
    } as unknown as Parameters<typeof compiled.runDerive>[0]);
    expect(calls[0]).toBe("p:flags_from_mask");
    expect(calls).toContain("i:fill_step:320");
    expect(calls).toContain("i:water_step:320");
    expect(calls).toContain("i:irrigation_step:8");
    expect(calls[calls.length - 1]).toBe("p:color");
  });

  test("a system without a derivation has none and runDerive is a no-op", async () => {
    const plain = await compileFieldSystem({
      id: "p",
      name: "p",
      views: { probe: { layer: "probe", ramp: ["#000000", "#ffffff"] } },
      modules: {
        "layers/probe.wesl":
          "fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }",
      },
    });
    expect(plain.derivedNames).toEqual([]);
    const calls: string[] = [];
    plain.runDerive({
      pass: (n: string) => calls.push(n),
      iterate: () => calls.push("iter"),
    } as unknown as Parameters<typeof plain.runDerive>[0]);
    expect(calls).toEqual([]);
  });
});
