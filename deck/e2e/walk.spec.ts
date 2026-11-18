import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EXPECTED_SLIDES = 65;

interface DeckInfo {
  slides: { id: string; title: string; kind: string }[];
  failed: string[];
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function openDeck(page: Page, path = "/"): Promise<DeckInfo> {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __deck?: unknown }).__deck !== undefined);
  return page.evaluate(() => (window as unknown as { __deck: DeckInfo }).__deck);
}

const shownSlide = (page: Page) => page.locator(".deck").getAttribute("data-slide");

test("every theory folder loads and the deck has the planned slides", async ({ page }) => {
  const deck = await openDeck(page);
  expect(deck.failed).toEqual([]);
  expect(deck.slides.length).toBeGreaterThanOrEqual(EXPECTED_SLIDES);
  expect(new Set(deck.slides.map((s) => s.id)).size).toBe(deck.slides.length);
});

test("walks every slide in order with no errors", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const deck = await openDeck(page);
  const noWebgl = testInfo.project.name === "no-webgl";
  const shots = join(here, "shots", testInfo.project.name);
  mkdirSync(shots, { recursive: true });

  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i];
    await expect.poll(() => shownSlide(page)).toBe(slide.id);
    expect(new URL(page.url()).hash).toBe(`#/${slide.id}`);
    await expect(page.locator(".panel h1").first()).toBeVisible();
    if (noWebgl) {
      await expect(page.locator(".deck__fallback svg").first()).toBeAttached();
      await expect(page.locator("canvas")).toHaveCount(0);
    } else {
      await expect(page.locator(".deck__world canvas")).toHaveCount(1);
    }
    if (testInfo.project.name === "motion") {
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(shots, `${String(i + 1).padStart(2, "0")}-${slide.id.replace("/", "-")}.png`) });
    }
    if (i < deck.slides.length - 1) await page.keyboard.press("ArrowRight");
  }
  expect(errors).toEqual([]);
});

test("a reload stays on the same slide and an unknown address opens the first", async ({ page }) => {
  const deck = await openDeck(page);
  const target = deck.slides[Math.min(29, deck.slides.length - 1)];
  await openDeck(page, `/#/${target.id}`);
  await expect.poll(() => shownSlide(page)).toBe(target.id);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __deck?: unknown }).__deck !== undefined);
  await expect.poll(() => shownSlide(page)).toBe(target.id);

  await openDeck(page, "/#/no-such/9");
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[0].id);
});

test("ten quick presses land ten slides on", async ({ page }) => {
  const errors = watchErrors(page);
  const deck = await openDeck(page);
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[0].id);
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight", { delay: 0 });
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[10].id);
  await page.waitForTimeout(1600);
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[10].id);
  expect(errors).toEqual([]);
});

test("keyboard shortcuts: overview, theme, home and end", async ({ page }) => {
  const deck = await openDeck(page);
  await page.keyboard.press("o");
  await expect(page.getByRole("dialog", { name: "All slides" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "All slides" })).toHaveCount(0);
  await page.keyboard.press("t");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("t");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("End");
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[deck.slides.length - 1].id);
  await page.keyboard.press("Home");
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[0].id);
});

/** Everything on the page that can scroll, and every box that holds more than it shows. */
function findOverflow(): string[] {
  const found: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(".deck *")) {
    const style = getComputedStyle(el);
    const canScroll = /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`);
    const over = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    const box = el.matches(".panel, .stage, .overview, .code__pre");
    if (over && (canScroll || box)) found.push(`${canScroll ? "scrolls" : "cut off"}: ${el.tagName.toLowerCase()}.${el.className}`);
  }
  const fits = [...document.querySelectorAll("[data-fit]")].map((el) => Number(el.getAttribute("data-fit")));
  if (Math.min(1, ...fits) < 0.72) found.push(`shrunk to ${Math.min(...fits)} to fit`);
  const root = document.scrollingElement;
  if (root && (root.scrollHeight > window.innerHeight + 1 || root.scrollWidth > window.innerWidth + 1)) found.push("the page itself scrolls");
  return found;
}

test("no slide has a scroller or anything cut off, at three window sizes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "reduced-motion", "layout does not depend on motion or WebGL, so it is checked once");
  const problems: string[] = [];
  for (const [width, height] of [
    [1600, 900],
    [1366, 650],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    const deck = await openDeck(page, "/?solo=1");
    const check = async (name: string) => {
      for (const p of await page.evaluate(findOverflow)) problems.push(`${width}x${height} ${name}: ${p}`);
    };
    for (const slide of deck.slides) {
      await page.evaluate((id) => {
        window.location.hash = `#/${id}`;
      }, slide.id);
      await expect.poll(() => shownSlide(page)).toBe(slide.id);
      await page.waitForTimeout(150);
      await check(slide.id);
      const tabs = page.locator(".stage .codeview__tab");
      for (let t = 1; t < (await tabs.count()); t++) {
        await tabs.nth(t).click();
        await page.waitForTimeout(80);
        await check(`${slide.id} tab ${t + 1}`);
      }
    }
    await page.keyboard.press("o");
    await page.waitForTimeout(200);
    await check("all-slides page");
    await page.keyboard.press("Escape");
  }
  expect(problems).toEqual([]);
});

test("the counter shows the slide inside its topic, not out of the whole deck", async ({ page }) => {
  const deck = await openDeck(page);
  const second = deck.slides.findIndex((s) => !s.id.startsWith(deck.slides[0].id.split("/")[0]));
  const topic = deck.slides[second].id.split("/")[0];
  const inTopic = deck.slides.filter((s) => s.id.startsWith(`${topic}/`)).length;
  await openDeck(page, `/#/${deck.slides[second + 1].id}`);
  await expect(page.locator(".rail__count")).toHaveText(`2 / ${inTopic}`);
  await expect(page.locator(".rail")).not.toContainText(String(deck.slides.length));
});

test("records frame times per slide as a report", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "motion", "frame times are sampled once, with motion on");
  const deck = await openDeck(page, "/?perf=1");
  const report: { id: string; median: number; p95: number; frames: number }[] = [];
  for (const slide of deck.slides) {
    await page.evaluate((id) => {
      window.location.hash = `#/${id}`;
    }, slide.id);
    await page.waitForTimeout(1500);
    const samples = await page.evaluate(() => {
      const perf = (window as unknown as { __perf?: { samples: number[] } }).__perf;
      return perf ? perf.samples.slice(-60) : [];
    });
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
    report.push({ id: slide.id, median: Number(at(0.5).toFixed(1)), p95: Number(at(0.95).toFixed(1)), frames: samples.length });
  }
  writeFileSync(
    join(here, "frame-report-headless.json"),
    `${JSON.stringify({ note: "Headless Edge on SwiftShader (software rendering). A report, not the pass mark.", slides: report }, null, 2)}\n`,
  );
});
