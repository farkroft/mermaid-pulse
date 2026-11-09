import { describe, expect, it } from "vitest";
import { parseDiagram } from "../src/lib/diagram";
import {
  buildParticles,
  computeBlastRadius,
  computeTelemetry,
  edgeVisualState,
  effectiveEdgeRps,
  findTracePath,
  latencyColor,
  nodeLatency,
} from "../src/lib/telemetry";

const MODEL = parseDiagram(`flowchart LR
  Client -->|400 rps| Gateway
  Gateway -->|300 rps| Auth
  Gateway -.->|60 rps| Kafka
  Auth -->|280 rps| DB[(Postgres)]
  %% @node Client latency=4ms
  %% @node Gateway latency=8ms
  %% @node Auth latency=12ms
  %% @node DB latency=20ms
  %% @node Kafka latency=6ms`);

describe("computeTelemetry", () => {
  it("counts nodes and flags health", () => {
    const t = computeTelemetry(MODEL, { multiplier: 1, tick: 0 });
    expect(t.totalNodes).toBe(5);
    expect(t.activeNodes).toBe(5);
    expect(t.outageNodes).toBe(0);
    expect(t.successRate).toBe(100);
  });

  it("sums entry throughput and applies the load multiplier", () => {
    expect(computeTelemetry(MODEL, { multiplier: 1, tick: 0 }).throughput).toBe(400);
    expect(computeTelemetry(MODEL, { multiplier: 5, tick: 0 }).throughput).toBe(2000);
    expect(computeTelemetry(MODEL, { multiplier: 20, tick: 0 }).throughput).toBe(8000);
  });

  it("derives P99 from the longest latency path", () => {
    const t = computeTelemetry(MODEL, { multiplier: 1, tick: 0 });
    // Client 4 + edge + Gateway 8 + edge + Auth 12 + edge + DB 20
    expect(t.p99).toBeGreaterThanOrEqual(44);
    expect(t.p99).toBeLessThan(300);
  });

  it("adds 600ms for degraded nodes and drops success on outage", () => {
    const degraded = parseDiagram(MODEL.code + "\n  %% @node Auth status=degraded");
    computeTelemetry(degraded, { multiplier: 1, tick: 0 });
    expect(nodeLatency(degraded.nodeById.Auth)).toBe(612);

    const outage = parseDiagram(MODEL.code + "\n  %% @node Auth status=outage");
    const tOutage = computeTelemetry(outage, { multiplier: 1, tick: 0 });
    expect(tOutage.outageNodes).toBe(1);
    expect(tOutage.activeNodes).toBe(4);
    expect(tOutage.successRate).toBeLessThan(100);
    expect(tOutage.successRate).toBeGreaterThan(0);
  });

  it("stays deterministic for a given tick", () => {
    const a = computeTelemetry(MODEL, { multiplier: 1, tick: 7 });
    const b = computeTelemetry(MODEL, { multiplier: 1, tick: 7 });
    expect(a).toEqual(b);
  });
});

describe("blast radius", () => {
  const outage = parseDiagram(MODEL.code + "\n  %% @node Gateway status=outage");
  const blast = computeBlastRadius(outage, ["Gateway"]);

  it("collects downstream nodes and edges", () => {
    expect(blast.downstreamNodes.has("Auth")).toBe(true);
    expect(blast.downstreamNodes.has("DB")).toBe(true);
    expect(blast.downstreamNodes.has("Client")).toBe(false);
  });

  it("collects incoming edges as dropped", () => {
    expect(blast.droppedEdges.size).toBe(1);
  });

  it("classifies edge visuals for the overlay", () => {
    const incoming = outage.edges.find((e) => e.to === "Gateway")!;
    const outgoing = outage.edges.find((e) => e.from === "Gateway" && e.to === "Auth")!;
    const upstream = outage.edges.find((e) => e.from === "Client")!;
    expect(edgeVisualState(incoming, blast, outage.nodeById)).toBe("dropped");
    expect(edgeVisualState(outgoing, blast, outage.nodeById)).toBe("halted");
    expect(edgeVisualState(upstream, blast, outage.nodeById)).toBe("dropped");
  });

  it("leaves unrelated edges flowing", () => {
    const model = parseDiagram(`flowchart LR
  A --> B
  C --> D
  %% @node A status=outage`);
    const b = computeBlastRadius(model, ["A"]);
    const unrelated = model.edges.find((e) => e.from === "C")!;
    expect(edgeVisualState(unrelated, b, model.nodeById)).toBe("flow");
  });
});

