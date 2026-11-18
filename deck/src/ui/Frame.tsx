import { motion } from "motion/react";
import { lazy, Suspense } from "react";
import type { Registry } from "../deck/registry";
import { useDeck } from "../deck/store";
import type { Badge, FlatSlide, SlideKind } from "../deck/types";
import { Fit } from "./Fit";
import { Overview } from "./Overview";
import { Rail } from "./Rail";

// The canvas is loaded on its own so the text, charts and code never wait for three.js.
const World = lazy(() => import("../world/World").then((module) => ({ default: module.World })));

const KIND_NAME: Record<SlideKind, string> = { theory: "Theory", impact: "Impact", code: "Code", extra: "" };
const BADGE_NAME: Record<Badge, string> = { measured: "Measured", computed: "Computed", illustration: "Illustration", source: "Project source" };
const BADGE_HELP: Record<Badge, string> = {
  measured: "A number from the project's experiments",
  computed: "Produced by the project's own code when the deck was built",
  illustration: "A small model running in this browser, not a result",
  source: "Code copied from src/prism when the deck was built, with its real line numbers",
};

/** "Theory 2 of 3", "Impact", or nothing for the opening and closing slides. */
export function whereInTheory(flat: FlatSlide): string {
  const { slide, theory } = flat;
  if (slide.kind === "extra") return "";
  const same = theory.slides.filter((s) => s.kind === slide.kind);
  const name = KIND_NAME[slide.kind];
  return same.length > 1 ? `${name} ${same.indexOf(slide) + 1} of ${same.length}` : name;
}

function BadgeTag({ flat }: { flat: FlatSlide }) {
  const { badge, sources } = flat.slide;
  const files = (sources ?? []).map((s) => `results/${s}.json`);
  const shown = files.slice(0, 2).join(", ");
  const rest = files.length - 2;
  const help = files.length > 0 ? `${BADGE_HELP[badge]}. Sources: ${files.join(", ")}` : BADGE_HELP[badge];
  return (
    <span className="badge" data-badge={badge} title={help}>
      <span className="badge__dot" aria-hidden="true" />
      {BADGE_NAME[badge]}
      {files.length > 0 ? (
        <span className="badge__src">
          {shown}
          {rest > 0 ? ` and ${rest} more` : ""}
        </span>
      ) : null}
    </span>
  );
}

function Head({ flat }: { flat: FlatSlide }) {
  const { theory } = flat;
  const numbered = theory.number >= 1 && theory.number <= 13;
  return (
    <header className="head">
      {numbered ? <span className="head__num">{theory.number}</span> : null}
      <span className="head__theory">{theory.number === 0 ? "PRISM-Rec explained" : theory.title}</span>
      <span className="head__where">{whereInTheory(flat)}</span>
      <BadgeTag flat={flat} />
    </header>
  );
}

export function Frame({ registry }: { registry: Registry }) {
  const index = useDeck((s) => s.index);
  const webgl = useDeck((s) => s.webgl);
  const overview = useDeck((s) => s.overview);
  const reduced = useDeck((s) => s.reducedMotion);
  const flat = registry.slides[Math.min(index, registry.slides.length - 1)];
  const { slide, theory } = flat;
  const stage = slide.layout === "stage" && slide.Stage !== undefined;
  const Panel = slide.Panel;
  const Stage = slide.Stage;
  const Fallback = theory.Fallback;
  const enter = reduced ? false : { opacity: 0, x: -12 };

  return (
    <div className="deck" data-kind={slide.kind} data-slide={slide.id}>
      <div className="deck__world" data-dim={stage}>
        {webgl ? (
          <Suspense fallback={null}>
            <World registry={registry} />
          </Suspense>
        ) : (
          <div className="deck__fallback" aria-hidden={stage}>
            <Fallback />
            <span className="deck__fallback-note">3D is not available in this browser, so this is a still diagram.</span>
          </div>
        )}
      </div>

      <Head flat={flat} />

      <motion.main
        key={slide.id}
        className="panel"
        initial={enter}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="panel__inner">
          <Fit box=".panel">
            <Panel />
          </Fit>
        </div>
      </motion.main>

      {stage && Stage ? (
        <motion.section
          key={`${slide.id}-stage`}
          className="stage"
          aria-label={`${slide.title}: figures`}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: reduced ? 0 : 0.12, ease: [0.4, 0, 0.2, 1] }}
        >
          <Fit box=".stage">
            <Stage />
          </Fit>
        </motion.section>
      ) : null}

      <Rail registry={registry} />
      {overview ? <Overview registry={registry} /> : null}
    </div>
  );
}
