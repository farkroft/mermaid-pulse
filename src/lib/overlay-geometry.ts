import type { DiagramEdge, DiagramModel, DiagramNode, EdgeKind } from "./diagram";

export interface NodeGeometry {
  id: string;
  model: DiagramNode;
  cx: number;
  cy: number;
  width: number;
  height: number;
  label: string;
  health: DiagramNode["health"];
  element: SVGGElement;
}

export interface EdgeGeometry {
  id: string;
  model: DiagramEdge;
  from: string;
  to: string;
  kind: EdgeKind;
  path: string;
  direction: 1 | -1;
  element: SVGPathElement | SVGLineElement;
}

export interface OverlayGeometry {
  nodes: NodeGeometry[];
  edges: EdgeGeometry[];
  viewBox: { x: number; y: number; width: number; height: number };
}

const EDGE_SELECTOR = [
  ".edgePaths path",
  "path.flowchart-link",
  "path.messageLine0",
  "path.messageLine1",
  "line.messageLine0",
  "line.messageLine1",
].join(",");

const NODE_SELECTOR =
  "g.node, g.actor, g[data-et='participant'], g[id^='root-'], g[id^='participant-']";

export function lineToPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${x1},${y1} L${x2},${y2}`;
}

function transformTranslate(element: Element): { x: number; y: number } {
  const transform = element.getAttribute("transform") ?? "";
  const translate = transform.match(/translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/);
  if (translate) return { x: Number(translate[1]), y: Number(translate[2]) };
  const matrix = transform.match(/matrix\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/);
  if (matrix) return { x: Number(matrix[5]), y: Number(matrix[6]) };
  return { x: 0, y: 0 };
}

function bbox(element: Element): { x: number; y: number; width: number; height: number } {
  const target = element as SVGGraphicsElement;
  if (typeof target.getBBox === "function") {
    try {
      const box = target.getBBox();
      if (box.width || box.height) return box;
    } catch {
      // detached node: fall through to attribute math
    }
  }
  const rect = element.querySelector("rect");
  if (rect) {
    const width = Number(rect.getAttribute("width") ?? 0);
    const height = Number(rect.getAttribute("height") ?? 0);
    const x = Number(rect.getAttribute("x") ?? 0);
    const y = Number(rect.getAttribute("y") ?? 0);
    return { x, y, width, height };
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}

function idFromElementId(raw: string): string | null {
  if (!raw) return null;
  let id = raw.replace(/^(flowchart|sequence|state|graph)-/, "");
  id = id.replace(/^L-/, "");
  id = id.replace(/^root-/, "");
  id = id.replace(/^participant-/, "");
  id = id.replace(/-\d+$/, "");
  if (id.startsWith("node-")) id = id.slice(5);
  return id || null;
}

// Sequence participants expose the model id on data-id, not on the group id.
function idFromDataset(group: Element): string | null {
  const direct = group.getAttribute("data-id");
  if (direct) return direct;
  const inner = group.querySelector("[data-id]");
  return inner?.getAttribute("data-id") ?? null;
}

function candidatesFromEdgeId(raw: string): string[] {
  if (!raw) return [];
  const stripped = raw.replace(/^L-/, "").replace(/-\d+$/, "");
  return stripped.split("-").filter(Boolean);
}

function nodeLabel(group: Element): string {
  const label = group.querySelector(".nodeLabel, .label, text, .actor, tspan");
  const text = (label?.textContent ?? "").trim();
  if (text) return text;
  const rect = group.querySelector("rect");
  return (rect?.getAttribute("name") ?? "").trim();
}

function elementPath(element: Element): string {
  if (element.tagName.toLowerCase() === "line") {
    const line = element as SVGLineElement;
    const num = (name: string) => Number(line.getAttribute(name) ?? 0);
    return lineToPath(num("x1"), num("y1"), num("x2"), num("y2"));
  }
  return element.getAttribute("d") ?? "";
}

function edgeKindFromElement(element: Element, model: DiagramEdge | undefined): EdgeKind {
  if (model) return model.kind;
  const className = element.getAttribute("class") ?? "";
  if (className.includes("edge-pattern-dotted") || className.includes("messageLine1")) return "async";
  if (className.includes("edge-thickness-thick")) return "thick";
  return "sync";
}

export function buildOverlayGeometry(svg: SVGSVGElement, model: DiagramModel): OverlayGeometry {
  const nodeElements = [...svg.querySelectorAll<SVGGElement>(NODE_SELECTOR)].filter(
    (group) => !group.closest(".edgePaths"),
  );

  const nodes: NodeGeometry[] = [];
  const used = new Set<string>();

  for (const group of nodeElements) {
    const byId = idFromElementId(group.id);
    const byDataset = idFromDataset(group);
    const label = nodeLabel(group);
    const match =
      (byId && model.nodeById[byId]) ||
      (byDataset && model.nodeById[byDataset]) ||
      model.nodes.find((n) => n.label === label && !used.has(n.id)) ||
      model.nodes.find((n) => n.id === label && !used.has(n.id)) ||
      model.nodes.find((n) => !used.has(n.id));

    if (!match) continue;
    const box = bbox(group);
    const translate = transformTranslate(group);
    const hasTransform = translate.x !== 0 || translate.y !== 0;
    const cx = hasTransform ? translate.x : box.x + box.width / 2;
    const cy = hasTransform ? translate.y : box.y + box.height / 2;
    used.add(match.id);
    nodes.push({
      id: match.id,
      model: match,
      cx,
      cy,
      width: Math.max(box.width, 40),
      height: Math.max(box.height, 24),
      label: match.label,
      health: match.health,
      element: group,
    });
  }

  const edgeElements = [...svg.querySelectorAll<SVGPathElement | SVGLineElement>(EDGE_SELECTOR)];
  const edges: EdgeGeometry[] = [];
  const usedEdges = new Set<string>();

  for (const element of edgeElements) {
    const d = elementPath(element);
    if (!d) continue;

    const candidates = candidatesFromEdgeId(element.id);
    let match: DiagramEdge | undefined;

    if (candidates.length >= 2) {
      const from = candidates[0];
      const to = candidates[candidates.length - 1];
      match = model.edges.find(
        (edge) => edge.from === from && edge.to === to && !usedEdges.has(edge.id),
      );
      if (!match) {
        const looser = candidates.join("");
        match = model.edges.find(
          (edge) =>
            !usedEdges.has(edge.id) &&
            (looser.includes(edge.from) || looser.includes(edge.to)),
        );
      }
    }

    if (!match) {
      match = model.edges.find((edge) => !usedEdges.has(edge.id));
    }

    if (match) usedEdges.add(match.id);
    const kind = edgeKindFromElement(element, match);
    const from = match?.from ?? candidates[0] ?? "";
    const to = match?.to ?? candidates[candidates.length - 1] ?? "";

    edges.push({
      id: match?.id ?? element.id ?? `edge-${edges.length}`,
      model:
        match ?? {
          id: element.id ?? `edge-${edges.length}`,
          from,
          to,
          kind,
          rps: 0,
          latency: 20,
          line: 0,
        },
      from,
      to,
      kind,
      path: d,
      direction: pathDirection(d),
      element,
    });
  }

  return {
    nodes,
    edges,
    viewBox: readViewBox(svg),
  };
}

function readViewBox(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const [x, y, width, height] = viewBox.split(/[\s,]+/).map(Number);
    if ([x, y, width, height].every(Number.isFinite)) return { x, y, width, height };
  }
  const width = svg.getBoundingClientRect().width || 800;
  const height = svg.getBoundingClientRect().height || 600;
  return { x: 0, y: 0, width, height };
}

interface Command {
  code: string;
  values: number[];
}

function tokenizePath(d: string): Command[] {
  const commands: Command[] = [];
  const pattern = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(d))) {
    const values = (match[2].match(/-?[\d.]+(?:e-?\d+)?/gi) ?? []).map(Number);
    commands.push({ code: match[1], values });
  }
  return commands;
}

function samplePath(d: string): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let prevControlX = 0;
  let prevControlY = 0;

  for (const command of tokenizePath(d)) {
    const { code, values } = command;
    const relative = code === code.toLowerCase();
    const upper = code.toUpperCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;

    if (upper === "M") {
      x = ox + (values[0] ?? 0);
      y = oy + (values[1] ?? 0);
      startX = x;
      startY = y;
      points.push({ x, y });
      for (let i = 2; i + 1 < values.length; i += 2) {
        x = ox + values[i];
        y = oy + values[i + 1];
        points.push({ x, y });
      }
      continue;
    }
    if (upper === "L") {
      for (let i = 0; i + 1 < values.length; i += 2) {
        x = ox + values[i];
        y = oy + values[i + 1];
        points.push({ x, y });
      }
      continue;
    }
    if (upper === "H") {
      for (const value of values) {
        x = ox + value;
        points.push({ x, y });
      }
      continue;
    }
    if (upper === "V") {
      for (const value of values) {
        y = oy + value;
        points.push({ x, y });
      }
      continue;
    }
    if (upper === "C") {
      for (let i = 0; i + 5 < values.length; i += 6) {
        const c1x = ox + values[i];
        const c1y = oy + values[i + 1];
        const c2x = ox + values[i + 2];
        const c2y = oy + values[i + 3];
        const endX = ox + values[i + 4];
        const endY = oy + values[i + 5];
        const fromX = x;
        const fromY = y;
        const segments = 12;
        for (let s = 1; s <= segments; s += 1) {
          const t = s / segments;
          const mt = 1 - t;
          points.push({
            x: mt ** 3 * fromX + 3 * mt ** 2 * t * c1x + 3 * mt * t ** 2 * c2x + t ** 3 * endX,
            y: mt ** 3 * fromY + 3 * mt ** 2 * t * c1y + 3 * mt * t ** 2 * c2y + t ** 3 * endY,
          });
        }
        x = endX;
        y = endY;
        prevControlX = c2x;
        prevControlY = c2y;
      }
      continue;
    }
    if (upper === "S") {
      for (let i = 0; i + 3 < values.length; i += 4) {
        const c1x = 2 * x - prevControlX;
        const c1y = 2 * y - prevControlY;
        const c2x = ox + values[i];
        const c2y = oy + values[i + 1];
        const endX = ox + values[i + 2];
        const endY = oy + values[i + 3];
        const fromX = x;
        const fromY = y;
        const segments = 12;
        for (let s = 1; s <= segments; s += 1) {
          const t = s / segments;
          const mt = 1 - t;
          points.push({
            x: mt ** 3 * fromX + 3 * mt ** 2 * t * c1x + 3 * mt * t ** 2 * c2x + t ** 3 * endX,
            y: mt ** 3 * fromY + 3 * mt ** 2 * t * c1y + 3 * mt * t ** 2 * c2y + t ** 3 * endY,
          });
        }
        x = endX;
        y = endY;
        prevControlX = c2x;
        prevControlY = c2y;
      }
      continue;
    }
    if (upper === "Q") {
      for (let i = 0; i + 3 < values.length; i += 4) {
        const cx = ox + values[i];
        const cy = oy + values[i + 1];
        const endX = ox + values[i + 2];
        const endY = oy + values[i + 3];
        const fromX = x;
        const fromY = y;
        for (let s = 1; s <= 10; s += 1) {
          const t = s / 10;
          const mt = 1 - t;
          points.push({
            x: mt * mt * fromX + 2 * mt * t * cx + t * t * endX,
            y: mt * mt * fromY + 2 * mt * t * cy + t * t * endY,
          });
        }
        x = endX;
        y = endY;
      }
      continue;
    }
    if (upper === "A") {
      for (let i = 0; i + 6 < values.length; i += 7) {
        x = ox + values[i + 5];
        y = oy + values[i + 6];
        points.push({ x, y });
      }
      continue;
    }
    if (upper === "Z") {
      points.push({ x: startX, y: startY });
      x = startX;
      y = startY;
    }
  }

  return points.length ? points : [{ x: 0, y: 0 }];
}

function cumulative(points: Array<{ x: number; y: number }>): number[] {
  const distances = [0];
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    distances.push(distances[i - 1] + Math.hypot(dx, dy));
  }
  return distances;
}

export function pointsAlongPath(d: string, count: number): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  const points = samplePath(d);
  const distances = cumulative(points);
  const total = distances[distances.length - 1];
  if (total === 0) return Array.from({ length: count }, () => points[0]);

  const result: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const target = (total * i) / Math.max(1, count - 1);
    let index = distances.findIndex((value) => value >= target);
    if (index <= 0) index = 1;
    const previous = index - 1;
    const span = distances[index] - distances[previous] || 1;
    const t = (target - distances[previous]) / span;
    result.push({
      x: points[previous].x + (points[index].x - points[previous].x) * t,
      y: points[previous].y + (points[index].y - points[previous].y) * t,
    });
  }
  return result;
}

export function pathDirection(d: string): 1 | -1 {
  const points = samplePath(d);
  if (points.length < 2) return 1;
  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : -1;
  return dy >= 0 ? 1 : -1;
}
