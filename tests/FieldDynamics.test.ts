import { SHARED_WESL } from "../src/client/lab/shared";
import { grazing } from "../src/client/lab/systems/grazing/system";
import {
  composeTerrain,
  terrain,
} from "../src/client/lab/systems/terrain/system";
import {
  compileFieldSystem,
  defineFieldSystem,
  FieldDynamicsError,
  type CompiledFieldSystem,
  type FieldSystem,
} from "../src/client/webgpu/FieldDynamics";

describe("intent brushes and player outputs", () => {
  const system = defineFieldSystem({
    id: "intent-contract",
    name: "intent contract",
    players: {
      count: 3,
      localPlayer: 1,
      fields: { actionKind: "u32", actionTile: "u32", actionTick: "u32" },
      outputs: ["actionResult", "foodSpendFx"],
    },
    brushes: {
      direct: { target: "value", mode: "set", value: 1, radius: 2 },
      city: { intent: 2, radius: 0 },
    },
    views: { value: { layer: "value", ramp: ["#000000", "#ffffff"] } },
    modules: {
      "layers/value.wesl": `
      import package::playerOutputs;
      fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
      fn update(x: i32, y: i32, i: u32) -> f32 {
        if (i == 0u) { playerOutputs::set_actionResult(1u, 9u); }
        return 0.0;
      }`,
    },
  });

  test("compiles one-shot intent brushes and persistent player outputs", async () => {
    const compiled = await compileFieldSystem(system);
    expect(compiled.localPlayer).toBe(1);
    expect(compiled.playerFieldNames).toEqual([
      "actionKind",
      "actionTile",
      "actionTick",
    ]);
    expect(compiled.playerOutputNames).toEqual(["actionResult", "foodSpendFx"]);
    expect(compiled.intentForBrush("city")).toBe(2);
    expect(compiled.intentForBrush("direct")).toBeUndefined();
    expect(compiled.kernelConfig.passes.map((p) => p.name)).toContain(
      "brush/direct",
    );
    expect(compiled.kernelConfig.passes.map((p) => p.name)).not.toContain(
      "brush/city",
    );
    expect(passByName(compiled, "stock/value").binds).toContain("PO!");
    expect(passByName(compiled, "stock/value").code).toMatch(
      /@binding\(1\) var<storage, read_write> PLAYER_OUTPUTS/,
    );
    expect(compiled.kernelConfig.buffers).toContainEqual(
      expect.objectContaining({
        name: "PO",
        type: "u32",
        count: 6,
        readable: true,
        clearable: true,
      }),
    );
    const data = new ArrayBuffer(6 * 4);
    const view = new DataView(data);
    view.setUint32(2 * 2 * 4, 7, true);
    view.setUint32((2 * 2 + 1) * 4, 11, true);
    expect(compiled.decodePlayerOutputs(data)[2]).toEqual({
      actionResult: 7,
      foodSpendFx: 11,
    });
  });

  test("diagnoses invalid player output contracts", async () => {
    await expect(
      compileFieldSystem({
        ...system,
        players: { ...system.players!, localPlayer: 3 },
      }),
    ).rejects.toThrow(/players\.localPlayer/);
    await expect(
      compileFieldSystem({
        ...system,
        players: { ...system.players!, outputs: ["ok", "ok", "not valid"] },
      }),
    ).rejects.toThrow(/players\.outputs/);
    await expect(
      compileFieldSystem({
        ...system,
        players: { count: 3, fields: {} },
      }),
    ).rejects.toThrow(/brushes\.city.*actionKind/);
    await expect(
      compileFieldSystem({
        ...system,
        players: { count: 3, fields: { actionKind: "u32" } },
        brushes: undefined,
      }),
    ).rejects.toThrow(
      /package::playerOutputs requires declared players\.outputs/,
    );
  });

  test("later phases can read compact player outputs", async () => {
    const phased = defineFieldSystem({
      id: "player-output-read",
      name: "player output read",
      players: {
        count: 2,
        fields: { actionKind: "u32" },
        outputs: ["decision"],
      },
      phases: [["write"], ["read"]],
      views: { read: { layer: "read", ramp: ["#000000", "#ffffff"] } },
      modules: {
        "layers/write.wesl": `
          import package::playerOutputs;
          fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }
          fn update(x: i32, y: i32, i: u32) -> u32 {
            if (i == 1u) { playerOutputs::set_decision(1u, 7u); }
            return 0u;
          }`,
        "layers/read.wesl": `
          import package::playerOutputs;
          fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }
          fn update(x: i32, y: i32, i: u32) -> u32 {
            return playerOutputs::decision(1u);
          }`,
      },
    });

    const compiled = await compileFieldSystem(phased);
    expect(passByName(compiled, "stock/read").code).toContain(
      "fn decision(p: u32) -> u32",
    );
  });
});

