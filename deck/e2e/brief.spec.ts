import { expect, test } from "@playwright/test";
import { findOverflow, openDeck, shownSlide, watchErrors } from "./helpers";

/** The short version: the same build, opened with ?edition=brief. */
const BRIEF = "/?edition=brief";
const MOST = 30;

test("the short version has thirty slides or fewer, no code slide, and they are all in the full deck", async ({ page }) => {
  const full = await openDeck(page);
  expect(full.edition).toBe("full");
  const brief = await openDeck(page, BRIEF);
  expect(brief.edition).toBe("brief");
  expect(brief.failed).toEqual([]);
  expect(brief.slides.length).toBeGreaterThan(0);
  expect(brief.slides.length).toBeLessThanOrEqual(MOST);
  expect(brief.slides.filter((s) => s.kind === "code")).toEqual([]);
  const order = full.slides.map((s) => s.id);
  const places = brief.slides.map((s) => order.indexOf(s.id));
  expect(places.every((place) => place >= 0)).toBe(true);
  expect([...places].sort((a, b) => a - b)).toEqual(places);
  expect(brief.slides[0].id).toBe(full.slides[0].id);
  expect(brief.slides[brief.slides.length - 1].title).toBe("Thank you");
});

test("the short version shows its own remade slides at the same addresses", async ({ page }) => {
  const full = await openDeck(page);
  const brief = await openDeck(page, BRIEF);
  const fullTitles = new Map(full.slides.map((s) => [s.id, s.title]));
  // Most remade slides also have a title of their own; one of those is opened in both versions.
  const remade = brief.slides.filter((s) => fullTitles.get(s.id) !== s.title);
  expect(remade.length).toBeGreaterThan(brief.slides.length / 2);
  const sample = remade[Math.floor(remade.length / 2)];
  await openDeck(page, `/#/${sample.id}`);
  await expect.poll(() => shownSlide(page)).toBe(sample.id);
  const fullHeadline = await page.locator(".panel h1").first().innerText();
  await openDeck(page, `${BRIEF}#/${sample.id}`);
  await expect.poll(() => shownSlide(page)).toBe(sample.id);
  const briefHeadline = await page.locator(".panel h1").first().innerText();
  expect(briefHeadline).not.toBe(fullHeadline);
  await expect(page).toHaveTitle(`${sample.title} | PRISM-Rec in Brief`);
});

test("the short version walks from the title to the thank-you with no errors", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const deck = await openDeck(page, BRIEF);
  const noWebgl = testInfo.project.name === "no-webgl";
  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i];
    await expect.poll(() => shownSlide(page)).toBe(slide.id);
    expect(new URL(page.url()).hash).toBe(`#/${slide.id}`);
    expect(new URL(page.url()).search).toBe("?edition=brief");
    await expect(page.locator(".panel h1").first()).toBeVisible();
    if (noWebgl) await expect(page.locator(".deck__fallback svg").first()).toBeAttached();
    else await expect(page.locator(".deck__world canvas")).toHaveCount(1);
    if (testInfo.project.name === "motion") await page.waitForTimeout(500);
    if (i < deck.slides.length - 1) await page.keyboard.press("ArrowRight");
  }
  await expect(page).toHaveTitle("Thank you | PRISM-Rec in Brief");
  // Past the last slide there is nowhere to go.
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[deck.slides.length - 1].id);
  expect(errors).toEqual([]);
});

test("the short version counts slides inside what it shows of each topic", async ({ page }) => {
  const deck = await openDeck(page, BRIEF);
  const topicOf = (id: string) => id.split("/")[0];
  for (const slide of deck.slides) {
    const shown = deck.slides.filter((s) => topicOf(s.id) === topicOf(slide.id));
    await openDeck(page, `${BRIEF}#/${slide.id}`);
    await expect.poll(() => shownSlide(page)).toBe(slide.id);
    await expect(page.locator(".rail__count")).toHaveText(`${shown.indexOf(slide) + 1} / ${shown.length}`);
  }
});

test("a link written for the full deck opens the same topic in the short version", async ({ page }) => {
  const full = await openDeck(page);
  const brief = await openDeck(page, BRIEF);
  const kept = new Set(brief.slides.map((s) => s.id));
  const topicOf = (id: string) => id.split("/")[0];
  // A left-out slide of a later topic: its landing slide is neither the first slide nor the one on screen,
  // so the test fails if the deck stays put or falls back to the title.
  const first = topicOf(brief.slides[0].id);
  const leftOut = full.slides.find((s) => !kept.has(s.id) && topicOf(s.id) !== first && brief.slides.some((b) => topicOf(b.id) === topicOf(s.id)));
  test.skip(!leftOut, "the short version keeps every slide of every later topic it shows");
  const landsOn = brief.slides.find((b) => topicOf(b.id) === topicOf(leftOut!.id))!;
  expect(landsOn.id).not.toBe(brief.slides[0].id);

  // Followed while the deck is open (a button inside a slide does this).
  await page.evaluate((id) => {
    window.location.hash = `#/${id}`;
  }, leftOut!.id);
  await expect.poll(() => shownSlide(page)).toBe(landsOn.id);
  await expect.poll(() => new URL(page.url()).hash).toBe(`#/${landsOn.id}`);

  // Opened as a fresh page (a link pasted into a new tab).
  await page.goto("about:blank");
  await openDeck(page, `${BRIEF}#/${leftOut!.id}`);
  await expect.poll(() => shownSlide(page)).toBe(landsOn.id);
  await expect.poll(() => new URL(page.url()).hash).toBe(`#/${landsOn.id}`);
});

