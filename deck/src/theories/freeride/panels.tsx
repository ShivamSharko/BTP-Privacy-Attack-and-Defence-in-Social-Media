import { fmt, raw } from "../../data";
import {
    BarChart,
    Caption,
    Choice,
    CodeView,
    Controls,
    GroupedBars,
    H,
    Note,
    P,
    Readout,
    Readouts,
    Slider,
    StatRow,
} from "../../ui";
import {
    auc,
    clean,
    drop,
    FRACTIONS,
    gainIntervalsAtZero,
    KINDS,
    limitation,
    meanGain,
    ndcg,
    range,
    readout,
    settings,
    type Fraction,
    type Kind,
} from "./figures";
import {
    aggregateAlignment,
    detectorAucs,
    flaggedByCosine,
    flaggedByNorm,
    freeRiderCount,
    N_DEVICES,
    simulateRound,
    type Behaviour,
} from "./sim";
import { useFreeRide } from "./store";

const SEED = 5;
const yesNo = (v: boolean) => (v ? "yes" : "no");

function useToy() {
    const share = useFreeRide((s) => s.share);
    const behaviour = useFreeRide((s) => s.behaviour);
    const round = simulateRound(share, behaviour, SEED);
    return {
        share,
        behaviour,
        round,
        align: aggregateAlignment(round),
        aucs: detectorAucs(round),
    };
}

const behaviourOptions: { value: Behaviour; label: string }[] = [
    { value: "zero", label: "sends zeros" },
    { value: "noise", label: "sends noise" },
];

/* ---------------------------------------------------------------- 9.1 */

export function WhatPanel() {
    const { share, behaviour, align } = useToy();
    const setShare = useFreeRide((s) => s.setShare);
    const setBehaviour = useFreeRide((s) => s.setBehaviour);
    return (
        <>
            <H>
                A free-rider takes the shared model and sends back nothing
                useful.
            </H>
            <P>
                Each light is a device. An honest device works out an update
                from its own history and sends it as a solid packet. A
                free-rider still joins every round and still receives the model,
                but skips the work. It sends either all zeros, or random noise
                rescaled to the size (the norm) of a typical honest update, so
                that it looks the right size. Its packets are hollow.
            </P>
            <P>
                The server adds up the packets and divides by the expected
                number of devices. Each hollow packet replaces a useful one, so
                the step along the honest direction shrinks. Noise also pushes
                the step off course.
            </P>
            <Note>
                A toy: {N_DEVICES} devices, updates of 32 numbers. Click a
                device to read its numbers.
            </Note>
            <Controls>
                <Choice<Behaviour>
                    label="A free-rider"
                    value={behaviour}
                    options={behaviourOptions}
                    onChange={setBehaviour}
                />
                <Slider
                    label="Share of free-riders"
                    value={share}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={setShare}
                    format={(v) => fmt.pct(v, 0)}
                />
                <Readouts>
                    <Readout
                        label="free-riders"
                        value={`${freeRiderCount(share)} of ${N_DEVICES}`}
                        role="noise"
                    />
                    <Readout
                        label="useful step, 100% means no loss"
                        value={fmt.pct(align.useful, 0)}
                        role="honest"
                    />
                    <Readout
                        label="off course"
                        value={fmt.pct(align.offTarget, 0)}
                        role="noise"
                    />
                </Readouts>
            </Controls>
        </>
    );
}

/* ---------------------------------------------------------------- 9.2 */

