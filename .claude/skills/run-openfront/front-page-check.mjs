import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 250)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 250)); });
await page.goto("http://localhost:9000/", { waitUntil: "load" });
await page.waitForTimeout(4000);

console.log("title:", await page.title());
const state = await page.evaluate(() => {
  const pick = (s) => document.querySelector(s);
  const btns = [...document.querySelectorAll("play-page button")].map(b => b.textContent.trim());
  const links = [...document.querySelectorAll("play-page a")].map(a => ({ text: a.textContent.trim(), href: a.getAttribute("href") }));
  const h1 = pick("play-page h1");
  return {
    h1: h1 ? h1.textContent.replace(/\s+/g," ").trim() : null,
    hasUsernameInput: !!pick("play-page username-input"),
    buttons: btns,
    links,
    desktopNav: !!pick("desktop-nav-bar"),
    mobileNav: !!pick("mobile-nav-bar"),
    hamburger: !!pick("#hamburger-btn"),
  };
});
console.log("front page:", JSON.stringify(state, null, 1));
await page.screenshot({ path: "/tmp/openfront-run/front-page.png" });

// Start Game must route to #shell and actually mount the shell.
await page.evaluate(() => [...document.querySelectorAll("play-page button")]
  .find(b => /start/i.test(b.textContent)).click());
await page.waitForTimeout(1500);
console.log("hash after Start Game:", await page.evaluate(() => location.hash));
const shellUp = await page.waitForFunction(() => {
  const el = document.querySelector("game-shell-page");
  return el && !el.classList.contains("hidden");
}, { timeout: 30000 }).then(() => true).catch(() => false);
console.log("shell page shown:", shellUp);

// Map generator link.
await page.goto("http://localhost:9000/", { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.evaluate(() => [...document.querySelectorAll("play-page a")]
  .find(a => a.getAttribute("href") === "#generator").click());
await page.waitForTimeout(1500);
console.log("hash after Map Generator:", await page.evaluate(() => location.hash));
console.log("generator shown:", await page.evaluate(() => {
  const el = document.querySelector("generator-page");
  return !!el && !el.classList.contains("hidden");
}));
console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
