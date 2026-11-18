import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { m } from "../../data";
import vectorsJson from "../../data/merkle_vectors.json";
import {
  buildTree,
  canonicalJson,
  EMPTY_ROOT_HEX,
  gateRun,
  inclusionProof,
  leafHash,
  MAX_LEAVES,
  merkleRoot,
  nodeHash,
  receiptBytes,
  roundsAllowed,
  short,
  tamper,
  treeLayout,
  verifyInclusion,
} from "./sim";

interface Vector {
  leaves_utf8: string[];
  leaf_hashes: string[];
  root: string;
  proof: { index: number; hashes: string[] };
}
const vectors = (vectorsJson as unknown as { vectors: Record<string, Vector> }).vectors;
const SIZES = Object.keys(vectors).map(Number);

const flip = (b: Uint8Array, at = 0): Uint8Array => {
  const out = b.slice();
  out[at] ^= 0x01;
  return out;
};
const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

describe("RFC 6962 Merkle tree against the Python implementation", () => {
  it("has vectors for 1, 2, 3, 5, 8 and 13 leaves", () => {
    expect(SIZES.sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 8, 13]);
  });

  it.each(SIZES)("gives the Python leaf hashes and root for %i leaves", (n) => {
    const v = vectors[String(n)];
    const leaves = v.leaves_utf8.map((s) => utf8ToBytes(s));
    expect(leaves.map((l) => bytesToHex(leafHash(l)))).toEqual(v.leaf_hashes);
    expect(bytesToHex(merkleRoot(leaves))).toBe(v.root);
    expect(buildTree(leaves).rootHex).toBe(v.root);
  });

  it.each(SIZES)("gives the Python inclusion proof for %i leaves", (n) => {
    const v = vectors[String(n)];
    const leaves = v.leaves_utf8.map((s) => utf8ToBytes(s));
    expect(inclusionProof(v.proof.index, leaves).map(bytesToHex)).toEqual(v.proof.hashes);
  });

  it("hashes the empty log as SHA-256 of nothing, as merkle_root([]) does", () => {
    expect(bytesToHex(merkleRoot([]))).toBe(EMPTY_ROOT_HEX);
    expect(EMPTY_ROOT_HEX).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const tree = buildTree([]);
    expect(tree.nodes).toEqual([]);
    expect(tree.rootHex).toBe(EMPTY_ROOT_HEX);
  });

  it("separates leaves from nodes with the 0x00 and 0x01 prefixes", () => {
    const a = leafHash(utf8ToBytes("a"));
    const b = leafHash(utf8ToBytes("b"));
    const joined = new Uint8Array([...a, ...b]);
    expect(bytesToHex(nodeHash(a, b))).not.toBe(bytesToHex(leafHash(joined)));
  });
});

