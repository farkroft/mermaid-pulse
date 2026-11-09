import { describe, expect, it } from "vitest";
import { parseDiagram } from "../src/lib/diagram";
import { buildOverlayGeometry, lineToPath, pathDirection, pointsAlongPath } from "../src/lib/overlay-geometry";

function svgFrom(markup: string, size = { width: 1000, height: 500 }): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  const svg = host.querySelector("svg")!;
  svg.getBoundingClientRect = () =>
    ({ width: size.width, height: size.height, top: 0, left: 0, x: 0, y: 0, right: size.width, bottom: size.height, toJSON: () => ({}) }) as DOMRect;
  return svg;
}

const FLOW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">
  <g class="nodes">
    <g class="node default" id="flowchart-Client-0" transform="translate(80,250)">
      <rect width="120" height="40" x="-60" y="-20"></rect>
    </g>
    <g class="node default" id="flowchart-Gateway-1" transform="translate(400,250)">
      <rect width="140" height="46" x="-70" y="-23"></rect>
    </g>
    <g class="node default" id="flowchart-DB-2" transform="translate(800,250)">
      <rect width="120" height="60" x="-60" y="-30"></rect>
    </g>
  </g>
  <g class="edgePaths">
    <path class="path" id="L-Client-Gateway-0" d="M140,250 L330,250"></path>
    <path class="path" id="L-Gateway-DB-1" d="M470,250 L740,250"></path>
  </g>
</svg>`;

const MODEL = parseDiagram(`flowchart LR
  Client[Client] --> Gateway[Gateway]
  Gateway --> DB[(DB)]`);

describe("overlay geometry", () => {
  it("converts a line element into path data", () => {
    expect(lineToPath(10, 20, 90, 40)).toBe("M10,20 L90,40");
  });

  it("maps mermaid node groups onto parsed model nodes", () => {
    const geometry = buildOverlayGeometry(svgFrom(FLOW_SVG), MODEL);
    expect(geometry.nodes.map((n) => n.id)).toEqual(["Client", "Gateway", "DB"]);
    const gateway = geometry.nodes.find((n) => n.id === "Gateway")!;
    expect(gateway.cx).toBeCloseTo(400, 0);
    expect(gateway.width).toBeCloseTo(140, 0);
    expect(gateway.health).toBe("healthy");
  });

  it("maps edge paths onto parsed model edges", () => {
    const geometry = buildOverlayGeometry(svgFrom(FLOW_SVG), MODEL);
    expect(geometry.edges).toHaveLength(2);
    expect(geometry.edges[0]).toMatchObject({ from: "Client", to: "Gateway", kind: "sync" });
    expect(geometry.edges[1].to).toBe("DB");
    expect(geometry.edges[0].path).toContain("M140");
  });

  it("falls back to element order when ids carry no model ids", () => {
    const svg = svgFrom(`<svg viewBox="0 0 400 200">
      <g class="nodes">
        <g class="node" id="flowchart-A-0"><rect width="80" height="30" x="-40" y="-15"/></g>
        <g class="node" id="flowchart-B-1"><rect width="80" height="30" x="-40" y="-15"/></g>
      </g>
      <g class="edgePaths">
        <path class="path" d="M0,0 L100,0"></path>
        <path class="path" d="M0,0 L100,0"></path>
      </g>
    </svg>`);
    const model = parseDiagram("flowchart LR\n A --> B\n B --> A");
    const geometry = buildOverlayGeometry(svg, model);
    expect(geometry.edges).toHaveLength(2);
    expect(geometry.edges[0].path).toBe("M0,0 L100,0");
  });

  it("reads sequence message lines as edges", () => {
    const svg = svgFrom(`<svg viewBox="0 0 800 400">
      <g class="nodes">
        <g class="node" id="C" transform="translate(100,40)"><rect width="120" height="40" x="-60" y="-20"/></g>
        <g class="node" id="A" transform="translate(400,40)"><rect width="120" height="40" x="-60" y="-20"/></g>
      </g>
      <line class="messageLine0" x1="160" y1="120" x2="340" y2="120"></line>
    </svg>`);
    const model = parseDiagram("sequenceDiagram\n  participant C as Client\n  participant A as Auth\n  C->>A: login");
    const geometry = buildOverlayGeometry(svg, model);
    expect(geometry.edges[0].path).toBe("M160,120 L340,120");
    expect(geometry.edges[0].kind).toBe("sync");
  });

  it("detects path direction for packet orientation", () => {
    expect(pathDirection("M0,0 L100,0")).toBe(1);
    expect(pathDirection("M100,0 L0,0")).toBe(-1);
    expect(pathDirection("M0,0 L0,100")).toBe(1);
  });

  it("samples points along a path for paused particles", () => {
    const points = pointsAlongPath("M0,0 L100,0", 4);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[3]).toEqual({ x: 100, y: 0 });
  });
});
