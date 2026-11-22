import { fmt, m, raw } from "../../data";
import { BarChart, Caption, Choice, CodeView, Controls, H, Note, P, Tex, Without } from "../../ui";
import type { Role } from "../../ui";
import { type Metric, useModel } from "./store";

/* ---------------------------------------------------------------- numbers */

const BASELINES = [
  { key: "most_popular", label: "MostPopular", note: "the same popular list for everyone" },
  { key: "friends", label: "Friends", note: "places the user's friends visited" },
  { key: "item_knn", label: "ItemKNN", note: "places that co-occur with the history" },
  { key: "item_ridge", label: "Item ridge", note: "linear item-to-item model, closed form" },
] as const;

export interface Bar {
  label: string;
  value: number;
  lo?: number;
  hi?: number;
  role: Role;
  note: string;
}

/** The six methods for one metric. Only NDCG@10 comes with an interval for every bar. */
export function bars(metric: Metric): Bar[] {
  const out: Bar[] = BASELINES.map((b) => {
    if (metric === "ndcg@10") {
      const [lo, hi] = raw<[number, number]>("privacy_utility", `baselines/${b.key}/ndcg_ci95`);
      return { label: b.label, value: m("privacy_utility", `baselines/${b.key}/ndcg@10`), lo, hi, role: "muted" as Role, note: b.note };
    }
    return { label: b.label, value: m("privacy_utility", `baselines/${b.key}/hr@10`), role: "muted" as Role, note: b.note };
  });
  for (const regime of ["large", "small"] as const) {
    const base = `summary/${regime}/levels/nondp`;
    if (metric === "ndcg@10") {
      const [lo, hi] = raw<[number, number]>("privacy_utility", `${base}/ndcg@10_ci95`);
      out.push({ label: `Fed. ${regime}`, value: m("privacy_utility", `${base}/ndcg@10_mean`), lo, hi, role: "model", note: "hybrid model, no privacy noise" });
    } else {
      out.push({ label: `Fed. ${regime}`, value: m("privacy_utility", `${base}/hr@10_mean`), role: "model", note: "hybrid model, no privacy noise" });
    }
  }
  return out;
}

const METRIC_LABEL: Record<Metric, string> = { "ndcg@10": "NDCG@10", "hr@10": "HR@10" };

/* ---------------------------------------------------------------- 1.4 impact */

export function ImpactPanel() {
  const metric = useModel((s) => s.metric);
  const setMetric = useModel((s) => s.setMetric);
  const users = m("privacy_utility", "baselines/most_popular/users_evaluated");
  const seeds = m("privacy_utility", "summary/large/levels/nondp/seeds");
  return (
    <>
      <H>With no privacy noise the model beats popularity and friends, and trails the item-based methods.</H>
      <P>
        Each user's later visits (the test split) are hidden, the whole catalogue is ranked from their earlier history,
        and NDCG@10 rewards putting a hidden visit near the top of ten. HR@10 is the share of users with at least one
        hit in their ten. The settings were frozen on the validation split before any test run.
      </P>
      <P>
        The federated bars use no clipping and no noise: the ceiling for the private versions that follow. ItemKNN and
        item ridge read everyone's history in one place, and are still higher.
      </P>
      <Note tone="warn">
        Intervals differ in kind: baselines bootstrap over {fmt.int(users)} users, federated bars over {seeds} training
        seeds. The catalogue is filtered to places with enough reviews, so absolute scores are higher than on the raw one.
      </Note>
      <Controls>
        <Choice<Metric>
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={(Object.keys(METRIC_LABEL) as Metric[]).map((value) => ({ value, label: METRIC_LABEL[value] }))}
        />
      </Controls>
    </>
  );
}

export function ImpactStage() {
  const metric = useModel((s) => s.metric);
  const data = bars(metric);
  const label = METRIC_LABEL[metric];
  const show = (v: number) => (metric === "ndcg@10" ? fmt.ndcg(v) : fmt.n(v, 3));
  return (
    <>
      <Without slide="model/1">
        <Caption>
          The model: every place is a direction built from its description plus a learned part, a user is the average
          of the places in their history, and a place scores by how closely the two directions agree. Fed. large and
          Fed. small are that model trained with large or small groups of users per round.
        </Caption>
      </Without>
      <BarChart
        yLabel=""
        format={show}
        data={data}
        summary={`${label} on the test split: ${data.map((d) => `${d.label} ${show(d.value)}`).join(", ")}.`}
      />
      <Caption>
        {metric === "ndcg@10"
          ? "Test split, NDCG@10. Fed. is the federated hybrid model. Whiskers are 95% intervals. NDCG@20 and HR@20 exist for the baselines but were not recorded for the federated runs, so they are not offered."
          : "Test split, HR@10. Fed. is the federated hybrid model. HR@10 has no interval in the result files."}
      </Caption>
    </>
  );
}