export function DetectPanel() {
    const { share, behaviour, round, aucs } = useToy();
    const secure = useFreeRide((s) => s.secure);
    const setShare = useFreeRide((s) => s.setShare);
    const setBehaviour = useFreeRide((s) => s.setBehaviour);
    const setSecure = useFreeRide((s) => s.setSecure);
    const byNorm = flaggedByNorm(round.norms);
    const byCos = flaggedByCosine(round.cosines);
    const caught = (flags: boolean[]) =>
        flags.filter((f, i) => f && round.isRider[i]).length;
    const wrong = (flags: boolean[]) =>
        flags.filter((f, i) => f && !round.isRider[i]).length;
    const riders = round.isRider.filter(Boolean).length;
    return (
        <>
            <H>
                A server that sees every update has two detectors, and noise is
                harder to catch by size.
            </H>
            <P>
                The norm detector flags an update much shorter than the median.
                Zeros have norm 0, so they fail it. The cosine detector flags an
                update that points a different way from the average of the
                others. Cosine similarity is 1 for the same direction and 0 for
                unrelated ones, and random noise points nowhere in particular.
            </P>
            <P>
                Noise scaled to the honest norm passes the first detector, so in
                the toy it is the harder case, and the second catches it. Left
                bar over a device: its norm. Right bar: its cosine. A red marker
                is a flag.
            </P>
            <Note tone="warn">
                Under a secure sum the server receives only the total, so
                neither detector can run. The toy's honest updates share one
                direction, which flatters the cosine detector; the measured
                runs, two slides on, differ.
            </Note>
            <Controls>
                <Choice<Behaviour>
                    label="A free-rider"
                    value={behaviour}
                    options={behaviourOptions}
                    onChange={setBehaviour}
                />
                <Choice<"plain" | "secure">
                    label="What the server sees"
                    value={secure ? "secure" : "plain"}
                    options={[
                        { value: "plain", label: "each update" },
                        { value: "secure", label: "only the sum" },
                    ]}
                    onChange={(v) => setSecure(v === "secure")}
                />
                <Slider
                    label="Share of free-riders"
                    value={share}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={setShare}
                    format={(v) => fmt.pct(v, 0)}
                />
                <Readouts>
                    <Readout
                        label="norm detector, AUC"
                        value={secure ? "cannot run" : fmt.n(aucs.norm, 2)}
                        role="model"
                    />
                    <Readout
                        label="cosine detector, AUC"
                        value={secure ? "cannot run" : fmt.n(aucs.cosine, 2)}
                        role="protected"
                    />
                    <Readout
                        label="free-riders flagged by norm / cosine"
                        value={
                            secure
                                ? "none"
                                : `${caught(byNorm)} / ${caught(byCos)} of ${riders}`
                        }
                        role="attacker"
                    />
                    <Readout
                        label="honest devices flagged"
                        value={
                            secure
                                ? "none"
                                : `${wrong(byNorm)} / ${wrong(byCos)}`
                        }
                    />
                </Readouts>
            </Controls>
        </>
    );
}

/* ---------------------------------------------------------------- 9.3 */

/** The smallest and largest non-zero free-rider shares in results/free_riding.json, as result-file keys. */
const SHARES = raw<number[]>("free_riding", "settings/fractions").filter((f) => f > 0);
const LOW = String(Math.min(...SHARES)) as Fraction;
const HIGH = String(Math.max(...SHARES)) as Fraction;

export function CostPanel() {
    const worst = Math.max(...KINDS.map((k) => drop(k, HIGH)));
    const best = Math.min(...KINDS.map((k) => drop(k, HIGH)));
    const gain = gainIntervalsAtZero();
    return (
        <>
            <H>
                Free-riders cost everyone else little:{" "}
                {fmt.pct(Number(HIGH), 0)} of them cost{" "}
                {fmt.pct(best)} to {fmt.pct(worst)} of NDCG@10.
            </H>
            <P>
                With {fmt.pct(Number(LOW), 0)} free-riders NDCG@10 is{" "}
                {fmt.ndcg(ndcg("zero", LOW).mean)} for zeros and{" "}
                {fmt.ndcg(ndcg("noise", LOW).mean)} for noise, against{" "}
                {fmt.ndcg(clean.mean())} with none. The two behaviours cost
                about the same.
            </P>
            <P>
                The free-riders gained nothing. Their own NDCG@10 was on average{" "}
                {fmt.ndcg(Math.abs(meanGain()))} below the contributors', and{" "}
                {gain.atZero} of {gain.total} per-seed intervals include zero.
            </P>
            <Note tone="warn">
                {limitation("Clip-only")} {limitation("Run records")}
            </Note>
        </>
    );
}

