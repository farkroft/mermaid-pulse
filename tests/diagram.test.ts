import { describe, expect, it } from "vitest";
import {
  applyNodeDirective,
  findElementAtLine,
  insertSnippet,
  parseDiagram,
  upsertEdgeDirective,
  upsertNodeDirective,
} from "../src/lib/diagram";

const SAMPLE = `flowchart LR
  Client([Client App]) -->|120 rps| Gateway[API Gateway]
  Gateway -->|80 rps| Auth[Auth Service]
  Gateway -.->|40 rps| Kafka{{Event Bus}}
  Auth ==>|900 rps| DB[(Postgres Primary)]
  %% @node Auth status=healthy cpu=42% latency=12ms
  %% @node DB status=degraded cpu=88% latency=185ms`;

describe("parseDiagram: flowchart", () => {
  const model = parseDiagram(SAMPLE);

  it("detects the diagram kind and direction", () => {
    expect(model.kind).toBe("flowchart");
    expect(model.direction).toBe("LR");
  });

  it("collects every node with label, shape and source line", () => {
    expect(model.nodes.map((n) => n.id)).toEqual(["Client", "Gateway", "Auth", "Kafka", "DB"]);
    expect(model.nodes[0].label).toBe("Client App");
    expect(model.nodes[0].shape).toBe("stadium");
    expect(model.nodes[3].shape).toBe("hexagon");
    expect(model.nodes[4].shape).toBe("cylinder");
    expect(model.nodes[1].line).toBe(2);
  });

  it("maps arrow syntax to traffic classes", () => {
    const kinds = model.edges.map((e) => e.kind);
    expect(kinds).toEqual(["sync", "sync", "async", "thick"]);
  });

  it("reads throughput from the edge label", () => {
    expect(model.edges.map((e) => e.rps)).toEqual([120, 80, 40, 900]);
  });

  it("applies @node directives onto parsed nodes", () => {
    const auth = model.nodeById.Auth;
    const db = model.nodeById.DB;
    expect(auth.health).toBe("healthy");
    expect(auth.cpu).toBe(42);
    expect(auth.latency).toBe(12);
    expect(db.health).toBe("degraded");
    expect(db.latency).toBe(185);
  });

  it("keeps the source line of each edge", () => {
    expect(model.edges[0].line).toBe(2);
    expect(model.edges[3].line).toBe(5);
  });

  it("indexes nodes and edges by source line for two-way highlighting", () => {
    const hit = findElementAtLine(model, 3);
    expect(hit?.nodes).toContain("Gateway");
    expect(hit?.edges.length).toBeGreaterThan(0);
  });
});

