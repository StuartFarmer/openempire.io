// Isolated renderer experiment. Run from the repository root with SimpleFront
// Vite at BENCH_URL (default http://127.0.0.1:9017). No production code changes.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus } from "node:os";
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require("playwright");
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu"],
});
try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.route("**/__renderer_benchmark__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><canvas></canvas>",
    }),
  );
  await page.goto(
    (process.env.BENCH_URL || "http://127.0.0.1:9017") +
      "/__renderer_benchmark__",
  );
  const result = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter || !adapter.features.has("timestamp-query"))
      throw Error("Hardware GPU with timestamps required");
    if (
      adapter.info.isFallbackAdapter ||
      /swiftshader/i.test(adapter.info.description)
    )
      throw Error("Software adapter rejected");
    const device = await adapter.requestDevice({
      requiredFeatures: ["timestamp-query"],
      requiredLimits: {
        maxStorageBuffersPerShaderStage: Math.min(
          16,
          adapter.limits.maxStorageBuffersPerShaderStage,
        ),
      },
    });
    const errors = [];
    device.addEventListener("uncapturederror", (e) =>
      errors.push(e.error.message),
    );
    const [
      { compileFieldSystem },
      { simplefront },
      { composeTerrain },
      { CAMERA_RENDER_WGSL },
    ] = await Promise.all([
      import("/src/client/webgpu/FieldDynamics.ts"),
      import("/src/client/games/simplefront/system.ts"),
      import("/src/client/lab/systems/terrain/system.ts"),
      import("/src/client/shell/CameraRenderer.ts"),
    ]);
    const compiled = await compileFieldSystem(composeTerrain(simplefront));
    const spec = compiled.kernelConfig.passes.find(
      (p) => p.name === "view/simplefront",
    );
    const width = 4096,
      height = 2048,
      area = width * height;
    const map = new Uint8Array(
      await (await fetch("/maps/earthxl/map.bin")).arrayBuffer(),
    );
    if (map.length !== area) throw Error("Unexpected map dimensions");
    const bitmap = await createImageBitmap(
      await (await fetch("/maps/earthxl/terrain-colors.png")).blob(),
    );
    const cv = new OffscreenCanvas(width, height),
      ctx = cv.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const land = new Float32Array(area),
      tint = new Uint32Array(area),
      owner = new Uint32Array(area),
      plot = new Uint32Array(area),
      density = new Uint32Array(area);
    const sprites = new Uint32Array(area * 2);
    let urbanTiles = 0,
      farmTiles = 0,
      landTiles = 0;
    for (let i = 0; i < area; i++) {
      tint[i] = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
      if (!(map[i] & 128)) continue;
      land[i] = 1;
      landTiles++;
      const x = i % width,
        y = Math.floor(i / width);
      owner[i] = 1 + (((x >> 7) + 17 * (y >> 7)) % 32);
      const pattern = ((x >> 3) + 3 * (y >> 3)) % 10;
      if (pattern === 0) {
        plot[i] = 1 << 16;
        density[i] = 128;
        urbanTiles++;
        sprites[i * 2] = 0b011010001010;
        sprites[i * 2 + 1] = 1 << 24;
      }
      if (pattern === 1) {
        plot[i] = 2 | (200 << 8);
        farmTiles++;
      }
    }
    const buffer = (data, usage = GPUBufferUsage.STORAGE) => {
      const b = device.createBuffer({
        size: Math.max(16, data.byteLength),
        usage: usage | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(b, 0, data);
      return b;
    };
    const grid = buffer(
      new Uint32Array([width, height, 0, 0]),
      GPUBufferUsage.UNIFORM,
    );
    const params = Object.fromEntries(
      compiled.paramList.map((p) => [p.name, p.value]),
    );
    params.maskFade = 1;
    const inputs = { land, tint, owner, plot, density };
    const buffers = {};
    for (const ref of spec.binds) {
      const name = ref.split(/[.:!]/)[0];
      if (name === "out" || buffers[name]) continue;
      if (name === "P")
        buffers[name] = buffer(
          compiled.writeParams(params, 1),
          GPUBufferUsage.UNIFORM,
        );
      else if (name === "PL")
        buffers[name] = buffer(
          compiled.writePlayers(
            Array.from({ length: 256 }, (_, i) => ({
              mine: i === 1 ? 1 : 0,
              fill: 0x559966,
              border: 0x334422,
            })),
          ),
        );
      else buffers[name] = buffer(inputs[name] || new Uint32Array(area));
    }
    const out = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    const sparseOut = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    const layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        ...spec.binds.map((ref, i) => ({
          binding: i + 1,
          visibility: GPUShaderStage.COMPUTE,
          ...(ref === "out"
            ? { storageTexture: { access: "write-only", format: "rgba8unorm" } }
            : {
                buffer: { type: ref === "P" ? "uniform" : "read-only-storage" },
              }),
        })),
      ],
    });
    const group = (target) =>
      device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: grid } },
          ...spec.binds.map((ref, i) => ({
            binding: i + 1,
            resource:
              ref === "out"
                ? target.createView()
                : { buffer: buffers[ref.split(/[.:!]/)[0]] },
          })),
        ],
      });
    const fullGroup = group(out),
      sparseGroup = group(sparseOut);
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [layout],
    });
    const full = await device.createComputePipelineAsync({
      layout: pipelineLayout,
      compute: {
        module: device.createShaderModule({ code: spec.code }),
        entryPoint: "main",
      },
    });
    // Only replace entry-point coordinates. The entire existing colour body,
    // storage bindings, neighbour reads and output format are unchanged.
    const entry = /fn main\([^]*?\)\s*\{/;
    const sparseCode = spec.code.replace(
      entry,
      `fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
      let chunk = ((wg.x / 16u) * 4051u + 17u) % 8192u;
      let sub = wg.x % 16u;
      let gid = vec3u((chunk % 128u) * 32u + (sub % 4u) * 8u + lid.x,
                     (chunk / 128u) * 32u + (sub / 4u) * 8u + lid.y, 0u);`,
    );
    if (sparseCode === spec.code) throw Error("Entry-point replacement failed");
    const sparse = await device.createComputePipelineAsync({
      layout: pipelineLayout,
      compute: {
        module: device.createShaderModule({ code: sparseCode }),
        entryPoint: "main",
      },
    });
    const query = device.createQuerySet({ type: "timestamp", count: 2 });
    const resolved = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const read = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const repeats = 1,
      samples = 60,
      warmups = 8;
    const timings = {};
    const writes = {
      querySet: query,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };
    const compute =
      (pipeline, bindGroup, x, y = 1) =>
      (encoder) => {
        const pass = encoder.beginComputePass({ timestampWrites: writes });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        for (let n = 0; n < repeats; n++) pass.dispatchWorkgroups(x, y);
        pass.end();
      };
    const cases = {
      full_map: compute(full, fullGroup, width / 8, height / 8),
      dirty_128_chunks: compute(sparse, sparseGroup, 128 * 16),
      dirty_512_chunks: compute(sparse, sparseGroup, 512 * 16),
      dirty_2048_chunks: compute(sparse, sparseGroup, 2048 * 16),
    };
    // Seed the full output, then verify sparse output matches the same shader
    // on all 128 written chunks and leaves every other texel at zero.
    let encoder = device.createCommandEncoder();
    cases.full_map(encoder);
    cases.dirty_128_chunks(encoder);
    device.queue.submit([encoder.finish()]);
    async function pixels(texture) {
      const b = device.createBuffer({
        size: area * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const e = device.createCommandEncoder();
      e.copyTextureToBuffer(
        { texture },
        { buffer: b, bytesPerRow: width * 4 },
        [width, height],
      );
      device.queue.submit([e.finish()]);
      await b.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(b.getMappedRange()).slice();
      b.unmap();
      b.destroy();
      return bytes;
    }
    const fullPixels = await pixels(out),
      sparsePixels = await pixels(sparseOut);
    const selected = new Set(
      Array.from({ length: 128 }, (_, i) => (i * 4051 + 17) % 8192),
    );
    let mismatch = 0,
      untouchedNonzero = 0;
    for (let i = 0; i < area; i++) {
      const chunk = (Math.floor(i / width) >> 5) * 128 + ((i % width) >> 5);
      for (let c = 0; c < 4; c++) {
        if (selected.has(chunk)) {
          if (fullPixels[i * 4 + c] !== sparsePixels[i * 4 + c]) mismatch++;
        } else if (sparsePixels[i * 4 + c] !== 0) untouchedNonzero++;
      }
    }
    if (mismatch || untouchedNonzero)
      throw Error(`Sparse parity failure ${mismatch}/${untouchedNonzero}`);
    const camBuffer = buffer(new Float32Array(12), GPUBufferUsage.UNIFORM);
    const plotTex = device.createTexture({
      size: [width, height],
      format: "r8uint",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: plotTex },
      Uint8Array.from(plot, (v) => v & 255),
      { bytesPerRow: width },
      [width, height],
    );
    const cityTex = device.createTexture({
      size: [width, height],
      format: "rg32uint",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: cityTex },
      sprites,
      { bytesPerRow: width * 8 },
      [width, height],
    );
    const palette = device.createTexture({
      size: [8, 128],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const paletteBytes = new Uint8Array(8 * 128 * 4);
    for (let i = 0; i < paletteBytes.length; i++)
      paletteBytes[i] = i % 4 === 3 ? 255 : 80 + ((i * 37) % 150);
    device.queue.writeTexture(
      { texture: palette },
      paletteBytes,
      { bytesPerRow: 32 },
      [8, 128],
    );
    const module = device.createShaderModule({ code: CAMERA_RENDER_WGSL });
    const renderPipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format: "rgba8unorm" }],
      },
      primitive: { topology: "triangle-list" },
    });
    const sampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    const cameraGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: camBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: out.createView() },
        { binding: 3, resource: plotTex.createView() },
        { binding: 4, resource: cityTex.createView() },
        { binding: 5, resource: palette.createView() },
      ],
    });
    for (const [w, h] of [
      [1920, 1080],
      [3840, 2160],
    ])
      for (const zoom of ["fit", "close"]) {
        const scale =
          zoom === "fit" ? Math.min(w / width, h / height) * 0.95 : 4;
        const cx = zoom === "fit" ? width / 2 : 2150,
          cy = zoom === "fit" ? height / 2 : 530;
        const values = new Float32Array([
          cx - w / 2 / scale,
          cy - h / 2 / scale,
          1 / scale,
          1,
          width,
          height,
          0,
          0,
          w,
          h,
          0,
          0,
        ]);
        const target = device.createTexture({
          size: [w, h],
          format: "rgba8unorm",
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        cases[`camera_${w}x${h}_${zoom}`] = (encoder) => {
          device.queue.writeBuffer(camBuffer, 0, values);
          for (let n = 0; n < repeats; n++) {
            const tw = {
              querySet: query,
              ...(n === 0 ? { beginningOfPassWriteIndex: 0 } : {}),
              ...(n === repeats - 1 ? { endOfPassWriteIndex: 1 } : {}),
            };
            const pass = encoder.beginRenderPass({
              ...(n === 0 || n === repeats - 1 ? { timestampWrites: tw } : {}),
              colorAttachments: [
                {
                  view: target.createView(),
                  loadOp: "clear",
                  storeOp: "store",
                },
              ],
            });
            pass.setPipeline(renderPipeline);
            pass.setBindGroup(0, cameraGroup);
            pass.draw(3);
            pass.end();
          }
        };
      }
    // Interleave cases to reduce ordering/thermal bias. Measure one dispatch
    // or render pass per sample; preserve the browser's timestamp precision.
    for (let sample = -warmups; sample < samples; sample++)
      for (const [name, encode] of Object.entries(cases)) {
        const e = device.createCommandEncoder();
        encode(e);
        e.resolveQuerySet(query, 0, 2, resolved, 0);
        e.copyBufferToBuffer(resolved, 0, read, 0, 16);
        device.queue.submit([e.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const t = new BigUint64Array(read.getMappedRange());
        const ms = Number(t[1] - t[0]) / 1e6 / repeats;
        read.unmap();
        if (sample >= 0) (timings[name] ??= []).push(ms);
      }
    if (errors.length) throw Error(errors.join("\n"));
    const summary = Object.fromEntries(
      Object.entries(timings).map(([name, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return [
          name,
          {
            medianMs: sorted[Math.floor(sorted.length / 2)],
            p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
            minMs: sorted[0],
            maxMs: sorted.at(-1),
          },
        ];
      }),
    );
    device.destroy();
    return {
      date: new Date().toISOString(),
      gpu: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        description: adapter.info.description,
      },
      userAgent: navigator.userAgent,
      scene: {
        map: "EarthXL",
        width,
        height,
        landTiles,
        urbanTiles,
        farmTiles,
        syntheticGameplay: true,
        maskFade: 1,
      },
      method: {
        samples,
        warmups,
        repeats,
        timer: "timestamp-query",
        renderTarget:
          "offscreen rgba8unorm; separate clear/store render pass per draw",
        sparseChunks: "32x32, dispersed deterministic permutation",
        excludes: [
          "CPU simulation",
          "dirty discovery and uploads",
          "swapchain/compositor",
          "boats and fire",
          "season derivation",
        ],
        productionShader: true,
      },
      parity: {
        checkedTiles: area,
        dirtyTiles: 128 * 32 * 32,
        mismatchBytes: mismatch,
        untouchedNonzeroBytes: untouchedNonzero,
      },
      summary,
      timings,
    };
  });
  result.cpu = cpus()[0].model;
  result.sourceSha256 = Object.fromEntries(
    [
      "simplefront/src/client/webgpu/FieldDynamics.ts",
      "simplefront/src/client/games/simplefront/system.ts",
      "simplefront/src/client/games/simplefront/visuals/city-view.wesl",
      "simplefront/src/client/games/shared/live-game.wesl",
      "simplefront/src/client/shell/CameraRenderer.ts",
    ].map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  );
  writeFileSync(
    process.env.BENCH_OUTPUT || "/tmp/simplefront-render-benchmark.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...result, timings: undefined }, null, 2));
} finally {
  await browser.close();
}
