import type { DiagramEdge, DiagramModel, DiagramNode, EdgeKind } from "./diagram";

export type EdgeVisualState = "flow" | "dropped" | "halted" | "backpressure";

export interface Telemetry {
  totalNodes: number;
  activeNodes: number;
  degradedNodes: number;
  outageNodes: number;
  throughput: number;
  p99: number;
  successRate: number;
  errorRate: number;
  spark: number[];
}

export interface BlastRadius {
  origin: Set<string>;
  downstreamNodes: Set<string>;
  downstreamEdges: Set<string>;
  droppedEdges: Set<string>;
}

export interface ParticleSpec {
  count: number;
  duration: number;
  lanes: number;
  bounce: boolean;
  color: string;
  size: number;
}

export const PALETTE = {
  sync: "#38bdf8",
  async: "#a855f7",
  asyncAlt: "#f59e0b",
  thick: "#10b981",
  amber: "#f59e0b",
  crimson: "#f43f5e",
  emerald: "#10b981",
  slate: "#94a3b8",
} as const;

export function edgeColor(kind: EdgeKind): string {
  if (kind === "async") return PALETTE.async;
  if (kind === "thick") return PALETTE.thick;
  return PALETTE.sync;
}

export function nodeLatency(node: DiagramNode): number {
  const base = node.latency || 8;
  if (node.health === "degraded") return base + 600;
  if (node.health === "outage") return base;
  return base;
}

export function latencyColor(ms: number): string {
  if (ms >= 500) return PALETTE.crimson;
  if (ms >= 180) return PALETTE.amber;
  if (ms >= 60) return PALETTE.sync;
  return PALETTE.emerald;
}

export function healthColor(node: DiagramNode): string {
  if (node.health === "outage") return PALETTE.crimson;
  if (node.health === "degraded") return PALETTE.amber;
  return PALETTE.emerald;
}

export function isEntryNode(model: DiagramModel, nodeId: string): boolean {
  return !model.edges.some((edge) => edge.to === nodeId);
}

export function isLeafNode(model: DiagramModel, nodeId: string): boolean {
  return !model.edges.some((edge) => edge.from === nodeId);
}