export function CostStage() {
    const label = (k: Kind, f: Fraction) =>
        `${k === "zero" ? "zeros" : "noise"}, ${fmt.pct(Number(f), 0)}`;
    const items = FRACTIONS.flatMap((f) => KINDS.map((k) => ({ k, f })));
    return (
        <>
            <StatRow
                items={items.map(({ k, f }) => ({
                    label: `lost, ${label(k, f)}`,
                    value: fmt.pct(drop(k, f)),
                    note: `NDCG@10 ${fmt.ndcg(ndcg(k, f).mean)}`,
                }))}
            />
            <BarChart
                yLabel="NDCG@10"
                format={(v) => v.toFixed(4)}
                data={[
                    {
                        label: "none",
                        value: clean.mean(),
                        lo: clean.min(),
                        hi: clean.max(),
                        role: "honest",
                        note: "no free-riders",
                    },
                    ...items.map(({ k, f }) => {
                        const n = ndcg(k, f);
                        return {
                            label: label(k, f),
                            value: n.mean,
                            lo: n.min,
                            hi: n.max,
                            role:
                                k === "zero"
                                    ? ("muted" as const)
                                    : ("noise" as const),
                        };
                    }),
                ]}
                summary={`NDCG@10 is ${fmt.ndcg(clean.mean())} with no free-riders and between ${fmt.ndcg(Math.min(...items.map(({ k, f }) => ndcg(k, f).mean)))} and ${fmt.ndcg(Math.max(...items.map(({ k, f }) => ndcg(k, f).mean)))} with ${fmt.pct(Number(LOW), 0)} or ${fmt.pct(Number(HIGH), 0)} free-riders, a small fall.`}
            />
            <Caption>
                Small-cohort regime, sample rate {settings.sampleRate()},{" "}
                {settings.rounds()} rounds, updates clipped to norm{" "}
                {settings.clipNorm()} and summed, {settings.seeds()} seeds.
                Whiskers span the lowest and highest seed. {settings.skipped()}{" "}
                of {settings.runs()} runs were reused from earlier records.
            </Caption>
        </>
    );
}

/* ---------------------------------------------------------------- 9.4 */

export function DetectionPanel() {
    const normNoise = range(FRACTIONS.map((f) => auc("noise", f, "norm").mean));
    const cosNoise = range(
        FRACTIONS.map((f) => auc("noise", f, "cosine").mean),
    );
    return (
        <>
            <H>
                Measured, the norm score caught both behaviours and the cosine
                score caught neither.
            </H>
            <P>
                AUC is the chance that a random free-rider looks more suspicious
                than a random contributor: 1 is perfect and 0.5 is a coin flip.
                Scores come from the last {settings.detectionRounds()} rounds of
                clipped updates.
            </P>
            <P>
                The experiment's own readout asked two things. Does noise with
                the honest norm evade the norm score?{" "}
                <strong>{yesNo(readout.evadesNorm())}</strong>: the norm AUC is{" "}
                {fmt.n(normNoise[0])} to {fmt.n(normNoise[1])}, and evading
                means within {readout.band()} of 0.5. Is it caught by the cosine
                score? <strong>{yesNo(readout.caughtByCosine())}</strong>: the
                cosine AUC is {fmt.n(cosNoise[0])} to {fmt.n(cosNoise[1])}, and
                caught means at least {fmt.n(readout.caughtAuc(), 2)}.
            </P>
            <Note tone="warn">{limitation("Free-riders do not adapt")}</Note>
        </>
    );
}

