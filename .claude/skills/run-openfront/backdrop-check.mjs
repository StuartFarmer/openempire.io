import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 250)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 250)); });
await page.goto("http://localhost:9000/", { waitUntil: "load" });
await page.waitForFunction(() => {
  const b = document.querySelector("#page-backdrop");
  return b && b.worker && (b.tickCount ?? 0) > 0;
}, { timeout: 90000 });
console.log("first frame:", JSON.stringify(await page.evaluate(() => {
  const b = document.querySelector("#page-backdrop");
  return { map: b.mapKey, tick: b.tickCount, turbo: b.turbo, inSpawn: b.inSpawn,
           zoom: Math.round(b.camera.scale),
           maxTiles: Math.max(0, ...[...(b.playerStat??[])].map(([,v])=>v.tiles)) };
})));
// Menu must still be clickable through the backdrop.
console.log("menu clickable:", await page.evaluate(() => {
  const btn = [...document.querySelectorAll("play-page button")].find(x=>/start/i.test(x.textContent));
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  return hit === btn || btn.contains(hit);
}));
const track = [];
let prev = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1200);
  const cur = await page.evaluate(() => {
    const b = document.querySelector("#page-backdrop");
    return { t: b.tickCount, op: b.style.opacity || "(unset)", turbo: b.turbo,
             z: Math.round(b.camera.scale), cx: b.camera.cx, cy: b.camera.cy };
  });
  const hop = prev ? Math.round(Math.hypot(cur.cx-prev.cx, cur.cy-prev.cy)) : 0;
  const dir = prev ? `${(cur.cx-prev.cx).toFixed(2)},${(cur.cy-prev.cy).toFixed(2)}` : "-";
  track.push({ ...cur, hop, dir });
  prev = cur;
}
console.log("opacity values seen:", [...new Set(track.map(t=>t.op))].join(","));
console.log("zoom:", [...new Set(track.map(t=>t.z))].join(","));
console.log("hops between samples:", track.map(t=>t.hop).join(" "));
console.log("max hop:", Math.max(...track.map(t=>t.hop)));
console.log("turbo ever on:", track.some(t=>t.turbo));
console.log("first sample zoom:", track[0].z, "| drift vectors:", track.slice(0,8).map(t=>t.dir).join("  "));
const warm = await page.evaluate(() => {
  const b = document.querySelector("#page-backdrop");
  let dense=0, front=0;
  for(let i=0;i<b.densityU32.length;i++) if(b.densityU32[i]>0) dense++;
  for(let i=0;i<b.frontU32.length;i++) if(b.frontU32[i]>0) front++;
  return { tick: b.tickCount, turbo: b.turbo, dense, front, inSpawn: b.inSpawn,
           maxTiles: Math.max(0, ...[...(b.playerStat??[])].map(([,v])=>v.tiles)),
           alive: [...(b.playerStat??[])].filter(([,v])=>v.alive).length,
           cam: { cx: Math.round(b.camera.cx), cy: Math.round(b.camera.cy), scale: Math.round(b.camera.scale) },
           heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null };
});
console.log("after 18s warm:", JSON.stringify(warm));
if (warm.inSpawn) console.log("!! STILL IN SPAWN PHASE — the game never started");
await page.screenshot({ path: "/tmp/openfront-run/backdrop.png" });
// Navigating away must tear the backdrop sim down (no two sims).
await page.evaluate(() => [...document.querySelectorAll("play-page button")].find(x=>/start/i.test(x.textContent)).click());
await page.waitForTimeout(4000);
console.log("after Start Game:", JSON.stringify(await page.evaluate(() => {
  const b = document.querySelector("#page-backdrop");
  const s = document.querySelector("#page-shell");
  return { backdropWorker: !!b.worker, backdropKernel: !!b.kernel, shellWorker: !!s.worker, shellHidden: s.classList.contains("hidden") };
})));
console.log("errors:", errors.length ? errors.slice(0,4) : "none");
await browser.close();
