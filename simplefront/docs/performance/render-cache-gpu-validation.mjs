// Real implementation validation for SimpleFront's incremental view pass.
// Run from the repository root with Vite at BENCH_URL (default :9017).
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
  await page.route("**/__render_cache_gpu_validation__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><canvas></canvas>",
    }),
  );
  await page.goto(
    (process.env.BENCH_URL || "http://127.0.0.1:9017") +
      "/__render_cache_gpu_validation__",
  );

  const result = await page.evaluate(async () => {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter || !adapter.features.has("timestamp-query"))
      throw new Error("Hardware GPU with timestamps required");
    if (
      adapter.info.isFallbackAdapter ||
      /swiftshader/i.test(adapter.info.description)
    )
      throw new Error("Software adapter rejected");

    const device = await adapter.requestDevice({
      requiredFeatures: ["timestamp-query"],
      requiredLimits: {
        maxStorageBuffersPerShaderStage: Math.min(
          16,
          adapter.limits.maxStorageBuffersPerShaderStage,
        ),
      },
    });
    const validationErrors = [];
    device.addEventListener("uncapturederror", (event) =>
      validationErrors.push(event.error.message),
    );

    // Benchmark-only instrumentation: make the production output readable and
    // add timestamp resolve commands around the real FieldFrame compute pass.
    const outputTextures = [];
    const nativeCreateTexture = device.createTexture.bind(device);
    Object.defineProperty(device, "createTexture", {
      value(descriptor) {
        const fieldOutput = descriptor.label === "field-out";
        const texture = nativeCreateTexture(
          fieldOutput
            ? {
                ...descriptor,
                usage: descriptor.usage | GPUTextureUsage.COPY_SRC,
              }
            : descriptor,
        );
        if (fieldOutput) outputTextures.push(texture);
        return texture;
      },
    });

    const querySet = device.createQuerySet({ type: "timestamp", count: 2 });
    const queryResolved = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const queryRead = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    let profileNextEncoder = false;
    const nativeCreateCommandEncoder = device.createCommandEncoder.bind(device);
    Object.defineProperty(device, "createCommandEncoder", {
      value(descriptor) {
        const encoder = nativeCreateCommandEncoder(descriptor);
        if (!profileNextEncoder) return encoder;
        profileNextEncoder = false;
        let computePasses = 0;
        const nativeBeginComputePass = encoder.beginComputePass.bind(encoder);
        const nativeFinish = encoder.finish.bind(encoder);
        Object.defineProperty(encoder, "beginComputePass", {
          value(passDescriptor = {}) {
            computePasses++;
            return nativeBeginComputePass({
              ...passDescriptor,
              timestampWrites: {
                querySet,
                beginningOfPassWriteIndex: 0,
                endOfPassWriteIndex: 1,
              },
            });
          },
        });
        Object.defineProperty(encoder, "finish", {
          value(commandDescriptor) {
            assert(
              computePasses === 1,
              `Expected one profiled compute pass, saw ${computePasses}`,
            );
            encoder.resolveQuerySet(querySet, 0, 2, queryResolved, 0);
            encoder.copyBufferToBuffer(queryResolved, 0, queryRead, 0, 16);
            return nativeFinish(commandDescriptor);
          },
        });
        return encoder;
      },
    });

    const [
      { FieldKernel },
      { compileFieldSystem },
      { simplefront },
      { composeTerrain },
      { RenderInvalidation },
    ] = await Promise.all([
      import("/src/client/webgpu/FieldKernel.ts"),
      import("/src/client/webgpu/FieldDynamics.ts"),
      import("/src/client/games/simplefront/system.ts"),
      import("/src/client/lab/systems/terrain/system.ts"),
      import("/src/client/shell/RenderInvalidation.ts"),
    ]);
    const compiled = await compileFieldSystem(composeTerrain(simplefront));
    const viewPass = compiled.kernelConfig.passes.find(
      (pass) => pass.name === "view/simplefront",
    );
    assert(viewPass, "Compiled SimpleFront view pass is missing");
    assert(viewPass.regionCode, "Compiled SimpleFront region pass is missing");

    const resourceName = (ref) => ref.split(/[.:!]/)[0];
    const boundNames = new Set(viewPass.binds.map(resourceName));
    const kernelConfig = {
      prelude: compiled.kernelConfig.prelude,
      uniforms: compiled.kernelConfig.uniforms.filter((spec) =>
        boundNames.has(spec.name),
      ),
      buffers: compiled.kernelConfig.buffers.filter((spec) =>
        boundNames.has(spec.name),
      ),
      passes: [viewPass],
    };
    const storageBufferCount = viewPass.binds.filter((ref) => {
      const name = resourceName(ref);
      return (
        name !== "out" &&
        !kernelConfig.uniforms.some((uniform) => uniform.name === name)
      );
    }).length;
    assert(
      storageBufferCount <= device.limits.maxStorageBuffersPerShaderStage,
      `View needs ${storageBufferCount} storage buffers, device allows ${device.limits.maxStorageBuffersPerShaderStage}`,
    );

    const params = Object.fromEntries(
      compiled.paramList.map((param) => [param.name, param.value]),
    );
    params.maskFade = 1;
    const players = Array.from({ length: 256 }, (_, id) => ({
      mine: id === 1 ? 1 : 0,
      fill: (0x335577 + id * 0x010903) & 0xffffff,
      border: (0x182838 + id * 0x000503) & 0xffffff,
    }));
    const playerBytes = new Uint32Array(compiled.writePlayers(players));
    const paramBytes = compiled.writeParams(params, 1);

    const allocateInputs = (width, height) => {
      const area = width * height;
      return Object.fromEntries(
        kernelConfig.buffers
          .filter((spec) => spec.name !== "PL")
          .map((spec) => [
            spec.name,
            spec.type === "f32"
              ? new Float32Array(spec.count ?? area)
              : new Uint32Array(spec.count ?? area),
          ]),
      );
    };

    const makeKernel = async (width, height, inputs) => {
      const outputIndex = outputTextures.length;
      const kernel = await FieldKernel.create(null, kernelConfig, { device });
      kernel.resize(width, height);
      assert(
        outputTextures.length === outputIndex + 1,
        "Failed to capture FieldKernel output texture",
      );
      for (const uniform of kernelConfig.uniforms) {
        assert(uniform.name === "P", `Unexpected view uniform ${uniform.name}`);
        kernel.writeUniform("P", paramBytes);
      }
      for (const spec of kernelConfig.buffers) {
        kernel.writeBuffer(
          spec.name,
          spec.name === "PL" ? playerBytes : inputs[spec.name],
        );
      }
      return { kernel, texture: outputTextures[outputIndex] };
    };

    const render = async (kernel, chunks) => {
      const frame = kernel.beginFrame();
      compiled.runView(frame, "simplefront", chunks);
      const frameResult = await frame.finish();
      assert(frameResult.dispatches === 1, "View frame did not dispatch once");
    };

    const readPixels = async (texture, width, height) => {
      const rowBytes = width * 4;
      const paddedRowBytes = Math.ceil(rowBytes / 256) * 256;
      const staging = device.createBuffer({
        size: paddedRowBytes * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture },
        { buffer: staging, bytesPerRow: paddedRowBytes },
        [width, height],
      );
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(staging.getMappedRange());
      const pixels = new Uint8Array(rowBytes * height);
      for (let y = 0; y < height; y++)
        pixels.set(
          mapped.subarray(y * paddedRowBytes, y * paddedRowBytes + rowBytes),
          y * rowBytes,
        );
      staging.unmap();
      staging.destroy();
      return pixels;
    };

    const readPixel = async (texture, x, y) => {
      const staging = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture, origin: [x, y] },
        { buffer: staging, bytesPerRow: 256 },
        [1, 1],
      );
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const pixel = Array.from(
        new Uint8Array(staging.getMappedRange()).subarray(0, 4),
      );
      staging.unmap();
      staging.destroy();
      return pixel;
    };

    const compareTextures = async (
      label,
      fullTexture,
      sparseTexture,
      width,
      height,
      updateKind,
      dirtyChunks,
    ) => {
      const [full, sparse] = await Promise.all([
        readPixels(fullTexture, width, height),
        readPixels(sparseTexture, width, height),
      ]);
      let mismatchBytes = 0;
      let firstMismatch = -1;
      for (let i = 0; i < full.length; i++) {
        if (full[i] === sparse[i]) continue;
        mismatchBytes++;
        if (firstMismatch < 0) firstMismatch = i;
      }
      assert(
        mismatchBytes === 0,
        `${label}: ${mismatchBytes} mismatched output bytes, first ${firstMismatch}`,
      );
      return {
        label,
        width,
        height,
        checkedBytes: full.length,
        updateKind,
        dirtyChunks,
        mismatchBytes,
      };
    };

    const uploadChanges = (kernelPair, inputs, changes) => {
      for (const { field, tile, value } of changes) {
        inputs[field][tile] = value;
        for (const { kernel } of kernelPair)
          kernel.writeBufferU32Range(field, inputs[field], tile, tile);
      }
    };

    const takeChunks = (tracker, tiles, label) => {
      for (const tile of tiles) tracker.markTile(tile);
      const update = tracker.take();
      assert(update.kind === "chunks", `${label}: expected chunk invalidation`);
      return update.ids;
    };

    const mapBytes = new Uint8Array(
      await (await fetch("/maps/earthxl/map.bin")).arrayBuffer(),
    );
    const width = 4096;
    const height = 2048;
    const area = width * height;
    assert(mapBytes.length === area, "Unexpected EarthXL dimensions");
    const terrainBitmap = await createImageBitmap(
      await (await fetch("/maps/earthxl/terrain-colors.png")).blob(),
    );
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    context.drawImage(terrainBitmap, 0, 0);
    const rgba = context.getImageData(0, 0, width, height).data;
    const inputs = allocateInputs(width, height);
    let landTiles = 0;
    let urbanTiles = 0;
    let farmTiles = 0;
    for (let tile = 0; tile < area; tile++) {
      inputs.tint[tile] =
        (rgba[tile * 4] << 16) | (rgba[tile * 4 + 1] << 8) | rgba[tile * 4 + 2];
      if (!(mapBytes[tile] & 128)) continue;
      inputs.land[tile] = 1;
      landTiles++;
      const x = tile % width;
      const y = Math.floor(tile / width);
      inputs.owner[tile] = 1 + (((x >> 7) + 17 * (y >> 7)) % 32);
      const pattern = ((x >> 3) + 3 * (y >> 3)) % 10;
      if (pattern === 0) {
        inputs.plot[tile] = 1 << 16;
        inputs.density[tile] = 128;
        urbanTiles++;
      } else if (pattern === 1) {
        inputs.plot[tile] = 2 | (32 << 8);
        farmTiles++;
      }
    }

    const selected = new Set();
    const isUniformOwnedInterior = (x, y, tile) => {
      const owner = inputs.owner[tile];
      if (
        owner === 0 ||
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1
      )
        return false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const neighbour = tile + dy * width + dx;
          if (inputs.land[neighbour] !== 1 || inputs.owner[neighbour] !== owner)
            return false;
        }
      return true;
    };
    const pickLand = (predicate, description) => {
      for (let tile = 0; tile < area; tile++) {
        if (inputs.land[tile] !== 1 || selected.has(tile)) continue;
        const x = tile % width;
        const y = Math.floor(tile / width);
        if (!predicate(x, y, tile)) continue;
        selected.add(tile);
        return tile;
      }
      throw new Error(`No land tile found for ${description}`);
    };
    const ownerBoundary = pickLand(
      (x, y, tile) =>
        x % 32 === 0 && x % 128 !== 0 && isUniformOwnedInterior(x, y, tile),
      "interior owner chunk boundary",
    );
    const farmTile = pickLand(
      (x, y, tile) => inputs.plot[tile] === (2 | (32 << 8)),
      "farm maturity",
    );
    const cityTile = pickLand(
      (x, y, tile) =>
        inputs.plot[tile] >>> 16 > 0 &&
        (inputs.plot[tile] & 255) === 0 &&
        inputs.front[tile] === 0 &&
        inputs.highlight[tile] === 0 &&
        inputs.damage[tile] === 0 &&
        isUniformOwnedInterior(x, y, tile),
      "interior city level",
    );
    const damageTile = pickLand((x, y) => x > 128 && y > 128, "damage");
    const highlightTile = pickLand((x, y) => x > 512 && y > 256, "highlight");
    const queuedTileA = pickLand(
      (x, y) => x > 768 && y > 384,
      "queued frame A",
    );
    const queuedTileB = pickLand(
      (x, y) => x > 1536 && y > 768,
      "queued frame B",
    );
    inputs.damage[damageTile] = 220;
    inputs.highlight[highlightTile] = 1;

    const full = await makeKernel(width, height, inputs);
    const sparse = await makeKernel(width, height, inputs);
    const earthKernels = [full, sparse];
    const tracker = new RenderInvalidation(width, height);
    assert(tracker.take().kind === "full", "Tracker must start full");
    const parity = [];
    const effects = [];
    await render(full.kernel);
    await render(sparse.kernel);
    parity.push(
      await compareTextures(
        "earthxl-initial-full",
        full.texture,
        sparse.texture,
        width,
        height,
        "full",
        null,
      ),
    );

    const ownerX = ownerBoundary % width;
    const ownerY = Math.floor(ownerBoundary / width);
    const crossChunkNeighbour = ownerBoundary - 1;
    assert(
      Math.floor(ownerX / 32) !== Math.floor((ownerX - 1) / 32),
      "Owner effect probe is not across a chunk boundary",
    );
    const ownerEffectBefore = await readPixel(full.texture, ownerX - 1, ownerY);
    let changes = [
      {
        field: "owner",
        tile: ownerBoundary,
        value: (inputs.owner[ownerBoundary] % 31) + 1,
      },
      { field: "tint", tile: 0, value: inputs.tint[0] ^ 0x003311 },
      {
        field: "tint",
        tile: area - 1,
        value: inputs.tint[area - 1] ^ 0x112200,
      },
    ];
    uploadChanges(earthKernels, inputs, changes);
    let chunks = takeChunks(
      tracker,
      changes.map((change) => change.tile),
      "owner-border-map-edges",
    );
    await render(full.kernel);
    await render(sparse.kernel, chunks);
    parity.push(
      await compareTextures(
        "owner-border-and-map-edges",
        full.texture,
        sparse.texture,
        width,
        height,
        "chunks",
        chunks.length,
      ),
    );
    const ownerEffectAfter = await readPixel(full.texture, ownerX - 1, ownerY);
    assert(
      ownerEffectBefore.some((byte, index) => byte !== ownerEffectAfter[index]),
      "Owner mutation did not change the cross-chunk neighbour output",
    );
    effects.push({
      label: "owner-border-cross-chunk-neighbour",
      mutatedTile: ownerBoundary,
      observedTile: crossChunkNeighbour,
      observedCoordinate: [ownerX - 1, ownerY],
      beforeRgba: ownerEffectBefore,
      afterRgba: ownerEffectAfter,
      changed: true,
    });

    const cityX = cityTile % width;
    const cityY = Math.floor(cityTile / width);
    const cityDensity = inputs.density[cityTile];
    const cityEffectBefore = await readPixel(full.texture, cityX, cityY);
    changes = [
      { field: "plot", tile: farmTile, value: 2 | (220 << 8) },
      {
        field: "plot",
        tile: cityTile,
        value: inputs.plot[cityTile] & 0xffff,
      },
    ];
    uploadChanges(earthKernels, inputs, changes);
    chunks = takeChunks(
      tracker,
      changes.map((change) => change.tile),
      "plot-farm-city",
    );
    await render(full.kernel);
    await render(sparse.kernel, chunks);
    parity.push(
      await compareTextures(
        "plot-farm-maturity-city-level",
        full.texture,
        sparse.texture,
        width,
        height,
        "chunks",
        chunks.length,
      ),
    );
    const cityEffectAfter = await readPixel(full.texture, cityX, cityY);
    assert(
      inputs.density[cityTile] === cityDensity,
      "City density changed during the level-only probe",
    );
    assert(
      cityEffectBefore[3] !== cityEffectAfter[3],
      "City level removal did not change the output alpha byte",
    );
    effects.push({
      label: "city-level-removal-at-constant-density",
      mutatedTile: cityTile,
      observedCoordinate: [cityX, cityY],
      density: cityDensity,
      beforeRgba: cityEffectBefore,
      afterRgba: cityEffectAfter,
      changedAlpha: true,
    });

    changes = [
      { field: "damage", tile: damageTile, value: 0 },
      { field: "highlight", tile: highlightTile, value: 0 },
    ];
    uploadChanges(earthKernels, inputs, changes);
    chunks = takeChunks(
      tracker,
      changes.map((change) => change.tile),
      "clearing-damage-highlight",
    );
    await render(full.kernel);
    await render(sparse.kernel, chunks);
    parity.push(
      await compareTextures(
        "clearing-damage-and-highlight",
        full.texture,
        sparse.texture,
        width,
        height,
        "chunks",
        chunks.length,
      ),
    );

    // Encode two snapshots before either frame completes. Each command buffer
    // must carry its own region IDs even though the kernel uniform is shared.
    const queuedA = [
      {
        field: "owner",
        tile: queuedTileA,
        value: (inputs.owner[queuedTileA] % 31) + 1,
      },
    ];
    uploadChanges(earthKernels, inputs, queuedA);
    const queuedChunksA = takeChunks(tracker, [queuedTileA], "queued A");
    const frameA = sparse.kernel.beginFrame();
    compiled.runView(frameA, "simplefront", queuedChunksA);

    const queuedB = [{ field: "damage", tile: queuedTileB, value: 196 }];
    uploadChanges(earthKernels, inputs, queuedB);
    const queuedChunksB = takeChunks(tracker, [queuedTileB], "queued B");
    const frameB = sparse.kernel.beginFrame();
    compiled.runView(frameB, "simplefront", queuedChunksB);
    const [frameResultA, frameResultB] = await Promise.all([
      frameA.finish(),
      frameB.finish(),
    ]);
    assert(
      frameResultA.dispatches === 1 && frameResultB.dispatches === 1,
      "Queued region frames did not both dispatch",
    );
    await render(full.kernel);
    parity.push(
      await compareTextures(
        "queued-unsubmitted-region-frames",
        full.texture,
        sparse.texture,
        width,
        height,
        "two chunk snapshots",
        queuedChunksA.length + queuedChunksB.length,
      ),
    );

    const smallWidth = 65;
    const smallHeight = 33;
    const smallArea = smallWidth * smallHeight;
    const smallInputs = allocateInputs(smallWidth, smallHeight);
    for (let tile = 0; tile < smallArea; tile++) {
      smallInputs.land[tile] = 1;
      smallInputs.tint[tile] =
        (((tile * 13) & 255) << 16) |
        (((tile * 29) & 255) << 8) |
        ((tile * 47) & 255);
      smallInputs.owner[tile] = 1 + (((tile % smallWidth) >> 4) % 4);
    }
    const smallFull = await makeKernel(smallWidth, smallHeight, smallInputs);
    const smallSparse = await makeKernel(smallWidth, smallHeight, smallInputs);
    await render(smallFull.kernel);
    await render(smallSparse.kernel);
    parity.push(
      await compareTextures(
        "65x33-initial-full",
        smallFull.texture,
        smallSparse.texture,
        smallWidth,
        smallHeight,
        "full",
        null,
      ),
    );
    const smallEdge = smallArea - 1;
    uploadChanges([smallFull, smallSparse], smallInputs, [
      { field: "owner", tile: smallEdge, value: 7 },
      { field: "plot", tile: smallEdge, value: 2 | (200 << 8) },
    ]);
    await render(smallFull.kernel);
    const allSmallChunks = new Uint32Array([0, 1, 2, 3, 4, 5]);
    await render(smallSparse.kernel, allSmallChunks);
    parity.push(
      await compareTextures(
        "65x33-clipped-edge-regions",
        smallFull.texture,
        smallSparse.texture,
        smallWidth,
        smallHeight,
        "chunks",
        allSmallChunks.length,
      ),
    );
    smallFull.kernel.destroy();
    smallSparse.kernel.destroy();

    const readTimestampMs = async () => {
      await queryRead.mapAsync(GPUMapMode.READ);
      const timestamps = new BigUint64Array(queryRead.getMappedRange());
      const gpuMs = Number(timestamps[1] - timestamps[0]) / 1e6;
      queryRead.unmap();
      return gpuMs;
    };
    const measureFrame = async (kernel, frameChunks) => {
      profileNextEncoder = true;
      const encodeStart = performance.now();
      const frame = kernel.beginFrame();
      compiled.runView(frame, "simplefront", frameChunks);
      const encodeJsMs = performance.now() - encodeStart;
      const finishStart = performance.now();
      const finished = frame.finish();
      const finishSubmitJsMs = performance.now() - finishStart;
      const frameResult = await finished;
      const finishWallMs = performance.now() - finishStart;
      const gpuMs = await readTimestampMs();
      assert(frameResult.dispatches === 1, "Profiled view did not dispatch");
      return {
        gpuMs,
        encodeJsMs,
        finishSubmitJsMs,
        finishWallMs,
        cpuPlusGpuMs: encodeJsMs + finishSubmitJsMs + gpuMs,
      };
    };

    const chunkCount = Math.ceil(width / 32) * Math.ceil(height / 32);
    const dispersedChunks = (count) =>
      Uint32Array.from(
        { length: count },
        (_, index) => (index * 4051 + 17) % chunkCount,
      );
    const cases = [
      { name: "full_map", kernel: full.kernel, chunks: undefined },
      {
        name: "dirty_128_chunks",
        kernel: sparse.kernel,
        chunks: dispersedChunks(128),
      },
      {
        name: "dirty_512_chunks",
        kernel: sparse.kernel,
        chunks: dispersedChunks(512),
      },
      {
        name: "dirty_2048_chunks",
        kernel: sparse.kernel,
        chunks: dispersedChunks(2048),
      },
    ];
    const warmups = 8;
    const samples = 60;
    const timings = Object.fromEntries(cases.map(({ name }) => [name, []]));
    for (let sample = -warmups; sample < samples; sample++) {
      for (const entry of cases) {
        const timing = await measureFrame(entry.kernel, entry.chunks);
        if (sample >= 0) timings[entry.name].push(timing);
      }
    }

    const stats = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        min: sorted[0],
        max: sorted.at(-1),
      };
    };
    const summary = Object.fromEntries(
      Object.entries(timings).map(([name, values]) => [
        name,
        Object.fromEntries(
          Object.keys(values[0]).map((metric) => [
            metric,
            stats(values.map((value) => value[metric])),
          ]),
        ),
      ]),
    );
    const fullGpuMedian = summary.full_map.gpuMs.median;
    const sparseGpuMedian = summary.dirty_128_chunks.gpuMs.median;
    const fullCombinedMedian = summary.full_map.cpuPlusGpuMs.median;
    const sparseCombinedMedian = summary.dirty_128_chunks.cpuPlusGpuMs.median;
    const acceptance = {
      pixelMismatchBytes: parity.reduce(
        (sum, entry) => sum + entry.mismatchBytes,
        0,
      ),
      sparse128GpuRatio: sparseGpuMedian / fullGpuMedian,
      sparse128GpuAtMost25Percent: sparseGpuMedian <= fullGpuMedian * 0.25,
      sparse128CpuPlusGpuLower: sparseCombinedMedian < fullCombinedMedian,
      noValidationErrors: validationErrors.length === 0,
    };
    assert(
      acceptance.sparse128GpuAtMost25Percent,
      `128-chunk GPU median ${sparseGpuMedian} ms exceeds 25% of full ${fullGpuMedian} ms`,
    );
    assert(
      acceptance.sparse128CpuPlusGpuLower,
      `128-chunk CPU+GPU median ${sparseCombinedMedian} ms does not beat full ${fullCombinedMedian} ms`,
    );
    await device.queue.onSubmittedWorkDone();
    assert(
      validationErrors.length === 0,
      `WebGPU validation errors:\n${validationErrors.join("\n")}`,
    );

    full.kernel.destroy();
    sparse.kernel.destroy();
    querySet.destroy();
    queryResolved.destroy();
    queryRead.destroy();
    device.destroy();
    return {
      date: new Date().toISOString(),
      gpu: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        device: adapter.info.device,
        description: adapter.info.description,
        isFallbackAdapter: adapter.info.isFallbackAdapter,
        maxStorageBuffersPerShaderStage:
          adapter.limits.maxStorageBuffersPerShaderStage,
      },
      userAgent: navigator.userAgent,
      implementation: {
        api: "FieldKernel.create/resize/writeBuffer/beginFrame + CompiledFieldSystem.runView + FieldFrame.finish",
        productionRegionUpload: true,
        productionShader: true,
        outputTextureInstrumentation: "COPY_SRC added to field-out",
        timestampInstrumentation:
          "timestampWrites injected into the real compute pass; query resolve appended to its command encoder",
        viewBinds: [...viewPass.binds],
        storageBufferCount,
        allocatedBuffers: kernelConfig.buffers.map((spec) => spec.name),
        allocatedUniforms: kernelConfig.uniforms.map((spec) => spec.name),
      },
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
      parity: {
        everyByteCompared: true,
        mutationCoverage: [
          "owner change on an interior chunk boundary with uniform 3x3 ownership; cross-chunk neighbour effect asserted",
          "first and last map texel",
          "farm maturity",
          "interior city physical level removal at constant density; alpha effect asserted",
          "damage clearing",
          "highlight clearing",
          "two encoded frames queued before completion",
          "65x33 non-aligned clipped edge chunks",
        ],
        directEffectAssertions: effects,
        cases: parity,
      },
      performance: {
        samples,
        warmups,
        order: cases.map(({ name }) => name),
        chunks: {
          size: "32x32",
          selection: "dispersed deterministic permutation",
          dirty_128_chunks: 128,
          dirty_512_chunks: 512,
          dirty_2048_chunks: 2048,
        },
        metrics: {
          gpuMs:
            "timestamp-query around the real view compute pass; excludes region-buffer copy",
          encodeJsMs: "beginFrame plus runView wall time",
          finishSubmitJsMs:
            "synchronous FieldFrame.finish work through command finish and queue.submit",
          finishWallMs:
            "FieldFrame.finish wall time through queue.onSubmittedWorkDone",
          cpuPlusGpuMs:
            "encodeJsMs + finishSubmitJsMs + gpuMs; excludes dirty discovery and the GPU region-buffer copy",
        },
        limitations: [
          "performance.now() was quantized to about 0.1 ms; zero CPU medians mean below timer resolution, not zero cost",
          "GPU timestamps cover the compute pass only and exclude the preceding region-buffer copy",
          "serial query readback and queue waits make this an isolated microbenchmark, not application throughput",
        ],
        exclusions: [
          "CPU simulation and dirty discovery",
          "game camera and compositor",
          "plot texture upload",
          "terrain derivation",
        ],
        summary,
        timings,
      },
      acceptance,
    };
  });

  result.cpu = cpus()[0].model;
  result.sourceSha256 = Object.fromEntries(
    [
      "simplefront/src/client/webgpu/FieldKernel.ts",
      "simplefront/src/client/webgpu/FieldDynamics.ts",
      "simplefront/src/client/games/simplefront/system.ts",
      "simplefront/src/client/games/simplefront/visuals/city-view.wesl",
      "simplefront/src/client/games/shared/live-game.wesl",
      "simplefront/src/client/shell/RenderInvalidation.ts",
      "simplefront/docs/performance/render-cache-gpu-validation.mjs",
    ].map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  );
  const output =
    process.env.BENCH_OUTPUT ||
    "simplefront/docs/performance/render-cache-gpu-validation.json";
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        output,
        gpu: result.gpu,
        parity: result.parity,
        summary: result.performance.summary,
        acceptance: result.acceptance,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
