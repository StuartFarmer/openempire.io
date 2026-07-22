import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 300)); });
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => { const el=document.querySelector("game-shell-page"); return !!el?.worker && (el.tickCount??0)>0 && !!el.ownerScratch; }, { timeout: 150000 });
await page.waitForTimeout(2000);
// Settle + grow so there are neighbours to inspect.
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const W=el.mapWidth,H=el.mapHeight,cx=Math.floor(el.camera.cx),cy=Math.floor(el.camera.cy);
  for (let r=0;r<160;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
    const x=cx+dx,y=cy+dy; if(x<1||y<1||x>=W-1||y>=H-1) continue;
    if(el.fertilityPlane?.[y*W+x]>0){el.onTileGesture(x,y,{});return;} }
});
await page.waitForTimeout(1500);
await page.evaluate(() => { const el=document.querySelector("game-shell-page"); el.turbo=true; if(!el.running) el.toggleRunning(); else el.setTurbo(true); });
await page.waitForTimeout(9000);
await page.evaluate(() => { const el=document.querySelector("game-shell-page"); el.turbo=false; el.setTurbo(false); });
await page.waitForTimeout(800);
// Zoom out so several countries are on screen.
await page.evaluate(() => {
  const el=document.querySelector("game-shell-page");
  const W=el.mapWidth, own=el.ownerScratch, me=el.mySmallID;
  let sx=0,sy=0,n=0;
  for(let i=0;i<own.length;i++) if(own[i]===me){sx+=i%W;sy+=(i/W)|0;n++;}
  if(n) el.camera={cx:sx/n, cy:sy/n, scale:5};
});
await page.waitForTimeout(1000);
console.log("idle hoveredPlayer:", await page.evaluate(() => document.querySelector("game-shell-page").paramValues.hoveredPlayer ?? 0));
await page.screenshot({ path: "/tmp/openfront-run/inspect-off.png" });

const target = await page.evaluate(() => {
  const el=document.querySelector("game-shell-page");
  const W=el.mapWidth, own=el.ownerScratch, me=el.mySmallID;
  const canvas=document.querySelector("#shell-canvas");
  const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1, cam=el.camera;
  // Biggest foreign nation visible near the centre.
  const counts=new Map();
  for(let i=0;i<own.length;i++){const o=own[i]; if(o===0||o===me) continue; counts.set(o,(counts.get(o)??0)+1);}
  const best=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  for(const want of best){
    for(let i=0;i<own.length;i++){
      if(own[i]!==want) continue;
      const x=i%W,y=(i/W)|0;
      const cxp=rect.left+((x+0.5-cam.cx)*cam.scale+canvas.width/2)/dpr;
      const cyp=rect.top+((y+0.5-cam.cy)*cam.scale+canvas.height/2)/dpr;
      const mx=rect.left+rect.width/2,my=rect.top+rect.height/2;
      if(Math.abs(cxp-mx)<rect.width*0.3&&Math.abs(cyp-my)<rect.height*0.3){
        const hit=document.elementFromPoint(cxp,cyp);
        if(hit&&(hit.id==="shell-canvas"||hit.id==="game-input-overlay"))
          return {ok:true,clientX:cxp,clientY:cyp,owner:want,name:el.playerName.get(want)};
      }
    }
  }
  return {ok:false};
});
console.log("inspect target:", JSON.stringify(target));
if (target.ok) {
  await page.mouse.move(target.clientX, target.clientY);
  await page.waitForTimeout(900);
  console.log("while hovering → hoveredPlayer:", await page.evaluate(() => document.querySelector("game-shell-page").paramValues.hoveredPlayer));
  await page.screenshot({ path: "/tmp/openfront-run/inspect-on.png" });
  // Move off onto our own land → should clear.
  await page.evaluate(() => {
    const el=document.querySelector("game-shell-page");
    const W=el.mapWidth, own=el.ownerScratch, me=el.mySmallID;
    const canvas=document.querySelector("#shell-canvas");
    const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1, cam=el.camera;
    for(let i=0;i<own.length;i++){ if(own[i]!==me) continue;
      const x=i%W,y=(i/W)|0;
      const cxp=rect.left+((x+0.5-cam.cx)*cam.scale+canvas.width/2)/dpr;
      const cyp=rect.top+((y+0.5-cam.cy)*cam.scale+canvas.height/2)/dpr;
      if(cxp>rect.left+30&&cxp<rect.right-30&&cyp>rect.top+30&&cyp<rect.bottom-30){
        window.__own={x:cxp,y:cyp}; return; } }
  });
  const own = await page.evaluate(() => window.__own);
  if (own) { await page.mouse.move(own.x, own.y); await page.waitForTimeout(700);
    console.log("hovering OWN land → hoveredPlayer:", await page.evaluate(() => document.querySelector("game-shell-page").paramValues.hoveredPlayer)); }
}
console.log("errors:", errors.length ? errors.slice(0,4) : "none");
await browser.close();
