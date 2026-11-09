export type NodeShape =
  | "rect"
  | "rounded"
  | "stadium"
  | "circle"
  | "diamond"
  | "hexagon"
  | "cylinder"
  | "subroutine"
  | "asymmetric"
  | "participant"
  | "default";

export type Health = "healthy" | "degraded" | "outage";
export type EdgeKind = "sync" | "async" | "thick";
export type DiagramKind = "flowchart" | "sequence" | "unknown";
export type SnippetKind = "service" | "database" | "queue" | "subgraph" | "directive";

export interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  line: number;
  health: Health;
  latency: number;
  cpu?: number;
  rps?: number;
  group?: string;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  rps: number;
  latency: number;
  line: number;
}

export interface DiagramModel {
  code: string;
  kind: DiagramKind;
  direction: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  nodeById: Record<string, DiagramNode>;
  edgeById: Record<string, DiagramEdge>;
}

interface Directive {
  status?: string;
  cpu?: string;
  latency?: string;
  rps?: string;
  extras: Record<string, string>;
}

const NODE_SHAPES: Array<{ open: string; close: string; shape: NodeShape }> = [
  { open: "([", close: "])", shape: "stadium" },
  { open: "((", close: "))", shape: "circle" },
  { open: "[[", close: "]]", shape: "subroutine" },
  { open: "[(", close: ")]", shape: "cylinder" },
  { open: "{{", close: "}}", shape: "hexagon" },
  { open: "[/", close: "/]", shape: "rect" },
  { open: "[\\", close: "\\]", shape: "rect" },
  { open: "[", close: "]", shape: "rect" },
  { open: "(", close: ")", shape: "rounded" },
  { open: "{", close: "}", shape: "diamond" },
  { open: ">", close: "]", shape: "asymmetric" },
];

const EDGE_PATTERN = /(?:<)?(?:==+>|==+|-\.->|-\.-|-{2,}>|-{2,}o|-{2,}x|-{3,})/;
const EDGE_SPLIT = new RegExp(`\\s*(${EDGE_PATTERN.source})\\s*`);

function defaultEdgeLatency(rps: number): number {
  return Math.round(Math.min(120, Math.max(6, 8 + rps / 100)));
}

function parseDirectiveValue(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "");
}

function directiveKeyOrder(key: string): number {
  return { status: 0, cpu: 1, latency: 2, rps: 3 }[key] ?? 9;
}

function serializeDirective(target: string, values: Record<string, string>): string {
  const parts = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort((a, b) => directiveKeyOrder(a[0]) - directiveKeyOrder(b[0]))
    .map(([key, value]) => `${key}=${value}`);
  return `%% ${target} ${parts.join(" ")}`.trimEnd();
}

function parseDirectives(code: string) {
  const nodes: Record<string, Directive> = {};
  const edges: Record<string, Directive> = {};
  const merge = (base: Directive | undefined, next: Directive): Directive => {
    if (!base) return next;
    return {
      status: next.status ?? base.status,
      cpu: next.cpu ?? base.cpu,
      latency: next.latency ?? base.latency,
      rps: next.rps ?? base.rps,
      extras: { ...base.extras, ...next.extras },
    };
  };

  for (const raw of code.split("\n")) {
    const line = raw.trim();
    const nodeMatch = line.match(/^%%\s*@node\s+([\w.-]+)\s*(.*)$/);
    if (nodeMatch) {
      nodes[nodeMatch[1]] = merge(nodes[nodeMatch[1]], parseKv(nodeMatch[2]));
      continue;
    }
    const edgeMatch = line.match(/^%%\s*@edge\s+([\w.-]+)\s*->\s*([\w.-]+)\s*(.*)$/);
    if (edgeMatch) {
      const key = `${edgeMatch[1]}->${edgeMatch[2]}`;
      edges[key] = merge(edges[key], parseKv(edgeMatch[3]));
    }
  }
  return { nodes, edges };
}

function parseKv(raw: string): Directive {
  const directive: Directive = { extras: {} };
  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const [key, ...rest] = token.split("=");
    const value = parseDirectiveValue(rest.join("="));
    if (!value) continue;
    if (key === "status" || key === "cpu" || key === "latency" || key === "rps") {
      directive[key] = value;
    } else {
      directive.extras[key] = value;
    }
  }
  return directive;
}

function healthFromStatus(status?: string): Health {
  if (status === "degraded") return "degraded";
  if (status === "outage" || status === "down") return "outage";
  return "healthy";
}