describe("particles", () => {
  it("scales particle count with throughput and clamps it", () => {
    const edge = MODEL.edges[0];
    const low = buildParticles(edge, { multiplier: 1 });
    const high = buildParticles(edge, { multiplier: 20 });
    expect(low.count).toBeGreaterThanOrEqual(1);
    expect(high.count).toBeLessThanOrEqual(8);
    expect(high.count).toBeGreaterThan(low.count);
  });

  it("scales duration with latency", () => {
    const fast = buildParticles({ ...MODEL.edges[0], latency: 10 }, { multiplier: 1 });
    const slow = buildParticles({ ...MODEL.edges[0], latency: 900 }, { multiplier: 1 });
    expect(slow.duration).toBeGreaterThan(fast.duration);
  });

  it("uses one lane for sync, two for thick, and a bounce for dropped", () => {
    expect(buildParticles({ ...MODEL.edges[0], kind: "sync" }, { multiplier: 1 }).lanes).toBe(1);
    expect(buildParticles({ ...MODEL.edges[0], kind: "thick" }, { multiplier: 1 }).lanes).toBe(2);
    expect(buildParticles(MODEL.edges[0], { multiplier: 1, state: "dropped" }).bounce).toBe(true);
  });

  it("maps latency bands to the palette", () => {
    expect(latencyColor(20)).toBe("#10b981");
    expect(latencyColor(90)).toBe("#38bdf8");
    expect(latencyColor(240)).toBe("#f59e0b");
    expect(latencyColor(700)).toBe("#f43f5e");
  });
});

describe("trace path", () => {
  it("finds a hop-by-hop path from an entry node to a leaf", () => {
    const path = findTracePath(MODEL);
    expect(path).not.toBeNull();
    expect(path!.nodeIds[0]).toBe("Client");
    expect(path!.edgeIds.length).toBe(path!.nodeIds.length - 1);
    expect(["DB", "Kafka"]).toContain(path!.nodeIds[path!.nodeIds.length - 1]);
  });

  it("returns null for a graph with no edges", () => {
    expect(findTracePath(parseDiagram("flowchart LR\n  A[Solo]"))).toBeNull();
  });
});

describe("effective edge throughput", () => {
  it("uses the label rate by default", () => {
    expect(effectiveEdgeRps(MODEL.edges[0], MODEL)).toBe(400);
  });

  it("shapes incoming density when the target node sets an rps directive", () => {
    const shaped = parseDiagram(MODEL.code + "\n  %% @node DB rps=1000");
    const into = shaped.edges.find((e) => e.to === "DB")!;
    expect(effectiveEdgeRps(into, shaped)).toBe(1000);
  });

  it("splits node rps across multiple incoming edges", () => {
    const shaped = parseDiagram(`flowchart LR
  A --> C
  B --> C
  %% @node C rps=900`);
    const total = shaped.edges.reduce((sum, e) => sum + effectiveEdgeRps(e, shaped), 0);
    expect(total).toBe(900);
  });

  it("falls back to the source node rps when the label has none", () => {
    const shaped = parseDiagram(`flowchart LR
  A --> B
  %% @node A rps=250`);
    expect(effectiveEdgeRps(shaped.edges[0], shaped)).toBe(250);
  });
});

describe("cyclic topologies", () => {
  const cyclic = parseDiagram(`sequenceDiagram
  participant C as Client
  participant S as Server
  C->>S: request
  S-->>C: response
  %% @edge C->S rps=1500 latency=20ms
  %% @edge S->C rps=1500 latency=20ms`);

  it("reports throughput for a graph with no entry node", () => {
    const t = computeTelemetry(cyclic, { multiplier: 1, tick: 0 });
    expect(t.throughput).toBe(1500);
    expect(computeTelemetry(cyclic, { multiplier: 5, tick: 0 }).throughput).toBe(7500);
  });

  it("still uses the entry rate for acyclic graphs", () => {
    expect(computeTelemetry(MODEL, { multiplier: 1, tick: 0 }).throughput).toBe(400);
  });
});