test("a link to a topic the short version leaves out keeps the slide on screen", async ({ page }) => {
  const full = await openDeck(page);
  const brief = await openDeck(page, BRIEF);
  const topicOf = (id: string) => id.split("/")[0];
  const shown = new Set(brief.slides.map((s) => topicOf(s.id)));
  const gone = full.slides.find((s) => !shown.has(topicOf(s.id)));
  test.skip(!gone, "the short version shows every topic");
  const here = brief.slides[Math.min(7, brief.slides.length - 1)];
  await openDeck(page, `${BRIEF}#/${here.id}`);
  await expect.poll(() => shownSlide(page)).toBe(here.id);
  await page.evaluate((id) => {
    window.location.hash = `#/${id}`;
  }, gone!.id);
  await page.waitForTimeout(300);
  expect(await shownSlide(page)).toBe(here.id);
  expect(new URL(page.url()).hash).toBe(`#/${here.id}`);
  expect(new URL(page.url()).search).toBe("?edition=brief");
});

test("a setting written after the slide in the address survives a slide change", async ({ page }) => {
  const deck = await openDeck(page, "/#/intro/1?edition=brief");
  expect(deck.edition).toBe("brief");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[1].id);
  await expect.poll(() => new URL(page.url()).hash).toBe(`#/${deck.slides[1].id}?edition=brief`);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __deck?: unknown }).__deck !== undefined);
  expect(await page.evaluate(() => (window as unknown as { __deck: { edition: string } }).__deck.edition)).toBe("brief");
  await expect.poll(() => shownSlide(page)).toBe(deck.slides[1].id);
});

test("each version links to the other from its first and last slide", async ({ page }) => {
  const brief = await openDeck(page, BRIEF);
  await expect(page.locator(".head__theory")).toHaveText("PRISM-Rec in brief");
  const toFull = page.getByRole("link", { name: "Open the full deck" });
  await expect(toFull).toBeVisible();
  await expect(toFull).toHaveAttribute("href", "/?edition=full");
  await page.keyboard.press("End");
  await expect.poll(() => shownSlide(page)).toBe(brief.slides[brief.slides.length - 1].id);
  await expect(page.getByRole("link", { name: "Open the full deck" })).toBeVisible();

  await toFullAndBack(page, brief.slides.length);
});

async function toFullAndBack(page: import("@playwright/test").Page, briefCount: number) {
  await page.getByRole("link", { name: "Open the full deck" }).click();
  await page.waitForFunction(() => (window as unknown as { __deck?: { edition: string } }).__deck?.edition === "full");
  const fullCount = await page.evaluate(() => (window as unknown as { __deck: { slides: unknown[] } }).__deck.slides.length);
  expect(fullCount).toBeGreaterThan(briefCount);
  await expect(page.locator(".head__theory")).toHaveText("PRISM-Rec explained");
  const toBrief = page.getByRole("link", { name: "Open the short version" });
  await expect(toBrief).toBeVisible();
  await expect(toBrief.locator("xpath=..")).toContainText(`${briefCount} slides`);
  // The full deck's last slide and its all-slides page carry the link too.
  await page.keyboard.press("End");
  await expect(page.locator(".panel h1")).toHaveText("Thank you.");
  await expect(toBrief).toBeVisible();
  await page.keyboard.press("o");
  const all = page.getByRole("dialog", { name: "All slides" });
  await expect(all.getByRole("link", { name: "Open the short version" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(all).toHaveCount(0);
  await toBrief.click();
  await page.waitForFunction(() => (window as unknown as { __deck?: { edition: string } }).__deck?.edition === "brief");
}

test("no short-version slide has a scroller or anything cut off, at three window sizes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "reduced-motion", "layout does not depend on motion or WebGL, so it is checked once");
  const problems: string[] = [];
  for (const [width, height] of [
    [1600, 900],
    [1366, 650],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    const deck = await openDeck(page, "/?solo=1&edition=brief");
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
    }
    await page.keyboard.press("o");
    await page.waitForTimeout(200);
    await check("all-slides page");
    await page.keyboard.press("Escape");
  }
  expect(problems).toEqual([]);
});