function numeric(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseNodeSpec(spec: string): { id: string; label: string; shape: NodeShape } | null {
  const text = spec.trim();
  if (!text) return null;
  const idMatch = text.match(/^([\w.-]+)/);
  if (!idMatch) return null;
  const id = idMatch[1];
  let rest = text.slice(id.length).trim();
  if (!rest) return { id, label: id, shape: "default" };
  if (rest.startsWith(":::")) {
    rest = rest.replace(/^:::\S+/, "").trim();
    if (!rest) return { id, label: id, shape: "default" };
  }
  for (const shape of NODE_SHAPES) {
    if (rest.startsWith(shape.open) && rest.endsWith(shape.close)) {
      const label = rest.slice(shape.open.length, rest.length - shape.close.length);
      return {
        id,
        label: label.replace(/^"|"$/g, "").trim() || id,
        shape: shape.shape,
      };
    }
  }
  return { id, label: id, shape: "default" };
}

function edgeKindFor(arrow: string): EdgeKind {
  if (arrow.includes("=")) return "thick";
  if (arrow.includes(".")) return "async";
  return "sync";
}

function parseEdgeLabel(label: string | undefined): { rps: number; label?: string } {
  if (!label) return { rps: 0 };
  const rpsMatch = label.match(/([\d,.]+)\s*(?:rps|req\/s|qps)/i);
  if (rpsMatch) return { rps: Math.round(Number(rpsMatch[1].replace(/,/g, ""))), label };
  return { rps: 0, label };
}

function stripInlineComment(line: string): string {
  return line.replace(/%%.*$/, "").trim();
}

function parseFlowchart(code: string): DiagramModel {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const nodeById: Record<string, DiagramNode> = {};
  const edgeById: Record<string, DiagramEdge> = {};
  const lines = code.split("\n");
  const directives = parseDirectives(code);

  let direction = "TB";
  let subgraphStack: string[] = [];
  let edgeSeq = 0;

  const ensureNode = (spec: string, line: number): DiagramNode | null => {
    const parsed = parseNodeSpec(spec);
    if (!parsed) return null;
    const existing = nodeById[parsed.id];
    if (existing) {
      if (parsed.label !== parsed.id && existing.label === existing.id) {
        existing.label = parsed.label;
        existing.shape = parsed.shape;
      }
      return existing;
    }
    const directive = directives.nodes[parsed.id];
    const node: DiagramNode = {
      id: parsed.id,
      label: parsed.label,
      shape: parsed.shape,
      line,
      health: healthFromStatus(directive?.status),
      latency: numeric(directive?.latency, 0),
      cpu: directive?.cpu ? numeric(directive.cpu, 0) : undefined,
      rps: directive?.rps ? numeric(directive.rps, 0) : undefined,
      group: subgraphStack[subgraphStack.length - 1],
    };
    nodeById[node.id] = node;
    nodes.push(node);
    return node;
  };

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("%%")) return;

    const header = trimmed.match(/^(?:flowchart|graph)\s+([A-Z]{2})/i);
    if (header) {
      direction = header[1].toUpperCase();
      return;
    }
    if (/^subgraph\b/.test(trimmed)) {
      const group = trimmed.replace(/^subgraph\s+/, "").split(/[\s[]/)[0] || `group${subgraphStack.length + 1}`;
      subgraphStack.push(group);
      return;
    }
    if (trimmed === "end") {
      subgraphStack = subgraphStack.slice(0, -1);
      return;
    }
    if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/.test(trimmed)) return;

    const statement = stripInlineComment(trimmed);
    if (!statement) return;

    const parts = statement.split(EDGE_SPLIT);
    let previous: DiagramNode | null = null;
    for (let i = 0; i < parts.length; i += 1) {
      const chunk = parts[i].trim();
      if (i % 2 === 1) continue;
      if (!chunk) continue;
      let label: string | undefined;
      let nodeText = chunk;
      const pipe = chunk.match(/^\|([^|]*)\|\s*(.*)$/);
      if (pipe) {
        label = pipe[1].trim();
        nodeText = pipe[2].trim();
      }
      const current = ensureNode(nodeText, lineNo);
      if (!current) continue;
      if (previous) {
        const arrow = parts[i - 1] ?? "-->";
        const id = `${previous.id}->${current.id}#${edgeSeq++}`;
        const parsedLabel = parseEdgeLabel(label);
        const directive = directives.edges[`${previous.id}->${current.id}`];
        const rps = directive?.rps ? numeric(directive.rps, parsedLabel.rps) : parsedLabel.rps;
        const edge: DiagramEdge = {
          id,
          from: previous.id,
          to: current.id,
          kind: edgeKindFor(arrow),
          label,
          rps,
          latency: numeric(directive?.latency, defaultEdgeLatency(rps)),
          line: lineNo,
        };
        edges.push(edge);
        edgeById[id] = edge;
      }
      previous = current;
    }
  });

  for (const edge of edges) {
    if (!edge.rps) {
      const from = nodeById[edge.from];
      edge.rps = from?.rps && from.rps > 0 ? from.rps : 0;
    }
  }

  return { code, kind: "flowchart", direction, nodes, edges, nodeById, edgeById };
}

