/**
 * The transparency ledger in the browser: a TypeScript port of src/prism/ledger/merkle.py
 * (RFC 6962 Merkle tree over SHA-256, inclusion proofs), canonical receipt bytes, a tree
 * layout for the scene, and the toy release gate. No React, no three.js. Everything here is
 * deterministic; the hashes are real SHA-256.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/** The scene shows at most this many receipts. */
export const MAX_LEAVES = 16;

/* ------------------------------------------------------------------ hashing */

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

/** SHA-256(0x00 || data), as leaf_hash. */
export function leafHash(data: Uint8Array): Uint8Array {
  return sha256(concat(LEAF_PREFIX, data));
}

/** SHA-256(0x01 || left || right), as node_hash. */
export function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concat(NODE_PREFIX, left, right));
}

/** Root of the empty log: SHA-256 of the empty byte string, as merkle_root([]). */
export const EMPTY_ROOT_HEX = bytesToHex(sha256(new Uint8Array(0)));

/** Largest power of two strictly less than n (n >= 2), as _split. */
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function root(leaves: readonly Uint8Array[], lo: number, hi: number): Uint8Array {
  const n = hi - lo;
  if (n === 0) return sha256(new Uint8Array(0));
  if (n === 1) return leafHash(leaves[lo]);
  const k = split(n);
  return nodeHash(root(leaves, lo, lo + k), root(leaves, lo + k, hi));
}

/** Merkle tree hash of raw leaf entries; the empty log gives SHA-256 of nothing. */
export function merkleRoot(leaves: readonly Uint8Array[]): Uint8Array {
  return root(leaves, 0, leaves.length);
}

function path(m: number, leaves: readonly Uint8Array[], lo: number, hi: number): Uint8Array[] {
  const n = hi - lo;
  if (n === 1) return [];
  const k = split(n);
  if (m < k) return [...path(m, leaves, lo, lo + k), root(leaves, lo + k, hi)];
  return [...path(m - k, leaves, lo + k, hi), root(leaves, lo, lo + k)];
}

/** Audit path for leaf `index`, deepest sibling first. Out of range throws, as the ValueError in Python. */
export function inclusionProof(index: number, leaves: readonly Uint8Array[]): Uint8Array[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) throw new RangeError("leaf index out of range");
  return path(index, leaves, 0, leaves.length);
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Checks an inclusion proof (RFC 9162 section 2.1.3.2), as verify_inclusion, except that it
 * takes the leaf's hash rather than its raw bytes. Never throws; a bad input gives false.
 */