export function DetectionStage() {
    const control = settings.zeroControlMeasured();
    const zeroNorm = range(FRACTIONS.map((f) => auc("zero", f, "norm").min));
    const cosAll = range(
        KINDS.flatMap((k) => FRACTIONS.map((f) => auc(k, f, "cosine").mean)),
    );
    const groups = KINDS.flatMap((k) =>
        FRACTIONS.map((f) => ({
            label: `${k === "zero" ? "zeros" : "noise"}, ${fmt.pct(Number(f), 0)}`,
            bars: (["norm", "cosine"] as const).map((score) => {
                const a = auc(k, f, score);
                return {
                    name: `${score} score`,
                    value: a.mean,
                    lo: a.min,
                    hi: a.max,
                    role:
                        score === "norm"
                            ? ("model" as const)
                            : ("protected" as const),
                };
            }),
        })),
    );
    return (
        <>
            <StatRow
                items={[
                    {
                        label: "norm AUC, zeros, lowest seed",
                        value: fmt.n(zeroNorm[0]),
                        role: "model",
                        note: control
                            ? `control: at least ${control.threshold}, ${control.passed ? "passed" : "failed"}`
                            : undefined,
                    },
                    {
                        label: "norm AUC, noise",
                        value: `${fmt.n(Math.min(...FRACTIONS.map((f) => auc("noise", f, "norm").mean)))} to ${fmt.n(Math.max(...FRACTIONS.map((f) => auc("noise", f, "norm").mean)))}`,
                        role: "model",
                    },
                    {
                        label: "cosine AUC, any cell",
                        value: `${fmt.n(cosAll[0])} to ${fmt.n(cosAll[1])}`,
                        role: "protected",
                        note: "about a coin flip",
                    },
                ]}
            />
            <GroupedBars
                yLabel="AUC"
                format={(v) => v.toFixed(3)}
                groups={groups}
                threshold={{ value: 0.5, label: "" }}
                summary={`The norm score separates free-riders almost perfectly in all four cases, from ${fmt.n(Math.min(...KINDS.flatMap((k) => FRACTIONS.map((f) => auc(k, f, "norm").mean))))} up to 1. The cosine score stays near 0.5.`}
            />
            <Caption>
                A zero update has cosine exactly 0, so a cosine AUC near 0.5
                means contributors' cosines are positive in about half the
                cases: real users' updates barely point the same way. The files
                record the outcome, not the reason. The dashed line is a coin
                flip, 0.5. Bars are means over {settings.seeds()} seeds;
                whiskers span the lowest and highest seed.
            </Caption>
        </>
    );
}

/* ---------------------------------------------------------------- 9.5 */

export function CodePanel() {
    return (
        <>
            <H>The hook sits between computing an update and clipping it.</H>
            <P>
                <code>make_free_rider_hook</code> returns a function that{" "}
                <code>train</code> calls as{" "}
                <code>client_hook(users, deltas, flat, round_index)</code> for
                each chunk of sampled users, after their updates are computed
                and before <code>clip_rows</code>. It overwrites the
                free-riders' rows: zeros, or Gaussian noise rescaled to the mean
                norm of the honest rows in that chunk, seeded by round and
                chunk.
            </P>
            <P>
                <code>detection_scores</code> clips as a client would, then
                takes each row's norm and its cosine to the mean of the other
                rows. <code>detection_aucs</code> turns the collected scores
                into two AUCs, or None when a group is empty.
            </P>
            <Note>
                Passing a hook switches off the closed-form fast path (
                <code>client_hook is None</code> is part of its test near the
                top of <code>train</code>), so these runs build every update.
                PyTorch and NumPy; <code>auc_score</code> comes from{" "}
                <code>attacks/membership.py</code>.
            </Note>
        </>
    );
}

export function CodeStage() {
    return (
        <div>
            <CodeView
                refs={[
                    "attacks/free_riding.py::make_free_rider_hook",
                    "attacks/free_riding.py::detection_scores",
                    "attacks/free_riding.py::detection_aucs",
                    "fl/server.py::train",
                ]}
                highlight={{
                    "attacks/free_riding.py::make_free_rider_hook": [
                        [152, 162],
                    ],
                    "attacks/free_riding.py::detection_scores": [
                        [49, 52],
                        [57, 63],
                    ],
                    "attacks/free_riding.py::detection_aucs": [[119, 120]],
                    "fl/server.py::train": [[166, 167]],
                }}
            />
        </div>
    );
}
