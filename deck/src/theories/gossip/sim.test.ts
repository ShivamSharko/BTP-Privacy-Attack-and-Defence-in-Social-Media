import { describe, expect, it } from "vitest";
import { rng } from "../../sim/random";
import {
  communityGraph,
  disagreement,
  distanceToGoal,
  goalOf,
  gossipRound,
  initialValues,
  initTrain,
  makeTargets,
  MAX_DEGREE,
  N_NODES,
  peerOrder,
  peerTable,
  privatise,
  closeness,
  roundsToAgree,
  takePeers,
  trainRound,
  TOY,
  type PeerTable,
  type TrainState,
} from "./sim";

const graph = communityGraph(N_NODES, 4, 3);

function finite(xs: number[]): boolean {
  return xs.every((x) => Number.isFinite(x));
}

describe("community graph", () => {
  it("is symmetric, has no self loops and is deterministic", () => {
    const again = communityGraph(N_NODES, 4, 3);
    expect(again.adj).toEqual(graph.adj);
    expect(graph.n).toBe(N_NODES);
    graph.adj.forEach((friends, i) => {
      expect(friends).not.toContain(i);
      expect(new Set(friends).size).toBe(friends.length);
      for (const j of friends) expect(graph.adj[j]).toContain(i);
    });
  });

  it("has visible communities: more friends inside than outside", () => {
    let inside = 0;
    let outside = 0;
    graph.adj.forEach((friends, i) => {
      for (const j of friends) (graph.community[i] === graph.community[j] ? inside++ : outside++);
    });
    expect(inside).toBeGreaterThan(outside * 3);
    expect(new Set(graph.community).size).toBe(4);
  });

  it("places every node inside the scene box with finite coordinates", () => {
    expect(graph.pos).toHaveLength(N_NODES * 3);
    for (let i = 0; i < N_NODES; i++) {
      expect(Number.isFinite(graph.pos[i * 3] + graph.pos[i * 3 + 1] + graph.pos[i * 3 + 2])).toBe(true);
      expect(Math.abs(graph.pos[i * 3])).toBeLessThan(5);
      expect(Math.abs(graph.pos[i * 3 + 1])).toBeLessThan(4);
      expect(Math.abs(graph.pos[i * 3 + 2])).toBeLessThan(5);
    }
  });

  it("copes with tiny graphs", () => {
    expect(communityGraph(0, 4, 1).n).toBe(0);
    expect(communityGraph(1, 4, 1).adj).toEqual([[]]);
    expect(communityGraph(3, 9, 1).community.every((c) => Number.isInteger(c))).toBe(true);
  });
});

describe("peer table: friends first, then random contacts", () => {
  const table = peerTable(graph, 4, 11);

  it("lists friends before random contacts and flags them", () => {
    graph.adj.forEach((friends, i) => {
      const k = Math.min(4, friends.length);
      for (let c = 0; c < 4; c++) {
        const peer = table.peers[i][c];
        expect(table.isFriend[i][c]).toBe(c < k);
        expect(friends.includes(peer)).toBe(c < k);
      }
    });
  });

  it("never lists a node as its own peer or lists a peer twice", () => {
    table.peers.forEach((row, i) => {
      expect(row).not.toContain(i);
      expect(new Set(row).size).toBe(row.length);
    });
  });

  it("gives isolated nodes only random contacts", () => {
    const lonely = communityGraph(10, 2, 1, 0, 0);
    const t = peerTable(lonely, 3, 5);
    for (const row of t.isFriend) expect(row).toEqual([false, false, false]);
    for (const row of t.peers) expect(row).toHaveLength(3);
  });

  it("takes a prefix, so a slider can add peers without reshuffling", () => {
    const order = peerOrder(graph, 11);
    const two = takePeers(order, 2);
    const five = takePeers(order, 5);
    two.peers.forEach((row, i) => expect(five.peers[i].slice(0, 2)).toEqual(row));
  });

  it("is deterministic for a seed and different for another", () => {
    expect(peerTable(graph, 4, 11)).toEqual(table);
    expect(peerTable(graph, 4, 12).peers).not.toEqual(table.peers);
  });

  it("handles degree 0 and degree larger than the network", () => {
    expect(peerTable(graph, 0, 1).peers.every((row) => row.length === 0)).toBe(true);
    const big = peerTable(communityGraph(5, 1, 1), 99, 1);
    big.peers.forEach((row) => expect(row).toHaveLength(4));
    expect(MAX_DEGREE).toBeGreaterThan(4);
  });
});

