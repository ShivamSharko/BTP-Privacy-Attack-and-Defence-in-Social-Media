import { bytesToHex } from "@noble/hashes/utils.js";
import { useMemo } from "react";
import { fmt, m } from "../../data";
import { Button, Buttons, Controls, H, Note, P, Readout, Readouts, Slider, Tex } from "../../ui";
import { buildTree, decode, EMPTY_ROOT_HEX, inclusionProof, leafHash, MAX_LEAVES, merkleRoot, receiptBytes, short, tamper, verifyInclusion } from "./sim";
import { demo, MAX_ASKED, runFor, useLedger } from "./store";

const costs = (key: string) => m("ledger_audit", `results/costs/${key}`);

function useLeaves(): Uint8Array[] {
  const size = useLedger((s) => s.size);
  return useMemo(() => Array.from({ length: size }, (_, i) => receiptBytes(i)), [size]);
}

/* ---------------------------------------------------------------- 12.1 the log */

export function GrowPanel() {
  const leaves = useLeaves();
  const append = useLedger((s) => s.append);
  const clear = useLedger((s) => s.clear);
  const tree = useMemo(() => buildTree(leaves), [leaves]);
  const height = tree.nodes.at(-1)?.level ?? 0;
  const full = leaves.length >= MAX_LEAVES;
  return (
    <>
      <H>Every round leaves a receipt, and one hash commits to all of them.</H>
      <P>
        After each training round the server appends a receipt, a small JSON record of what ran, to an append-only log
        built as a Merkle tree, the structure RFC 6962 specifies. A leaf is the SHA-256 hash of a receipt with a zero
        byte in front. An inner node hashes its two children with a one byte in front, so a leaf can never pass for a
        node.
      </P>
      <Tex block>{String.raw`\mathrm{MTH}(D_{0:n}) = H\big(\mathtt{01} \,\|\, \mathrm{MTH}(D_{0:k}) \,\|\, \mathrm{MTH}(D_{k:n})\big)`}</Tex>
      <P>
        D is the list of receipts, H is SHA-256 and k is the largest power of two below n. With five receipts the left
        subtree holds four and the fifth sits alone on the right: no padding, no copies. Change any receipt and the
        root changes.
      </P>
      <Note>The hashes are real SHA-256, computed in this browser.</Note>
      <Controls>
        <Buttons>
          <Button onClick={append}>{full ? `The scene holds ${MAX_LEAVES}` : "Append a receipt"}</Button>
          <Button kind="quiet" onClick={clear}>
            Start over
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="receipts" value={String(leaves.length)} />
          <Readout label={leaves.length === 0 ? "root of the empty log" : "root"} value={short(tree.rootHex)} role="ledger" />
          <Readout label="levels above the leaves" value={String(height)} />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 12.2 inclusion proofs */

export function ProofPanel() {
  const leaves = useLeaves();
  const selected = useLedger((s) => s.selected);
  const n = leaves.length;
  const result = useMemo(() => {
    if (selected < 0 || selected >= n) return null;
    const proof = inclusionProof(selected, leaves);
    return { hashes: proof.length, ok: verifyInclusion(selected, n, leafHash(leaves[selected]), proof, merkleRoot(leaves)) };
  }, [leaves, selected, n]);
  return (
    <>
      <H>A handful of hashes proves that a receipt is in the log.</H>
      <P>
        To check one receipt you do not need the whole log, only the hashes beside its path to the root: one per level,
        about log₂ n of them. Hash the receipt, combine it with each of those hashes in turn, and compare the result with
        the root. Click any receipt in the tree to see its path climb.
      </P>
      <P>
        A consistency proof does the same across time: a few hashes show that the log at an earlier size is an exact
        prefix of the log now, so nothing already written was changed or removed.
      </P>
      <Note>
        In the project&apos;s longest ledger, {fmt.int(costs("verified_size"))} receipts, a proof is{" "}
        {costs("inclusion_proof_hashes")} hashes, {costs("inclusion_proof_bytes")} bytes.
      </Note>
      <Controls>
        <Readouts>
          <Readout label={`receipt, of ${n}`} value={result ? String(selected + 1) : "none"} role="ledger" />
          <Readout label="hashes in the proof" value={result ? String(result.hashes) : "none"} role="ledger" />
          <Readout label="proof checks against the root" value={result ? (result.ok ? "yes" : "no") : "empty log"} role={result?.ok ? "ledger" : "attacker"} />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 12.3 canonical bytes, signatures, tampering */

export function TamperPanel() {
  const leaves = useLeaves();
  const selected = useLedger((s) => s.selected);
  const tampered = useLedger((s) => s.tampered);
  const setTampered = useLedger((s) => s.setTampered);
  const n = leaves.length;
  const view = useMemo(() => {
    if (selected < 0 || selected >= n) return null;
    const shown = tampered ? tamper(leaves, selected) : leaves;
    const signed = merkleRoot(leaves);
    const recomputed = buildTree(shown).rootHex;
    const ok = verifyInclusion(selected, n, leafHash(shown[selected]), inclusionProof(selected, leaves), signed);
    return { text: decode(shown[selected]), signed: bytesToHex(signed), recomputed, ok };
  }, [leaves, selected, tampered, n]);
  return (
    <>
      <H>Flip one byte and the recomputed root no longer matches the signed one.</H>
      <P>
        A receipt becomes bytes by canonical JSON (RFC 8785): keys sorted, no spaces, one spelling for every number. The
        same receipt therefore always gives the same bytes and the same hash.
      </P>
      <P>
        At each checkpoint the server signs a short note, the log&apos;s name, its size and its root, with an Ed25519
        key. Anyone holding the public key can check the signature, so the root cannot be swapped quietly.
      </P>
      <P>
        Flip one bit of the receipt below and its round number changes. Every hash on its path changes with it, the
        recomputed root differs from the signed root, and the proof fails.
      </P>
      <Controls>
        <pre className="ledger-receipt" style={{ color: tampered ? "var(--attacker)" : "var(--ledger)", margin: 0, whiteSpace: "pre-wrap" }}>
          {view ? view.text : "the log is empty"}
        </pre>
        <Buttons>
          <Button onClick={() => setTampered(!tampered)}>{tampered ? "Restore the byte" : "Flip one byte"}</Button>
        </Buttons>
        <Readouts>
          <Readout label="signed root" value={short(view?.signed ?? EMPTY_ROOT_HEX)} role="ledger" />
          <Readout label="recomputed root" value={short(view?.recomputed ?? EMPTY_ROOT_HEX)} role={view && !view.ok ? "attacker" : "ledger"} />
          <Readout label="verdict" value={view ? (view.ok ? "verifies" : "rejected") : "empty log"} role={view && !view.ok ? "attacker" : "ledger"} />
          <Readout label="signature, not computed here" value="Ed25519, 64 bytes" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 12.4 the release gate */

export function GatePanel() {
  const asked = useLedger((s) => s.asked);
  const progress = useLedger((s) => s.progress);
  const setAsked = useLedger((s) => s.setAsked);
  const play = useLedger((s) => s.play);
  const run = runFor(asked);
  return (
    <>
      <H>The gate stops a run at the first round that would pass its budget.</H>
      <P>
        Before training, the privacy accountant turns the budget ε into the number of rounds that fit. Before every
        round the release gate checks the ε the run would reach after it; if that passes the budget, it writes a refusal
        receipt and the run stops. A model is released only if receipts for every round from 1 to the last are in the
        log.
      </P>
      <P>
        In the project&apos;s demonstration a run asked for {demo.asked} rounds on a budget of ε {fmt.n(demo.budget, 1)}:{" "}
        {demo.allowed} fitted, round {demo.allowed + 1} was refused, and the model was released at ε{" "}
        {fmt.n(demo.released, 3)}.
      </P>
      <Note tone="warn">
        What a ledger cannot prove: that training really ran as recorded. It shows what was written and that nothing
        changed afterwards. It keeps nothing secret, and whoever holds the one signing key could write a new log from
        scratch.
      </Note>
      <Controls>
        <Slider label="Rounds asked" value={asked} min={1} max={MAX_ASKED} step={1} onChange={setAsked} />
        <Buttons>
          <Button onClick={play}>Run the gate</Button>
        </Buttons>
        <Readouts>
          <Readout label="rounds allowed" value={String(run.allowed)} role="protected" />
          <Readout label="rounds completed" value={String(run.receipts.slice(0, progress).filter((r) => r.kind === "round").length)} role="ledger" />
          <Readout label="receipts written" value={`${progress} of ${run.receipts.length}`} role="ledger" />
        </Readouts>
      </Controls>
    </>
  );
}
