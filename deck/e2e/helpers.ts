/** Shared by the end-to-end specs: opening the deck, watching for errors, finding anything that overflows. */
import type { Page } from "@playwright/test";

export interface DeckInfo {
  edition: string;
  slides: { id: string; title: string; kind: string }[];
  failed: string[];
}

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

export async function openDeck(page: Page, path = "/"): Promise<DeckInfo> {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __deck?: unknown }).__deck !== undefined);
  return page.evaluate(() => (window as unknown as { __deck: DeckInfo }).__deck);
}

export const shownSlide = (page: Page) => page.locator(".deck").getAttribute("data-slide");

/** Everything on the page that can scroll, and every box that holds more than it shows. */
export function findOverflow(): string[] {
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
