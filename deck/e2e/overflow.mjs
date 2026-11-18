// Checks that no slide has a scroller and that nothing is cut off, at several window sizes.
// Usage (dev server on 5173 or preview on 4173 already running):
//   node e2e/overflow.mjs [--base http://localhost:5173] [--sizes 1920x1080,1536x730] [--only dp]
// A slide fails when any element can scroll, or when the text column or the figure card holds
// more than it shows. The report also lists how far each slide had to be shrunk to fit.
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = option("base", "http://localhost:5173");
const only = option("only", "");
const sizes = option("sizes", "1920x1080,1536x730,1366x650,1280x720,1024x768,2560x1080")
  .split(",")
  .map((s) => s.split("x").map(Number));
const SMALLEST_FIT = Number(option("min-fit", "0.72"));

const browser = await chromium.launch({
  channel: "msedge",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

function inspect() {
  const describe = (el) => {
    const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${cls}`;
  };
  const scrollers = [];
  for (const el of document.querySelectorAll(".deck *")) {
    const style = getComputedStyle(el);
    const y = /auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const x = /auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (x || y) scrollers.push(`${describe(el)} ${x ? `x+${el.scrollWidth - el.clientWidth}` : ""}${y ? ` y+${el.scrollHeight - el.clientHeight}` : ""}`.trim());
  }
  const clipped = [];
  for (const selector of [".panel", ".stage", ".overview", ".code__pre"]) {
    for (const el of document.querySelectorAll(selector)) {
      const dy = el.scrollHeight - el.clientHeight;
      const dx = el.scrollWidth - el.clientWidth;
      if (dy > 1 || dx > 1) clipped.push(`${selector}${dx > 1 ? ` x+${dx}` : ""}${dy > 1 ? ` y+${dy}` : ""}`);
    }
  }
  const fits = [...document.querySelectorAll("[data-fit]")].map((el) => Number(el.getAttribute("data-fit")));
  const doc = document.scrollingElement;
  if (doc && (doc.scrollHeight > window.innerHeight + 1 || doc.scrollWidth > window.innerWidth + 1)) scrollers.push("the page itself");
  return { scrollers, clipped, fit: fits.length ? Math.min(...fits) : 1 };
}

let failures = 0;
for (const [width, height] of sizes) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${base}/?solo=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__deck !== undefined, null, { timeout: 30000 });
  const deck = await page.evaluate(() => window.__deck);
  const slides = deck.slides.filter((s) => !only || s.id.startsWith(`${only}/`));
  const bad = [];
  const shrunk = [];
  const check = async (name) => {
    const found = await page.evaluate(inspect);
    if (found.scrollers.length > 0 || found.clipped.length > 0) bad.push(`  ${name}: ${[...found.scrollers.map((s) => `scrolls ${s}`), ...found.clipped.map((s) => `cut off ${s}`)].join("; ")}`);
    if (found.fit < 0.999) shrunk.push({ name, fit: found.fit });
    if (found.fit < SMALLEST_FIT) bad.push(`  ${name}: shrunk to ${Math.round(found.fit * 100)}% to fit, below the ${Math.round(SMALLEST_FIT * 100)}% floor`);
  };
  for (const slide of slides) {
    await page.evaluate((id) => {
      window.location.hash = `#/${id}`;
    }, slide.id);
    await page.waitForTimeout(450);
    await check(slide.id);
    // Every tab of a code view is a different excerpt with its own length.
    const tabs = page.locator(".stage .codeview__tab");
    const count = await tabs.count();
    for (let t = 1; t < count; t++) {
      await tabs.nth(t).click();
      await page.waitForTimeout(120);
      await check(`${slide.id} tab ${t + 1}`);
    }
  }
  if (!only) {
    await page.keyboard.press("o");
    await page.waitForTimeout(300);
    await check("all-slides page");
  }
  await page.close();
  shrunk.sort((a, b) => a.fit - b.fit);
  const worst = shrunk.slice(0, 24).map((s) => `${s.name} ${Math.round(s.fit * 100)}%`).join(", ");
  console.log(`${width}x${height}: ${slides.length} slides, ${bad.length} problem(s), ${shrunk.length} shrunk to fit${worst ? ` (smallest: ${worst})` : ""}`);
  if (bad.length > 0) console.log(bad.join("\n"));
  failures += bad.length;
}
await browser.close();
if (failures > 0) {
  console.error(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log("\nNo scroller and nothing cut off at any size.");
