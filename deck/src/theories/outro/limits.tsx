import type { ReactNode } from "react";
import { raw, type ResultFile } from "../../data";
import { inEdition, topicInEdition } from "../../deck/editions";
import { useEdition } from "../../deck/store";
import { H, List, Note, P } from "../../ui";

/**
 * One limitation, found by a phrase from the result file's own list. The text shown is the
 * file's sentence, or a shorter wording of it with the same meaning; a phrase that is no
 * longer in the file makes the slide fail to render, so a changed list is noticed.
 */
export function limitation(file: ResultFile, phrase: string, short?: string, slide?: string, alsoOn?: string): Limitation {
  const key = file === "dataset_card" ? "known_limitations" : "limitations";
  const list = raw<string[]>(file, key);
  const found = list.find((item) => item.includes(phrase));
  if (!found) throw new Error(`results/${file}.json ${key} has no item containing "${phrase}"`);
  return { file, text: short ?? found, slide, alsoOn };
}

/** A limitation, the file it comes from and, when it is about one slide's study only, that slide. */
export interface Limitation {
  file: ResultFile;
  text: string;
  slide?: string;
  /** A slide outside the file's topic that also shows the study, so the limit stays wherever that slide is. */
  alsoOn?: string;
}

/** The topic whose slides show each result file. */
export const FILE_TOPIC: Partial<Record<ResultFile, string>> = {
  privacy_utility: "dp",
  sensitivity: "dp",
  update_leakage: "leak",
  membership: "mia",
  poisoning: "poison",
  free_riding: "freeride",
  gossip: "gossip",
  participation: "part",
  ledger_audit: "ledger",
};

/** Participation scenarios whose epsilon note marks the epsilon as nominal, read from every privacy level of every cell. */
function nominalScenarios(): string[] {
  const cells = raw<Record<string, Record<string, { epsilon_note?: string }>>>("participation", "results/cells");
  return Object.entries(cells)
    .filter(([, levels]) => Object.values(levels).some((cell) => cell.epsilon_note?.includes("NOMINAL")))
    .map(([name]) => name.replace(/_/g, " "));
}