function parseSequence(code: string): DiagramModel {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const nodeById: Record<string, DiagramNode> = {};
  const edgeById: Record<string, DiagramEdge> = {};
  const directives = parseDirectives(code);
  let edgeSeq = 0;

  const ensureNode = (id: string, label: string, line: number): DiagramNode => {
    if (nodeById[id]) return nodeById[id];
    const directive = directives.nodes[id];
    const node: DiagramNode = {
      id,
      label,
      shape: "participant",
      line,
      health: healthFromStatus(directive?.status),
      latency: numeric(directive?.latency, 0),
      cpu: directive?.cpu ? numeric(directive.cpu, 0) : undefined,
      rps: directive?.rps ? numeric(directive.rps, 0) : undefined,
    };
    nodeById[id] = node;
    nodes.push(node);
    return node;
  };

  code.split("\n").forEach((rawLine, index) => {
    const lineNo = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("%%")) return;
    if (/^sequenceDiagram\b/.test(trimmed)) return;
    if (/^(autonumber|title|note|loop|alt|else|opt|par|and|critical|break|rect|activate|deactivate)\b/i.test(trimmed)) return;

    const participant = trimmed.match(/^(?:participant|actor)\s+([\w.-]+)(?:\s+as\s+(.+))?$/i);
    if (participant) {
      ensureNode(participant[1], (participant[2] ?? participant[1]).trim(), lineNo);
      return;
    }

    const message = trimmed.match(/^([\w.]+(?:-[\w.]+)*)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*([\w.]+(?:-[\w.]+)*)\s*:\s*(.*)$/);
    if (!message) return;
    const [, from, arrow, to, text] = message;
    ensureNode(from, from, lineNo);
    ensureNode(to, to, lineNo);
    const kind: EdgeKind = arrow.includes("--") ? "async" : "sync";
    const parsedLabel = parseEdgeLabel(text);
    const directive = directives.edges[`${from}->${to}`];
    const id = `${from}->${to}#${edgeSeq++}`;
    const edge: DiagramEdge = {
      id,
      from,
      to,
      kind,
      label: text,
      rps: numeric(directive?.rps, parsedLabel.rps),
      latency: numeric(directive?.latency, defaultEdgeLatency(parsedLabel.rps)),
      line: lineNo,
    };
    edges.push(edge);
    edgeById[id] = edge;
  });

  return { code, kind: "sequence", direction: "LR", nodes, edges, nodeById, edgeById };
}

export function parseDiagram(code: string): DiagramModel {
  const normalized = code.replace(/\r\n/g, "\n");
  if (/^\s*(flowchart|graph)\b/m.test(normalized)) return parseFlowchart(normalized);
  if (/^\s*sequenceDiagram\b/m.test(normalized)) return parseSequence(normalized);
  return {
    code: normalized,
    kind: "unknown",
    direction: "TB",
    nodes: [],
    edges: [],
    nodeById: {},
    edgeById: {},
  };
}

// Lines that "belong" to a node: its declaration, every edge statement that
// references it, and its %% @node telemetry directive lines. Declaration first.
export function findNodeLines(model: DiagramModel, nodeId: string): number[] {
  const lines = new Set<number>();
  if (model.nodeById[nodeId]) lines.add(model.nodeById[nodeId].line);
  for (const edge of model.edges) {
    if (edge.from === nodeId || edge.to === nodeId) lines.add(edge.line);
  }
  const mention = new RegExp(`(?<![\\w-])${escapeRegExp(nodeId)}(?!\\w)`);
  model.code.split("\n").forEach((raw, index) => {
    if (raw.trim().startsWith("%%") && mention.test(raw)) lines.add(index + 1);
  });
  return [...lines].sort((a, b) => a - b);
}

export function findElementAtLine(
  model: DiagramModel,
  line: number,
): { nodes: string[]; edges: string[] } | null {
  const edgeIds = model.edges.filter((e) => e.line === line).map((e) => e.id);
  const nodeIds = new Set(model.nodes.filter((n) => n.line === line).map((n) => n.id));
  for (const edgeId of edgeIds) {
    const edge = model.edgeById[edgeId];
    if (edge) {
      nodeIds.add(edge.from);
      nodeIds.add(edge.to);
    }
  }
  if (!edgeIds.length && !nodeIds.size) return null;
  return { nodes: [...nodeIds], edges: edgeIds };
}

function directiveValues(patch: Record<string, string | number | undefined>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "health" || key === "status") {
      values.status = String(value);
    } else if (key === "latency") {
      values.latency = `${Math.round(Number(value))}ms`;
    } else if (key === "cpu") {
      values.cpu = String(value).includes("%") ? String(value) : `${value}%`;
    } else {
      values[key] = String(value);
    }
  }
  return values;
}

