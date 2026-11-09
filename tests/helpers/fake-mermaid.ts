import { parseDiagram } from "../../src/lib/diagram";

const NODE_W = 132;
const NODE_H = 46;

export function fakeSvgFor(code: string): string {
  const model = parseDiagram(code);
  const gapX = 210;
  const positions = new Map<string, { x: number; y: number }>();
  model.nodes.forEach((node, index) => {
    positions.set(node.id, { x: 110 + index * gapX, y: 140 });
  });

  const width = Math.max(640, 160 + model.nodes.length * gapX);
  const nodes = model.nodes
    .map((node, index) => {
      const pos = positions.get(node.id)!;
      return `<g class="node default" id="flowchart-${node.id}-${index}" transform="translate(${pos.x},${pos.y})">
        <rect width="${NODE_W}" height="${NODE_H}" x="${-NODE_W / 2}" y="${-NODE_H / 2}" rx="6"></rect>
        <g class="label"><text class="nodeLabel">${node.label}</text></g>
      </g>`;
    })
    .join("");

  const edges = model.edges
    .map((edge, index) => {
      const from = positions.get(edge.from) ?? { x: 120, y: 300 + index * 40 };
      const to = positions.get(edge.to) ?? { x: 400, y: 300 + index * 40 };
      const x1 = from.x + NODE_W / 2;
      const x2 = to.x - NODE_W / 2;
      const y1 = from.y;
      const y2 = to.y;
      return `<path class="path" id="L-${edge.from}-${edge.to}-${index}" d="M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}"></path>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 360" width="${width}" height="360">
    <g class="edgePaths">${edges}</g>
    <g class="nodes">${nodes}</g>
  </svg>`;
}

export async function fakeRenderMermaid(code: string): Promise<string> {
  return fakeSvgFor(code);
}

export async function fakeValidateMermaid(code: string): Promise<void> {
  if (/BROKEN/.test(code) || /-->\s*$/.test(code.trim())) {
    throw new Error("Parse error on line 2:\n... A -->\nExpecting 'NODE_STRING'");
  }
}