export function verifyInclusion(
  index: number,
  size: number,
  leaf: Uint8Array,
  proof: readonly Uint8Array[],
  rootHash: Uint8Array,
): boolean {
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || index >= size) return false;
  let fn = index;
  let sn = size - 1;
  let r = leaf;
  for (const p of proof) {
    if (sn === 0) return false;
    if (fn & 1 || fn === sn) {
      r = nodeHash(p, r);
      if (!(fn & 1)) {
        while (!(fn & 1) && fn !== 0) {
          fn >>= 1;
          sn >>= 1;
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && equal(r, rootHash);
}

/* ------------------------------------------------------------------ receipts */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Canonical JSON in the sense of RFC 8785 for the values receipts hold: keys sorted by UTF-16
 * code units, no whitespace, numbers in the ECMAScript form that RFC 8785 prescribes.
 * NaN and infinity throw, as canonical_bytes raises ValueError.
 */
export function canonicalJson(value: Json): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number in receipt");
    return JSON.stringify(value);
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

/** The receipt of round index + 1 in the toy log, as canonical bytes. */
export function receiptBytes(index: number): Uint8Array {
  return utf8ToBytes(receiptText(index));
}

export function receiptText(index: number): string {
  return canonicalJson({ kind: "round", lineage: "demo", round: index + 1 });
}

/**
 * A copy of the leaves with one bit of one byte of leaf `index` flipped (XOR 0x01, as the
 * project's tamper audit does). By default the byte is the last one before the closing
 * brace, which in a receipt is the last digit of the round number. Out of range: unchanged.
 */
export function tamper(leaves: readonly Uint8Array[], index: number, at?: number): Uint8Array[] {
  return leaves.map((leaf, i) => {
    const copy = leaf.slice();
    if (i !== index || copy.length === 0) return copy;
    const position = at ?? Math.max(0, copy.length - 2);
    if (position >= 0 && position < copy.length) copy[position] ^= 0x01;
    return copy;
  });
}

export const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** First eight hex digits, for a label. */
export const short = (hex: string): string => hex.slice(0, 8);

/* ------------------------------------------------------------------ layout */

export interface LayoutNode {
  /** `${lo}-${hi}`: stable across appends for a complete subtree. */
  key: string;
  /** Leaf range [lo, hi). */
  lo: number;
  hi: number;
  /** 0 for a leaf; ceil(log2(hi - lo)) otherwise. */
  level: number;
  left: number | null;
  right: number | null;
  parent: number | null;
  x: number;
  y: number;
  z: number;
}

export const LEAF_Y = -2.1;
export const LEVEL_DY = 1.05;
const MAX_WIDTH = 8.4;

export function leafSpacing(n: number): number {
  return n <= 1 ? 1 : Math.min(1.05, MAX_WIDTH / (n - 1));
}

/**
 * Positions of every node of the RFC 6962 tree over n leaves: leaves in a row at the bottom,
 * each inner node above the midpoint of its two children at the height of its level.
 * Children come before their parent; the root is last.
 */
export function treeLayout(n: number): LayoutNode[] {
  const count = Math.max(0, Math.min(Math.floor(Number.isFinite(n) ? n : 0), 4096));
  if (count === 0) return [];
  const s = leafSpacing(count);
  const nodes: LayoutNode[] = [];
  const make = (lo: number, hi: number): number => {
    const size = hi - lo;
    let left: number | null = null;
    let right: number | null = null;
    let x: number;
    if (size === 1) {
      x = (lo - (count - 1) / 2) * s;
    } else {
      const k = split(size);
      left = make(lo, lo + k);
      right = make(lo + k, hi);
      x = (nodes[left].x + nodes[right].x) / 2;
    }
    const level = size === 1 ? 0 : Math.ceil(Math.log2(size));
    nodes.push({ key: `${lo}-${hi}`, lo, hi, level, left, right, parent: null, x, y: LEAF_Y + level * LEVEL_DY, z: 0 });
    const me = nodes.length - 1;
    if (left !== null) nodes[left].parent = me;
    if (right !== null) nodes[right].parent = me;
    return me;
  };
  make(0, count);
  return nodes;
}

export interface TreeNode extends LayoutNode {
  hash: Uint8Array;
  hex: string;
}

export interface ProofPath {
  /** Key of the leaf, or null when the index is out of range. */
  leaf: string | null;
  /** Keys of the leaf's ancestors, bottom up, ending with the root. */
  ancestors: string[];
  /** Keys of the nodes whose hashes form the inclusion proof, in proof order. */
  siblings: string[];
}

export interface Tree {
  nodes: TreeNode[];
  rootHex: string;
  /** The proof path of leaf `index`; empty (never an exception) when out of range. */
  pathTo(index: number): ProofPath;
}

/** The whole tree with every node's real hash, for the scene. */
export function buildTree(leaves: readonly Uint8Array[]): Tree {
  const layout = treeLayout(leaves.length);
  const nodes: TreeNode[] = [];
  for (const nd of layout) {
    const hash = nd.left === null || nd.right === null ? leafHash(leaves[nd.lo]) : nodeHash(nodes[nd.left].hash, nodes[nd.right].hash);
    nodes.push({ ...nd, hash, hex: bytesToHex(hash) });
  }
  const rootHex = nodes.length ? nodes[nodes.length - 1].hex : EMPTY_ROOT_HEX;
  const byKey = new Map(nodes.map((nd, i) => [nd.key, i]));
  return {
    nodes,
    rootHex,
    pathTo(index) {
      const at = byKey.get(`${index}-${index + 1}`);
      if (at === undefined || !Number.isInteger(index)) return { leaf: null, ancestors: [], siblings: [] };
      const ancestors: string[] = [];
      const siblings: string[] = [];
      let i = at;
      while (nodes[i].parent !== null) {
        const p = nodes[i].parent as number;
        const sibling = nodes[p].left === i ? nodes[p].right : nodes[p].left;
        siblings.push(nodes[sibling as number].key);
        ancestors.push(nodes[p].key);
        i = p;
      }
      return { leaf: nodes[at].key, ancestors, siblings };
    },
  };
}

/* ------------------------------------------------------------------ release gate */

const TOL = 1e-9;

/**
 * How many rounds fit a budget when every round spends the same amount: the largest t with
 * t * perRound <= budget * (1 + 1e-9), the tolerance ReleaseGate._over uses. A free round
 * gives an unbounded count; a bad input gives 0.
 */
export function roundsAllowed(budget: number, perRound: number): number {
  if (Number.isNaN(budget) || Number.isNaN(perRound) || budget <= 0) return 0;
  if (perRound <= 0 || budget === Infinity) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor((budget * (1 + TOL)) / perRound));
}

export interface GateReceipt {
  kind: "round" | "refusal" | "release";
  /** The round a round or refusal receipt is about; for a release, the rounds completed. */
  round: number;
}

export interface GateRun {
  asked: number;
  allowed: number;
  completed: number;
  /** The round the gate refused, or null if every round asked for fitted. */
  refusedAt: number | null;
  /** Receipts in the order the gate writes them. */
  receipts: GateReceipt[];
}

/**
 * A run asking for `asked` rounds against a budget: round receipts for every authorised round,
 * a refusal receipt at the first round over budget (the run stops there), then a release
 * receipt covering rounds 1 to completed. A run that completes no round is not released,
 * as the runner marks it refused_before_first_round.
 */
export function gateRun(asked: number, budget: number, perRound: number): GateRun {
  const want = Number.isFinite(asked) ? Math.max(0, Math.min(Math.floor(asked), 100_000)) : 0;
  const allowed = roundsAllowed(budget, perRound);
  const completed = Math.min(want, allowed);
  const refusedAt = want > allowed ? allowed + 1 : null;
  const receipts: GateReceipt[] = [];
  for (let t = 1; t <= completed; t++) receipts.push({ kind: "round", round: t });
  if (refusedAt !== null) receipts.push({ kind: "refusal", round: refusedAt });
  if (completed > 0) receipts.push({ kind: "release", round: completed });
  return { asked: want, allowed, completed, refusedAt, receipts };
}
