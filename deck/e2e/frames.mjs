// Frame-time check in a real, visible Edge window on this machine's GPU.
// Pass mark per slide: median frame at most 16.7 ms and 95th percentile at most 25 ms.
// Usage: npm run build && npm run preview   (in another terminal), then:  node e2e/frames.mjs
// Keep the window in front and do not cover it while it runs: a hidden window is throttled.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = option("base", "http://localhost:4173");
const settle = Number(option("settle", "2600"));
const MEDIAN_LIMIT = 16.7;
const P95_LIMIT = 25;
const here = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({ channel: "msedge", headless: false, args: ["--window-size=1920,1080", "--window-position=0,0"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${base}/?perf=1`);
await page.waitForFunction(() => window.__deck !== undefined);
const deck = await page.evaluate(() => window.__deck);
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
});

// A hidden window, a locked screen or a display that has switched off throttles animation
// frames, and the numbers would mean nothing. Check that frames are really being delivered.
async function frameRate() {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const start = performance.now();
        const tick = () => {
          n += 1;
          if (performance.now() - start < 1000) requestAnimationFrame(tick);
          else resolve(n);
        };
        requestAnimationFrame(tick);
        setTimeout(() => resolve(n), 1600);
      }),
  );
}
const startRate = await frameRate();
if (startRate < 40) {
  await browser.close();
  console.error(`only ${startRate} animation frames in one second: the window is hidden or the display is off. Nothing was measured and the report was not changed.`);
  process.exit(2);
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
const slides = [];
for (const slide of deck.slides) {
  await page.evaluate((id) => {
    window.location.hash = `#/${id}`;
  }, slide.id);
  // Start anything that only animates on request, so the busiest state is the one measured.
  const starter = page.locator(".panel button", { hasText: /^(Start|Play|Play the day|Run the gate|Start a round|Step)$/ }).first();
  await page.waitForTimeout(500);
  if ((await starter.count()) > 0) await starter.click({ timeout: 1000 }).catch(() => {});
  await page.evaluate(() => {
    if (window.__perf) window.__perf.samples.length = 0;
  });
  await page.waitForTimeout(settle);
  const samples = await page.evaluate(() => (window.__perf ? [...window.__perf.samples] : []));
  const sorted = [...samples].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const p95 = quantile(sorted, 0.95);
  const onDemand = samples.length < 30;
  slides.push({
    id: slide.id,
    kind: slide.kind,
    frames: samples.length,
    median: Number(median.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    rendering: onDemand ? "on demand (scene idle behind a chart or code)" : "continuous",
    pass: onDemand || (median <= MEDIAN_LIMIT && p95 <= P95_LIMIT),
  });
}
const endRate = await frameRate();
await browser.close();
if (endRate < 40) {
  console.error(`only ${endRate} animation frames in one second at the end: the window was hidden during the run. The report was not changed.`);
  process.exit(2);
}

const continuous = slides.filter((s) => s.rendering === "continuous");
const failing = slides.filter((s) => !s.pass);
const report = {
  measured: new Date().toISOString(),
  gpu,
  viewport: "1920x1080",
  displayFramesPerSecond: startRate,
  passMark: { medianMs: MEDIAN_LIMIT, p95Ms: P95_LIMIT },
  summary: {
    slides: slides.length,
    continuous: continuous.length,
    onDemand: slides.length - continuous.length,
    worstMedianMs: Math.max(0, ...continuous.map((s) => s.median)),
    worstP95Ms: Math.max(0, ...continuous.map((s) => s.p95)),
    failing: failing.map((s) => s.id),
  },
  slides,
};
writeFileSync(join(here, "frame-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`GPU: ${gpu}`);
console.log(`${slides.length} slides, ${continuous.length} rendering continuously`);
console.log(`worst median ${report.summary.worstMedianMs} ms, worst p95 ${report.summary.worstP95Ms} ms`);
for (const s of [...continuous].sort((a, b) => b.p95 - a.p95).slice(0, 8)) console.log(`  ${s.id.padEnd(12)} median ${s.median} ms  p95 ${s.p95} ms  ${s.pass ? "" : "OVER"}`);
if (failing.length > 0) {
  console.error(`over the pass mark: ${failing.map((s) => s.id).join(", ")}`);
  process.exit(1);
}
console.log("every slide is inside the pass mark");
