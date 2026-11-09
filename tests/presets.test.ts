import { describe, expect, it } from "vitest";
import { parseDiagram } from "../src/lib/diagram";
import { PRESETS } from "../src/lib/presets";
import { decodeShare, encodeShare } from "../src/lib/share";

describe("architecture presets", () => {
  it("ships five presets, each parseable", () => {
    expect(PRESETS).toHaveLength(5);
    for (const preset of PRESETS) {
      const model = parseDiagram(preset.code);
      expect(model.nodes.length, preset.id).toBeGreaterThan(2);
      expect(model.edges.length, preset.id).toBeGreaterThan(2);
    }
  });

  it("includes a high-level network topology preset", () => {
    const network = PRESETS.find((preset) => preset.id === "network-topology");
    expect(network).toBeDefined();
    const model = parseDiagram(network!.code);
    expect(model.kind).toBe("flowchart");
    expect(model.direction).toBe("TD");
    // Tier coverage: edge, core, perimeter, internal segmentation.
    const labels = model.nodes.map((node) => node.label).join(" ");
    expect(labels).toMatch(/Internet|ISP/i);
    expect(labels).toMatch(/Firewall/i);
    expect(labels).toMatch(/Core|Backbone/i);
    expect(labels).toMatch(/Load Balancer/i);
    // Subgraph bands mark the network segments (they are zones, not nodes).
    expect(network!.code).toMatch(/subgraph DMZ\[DMZ VLAN 10\]/);
    expect(network!.code).toMatch(/subgraph CORE\[Core Backbone VLAN 20\]/);
    // Mixed link kinds: routed, tunneled, and high-throughput links.
    expect(model.edges.some((edge) => edge.kind === "sync")).toBe(true);
    expect(model.edges.some((edge) => edge.kind === "async")).toBe(true);
    expect(model.edges.some((edge) => edge.kind === "thick")).toBe(true);
  });

  it("covers flowchart and sequence diagram kinds", () => {
    const kinds = PRESETS.map((p) => parseDiagram(p.code).kind);
    expect(kinds).toContain("flowchart");
    expect(kinds).toContain("sequence");
  });

  it("every preset carries node telemetry directives", () => {
    for (const preset of PRESETS) {
      expect(preset.code).toContain("%% @node");
      expect(parseDiagram(preset.code).nodes.some((n) => n.health !== "healthy")).toBe(true);
    }
  });

  it("keeps preset copy free of em dashes", () => {
    for (const preset of PRESETS) {
      expect(`${preset.name} ${preset.description}`).not.toContain("\u2014");
    }
  });

  it("gives every preset a unique id", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});

describe("share encoding", () => {
  it("round-trips code through the URL hash", () => {
    const code = "flowchart LR\n  A[One] --> B[Two]";
    const hash = encodeShare(code);
    expect(hash.startsWith("#")).toBe(true);
    expect(decodeShare(hash)).toBe(code);
  });

  it("survives unicode labels", () => {
    const code = "flowchart TD\n  A[Orders] --> B[Pembayaran]";
    expect(decodeShare(encodeShare(code))).toBe(code);
  });

  it("rejects an empty or corrupt hash without throwing", () => {
    expect(decodeShare("")).toBeNull();
    expect(decodeShare("#")).toBeNull();
    expect(decodeShare("#%%%not-base64")).toBeNull();
  });

  it("ignores unrelated hashes", () => {
    expect(decodeShare("#section-2")).toBeNull();
  });
});