function mergeDirective(existing: string, values: Record<string, string>): Record<string, string> {
  const current = parseKv(existing);
  const merged: Record<string, string> = { ...current.extras };
  if (current.status) merged.status = current.status;
  if (current.cpu) merged.cpu = current.cpu;
  if (current.latency) merged.latency = current.latency;
  if (current.rps) merged.rps = current.rps;
  return { ...merged, ...values };
}

export function upsertNodeDirective(
  code: string,
  nodeId: string,
  patch: Record<string, string | number | undefined>,
): string {
  const values = directiveValues(patch);
  const lines = code.split("\n");
  const pattern = new RegExp(`^(\\s*)%%\\s*@node\\s+${escapeRegExp(nodeId)}\\b\\s*(.*)$`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index >= 0) {
    const indent = lines[index].match(/^\s*/)?.[0] ?? "";
    lines[index] = `${indent}${serializeDirective(`@node ${nodeId}`, mergeDirective(lines[index].replace(/^\s*%%\s*@node\s+\S+\s*/, ""), values))}`;
    return lines.join("\n");
  }
  const insertAt = lines.findIndex((line) => /^\s*%%/.test(line));
  const directive = serializeDirective(`@node ${nodeId}`, values);
  if (insertAt >= 0) {
    lines.splice(insertAt, 0, `  ${directive}`);
  } else {
    lines.push(`  ${directive}`);
  }
  return lines.join("\n");
}

export function applyNodeDirective(
  code: string,
  nodeId: string,
  patch: Record<string, string | number | undefined>,
): string {
  return upsertNodeDirective(code, nodeId, patch);
}

export function upsertEdgeDirective(
  code: string,
  from: string,
  to: string,
  patch: Record<string, string | number | undefined>,
): string {
  const values = directiveValues(patch);
  const lines = code.split("\n");
  const pattern = new RegExp(
    `^(\\s*)%%\\s*@edge\\s+${escapeRegExp(from)}\\s*->\\s*${escapeRegExp(to)}\\b\\s*(.*)$`,
  );
  const index = lines.findIndex((line) => pattern.test(line));
  if (index >= 0) {
    const indent = lines[index].match(/^\s*/)?.[0] ?? "";
    lines[index] = `${indent}${serializeDirective(
      `@edge ${from}->${to}`,
      mergeDirective(lines[index].replace(/^\s*%%\s*@edge\s+\S+\s*->\s*\S+\s*/, ""), values),
    )}`;
    return lines.join("\n");
  }
  const insertAt = lines.findIndex((line) => /^\s*%%/.test(line));
  const directive = serializeDirective(`@edge ${from}->${to}`, values);
  if (insertAt >= 0) lines.splice(insertAt, 0, `  ${directive}`);
  else lines.push(`  ${directive}`);
  return lines.join("\n");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextId(code: string, base: string): string {
  if (!new RegExp(`\\b${base}\\b`).test(code)) return base;
  let n = 2;
  while (new RegExp(`\\b${base}${n}\\b`).test(code)) n += 1;
  return `${base}${n}`;
}

export function insertSnippet(code: string, kind: SnippetKind): string {
  const model = parseDiagram(code);
  const isSequence = model.kind === "sequence";
  const lines = code.split("\n");
  const insertAt = Math.max(
    lines.findIndex((line) => /^\s*%%/.test(line)),
    0,
  ) || lines.length;

  const append = (block: string[]) => {
    const target = insertAt === 0 || insertAt >= lines.length ? lines.length : insertAt;
    const next = [...lines];
    next.splice(target, 0, ...block);
    return next.join("\n");
  };

  if (kind === "directive") {
    const target = model.nodes[model.nodes.length - 1]?.id ?? "A";
    return append([`  %% @node ${target} status=healthy cpu=40% latency=20ms`]);
  }

  if (isSequence) {
    if (kind === "subgraph") {
      return append(["  rect rgb(15, 23, 42)", "  note over A: Group", "  end"]);
    }
    const id = nextId(code, kind === "database" ? "NewDatabase" : kind === "queue" ? "NewQueue" : "NewService");
    const label = kind === "database" ? "New Database" : kind === "queue" ? "New Queue" : "New Service";
    return append([`  participant ${id} as ${label}`]);
  }

  if (kind === "service") {
    const id = nextId(code, "NewService");
    return append([`  ${id}[New Service]`]);
  }
  if (kind === "database") {
    const id = nextId(code, "NewDatabase");
    return append([`  ${id}[(New Database)]`]);
  }
  if (kind === "queue") {
    const id = nextId(code, "NewQueue");
    return append([`  ${id}{{New Queue}}`]);
  }
  const groupId = nextId(code, "NewGroup");
  const nodeId = nextId(code, "NewService");
  return append([`  subgraph ${groupId}[New Group]`, `    ${nodeId}[New Service]`, "  end"]);
}
