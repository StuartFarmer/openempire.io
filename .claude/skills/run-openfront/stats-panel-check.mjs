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
await page.evaluate(() => {
  const el=document.querySelector("game-shell-page");
  const W=el.mapWidth,H=el.mapHeight,cx=Math.floor(el.camera.cx),cy=Math.floor(el.camera.cy);
  for(let r=0;r<160;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
    const x=cx+dx,y=cy+dy; if(x<1||y<1||x>=W-1||y>=H-1) continue;
    if(el.fertilityPlane?.[y*W+x]>0){el.onTileGesture(x,y,{});return;} }
});
await page.waitForTimeout(1500);
await page.evaluate(() => { const el=document.querySelector("game-shell-page"); el.turbo=true; if(!el.running) el.toggleRunning(); else el.setTurbo(true); });
await page.waitForTimeout(14000);
await page.evaluate(() => { const el=document.querySelector("game-shell-page"); el.turbo=false; el.setTurbo(false); });
await page.waitForTimeout(800);

console.log("stats received:", JSON.stringify(await page.evaluate(() => {
  const el=document.querySelector("game-shell-page");
  const me=el.playerStat.get(el.mySmallID);
  const h=el.history.get(el.mySmallID);
  return { me, historyPlayers: el.history.size,
           series: h ? { troops: h.troops.length, food: h.food.length, balance: h.balance.length } : null,
           lastBalance: h ? h.balance[h.balance.length-1] : null };
})));

await page.evaluate(() => {
  const el=document.querySelector("game-shell-page");
  const W=el.mapWidth, own=el.ownerScratch, me=el.mySmallID;
  let sx=0,sy=0,n=0;
  for(let i=0;i<own.length;i++) if(own[i]===me){sx+=i%W;sy+=(i/W)|0;n++;}
  if(n) el.camera={cx:sx/n,cy:sy/n,scale:5};
});
await page.waitForTimeout(900);
const panel = await page.evaluate(() => {
  const rows=[...document.querySelectorAll("game-shell-page .absolute.bottom-3.right-3 > div")];
  return rows.map(r=>r.textContent.replace(/\s+/g," ").trim());
});
console.log("panel (no hover):", JSON.stringify(panel, null, 1));
await page.screenshot({ path: "/tmp/openfront-run/stats-panel.png" });

const target = await page.evaluate(() => {
  const el=document.querySelector("game-shell-page");
  const W=el.mapWidth, own=el.ownerScratch, me=el.mySmallID;
  const canvas=document.querySelector("#shell-canvas");
  const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1, cam=el.camera;
  const counts=new Map();
  for(let i=0;i<own.length;i++){const o=own[i]; if(o===0||o===me) continue; counts.set(o,(counts.get(o)??0)+1);}
  for(const [want] of [...counts.entries()].sort((a,b)=>b[1]-a[1])){
    for(let i=0;i<own.length;i++){ if(own[i]!==want) continue;
      const x=i%W,y=(i/W)|0;
      const cxp=rect.left+((x+0.5-cam.cx)*cam.scale+canvas.width/2)/dpr;
      const cyp=rect.top+((y+0.5-cam.cy)*cam.scale+canvas.height/2)/dpr;
      const mx=rect.left+rect.width/2,my=rect.top+rect.height/2;
      if(Math.abs(cxp-mx)<rect.width*0.3&&Math.abs(cyp-my)<rect.height*0.3){
        const hit=document.elementFromPoint(cxp,cyp);
        if(hit&&(hit.id==="shell-canvas"||hit.id==="game-input-overlay"))
          return {ok:true,x:cxp,y:cyp,name:el.playerName.get(want)}; } } }
  return {ok:false};
});
if (target.ok) {
  await page.mouse.move(target.x, target.y);
  await page.waitForTimeout(800);
  const hov = await page.evaluate(() => {
    const box=document.querySelector("game-shell-page .absolute.bottom-3.right-3");
    return { text: [...box.children].map(r=>r.textContent.replace(/\s+/g," ").trim()),
             ghostLines: box.querySelectorAll('polyline[stroke^="rgba"]').length,
             ownLines: box.querySelectorAll('polyline[stroke="#7dd3fc"]').length };
  });
  console.log(`panel (hovering ${target.name}):`, JSON.stringify(hov, null, 1));
  await page.screenshot({ path: "/tmp/openfront-run/stats-panel-hover.png" });
}
const toggled = await page.evaluate(() => {
  [...document.querySelectorAll("game-shell-page button")].find(b=>b.textContent.trim()==="stats").click();
  return true;
});
await page.waitForTimeout(400);
console.log("after toggle, panel present:", await page.evaluate(() =>
  !!document.querySelector("game-shell-page .absolute.bottom-3.right-3")));
// Height parity: the stats panel should match the tile inspector at full detail.
await page.evaluate(() => {
  [...document.querySelectorAll("game-shell-page button")].find(b=>b.textContent.trim()==="stats").click();
});
await page.waitForTimeout(400);
if (target.ok) { await page.mouse.move(target.x, target.y); await page.waitForTimeout(700); }
const heights = await page.evaluate(() => {
  const stats = document.querySelector("game-shell-page .absolute.bottom-3.right-3");
  const insp  = document.querySelector("game-shell-page .absolute.bottom-3.left-3");
  return {
    statsH: stats ? Math.round(stats.getBoundingClientRect().height) : null,
    inspectorH: insp ? Math.round(insp.getBoundingClientRect().height) : null,
    inspectorRows: insp ? insp.children.length : null,
    statsBottom: stats ? Math.round(window.innerHeight - stats.getBoundingClientRect().bottom) : null,
  };
});
console.log("HEIGHTS:", JSON.stringify(heights));
console.log("errors:", errors.length ? errors.slice(0,4) : "none");
await browser.close();