function listNames(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export interface LimitGroup {
  title: string;
  items: Limitation[];
}

export const GROUPS_A: LimitGroup[] = [
  {
    title: "Data and scale",
    items: [
      limitation("dataset_card", "k-core removes"),
      limitation("dataset_card", "Dataset vintage"),
      limitation(
        "sensitivity",
        "subsets (or supersets) of the same Philadelphia",
        "The sensitivity variants are cuts of the same Philadelphia sample: they test preprocessing, not another city or platform.",
      ),
      limitation(
        "privacy_utility",
        "Hyperparameters were tuned",
        "Hyperparameters were tuned on the validation split of the same users, and that tuning is not counted in epsilon.",
      ),
      limitation("poisoning", "Three seeds by default", "Poisoning uses three seeds by default: min and max over seeds are reported, not confidence intervals."),
    ],
  },
  {
    title: "Simulation, not deployment",
    items: [
      limitation("update_leakage", "simulation of the arithmetic"),
      limitation("poisoning", "Committees are simulated", "Committees are simulated: their sums are computed in the clear and no secure-aggregation protocol runs."),
      limitation("gossip", "Rounds are synchronous", "Gossip rounds are synchronous: every node updates and mixes at once, with no stragglers."),
      limitation(
        "participation",
        "synthetic (rank-based",
        "Availability in four participation scenarios is synthetic, not measured from device traces.",
      ),
      limitation("ledger_audit", "does not prove the training ran", "The ledger shows what was recorded and that it was not altered, not that training ran as recorded."),
      limitation("ledger_audit", "One signing key on one machine", "One signing key on one machine: whoever holds it could write a different log from scratch."),
    ],
  },
];

export const GROUPS_B: LimitGroup[] = [
  {
    title: "What the privacy numbers do not say",
    items: [
      limitation("privacy_utility", "clip-only level is a diagnostic"),
      limitation("privacy_utility", "What-if levels", "The what-if levels simulate a larger population by dividing the noise; they claim no epsilon.", "dp/6"),
      limitation(
        "participation",
        "is NOMINAL",
        `Where availability depends on user data (the ${listNames(nominalScenarios())} scenarios), the epsilon shown is nominal: the analysis does not hold.`,
        undefined,
        "intro/7",
      ),
      limitation("gossip", "no amplification by sampling", "Gossip's local epsilon composes every round without amplification, per node and for that node's own data."),
      limitation("update_leakage", "local-noise epsilon is for one release", "The local-noise epsilon in the leakage study covers one release of one update, not a training run."),
      limitation("poisoning", "robust modes run without DP noise"),
    ],
  },
  {
    title: "Which attacks were tried",
    items: [
      limitation("poisoning", "One attack strategy"),
      limitation("poisoning", "Attackers do not adapt"),
      limitation("free_riding", "Free-riders do not adapt", "Free-riders do not adapt to detection; an adaptive one could imitate honest updates."),
      limitation(
        "membership",
        "loss-threshold test",
        "Membership inference is a loss-threshold test with reference models: a negative result bounds this attack only.",
      ),
      limitation("update_leakage", "honest-but-curious"),
    ],
  },
];

export function Group({ group }: { group: LimitGroup }) {
  // An edition lists the limits of what it shows: an item about a topic or a study it leaves out is left out too.
  const edition = useEdition();
  const items = group.items.filter((item) => {
    const topic = FILE_TOPIC[item.file];
    const shown = topic === undefined || topicInEdition(edition, topic) || (item.alsoOn !== undefined && inEdition(edition, item.alsoOn));
    return shown && (item.slide === undefined || inEdition(edition, item.slide));
  });
  return (
    <section style={{ marginBottom: "1.1em" }}>
      <h2>{group.title}</h2>
      <List
        items={items.map((item, i): ReactNode => (
          <span key={i}>
            {item.text} <span className="caption" style={{ display: "inline" }}>({item.file})</span>
          </span>
        ))}
      />
    </section>
  );
}

function Columns({ groups }: { groups: LimitGroup[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(19em, 1fr))", gap: "0 2.2em" }}>
      {groups.map((g) => (
        <Group key={g.title} group={g} />
      ))}
    </div>
  );
}

export function LimitsAPanel() {
  return (
    <>
      <H>What the results do not show: one city, one machine, no real devices.</H>
      <P>
        Every result file carries its own list of limitations. These two slides gather the ones that change how a
        number should be read, shortened where the file's sentence is long. The file each comes from is named after
        it.
      </P>
      <P>
        The data is one city's reviews in one release, filtered to a dense core. The federation, the secure sum, the
        committees and the ledger all run as a simulation in one process: nothing here has met a network, a dropped
        device or a second operator.
      </P>
    </>
  );
}

export function LimitsAStage() {
  return <Columns groups={GROUPS_A} />;
}

export function LimitsBPanel() {
  return (
    <>
      <H>What is not claimed: each epsilon covers one stated mechanism, each attack is one attack.</H>
      <P>
        An epsilon here is a statement about a simulated Gaussian mechanism with ideal Poisson sampling, for one user
        added or removed. Wherever a setting breaks those assumptions, the file says so, and the deck repeats it.
      </P>
      <P>
        A defence that held, held against the attack that was run. None of the attackers adapts to the defence, so a
        good result is an upper bound on what the defence achieves, not a guarantee.
      </P>
      <Note tone="warn">
        Still open: the dataset provider's pre-publication review has not been done. The deck and the repository were
        put online to share them with the guide, before that review.
      </Note>
    </>
  );
}

export function LimitsBStage() {
  return <Columns groups={GROUPS_B} />;
}
