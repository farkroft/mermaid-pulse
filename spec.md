Use antislop during for this session.

You are a principal frontend systems architect and data-visualization engineer. Build "MermaidPulse: Live Interactive Mermaid Editor & Traffic Simulator"—a web application inspired by https://mermaid.live that accepts standard Mermaid.js syntax (`flowchart`, `graph`, `sequenceDiagram`) and transforms static diagrams into living, interactive architecture topologies with real-time traffic heartbeats, animated packet flows, latency telemetry, and click-to-inject chaos simulation.

Do not create external image or font files (R-23). Use standard `mermaid` SVG rendering enhanced with a custom SVG post-processing & animation overlay engine, Tailwind CSS, and Lucide icons. Execute using strict TDD (Red -> Green -> Refactor).

---

### 1. Design Direction & Anti-Slop Purpose Ledger (R-37)
- **Identity & Mood:** Precision Network Telemetry Studio & Live Diagramming IDE (`#050810` obsidian canvas, `#0b1120` editor surface, `#38bdf8` active packet cyan, `#10b981` healthy heartbeat emerald, `#f59e0b` high-latency amber, `#f43f5e` dropped-packet/outage crimson).
- **Typography:** Clean geometric sans (`Inter`/`system-ui`) for UI controls and ligature-friendly monospace (`JetBrains Mono`) for the Mermaid code editor, inline telemetry badges, and RPS counters.
- **Purpose-Gated Visual Techniques:**
  1. *Animated SVG Packet Pulses & `<animateMotion>` Along Edges (Purpose):* Visualizes request direction, throughput (RPS), and link latency directly on standard Mermaid arrows (`-->`, `-.->`, `==>`) so users see how traffic moves through their architecture.
  2. *Node Heartbeat Rings & Status LEDs (Purpose):* Communicates real-time node health (`Healthy`, `Degraded`, `Down`) at a glance without cluttering the node label text.
  3. *Downstream Blast-Radius Coloring (Purpose):* When a user clicks a node to simulate an outage or latency spike, upstream/downstream edges visually reflect backpressure and dropped requests.
  4. *Two-Way Editor-to-Canvas Highlighting (Purpose):* Hovering a node or edge on the canvas highlights its exact line in the Mermaid code editor (and vice versa) for effortless editing of complex diagrams.

---

### 2. Core Technical Engine: Mermaid-to-Live-SVG Pipeline

1. **100% Standard Mermaid Syntax + Optional Live Directives:**
   - Must parse and render standard Mermaid syntax (`flowchart TD`, `flowchart LR`, `graph TD`, `sequenceDiagram`, subgraphs, cylinder databases `[(DB)]`, hexagons `{{Queue}}`, etc.) out of the box.
   - Automatically animate every rendered Mermaid edge (`.edgePath path`, `.flowchart-link`, `.messageLine0`) with live traffic pulses by default.
   - Support optional lightweight Mermaid comment directives so users can script telemetry directly in code:
     ```mermaid
     flowchart LR
       Client([Client App]) -->|120 rps| Gateway[API Gateway]
       Gateway -->|80 rps| Auth[Auth Service]
       Gateway -.->|40 rps| Kafka{{Event Bus}}
       Auth --> DB[(Postgres Primary)]
       %% @node Auth status=healthy cpu=42% latency=12ms
       %% @node DB status=degraded cpu=88% latency=185ms
     ```

2. **SVG Post-Processor & Live Overlay Engine:**
   - After `mermaid.render()` outputs the SVG DOM:
     * **Edge Traffic Animator:** Inspect every SVG edge `<path>`. Inject a subtle glowing base track and animated `<circle>` packet particles using SVG `<animateMotion>` (or `requestAnimationFrame` along `path.getPointAtLength()`) whose speed scales with latency and whose particle density scales with RPS.
     * **Link Style Mapping:**
       - Solid arrows (`-->`) = Synchronous HTTP/gRPC pulses (cyan `#38bdf8`).
       - Dotted arrows (`-.->`) = Async event/queue bursts (purple/amber `#a855f7` / `#f59e0b`).
       - Thick arrows (`==>`) = High-throughput data pipelines (dual-lane emerald `#10b981`).
     * **Interactive Node Augmentation:** Attach click and hover listeners to every `.node` group in the SVG. Inject an anchored status heartbeat indicator (pulsing ring + micro-badge showing live latency/RPS) on each node.

---

### 3. Core Interactive Features

1. **Split Live Code Editor (Left Pane):**
   - Line-numbered Mermaid code editor with instant debounced live preview (under 100ms).
   - Syntax error banner that pins the exact line number and error message without crashing or blanking out the last valid diagram state.
   - **Quick-Insert Snippet Bar:** 1-click buttons to insert nodes (`+ Service`, `+ Database [( )]`, `+ Queue {{ }}`, `+ Subgraph`, `+ Traffic Rule %% @node`).
   - **Built-in Architecture Presets:**
     * *Kubernetes Ingress & Microservices Mesh*
     * *Event-Driven Kafka & Worker Pipeline*
     * *Multi-Region Active-Active Database Failover*
     * *High-Concurrency Checkout Sequence Diagram*

2. **Interactive Canvas with Pan, Zoom & Chaos Inspection (Center/Right Pane):**
   - Smooth pan and cursor-centered zoom (`0.25x` to `3x`) with `Fit to Screen`, `Center`, and `Reset Zoom` controls.
   - **Click-to-Inspect & Chaos Popover:** Clicking any rendered Mermaid node opens a sleek floating inspector card anchored to that node:
     * **Health State Toggle:** Switch node between `Healthy (200 OK)`, `Degraded / High Latency (600ms)`, and `Outage / Circuit Open (503)`.
     * **Blast Radius Simulation:** Setting a node to `Outage` immediately turns incoming edges crimson with bouncing/dropped packet animations, halts outgoing downstream traffic pulses, and increments the global Error Rate counter.
     * **Throughput Slider:** Adjust node/edge RPS (`0` to `5000 RPS`) and watch packet flow density update immediately on the canvas and write back to the `%% @node` directive in the editor.

3. **Global Heartbeat & Traffic Simulation Controller (Bottom Dock):**
   - **Simulation Controls:** `Play / Pause Traffic`, `Step Single Request` (traces a single glowing request hop-by-hop from entry node to leaf node), and `Traffic Load Multiplier` (`1x Normal`, `5x Peak`, `20x DDoS Stress`).
   - **Live Cluster Telemetry Readout:** Real-time aggregated metrics calculated from the active graph (`Active Nodes`, `Total Throughput (RPS)`, `End-to-End P99 Latency (ms)`, `Success Rate (%)`).
   - **Export Suite:** `Copy Mermaid Code`, `Download Animated SVG`, and `Share Encoded URL Hash`.

---

### 4. Viewport-Locked UI Layout (`100vh` — Craftsmanship C-3)

Lock the application strictly inside `w-screen h-screen overflow-hidden flex flex-col bg-[#050810] text-slate-100 select-none`:
- **Top Header (`h-14`):** App brand + version pill, Architecture Preset selector dropdown, `Traffic Mode` toggle (`Live
