const ORIGIN = "http://127.0.0.1:9000/";
const CHECK_ORIGIN = "http://localhost:9000/";

async function assertDevServer(): Promise<void> {
  try {
    const response = await fetch(CHECK_ORIGIN);
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (cause) {
    const error = new Error(
      `the LeanFront GPU replay needs the dev server on ${CHECK_ORIGIN} (npm run dev -- --host 127.0.0.1 --port 9000)`,
    );
    (error as Error & { cause?: unknown }).cause = cause;
    throw error;
  }
}

async function main(): Promise<void> {
  await assertDevServer();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    channel: "chromium",
    args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
  });
  try {
    const results = [];
    for (let run = 1; run <= 2; run += 1) {
      const page = await browser.newPage();
      try {
        await page.goto(ORIGIN, { waitUntil: "load" });
        const result = await page.evaluate(async () => {
          const probeUrl = "/tests/perf/leanfront/LeanFrontGpuProbe.ts";
          const probe = (await import(
            /* @vite-ignore */ probeUrl
          )) as typeof import("./LeanFrontGpuProbe");
          return probe.runLeanFrontGpuProbe();
        });
        results.push(result);
        console.log(`run ${run}: ${JSON.stringify(result)}`);
      } finally {
        await page.close();
      }
    }
    if (results[0].hash !== results[1].hash) {
      throw new Error(
        `GPU replay hash mismatch: ${results[0].hash} != ${results[1].hash}`,
      );
    }
    console.log(`deterministic hash: ${results[0].hash}`);
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