describe("parseDiagram: robustness", () => {
  it("parses chained edges and multiple sources", () => {
    const model = parseDiagram(`graph TD
  A[Start] --> B[Middle] --> C[End]
  A --> D[Side]`);
    expect(model.edges.map((e) => `${e.from}>${e.to}`)).toEqual([
      "A>B",
      "B>C",
      "A>D",
    ]);
  });

  it("parses subgraphs without treating them as nodes", () => {
    const model = parseDiagram(`flowchart TD
  subgraph Mesh[Service Mesh]
    A[Ingress] --> B[Sidecar]
  end
  B --> C[(Store)]`);
    expect(model.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
    expect(model.edges).toHaveLength(2);
  });

  it("ignores styling and click directives", () => {
    const model = parseDiagram(`flowchart TD
  A[One] --> B[Two]
  classDef hot fill:#f00
  class A hot
  style B fill:#0f0
  click A call focus()
  linkStyle 0 stroke:#fff`);
    expect(model.nodes).toHaveLength(2);
    expect(model.edges).toHaveLength(1);
  });

  it("returns an unknown model for empty source", () => {
    const model = parseDiagram("");
    expect(model.kind).toBe("unknown");
    expect(model.nodes).toHaveLength(0);
  });
});

describe("parseDiagram: sequenceDiagram", () => {
  const code = `sequenceDiagram
  participant C as Client
  participant A as Auth
  participant D as Database
  C->>A: POST /login
  A-->>C: 200 token
  A->>D: SELECT user`;

  const model = parseDiagram(code);

  it("treats participants as nodes and messages as edges", () => {
    expect(model.kind).toBe("sequence");
    expect(model.nodes.map((n) => n.label)).toEqual(["Client", "Auth", "Database"]);
    expect(model.edges).toHaveLength(3);
  });

  it("keeps message direction and async style", () => {
    expect(model.edges[0]).toMatchObject({ from: "C", to: "A", kind: "sync" });
    expect(model.edges[1]).toMatchObject({ from: "A", to: "C", kind: "async" });
  });

  it("registers participants that only appear in messages", () => {
    const m = parseDiagram(`sequenceDiagram
  A->>B: hello`);
    expect(m.nodes.map((n) => n.id)).toEqual(["A", "B"]);
  });
});

describe("directive write-back", () => {
  it("updates an existing @node directive in place", () => {
    const next = upsertNodeDirective(SAMPLE, "DB", { health: "outage", latency: 640 });
    const lines = next.split("\n");
    expect(lines[6].trim()).toBe("%% @node DB status=outage cpu=88% latency=640ms");
    expect(lines.filter((l) => l.includes("@node DB"))).toHaveLength(1);
  });

  it("appends a directive when the node has none", () => {
    const next = upsertNodeDirective(SAMPLE, "Gateway", { health: "healthy", rps: 480 });
    expect(next).toContain("%% @node Gateway status=healthy");
    expect(parseDiagram(next).nodeById.Gateway.rps).toBe(480);
  });

  it("writes @edge directives without duplicating", () => {
    const once = upsertEdgeDirective(SAMPLE, "Gateway", "Auth", { rps: 640, latency: 40 });
    const twice = upsertEdgeDirective(once, "Gateway", "Auth", { rps: 300 });
    expect(twice.match(/@edge Gateway->Auth/g)).toHaveLength(1);
    const edge = parseDiagram(twice).edges.find((e) => e.from === "Gateway" && e.to === "Auth");
    expect(edge?.rps).toBe(300);
    expect(edge?.latency).toBe(40);
  });

  it("applies a node patch without touching other directives", () => {
    const patched = applyNodeDirective(SAMPLE, "Auth", { health: "degraded" });
    const model = parseDiagram(patched);
    expect(model.nodeById.Auth.health).toBe("degraded");
    expect(model.nodeById.DB.health).toBe("degraded");
  });
});

describe("quick insert snippets", () => {
  const base = "flowchart LR\n  A[Start] --> B[End]";

  it("inserts a valid service node", () => {
    const code = insertSnippet(base, "service");
    const model = parseDiagram(code);
    expect(model.nodes.some((n) => n.label === "New Service")).toBe(true);
  });

  it("inserts a database with cylinder syntax", () => {
    const code = insertSnippet(base, "database");
    expect(code).toContain("[(");
    expect(parseDiagram(code).nodes.some((n) => n.shape === "cylinder")).toBe(true);
  });

  it("inserts a queue with hexagon syntax", () => {
    const code = insertSnippet(base, "queue");
    expect(parseDiagram(code).nodes.some((n) => n.shape === "hexagon")).toBe(true);
  });

  it("inserts a balanced subgraph block", () => {
    const code = insertSnippet(base, "subgraph");
    expect(code.match(/subgraph/g)).toHaveLength(1);
    expect(code.match(/end/g)).toHaveLength(1);
  });

  it("inserts a telemetry directive that targets a real node", () => {
    const code = insertSnippet(base, "directive");
    expect(code).toContain("%% @node B status=");
    expect(parseDiagram(code).nodeById.B).toBeDefined();
  });

  it("uses participant syntax inside a sequence diagram", () => {
    const code = insertSnippet("sequenceDiagram\n  A->>B: ping", "service");
    expect(code).toContain("participant NewService as New Service");
  });
});