describe("inclusion proofs", () => {
  it("verify for every leaf of every size from 1 to 16", () => {
    for (let n = 1; n <= MAX_LEAVES; n++) {
      const leaves = Array.from({ length: n }, (_, i) => receiptBytes(i));
      const root = merkleRoot(leaves);
      for (let i = 0; i < n; i++) {
        const proof = inclusionProof(i, leaves);
        expect(proof.length).toBe(buildTree(leaves).pathTo(i).siblings.length);
        expect(verifyInclusion(i, n, leafHash(leaves[i]), proof, root)).toBe(true);
      }
    }
  });

  it.each(SIZES)("fail after one byte of the leaf, a proof hash or the root is flipped (%i leaves)", (n) => {
    const v = vectors[String(n)];
    const leaves = v.leaves_utf8.map((s) => utf8ToBytes(s));
    const i = v.proof.index;
    const proof = inclusionProof(i, leaves);
    const root = hexToBytes(v.root);
    const leaf = leafHash(leaves[i]);
    expect(verifyInclusion(i, n, leaf, proof, root)).toBe(true);
    expect(verifyInclusion(i, n, leafHash(flip(leaves[i], 3)), proof, root)).toBe(false);
    expect(verifyInclusion(i, n, leaf, proof, flip(root, 31))).toBe(false);
    proof.forEach((_, k) => {
      const bad = proof.map((h, j) => (j === k ? flip(h, 7) : h));
      expect(verifyInclusion(i, n, leaf, bad, root)).toBe(false);
    });
  });

  it("fail with a wrong index, a wrong size, a missing or an extra hash", () => {
    const leaves = Array.from({ length: 13 }, (_, i) => receiptBytes(i));
    const root = merkleRoot(leaves);
    const proof = inclusionProof(6, leaves);
    const leaf = leafHash(leaves[6]);
    expect(verifyInclusion(7, 13, leaf, proof, root)).toBe(false);
    // a size whose tree has another shape on this path (12 has the same shape as 13 here,
    // which RFC 9162 allows: the signed checkpoint binds the size)
    expect(verifyInclusion(6, 7, leaf, proof, root)).toBe(false);
    expect(verifyInclusion(6, 13, leaf, proof.slice(1), root)).toBe(false);
    expect(verifyInclusion(6, 13, leaf, [...proof, proof[0]], root)).toBe(false);
  });

  it("handle an index out of range as the Python does", () => {
    const leaves = [receiptBytes(0), receiptBytes(1)];
    // inclusion_proof raises ValueError; here a RangeError
    expect(() => inclusionProof(2, leaves)).toThrow(RangeError);
    expect(() => inclusionProof(-1, leaves)).toThrow(RangeError);
    expect(() => inclusionProof(0, [])).toThrow(RangeError);
    // verify_inclusion returns False
    const root = merkleRoot(leaves);
    expect(verifyInclusion(2, 2, leafHash(leaves[0]), [], root)).toBe(false);
    expect(verifyInclusion(-1, 2, leafHash(leaves[0]), [], root)).toBe(false);
    expect(verifyInclusion(0, 0, leafHash(leaves[0]), [], merkleRoot([]))).toBe(false);
    // the tree's own helper gives an empty path instead of throwing, for the scene
    expect(buildTree(leaves).pathTo(5)).toEqual({ ancestors: [], siblings: [], leaf: null });
    expect(buildTree([]).pathTo(0)).toEqual({ ancestors: [], siblings: [], leaf: null });
  });
});

describe("tampering", () => {
  it("flips exactly one byte of one leaf and leaves the input alone", () => {
    const leaves = Array.from({ length: 5 }, (_, i) => receiptBytes(i));
    const before = leaves.map((l) => bytesToHex(l));
    const out = tamper(leaves, 2);
    expect(leaves.map((l) => bytesToHex(l))).toEqual(before);
    let diff = 0;
    out.forEach((l, i) => {
      for (let k = 0; k < l.length; k++) if (l[k] !== leaves[i][k]) diff++;
    });
    expect(diff).toBe(1);
    expect(bytesToHex(merkleRoot(out))).not.toBe(bytesToHex(merkleRoot(leaves)));
  });

  it("changes the round number it flips, and every hash on the leaf's path", () => {
    const leaves = Array.from({ length: 13 }, (_, i) => receiptBytes(i));
    const out = tamper(leaves, 6);
    expect(new TextDecoder().decode(out[6])).not.toBe(new TextDecoder().decode(leaves[6]));
    const good = buildTree(leaves);
    const bad = buildTree(out);
    const changed = good.nodes.filter((nd, k) => nd.hex !== bad.nodes[k].hex).map((nd) => nd.key);
    const path = good.pathTo(6);
    expect(changed.sort()).toEqual([path.leaf!, ...path.ancestors].sort());
  });

  it("ignores an index out of range", () => {
    const leaves = [receiptBytes(0)];
    expect(tamper(leaves, 4).map((l) => bytesToHex(l))).toEqual(leaves.map((l) => bytesToHex(l)));
    expect(tamper([], 0)).toEqual([]);
  });
});

describe("receipts", () => {
  it("are canonical JSON with sorted keys and no spaces", () => {
    expect(canonicalJson({ round: 3, kind: "round", lineage: "demo" })).toBe('{"kind":"round","lineage":"demo","round":3}');
    expect(canonicalJson({ b: [1, { d: 0.5, c: null }], a: "x" })).toBe('{"a":"x","b":[1,{"c":null,"d":0.5}]}');
    expect(new TextDecoder().decode(receiptBytes(0))).toContain('"round":1');
  });

  it("are deterministic", () => {
    expect(bytesToHex(receiptBytes(4))).toBe(bytesToHex(receiptBytes(4)));
    expect(bytesToHex(receiptBytes(4))).not.toBe(bytesToHex(receiptBytes(5)));
  });

  it("shorten a hash for a label", () => {
    expect(short("03234363cfe54995260246da5684d862")).toBe("03234363");
  });
});