describe("gossip averaging", () => {
  const values = initialValues(graph, 2);

  it("does nothing, and makes no NaN, when nobody has a peer", () => {
    const none: PeerTable = peerTable(graph, 0, 1);
    const next = gossipRound(values, none.peers);
    expect(next).toEqual(values);
    expect(finite(next)).toBe(true);
    expect(gossipRound([], [])).toEqual([]);
  });

  it("preserves the mean when the mixing is symmetric", () => {
    const n = 12;
    const ring = Array.from({ length: n }, (_, i) => [(i + 1) % n, (i + n - 1) % n]);
    const v = Array.from({ length: n }, (_, i) => Math.sin(i) * 3 + i);
    let state = v;
    for (let r = 0; r < 20; r++) state = gossipRound(state, ring);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(state)).toBeCloseTo(mean(v), 10);
  });

  it("never increases the disagreement, whatever the peer table", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { peers } = peerTable(graph, 1 + (seed % 6), seed);
      let state = initialValues(graph, seed);
      for (let r = 0; r < 12; r++) {
        const next = gossipRound(state, peers);
        expect(disagreement(next)).toBeLessThanOrEqual(disagreement(state) + 1e-12);
        state = next;
      }
    }
  });

  it("leaves agreement alone", () => {
    const flat = new Array<number>(N_NODES).fill(0.4);
    expect(gossipRound(flat, peerTable(graph, 4, 1).peers)).toEqual(flat);
    expect(disagreement(flat)).toBe(0);
    expect(disagreement([])).toBe(0);
  });

  it("converges in fewer rounds when each node talks to more peers", () => {
    const rounds = (d: number) => roundsToAgree(values, peerTable(graph, d, 4).peers, 0.05, 400);
    expect(rounds(8)).toBeLessThan(rounds(4));
    expect(rounds(4)).toBeLessThan(rounds(2));
  });

  it("never agrees with zero peers", () => {
    expect(roundsToAgree(values, peerTable(graph, 0, 1).peers, 0.02, 50)).toBe(50);
  });
});

describe("privatise", () => {
  it("clips to the norm and adds nothing at zero noise", () => {
    const out = privatise([3, 4], 1, 0, rng(1));
    expect(Math.hypot(out[0], out[1])).toBeCloseTo(1, 12);
    expect(privatise([0.3, 0.4], 1, 0, rng(1))).toEqual([0.3, 0.4]);
    expect(privatise([0, 0], 1, 0, rng(1))).toEqual([0, 0]);
  });

  it("adds noise that grows with the multiplier", () => {
    const r = rng(9);
    const spread = (z: number) => {
      let s = 0;
      for (let k = 0; k < 400; k++) s += privatise([0, 0], 1, z, r)[0] ** 2;
      return Math.sqrt(s / 400);
    };
    expect(spread(4)).toBeGreaterThan(spread(1) * 2);
  });
});

describe("local steps toward a shared target", () => {
  const targets = makeTargets(graph, 6);
  const goal = goalOf(targets);
  const { peers } = peerTable(graph, 4, 2);
  const run = (optimiser: "plain" | "adam", noise: number, rounds: number, seed = 1): TrainState => {
    const r = rng(seed);
    let s = initTrain(N_NODES);
    for (let k = 0; k < rounds; k++) s = trainRound(s, targets, peers, { optimiser, noise }, r);
    return s;
  };

  it("is deterministic for a seed", () => {
    expect(run("adam", 2, 15, 3)).toEqual(run("adam", 2, 15, 3));
  });

  it("with Adam and gossiped moments the nodes reach the goal; plain averaging stalls", () => {
    const adam = run("adam", 0, 120);
    const plain = run("plain", 0, 120);
    expect(distanceToGoal(adam, goal)).toBeLessThan(0.2);
    expect(distanceToGoal(plain, goal)).toBeGreaterThan(0.6);
    expect(disagreement(closeness(adam, goal))).toBeLessThan(0.5);
  });

  it("zero noise gives the same run whatever the random stream", () => {
    expect(run("adam", 0, 30, 1)).toEqual(run("adam", 0, 30, 99));
    expect(run("plain", 0, 30, 1)).toEqual(run("plain", 0, 30, 99));
  });

  it("local noise costs most of the progress", () => {
    const clean = distanceToGoal(run("adam", 0, 120), goal);
    const noisy = distanceToGoal(run("adam", TOY.noiseShown, 120), goal);
    expect(noisy).toBeGreaterThan(clean * 4);
  });

  it("handles nodes with no peers, isolated graphs and noise without NaN", () => {
    const alone = peerTable(graph, 0, 1).peers;
    let s = initTrain(N_NODES);
    const r = rng(2);
    for (let k = 0; k < 40; k++) s = trainRound(s, targets, alone, { optimiser: "adam", noise: TOY.noiseShown }, r);
    for (const row of [...s.theta, ...s.m, ...s.v]) expect(finite(row)).toBe(true);
    const empty = trainRound(initTrain(0), [], [], { optimiser: "adam", noise: 0 }, rng(1));
    expect(empty.theta).toEqual([]);
    expect(distanceToGoal(initTrain(0), [1, 1])).toBe(0);
  });

  it("keeps closeness inside zero to one for the colour ramp", () => {
    for (const x of closeness(run("adam", TOY.noiseShown, 60), goal)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});
