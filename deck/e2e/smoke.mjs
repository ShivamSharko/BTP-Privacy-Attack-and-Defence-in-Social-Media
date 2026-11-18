// Visits every slide of one theory in headless Edge, saves a picture of each, and reports
// console errors. Usage (dev server already running on port 5173):
//   node e2e/smoke.mjs <theoryId> [--base http://localhost:5173] [--light] [--wait 1800]
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const theoryId = args.find((a) => !a.startsWith("--"));
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!theoryId) {
  console.error("usage: node e2e/smoke.mjs <theoryId> [--base URL] [--light] [--wait ms]");
  process.exit(2);
}
const base = option("base", "http://localhost:5173");
const wait = Number(option("wait", "1800"));
const light = args.includes("--light");
const shots = join(dirname(fileURLToPath(import.meta.url)), "shots");
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  channel: "msedge",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const problems = [];
let current = "(loading)";
const foreign = (text) =>
  (/\/theories\/([\w-]+)\//.test(text) && !text.includes(`/theories/${theoryId}/`)) ||
  (/scene "[\w-]+" failed/.test(text) && !text.includes(`scene "${theoryId}" failed`)) ||
  /Outdated Optimize Dep|\[vite\]/.test(text);
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = `${message.text()} ${message.location()?.url ?? ""}`;
  if (!foreign(text)) problems.push(`[${current}] console error: ${message.text()}`);
});
page.on("pageerror", (error) => {
  const text = `${error.message} ${error.stack ?? ""}`;
  if (!foreign(text)) problems.push(`[${current}] page error: ${error.message}`);
});

await page.goto(`${base}/?solo=1#/${theoryId}/1`, { waitUntil: "load" });
await page.waitForFunction(() => window.__deck !== undefined, null, { timeout: 30000 });
const deck = await page.evaluate(() => window.__deck);
const slides = deck.slides.filter((s) => s.id.startsWith(`${theoryId}/`));
if (deck.failed.includes(theoryId)) problems.push(`theory folder "${theoryId}" failed to import (see the dev server output)`);
if (slides.length === 0) problems.push(`no slides found for "${theoryId}"`);
if (light) await page.keyboard.press("t");

for (const slide of slides) {
  current = slide.id;
  await page.evaluate((id) => {
    window.location.hash = `#/${id}`;
  }, slide.id);
  await page.waitForTimeout(wait);
  const shown = await page.evaluate(() => document.querySelector(".deck")?.getAttribute("data-slide"));
  if (shown !== slide.id) problems.push(`[${slide.id}] the deck shows "${shown}" instead`);
  const file = join(shots, `${slide.id.replace("/", "-")}${light ? "-light" : ""}.png`);
  await page.screenshot({ path: file });
  console.log(`${slide.id}  ${slide.kind.padEnd(7)} ${slide.title}  ->  ${file}`);
}

await browser.close();
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`\n${slides.length} slides, no errors.`);