export function computeBlastRadius(model: DiagramModel, originIds: string[]): BlastRadius {
  const origin = new Set(originIds);
  const downstreamNodes = new Set<string>();
  const downstreamEdges = new Set<string>();
  const droppedEdges = new Set<string>();
  const queue = [...origin];

  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of model.edges) {
      if (edge.from !== current) continue;
      downstreamEdges.add(edge.id);
      if (!downstreamNodes.has(edge.to) && !origin.has(edge.to)) {
        downstreamNodes.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  for (const edge of model.edges) {
    const targetDown = origin.has(edge.to) || downstreamNodes.has(edge.to);
    const sourceFailing = origin.has(edge.from) || downstreamNodes.has(edge.from);
    if (targetDown && !sourceFailing) droppedEdges.add(edge.id);
  }

  return { origin, downstreamNodes, downstreamEdges, droppedEdges };
}

export function edgeVisualState(
  edge: DiagramEdge,
  blast: BlastRadius,
  nodeById: Record<string, DiagramNode>,
): EdgeVisualState {
  if (blast.droppedEdges.has(edge.id)) return "dropped";
  const source = nodeById[edge.from];
  const target = nodeById[edge.to];
  if (source?.health === "outage") return "halted";
  if (blast.downstreamEdges.has(edge.id)) {
    if (target?.health === "outage") return "dropped";
    if (target?.health === "degraded" || source?.health === "degraded") return "backpressure";
    return "halted";
  }
  if (source?.health === "degraded" || target?.health === "degraded") return "backpressure";
  return "flow";
}

export function buildParticles(
  edge: DiagramEdge,
  options: { multiplier: number; state?: EdgeVisualState },
): ParticleSpec {
  const state = options.state ?? "flow";
  const effectiveRps = edge.rps * options.multiplier;
  const base = effectiveRps <= 0 ? 1 : Math.round(1 + Math.log10(1 + effectiveRps) * 1.9);
  const count = Math.min(8, Math.max(1, base));
  const latency = Math.max(6, edge.latency || 10);
  const duration = Math.min(9, Math.max(0.9, latency / 34));
  const lanes = edge.kind === "thick" ? 2 : 1;
  const bounce = state === "dropped";
  const color =
    state === "dropped"
      ? PALETTE.crimson
      : state === "halted"
        ? PALETTE.slate
        : state === "backpressure"
          ? PALETTE.amber
          : edgeColor(edge.kind);
  return { count, duration, lanes, bounce, color, size: edge.kind === "thick" ? 3.6 : 2.8 };
}

export function computeTelemetry(
  model: DiagramModel,
  options: { multiplier: number; tick: number },
): Telemetry {
  const totalNodes = model.nodes.length;
  const outageNodes = model.nodes.filter((n) => n.health === "outage").length;
  const degradedNodes = model.nodes.filter((n) => n.health === "degraded").length;
  const activeNodes = totalNodes - outageNodes;

  const entries = model.nodes.filter((node) => isEntryNode(model, node.id));
  const entryThroughput = entries.reduce((sum, node) => {
    const fromEdges = model.edges.filter((e) => e.from === node.id);
    const own = node.rps ?? 0;
    const edgeSum = fromEdges.reduce((acc, e) => acc + effectiveEdgeRps(e, model), 0);
    return sum + (own > 0 ? own : edgeSum);
  }, 0);
  // Cyclic topologies (sequence diagrams, replication rings) have no entry
  // node, so fall back to the busiest single edge as the cluster rate.
  const busiest = model.edges.reduce(
    (max, edge) => Math.max(max, effectiveEdgeRps(edge, model)),
    0,
  );
  const throughput = Math.round(Math.max(entryThroughput, busiest) * options.multiplier);

  const p99 = criticalPathLatency(model);
  const dropped = model.edges.filter((e) => {
    const target = model.nodeById[e.to];
    return target?.health === "outage";
  }).length;
  const droppedWeight = model.edges.length ? dropped / model.edges.length : 0;
  const outageWeight = totalNodes ? outageNodes / totalNodes : 0;
  const successRate = totalNodes === 0 ? 100 : clamp(100 - (droppedWeight * 42 + outageWeight * 8), 0, 100);

  const seed = options.tick;
  const spark = Array.from({ length: 16 }, (_, i) => {
    const wave = Math.sin((i + seed * 0.6) * 0.7) * 0.16 + Math.sin((i + seed) * 0.31) * 0.09;
    return clamp(0.42 + wave + (degradedNodes > 0 ? 0.1 : 0), 0.08, 1);
  });

  return {
    totalNodes,
    activeNodes,
    degradedNodes,
    outageNodes,
    throughput,
    p99,
    successRate: Number(successRate.toFixed(1)),
    errorRate: Number((100 - successRate).toFixed(1)),
    spark,
  };
}

function criticalPathLatency(model: DiagramModel): number {
  if (!model.nodes.length) return 0;
  const memo = new Map<string, number>();

  const visit = (nodeId: string, seen: Set<string>): number => {
    if (seen.has(nodeId)) return 0;
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached;
    const node = model.nodeById[nodeId];
    const nodeCost = node ? nodeLatency(node) : 0;
    const next = model.edges.filter((e) => e.from === nodeId);
    if (!next.length) {
      memo.set(nodeId, nodeCost);
      return nodeCost;
    }
    const branch = next.map((edge) => {
      const target = model.nodeById[edge.to];
      const penalty = target?.health === "outage" ? 0 : 0;
      return edge.latency + visit(edge.to, new Set([...seen, nodeId])) + penalty;
    });
    const best = Math.max(...branch);
    const total = nodeCost + best;
    memo.set(nodeId, total);
    return total;
  };

  const entries = model.nodes.filter((node) => isEntryNode(model, node.id));
  const roots = entries.length ? entries : model.nodes.slice(0, 1);
  return Math.round(Math.max(...roots.map((node) => visit(node.id, new Set()))));
}

export function findTracePath(
  model: DiagramModel,
): { nodeIds: string[]; edgeIds: string[] } | null {
  if (!model.edges.length) return null;
  const entries = model.nodes.filter((node) => isEntryNode(model, node.id));
  const start = entries[0] ?? model.nodes[0];
  if (!start) return null;

  const nodeIds: string[] = [start.id];
  const edgeIds: string[] = [];
  const seen = new Set<string>([start.id]);
  let current = start.id;

  for (let hop = 0; hop < model.nodes.length; hop += 1) {
    const options = model.edges
      .filter((edge) => edge.from === current && !seen.has(edge.to))
      .sort((a, b) => b.rps - a.rps);
    const next = options[0];
    if (!next) break;
    edgeIds.push(next.id);
    nodeIds.push(next.to);
    seen.add(next.to);
    current = next.to;
  }

  if (!edgeIds.length) {
    const fallback = model.edges[0];
    return { nodeIds: [fallback.from, fallback.to], edgeIds: [fallback.id] };
  }
  return { nodeIds, edgeIds };
}

export function effectiveEdgeRps(edge: DiagramEdge, model: DiagramModel): number {
  const target = model.nodeById[edge.to];
  if (target?.rps && target.rps > 0) {
    const incoming = model.edges.filter((e) => e.to === edge.to);
    const weights = incoming.reduce((sum, e) => sum + Math.max(1, e.rps), 0);
    return Math.round((target.rps * Math.max(1, edge.rps)) / Math.max(1, weights));
  }
  if (edge.rps > 0) return edge.rps;
  const source = model.nodeById[edge.from];
  return source?.rps ?? 0;
}

export function aggregateRps(model: DiagramModel, nodeId: string): number {
  const outgoing = model.edges.filter((e) => e.from === nodeId);
  if (!outgoing.length) {
    const incoming = model.edges.filter((e) => e.to === nodeId);
    return incoming.reduce((sum, e) => sum + e.rps, 0);
  }
  return outgoing.reduce((sum, e) => sum + e.rps, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