function passByName(compiled: CompiledFieldSystem, name: string) {
  const pass = compiled.kernelConfig.passes.find((p) => p.name === name);
  expect(pass, `pass "${name}" should exist`).toBeDefined();
  return pass!;
}

describe("compileFieldSystem (unified layers)", () => {
  let compiled: CompiledFieldSystem;
  beforeAll(async () => {
    // grazing is a terrain game (its herds overlay reads layers::tint); compile
    // it composed on the terrain base, as the viewer mounts it.
    compiled = await compileFieldSystem(composeTerrain(grazing));
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
    // grass.wesl references params:: plus layers::{crop, grass, herd,
    // temperature} (temperature is the terrain field, or the raw plane when
    // grazing is compiled standalone).
    expect(passByName(compiled, "stock/grass").binds).toEqual([
      "P",
      "crop",
      "grass.read",
      "herd.read",
      "temperature",
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
    // Composed on terrain, `temperature` resolves to the derived field (not a
    // plane upload); only genuine planes remain.
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
    const bytes = new ArrayBuffer(4 * 4);
    const view = new DataView(bytes);
    view.setUint32(0, 42, true); // tick
    view.setUint32(4, Math.round(123.5 * 256), true); // totalHerd low fx word
    view.setUint32(8, 0, true); // totalHerd high fx word
    view.setFloat32(12, 0.75, true); // peakGrass max, raw f32 bits
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
    expect(buffer("S")).toMatchObject({ count: 4 }); // tick + wide sum + max
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

  const reducedSystem: FieldSystem = {
    id: "reduced",
    name: "Reduced",
    scalars: { total: { reduce: "sum", layer: "amount" } },
    views: { amount: { layer: "amount", ramp: ["#000000", "#ffffff"] } },
    modules: {
      "layers/amount.wesl": `
import package::layers;
fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
fn update(x: i32, y: i32, i: u32) -> f32 { return layers::amount::val(i); }
`,
    },
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

  test("updates see the previous scalars before reduction slots are cleared", async () => {
    const compiled = await compileFieldSystem(reducedSystem);
    expect(recordTick(compiled)).toEqual([
      "pass:sim/tick",
      "pass:stock/amount",
      "swap:amount",
      "pass:sim/zero",
      "pass:reduce/total",
    ]);
  });

  test("tick advance and scalar clearing are separate generated passes", async () => {
    const compiled = await compileFieldSystem(reducedSystem);
    const tick = compiled.kernelConfig.passes.find(
      (p) => p.name === "sim/tick",
    )!;
    const zero = compiled.kernelConfig.passes.find(
      (p) => p.name === "sim/zero",
    )!;
    expect(tick.code).toContain("S.tick = S.tick + 1u");
    expect(zero.code).not.toContain("S.tick = S.tick + 1u");
    expect(zero.code).toContain("atomicStore");
  });

  test("sum reductions preserve values above the per-tile and aggregate i32 limits", async () => {
    const compiled = await compileFieldSystem(reducedSystem);
    const sim = compiled.kernelConfig.buffers.find(({ name }) => name === "S");
    expect(sim?.count).toBe(3); // tick + low/high fixed-point words

    const total = 40_000 * 256;
    const bytes = new ArrayBuffer(12);
    const view = new DataView(bytes);
    view.setUint32(4, total >>> 0, true);
    view.setUint32(8, Math.floor(total / 0x1_0000_0000), true);
    expect(compiled.decodeScalars(bytes).values.total).toBe(40_000);

    const reduce = passByName(compiled, "reduce/total");
    expect(reduce.code).toContain("atomicAddFx64");
    expect(reduce.code).not.toContain("32767.0");
  });

  test("default: one synchronous phase — all stocks, then one commit", async () => {
    const compiled = await compileFieldSystem(twoLayers);
    expect(recordTick(compiled)).toEqual([
      "pass:sim/tick",
      "pass:stock/a",
      "pass:stock/b",
      "swap:a",
      "swap:b",
      "pass:sim/zero",
    ]);
  });

  test("phases stage the commits so later phases read current-tick values", async () => {
    const compiled = await compileFieldSystem({
      ...twoLayers,
      phases: [["b"], ["a"]],
    });
    expect(recordTick(compiled)).toEqual([
      "pass:sim/tick",
      "pass:stock/b",
      "swap:b",
      "pass:stock/a",
      "swap:a",
      "pass:sim/zero",
    ]);
  });

  test("unlisted updated layers fall into a final implicit phase", async () => {
    const compiled = await compileFieldSystem({
      ...twoLayers,
      phases: [["b"]],
    });
    expect(recordTick(compiled)).toEqual([
      "pass:sim/tick",
      "pass:stock/b",
      "swap:b",
      "pass:stock/a",
      "swap:a",
      "pass:sim/zero",
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
    // S = tick + tilesOwned[8] + totalTroops[8]×2 + peakTroops = 26 words.
    const sim = compiled.kernelConfig.buffers.find((b) => b.name === "S");
    expect(sim?.count).toBe(26);

    const bytes = new ArrayBuffer(26 * 4);
    const view = new DataView(bytes);
    view.setUint32(0, 7, true); // tick
    view.setInt32(4 + 3 * 4, 5 * 256, true); // tilesOwned[3] = 5
    view.setUint32(4 + 8 * 4 + 2 * 2 * 4, Math.round(12.5 * 256), true); // totalTroops[2] low
    view.setUint32(4 + 8 * 4 + (2 * 2 + 1) * 4, 0, true); // totalTroops[2] high
    view.setFloat32(4 + 8 * 4 + 16 * 4, 0.5, true); // peakTroops
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
        "climate_temperature",
        "climate_precipitation",
        "fill_step",
        "flow_dir",
        "water_step",
        "irrigation_step",
        "humidity_biome",
        "color",
      ]),
    );
    // Terrain owns a named uniform (TP) with the worldgen Params layout, so a
    // composed game keeps P for its own params.
    const tp = compiled.kernelConfig.uniforms?.find((u) => u.name === "TP");
    expect(tp?.bytes).toBe(96);
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
    expect(calls).toContain("p:color");
    expect(calls[calls.length - 1]).toBe("p:pack_tint");
    const packTint = passByName(compiled, "pack_tint");
    expect(packTint.binds).toEqual(["out.read", "tint!"]);
    expect(packTint.code).toContain("texture_2d<f32>");
  });

  test("runDerive tiers filter to the tagged steps (two-tier reactivity)", async () => {
    const compiled = await compileFieldSystem(terrain);
    const run = (tier?: string): string[] => {
      const calls: string[] = [];
      compiled.runDerive(
        {
          pass: (n: string) => calls.push(n),
          iterate: (n: string) => calls.push(n),
        } as unknown as Parameters<typeof compiled.runDerive>[0],
        tier,
      );
      return calls;
    };
    // recolor skips the expensive drainage (fill/flow/water) but keeps the
    // cheap climate → biome → color chain over the settled buffers.
    const recolor = run("recolor");
    expect(recolor).not.toContain("fill_step");
    expect(recolor).not.toContain("flow_dir");
    expect(recolor).not.toContain("water_step");
    expect(recolor).toEqual([
      "flags_from_mask",
      "histogram",
      "quantile",
      "climate_temperature",
      "climate_precipitation",
      "water_max",
      "water_normalize",
      "irrigation_init",
      "irrigation_step",
      "humidity_biome",
      "color",
      "pack_tint",
    ]);
    // season is the per-tick sweep; repaint is color only. pack_tint follows
    // color in every color tier (the game overlay reads its `tint`).
    expect(run("season")).toEqual([
      "climate_temperature",
      "climate_precipitation",
      "humidity_biome",
      "color",
      "pack_tint",
    ]);
    expect(run("repaint")).toEqual(["color", "pack_tint"]);
    // no tier → the full pipeline (includes drainage).
    expect(run()).toContain("fill_step");
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

describe("shared:: WESL library", () => {
  // A layer that pulls a helper from the shared library links without any
  // copy of the function in the system folder (codify-game-systems).
  test("a system layer can import from shared::", async () => {
    const system: FieldSystem = {
      id: "s",
      name: "s",
      params: { rate: { value: 0.1, min: 0, max: 1 } },
      views: { pop: { layer: "pop", ramp: ["#000000", "#ffffff"] } },
      modules: {
        "layers/pop.wesl": `import package::layers;
import package::params;
import shared::growth::logistic;
fn init(x: i32, y: i32, i: u32) -> f32 { return 0.1; }
fn update(x: i32, y: i32, i: u32) -> f32 {
  return logistic(layers::pop::val(i), params::rate(), 1.0);
}`,
      },
    };
    const compiled = await compileFieldSystem(system);
    const stock = passByName(compiled, "stock/pop");
    // The shared function is linked into the generated pass source.
    expect(stock.code).toContain("logistic");
    expect(compiled.layerNames).toEqual(["pop"]);
  });
});

describe("system-specific mechanics stay in the system", () => {
  // shared:: is game-agnostic primitives only; a game's combat/conquest rules
  // live in its own lib/, not in shared (codify-game-systems).
  test("empire + territory own their combat.wesl", async () => {
    const { empire } = await import("../src/client/lab/systems/empire/system");
    const { territory } =
      await import("../src/client/lab/systems/territory/system");
    // empire is a terrain game (its overlay reads tint); compose it. territory
    // has no terrain-dependent view, so it compiles standalone.
    const e = await compileFieldSystem(composeTerrain(empire));
    const t = await compileFieldSystem(territory);
    // Each system's own conquest rule linked into its flip pass.
    expect(passByName(e, "stock/owner").code).toContain("conquers");
    expect(passByName(t, "stock/owner").code).toContain("conquers");
    // shared:: carries no combat mechanic.
    expect(Object.keys(SHARED_WESL.modules).join()).not.toContain("combat");
  });
});

describe("terrain-base composition (add-games-on-terrain)", () => {
  // A derive field marked `exposed` is readable by a per-tick layer via
  // `layers::<name>`, and the derive can carry its own uniform so the game
  // keeps `P` for its params.
  const gameOnBase = (extraLayer?: Record<string, string>): FieldSystem => ({
    id: "g",
    name: "g",
    params: { growth: { value: 0.1, min: 0, max: 1 } },
    views: { pop: { layer: "pop", ramp: ["#000000", "#ffffff"] } },
    derive: {
      typeImports: "struct Params { seaLevel: f32, }",
      uniform: { name: "TP", wgslType: "Params", bytes: 16 },
      fields: {
        elev: { type: "f32" },
        heat: { type: "f32", exposed: true },
      },
      steps: [{ pass: "climate", binds: ["TP", "elev", "heat!"] }],
    },
    modules: {
      "passes/climate.wesl":
        "import package::bindings::{P, elev, heat};\nfn tile(x: i32, y: i32, i: u32) { heat[i] = elev[i] + P.seaLevel; }",
      "layers/pop.wesl": `import package::layers;
import package::params;
fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
fn update(x: i32, y: i32, i: u32) -> f32 {
  return layers::pop::val(i) + params::growth() * layers::heat::val(i);
}`,
      ...extraLayer,
    },
  });

  test("a game layer reads an exposed terrain field; both uniforms exist", async () => {
    const compiled = await compileFieldSystem(gameOnBase());
    // The game keeps P (its params) AND the terrain gets its own TP uniform.
    const uniforms = compiled.kernelConfig.uniforms ?? [];
    expect(uniforms.map((u) => u.name)).toEqual(
      expect.arrayContaining(["P", "TP", "B"]),
    );
    // The exposed field is a derive buffer, not a map-plane upload.
    expect(compiled.derivedNames).toEqual(expect.arrayContaining(["heat"]));
    expect(compiled.mapLayers).not.toContain("heat");
    // pop's stock pass binds the terrain `heat` buffer (read-only, no facet).
    const stock = passByName(compiled, "stock/pop");
    expect(stock.binds).toContain("heat");
    expect(stock.binds).toContain("P");
  });

  test("a game layer that shadows a terrain field is rejected", async () => {
    await expect(
      compileFieldSystem(
        gameOnBase({
          "layers/heat.wesl":
            "fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }",
        }),
      ),
    ).rejects.toThrow(/heat/);
  });
});

describe("games composed on terrain compile", () => {
  test("grazing / settlement / empire link on the terrain base", async () => {
    const { composeTerrain } =
      await import("../src/client/lab/systems/terrain/system");
    const { grazing } =
      await import("../src/client/lab/systems/grazing/system");
    const { settlement } =
      await import("../src/client/lab/systems/settlement/system");
    const { empire } = await import("../src/client/lab/systems/empire/system");
    for (const game of [grazing, settlement, empire]) {
      const c = await compileFieldSystem(composeTerrain(game));
      // The terrain derivation is present (climate pass) AND the game ticks.
      const names = c.kernelConfig.passes.map((p) => p.name);
      expect(names).toContain("climate_temperature"); // terrain derive
      expect(names.some((n) => n.startsWith("stock/"))).toBe(true); // game sim
      // Both uniforms: game P + terrain TP.
      expect((c.kernelConfig.uniforms ?? []).map((u) => u.name)).toEqual(
        expect.arrayContaining(["P", "TP"]),
      );
    }
  });
});

describe("conquest game composes on terrain", () => {
  test("conquest links on the terrain base (OpenFront terrain-typed combat)", async () => {
    const { conquest } =
      await import("../src/client/lab/systems/conquest/system");
    const c = await compileFieldSystem(composeTerrain(conquest));
    const names = c.kernelConfig.passes.map((p) => p.name);
    expect(names).toContain("climate_temperature"); // terrain base
    expect(names).toContain("stock/owner");
    expect(names).toContain("stock/troops");
    expect(names).toContain("view/conquest");
    // terrain-typed conquest cost is in the pass source.
    expect(passByName(c, "stock/owner").code).toContain("conquers");
  });
});

describe("openfront-live bridge composes on terrain", () => {
  test("owner is a CPU-written render conduit (init only, never GPU-ticked)", async () => {
    const { openfront } = await import("../src/client/games/openfront/system");
    const c = await compileFieldSystem(composeTerrain(openfront));
    const names = c.kernelConfig.passes.map((p) => p.name);
    expect(names).toContain("climate_temperature"); // terrain base derives
    // Render conduits (CPU-written each tick): ownership + structure + damage +
    // front + supply + aimed-segment highlight fields (all init-only).
    expect(c.layerNames).toEqual([
      "damage",
      "density",
      "front",
      "highlight",
      "owner",
      "plot",
      "supply",
    ]);
    for (const l of [
      "owner",
      "plot",
      "density",
      "damage",
      "front",
      "supply",
      "highlight",
    ]) {
      expect(names).toContain(`init/${l}`);
      // No per-tick sim pass: no `update`, so never GPU-ticked — the shell
      // overwrites each from the real sim every frame.
      expect(names).not.toContain(`stock/${l}`);
    }
    // The overlay composites the owner colour over the terrain tint.
    expect(names).toContain("view/openfront");
    expect(passByName(c, "view/openfront").code).toContain("unpackTint");
  });
});
