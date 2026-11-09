import { describe, expect, it } from "vitest";
import { buildStandaloneSvg, sanitizeFileName } from "../src/lib/export-svg";

describe("standalone SVG export", () => {
  it("adds the xmlns declaration and strips interactive handlers", () => {
    const svg = `<svg viewBox="0 0 100 100"><g class="node" onclick="alert(1)"><rect width="10" height="10"/></g></svg>`;
    const output = buildStandaloneSvg(svg, `<circle r="2"/>`, "MermaidPulse");
    expect(output).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(output).not.toContain("onclick");
    expect(output).toContain("<title>MermaidPulse</title>");
    expect(output).toContain('<circle r="2"/>');
  });

  it("keeps the viewBox and adds a background rect", () => {
    const output = buildStandaloneSvg(
      `<svg viewBox="0 0 320 200"><rect width="1" height="1"/></svg>`,
      "",
      "Diagram",
    );
    expect(output).toContain('viewBox="0 0 320 200"');
    expect(output).toContain("#050810");
    expect(output).toContain("<title>Diagram</title>");
  });

  it("produces safe file names", () => {
    expect(sanitizeFileName("Kubernetes Ingress & Mesh: v2")).toBe("kubernetes-ingress-mesh-v2.svg");
    expect(sanitizeFileName("   ")).toBe("mermaidpulse-diagram.svg");
  });
});
