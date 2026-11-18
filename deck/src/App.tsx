import { useEffect, useState } from "react";
import { fromHash, toHash } from "./deck/hash";
import { describeTarget, keyAction } from "./deck/keys";
import { loadRegistry, type Registry } from "./deck/registry";
import { useDeck } from "./deck/store";
import { applyTheme } from "./styles/roles";
import { Frame } from "./ui/Frame";

declare global {
  interface Window {
    __deck?: { slides: { id: string; title: string; kind: string }[]; failed: string[] };
  }
}

function hasWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function App() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const index = useDeck((s) => s.index);
  const theme = useDeck((s) => s.theme);

  // Load every theory folder once, then open the slide named in the address bar.
  useEffect(() => {
    let cancelled = false;
    void loadRegistry().then((loaded) => {
      if (cancelled) return;
      const deck = useDeck.getState();
      deck.setWebgl(hasWebgl() && !window.location.href.includes("nowebgl=1"));
      deck.setCount(loaded.slides.length);
      deck.go(fromHash(window.location.hash, loaded.ids));
      window.__deck = {
        slides: loaded.slides.map(({ slide }) => ({ id: slide.id, title: slide.title, kind: slide.kind })),
        failed: loaded.failed,
      };
      setRegistry(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => useDeck.getState().setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // Keep the address bar and the slide in step, both ways.
  useEffect(() => {
    if (!registry) return;
    const id = registry.ids[index];
    if (id && window.location.hash.split("?")[0] !== toHash(id)) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${toHash(id)}`);
    }
    document.title = id ? `${registry.slides[index].slide.title} | PRISM-Rec Explained` : "PRISM-Rec Explained";
  }, [registry, index]);

  useEffect(() => {
    if (!registry) return;
    const onHash = () => useDeck.getState().go(fromHash(window.location.hash, registry.ids));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [registry]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = keyAction(
        event.key,
        describeTarget(document.activeElement),
        event.ctrlKey || event.metaKey || event.altKey,
      );
      if (!action) return;
      const deck = useDeck.getState();
      event.preventDefault();
      switch (action) {
        case "next":
          return deck.next();
        case "prev":
          return deck.prev();
        case "first":
          return deck.first();
        case "last":
          return deck.last();
        case "overview":
          return deck.toggleOverview();
        case "theme":
          return deck.toggleTheme();
        case "reset":
          return deck.reset();
        case "close":
          if (deck.overview) deck.toggleOverview();
          return;
        case "fullscreen":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.();
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!registry) {
    return (
      <div className="loading" role="status" aria-live="polite">
        Loading the deck
      </div>
    );
  }
  if (registry.slides.length === 0) {
    return (
      <div className="loading" role="alert">
        No slides could be loaded. Check the browser console for the folder that failed.
      </div>
    );
  }
  return <Frame registry={registry} />;
}