/* ---------------------------------------------------------------- 1.5 code */

/** Sizes of the three blocks of the flat parameter vector, from the data card and the frozen model. */
export function blockSizes() {
  const n = m("dataset_card", "items");
  const d = m("privacy_utility", "frozen/model/dim");
  const emb = n * d;
  const umap = d * d;
  const bias = n;
  return { n, d, emb, umap, bias, total: emb + umap + bias };
}

export function CodePanel() {
  const s = blockSizes();
  return (
    <>
      <H>The recommender is one flat vector of {fmt.int(s.total)} numbers, in three named blocks.</H>
      <P>
        <code>Layout</code> names the blocks and their shapes: <code>emb</code> (the ID part of every item),{" "}
        <code>umap</code> (a matrix applied to the user) and <code>bias</code>. Attack and secure-sum code reach a block
        through its slice in the layout, never through a hand-counted offset.
      </P>
      <P>
        <code>item_vectors</code> adds the fixed content base to <code>emb</code>. <code>user_loss</code> takes the
        visible and target vectors, pools, normalises, masks the visible items and returns the softmax loss.{" "}
        <code>score_matrix</code> scores every item for a batch of histories.
      </P>
      <Note>
        PyTorch and NumPy. The content base is a fixed projection of public text embeddings, computed from item data
        alone, so it costs no privacy budget.
      </Note>
    </>
  );
}

const WIDTH = 780;
const MIN_BLOCK = 12;

/** The parameter vector drawn to scale; the small matrix is given a minimum width so it can be seen. */
function ParameterBar() {
  const s = blockSizes();
  const sizesRaw = [s.emb, s.umap, s.bias];
  const free = WIDTH - 2 * 6;
  const widths = sizesRaw.map((v) => Math.max(MIN_BLOCK, (v / s.total) * free));
  const scaleBack = free / widths.reduce((a, b) => a + b, 0);
  const w = widths.map((x) => x * scaleBack);
  const xs = [0, w[0] + 6, w[0] + w[1] + 12];
  const fills = ["var(--model)", "var(--honest)", "var(--noise)"];
  const names = ["emb", "umap", "bias"];
  const shapes = [`${fmt.int(s.n)} × ${s.d}`, `${s.d} × ${s.d}`, `${fmt.int(s.n)}`];
  const sizes = sizesRaw.map(fmt.int);
  return (
    <svg className="paramBar" viewBox={`0 0 ${WIDTH + 20} 124`} role="img" aria-label={`Parameter vector: emb ${sizes[0]}, umap ${sizes[1]}, bias ${sizes[2]}`}>
      <g transform="translate(10 6)">
        <text x={0} y={12} fontSize={13} fill="var(--ink-soft)">
          one flat float32 vector, {fmt.int(s.total)} numbers in storage order
        </text>
        {w.map((width, i) => (
          <rect key={names[i]} x={xs[i]} y={20} width={width} height={34} rx={3} fill={fills[i]} />
        ))}
        <text x={xs[0] + w[0] / 2} y={42} textAnchor="middle" fontSize={16} fontWeight={600} fill="var(--dusk)">
          {names[0]}, {shapes[0]} = {sizes[0]}
        </text>
        {[1, 2].map((i) => (
          <g key={names[i]}>
            <line x1={xs[i] + w[i] / 2} x2={xs[i] + w[i] / 2} y1={56} y2={i === 1 ? 70 : 92} stroke={fills[i]} strokeWidth={1.5} />
            <text x={xs[i] + w[i] / 2} y={i === 1 ? 86 : 110} textAnchor="end" fontSize={15} fontWeight={600} fill={fills[i]}>
              {names[i]}, {shapes[i]} = {sizes[i]}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export function CodeStage() {
  return (
    <>
      <ParameterBar />
      <Tex>{String.raw`\text{parameters} = n \cdot d + d^2 + n`}</Tex>
      <CodeView
        refs={["models/hybrid.py::Layout", "models/hybrid.py::item_vectors", "models/hybrid.py::user_loss", "models/hybrid.py::score_matrix"]}
      />
    </>
  );
}