describe("tree layout", () => {
  it("gives finite, distinct positions for every size from 1 to 16", () => {
    for (let n = 1; n <= MAX_LEAVES; n++) {
      const nodes = treeLayout(n);
      expect(nodes).toHaveLength(2 * n - 1);
      const seen = new Set<string>();
      for (const nd of nodes) {
        for (const v of [nd.x, nd.y, nd.z]) expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(nd.x)).toBeLessThanOrEqual(5);
        seen.add(`${nd.x.toFixed(4)},${nd.y.toFixed(4)}`);
      }
      expect(seen.size).toBe(nodes.length);
      // every child sits below its parent
      for (const nd of nodes) {
        for (const c of [nd.left, nd.right]) if (c !== null) expect(nodes[c].y).toBeLessThan(nd.y);
      }
    }
  });

  it("splits as RFC 6962 does: the left subtree holds the largest power of two below n", () => {
    const five = treeLayout(5);
    const root = five[five.length - 1];
    expect(root.lo).toBe(0);
    expect(root.hi).toBe(5);
    expect(five[root.left!].hi - five[root.left!].lo).toBe(4);
    expect(five[root.right!].hi - five[root.right!].lo).toBe(1);
  });

  it("is empty for an empty log and deterministic", () => {
    expect(treeLayout(0)).toEqual([]);
    expect(treeLayout(11)).toEqual(treeLayout(11));
  });
});

describe("the release gate", () => {
  it("counts the rounds that fit a budget, with the Python tolerance", () => {
    expect(roundsAllowed(2, 2 / 27)).toBe(27);
    expect(roundsAllowed(1, 0.25)).toBe(4);
    expect(roundsAllowed(1, 0.3)).toBe(3);
    expect(roundsAllowed(0, 0.1)).toBe(0);
    expect(roundsAllowed(-1, 0.1)).toBe(0);
    expect(roundsAllowed(1, 0)).toBe(Number.MAX_SAFE_INTEGER);
    expect(roundsAllowed(Number.NaN, 0.1)).toBe(0);
    expect(roundsAllowed(1, Number.NaN)).toBe(0);
  });

  it("replays the measured demonstration: refused at the first round over budget", () => {
    const asked = m("ledger_audit", "results/blocked_release_demo/rounds_asked");
    const allowed = m("ledger_audit", "results/blocked_release_demo/rounds_allowed");
    const budget = m("ledger_audit", "results/blocked_release_demo/budget_epsilon");
    const run = gateRun(asked, budget, budget / allowed);
    expect(run.allowed).toBe(allowed);
    expect(run.completed).toBe(m("ledger_audit", "results/blocked_release_demo/rounds_completed"));
    expect(run.refusedAt).toBe(allowed + 1);
    expect(run.receipts.filter((r) => r.kind === "refusal")).toHaveLength(m("ledger_audit", "results/blocked_release_demo/refusal_receipts"));
    expect(run.receipts.filter((r) => r.kind === "round").map((r) => r.round)).toEqual(Array.from({ length: allowed }, (_, i) => i + 1));
    expect(run.receipts.at(-1)?.kind).toBe("release");
  });

  it("releases without a refusal when the run fits, and survives the extremes", () => {
    const ok = gateRun(10, 2, 0.1);
    expect(ok.refusedAt).toBeNull();
    expect(ok.completed).toBe(10);
    expect(ok.receipts.map((r) => r.kind)).toEqual([...Array(10).fill("round"), "release"]);
    // no round completed: the runner releases nothing (status refused_before_first_round)
    const none = gateRun(0, 2, 0.1);
    expect(none.completed).toBe(0);
    expect(none.receipts).toEqual([]);
    const nothing = gateRun(5, 0, 0.1);
    expect(nothing.completed).toBe(0);
    expect(nothing.refusedAt).toBe(1);
    expect(nothing.receipts.map((r) => r.kind)).toEqual(["refusal"]);
    for (const r of [gateRun(-3, 2, 0.1), gateRun(Number.NaN, 2, 0.1), gateRun(5, 2, Number.NaN)]) {
      expect(Number.isFinite(r.completed)).toBe(true);
    }
  });
});
