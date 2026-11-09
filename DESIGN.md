# DESIGN.md: MermaidPulse (Live Interactive Mermaid Editor & Traffic Simulator)

This document defines the visual direction, spatial layout, interactive SVG animation rules, and quality locks for **MermaidPulse**. It serves as the single source of truth for design fields (identity, personality, palette, typography, mood, and dials) consumed alongside the anti-slop quality framework.

## 1. Identity, Personality & Mood

* **Product Identity:** A live architecture diagramming IDE and real-time network traffic simulator that turns standard Mermaid syntax into an interactive topology with animated packet pulses, node heartbeats, and chaos injection controls.
* **Target Audience:** Platform engineers, distributed systems architects, SREs, and backend developers who use diagrams to model throughput, latency bottlenecks, and failure blast radiuses.
* **Personality:** Crisp, analytical, responsive, and tactile. It pairs the speed of a text-first markdown editor with the live observability of a production network telemetry console.
* **Mood:** High-contrast systems control room. Deep obsidian and slate surfaces stay visually quiet so animated SVG packet flows, latency heatmaps, and fault states stand out immediately.
* **Uniqueness Benchmark:** Without a logo or header title, the interface is immediately identifiable by its split-pane Mermaid code sync, glowing SVG packet spheres traveling along diagram edges, pulsing node heartbeat rings, and anchored chaos injection popover cards.

## 2. Liveliness Toolkit (Dials & Levers)

Dial: ENERGY 2 / RHYTHM 2 / MOTION 3

### How the Dials Govern Visual Decisions

* **ENERGY 2 (Controlled Diagnostic Contrast):** Saturated neon accents are restricted strictly to active packet particles, health status rings, and syntax highlights against a calm, low-luminance canvas.
* **RHYTHM 2 (Balanced IDE Proportions):** The screen divides cleanly into a fixed-width code authoring pane on the left and an expansive, unobstructed interactive vector canvas on the right (at least 65% of total viewport width).
* **MOTION 3 (State-Driven Telemetry Flow):** Continuous, deterministic SVG motion encodes system behavior. Particle velocity reflects edge latency in milliseconds, particle density reflects throughput in requests per second, and node outages visibly halt downstream packet propagation.

### Active Levers

1. **One Focal Point Per Screen:** The interactive Mermaid SVG topology on the right canvas is the primary focal point. The left editor and bottom controller bar use subtle borders and recessed surface tones so they never compete with the live diagram.
2. **Two-Way Visual Binding:** Hovering a line of Mermaid code highlights the corresponding SVG node or edge on the canvas, and hovering a canvas element highlights its source line in the editor.
3. **Semantic Motion Encoding:** Animation speed and color are never arbitrary; every moving element maps directly to a numeric rate, latency value, or health status in the simulation store.

## 3. Purpose-Gate Ledger

Every visual treatment must serve a functional diagnostic or authoring goal. Any decorative effect not justified below must be omitted.

| Visual Technique | Primary UI Target | Functional Purpose | Strict Constraint |
| :--- | :--- | :--- | :--- |
| **Obsidian Canvas** | Right SVG stage | Maximizes contrast for glowing packet trails | Never use pure black on cards |
| **SVG Packet Motion** | Diagram edge paths | Encodes request direction, RPS, and latency | Scale speed and count by metrics |
| **Node Heartbeat Ring** | Diagram node perimeter | Shows health state without text clutter | Pulse only on degraded or outage |
| **Backdrop Blur Dock** | Floating canvas overlays | Preserves diagram visibility beneath controls | Limit to bottom dock and popovers |
| **Blast-Radius Tint** | Upstream and downstream edges | Highlights cascading failure paths on outage | Trigger only during fault states |

### Ledger Explanations and Boundaries

* **Obsidian Canvas (`#050810`):** Provides a low-glare backdrop so 1px vector edges and 3px glowing packet spheres remain legible across zoom levels from 0.25x to 3.0x. Elevated panels must use slate tones (`#0B1120` to `#1E293B`) with explicit 1px borders.
* **SVG Packet Motion (`<animateMotion>`):** Standard Mermaid edges are augmented post-render with moving circle particles. Synchronous links (`-->`), asynchronous queues (`-.->`), and heavy data pipes (`==>`) use distinct stroke patterns and particle colors.
* **Node Heartbeat Ring:** Each rendered Mermaid `.node` group receives a subtle status badge and perimeter ring. Healthy nodes display a steady emerald dot, degraded nodes pulse amber at a 1.5s interval, and outage nodes flash crimson while rejecting incoming packets.
* **Backdrop Blur Dock (`backdrop-blur-md`):** Applied only to the floating zoom toolbar, contextual Chaos Inspector popover, and bottom Heartbeat Controller dock so pan/zoom context is never lost.
* **Blast-Radius Tint:** When a node is switched to **Outage (503)**, incoming edges turn crimson with dropped-packet bounce animations, and downstream outgoing edges dim to 25% opacity with zero flowing particles.

## 4. Color Palette & Contrast Locks

All typography and active icon pairings must satisfy WCAG AA contrast minimums ($\ge 4.5:1$ for body copy and code, $\ge 3.0:1$ for large headers and active UI borders).

### Surface Tokens

* **Canvas Void:** `#050810` (Interactive SVG pan/zoom stage background with `#1E293B` radial dot grid)
* **Editor Surface:** `#0B1120` (Left pane Mermaid code editor background)
* **Elevated HUD Surface:** `rgba(15, 23, 42, 0.85)` (`bg-slate-900/85` with `backdrop-blur-md` for floating docks and popovers)
* **Code Gutter & Inactive Tab:** `#0F172A` (Line number gutter, snippet bar, and secondary cards)
* **Structural Hairline Border:** `rgba(51, 65, 85, 0.65)` (`border-slate-700/65` for pane dividers and card outlines)
* **Active Focus & Selection Border:** `#38BDF8` (Selected SVG node outline, active editor line border, keyboard focus ring)

### Semantic Traffic & Health Tokens

* **Synchronous Traffic (Electric Cyan):** `#38BDF8` (Standard HTTP/gRPC `-->` request packets and active selection highlights)
* **Asynchronous Event Flow (Vibrant Violet):** `#A855F7` (Dotted `-.->` pub/sub and queue message bursts)
* **High-Throughput Pipeline (Emerald):** `#10B981` (Thick `==>` data stream lanes and healthy **200 OK** node heartbeats)
* **Degraded / High Latency (Cyber Amber):** `#F59E0B` (Elevated P99 latency warnings, backpressure queues, and syntax warning banners)
* **Outage / Circuit Open (Crimson):** `#F43F5E` (**503 Outage** state, dropped packet animations, and Mermaid syntax error line pins)

### Text Hierarchy Tokens

* **Primary Text:** `#F8FAFC` (`slate-50`, contrast ratio $17.8:1$ on editor surface)
* **Secondary Text:** `#CBD5E1` (`slate-300`, contrast ratio $11.4:1$ on editor surface, used for inspector labels and preset descriptions)
* **Muted Metadata & Line Numbers:** `#94A3B8` (`slate-400`, contrast ratio $6.1:1$ on editor surface, used for editor gutters, unit suffixes, and shortcuts)

## 5. Typography & Copywriting Discipline

### Font Stack & Scale

* **UI Controls & Inspector Labels:** `'Plus Jakarta Sans'`, `'Inter'`, or system geometric sans-serif (`font-sans`).
  * App Header Title: 15px, `font-semibold`, `tracking-tight`, `#F8FAFC`.
  * Section & Popover Header: 13px, `font-semibold`, uppercase, `tracking-wider`, `#CBD5E1`.
  * Control Labels & Buttons: 12px, `font-medium`, `#F8FAFC`.
* **Mermaid Code Editor & Live Telemetry:** `'JetBrains Mono'`, `'Fira Code'`, or system monospace (`font-mono`).
  * Editor Code Text: 13px, `leading-relaxed` (1.6), `#F8FAFC`.
  * Node Telemetry Micro-Badges: 11px, `font-medium`, `#38BDF8` or `#10B981`.
  * **Numeric Lock:** Every live counter (RPS, P99 latency in ms, error percentage, zoom percentage) must apply `font-variant-numeric: tabular-nums` (`tabular-nums`) so layout widths never jitter during real-time simulation ticks.

### Copywriting Hygiene (Anti-Slop Rules)

* **Zero Em Dashes (Rule R-02):** Never use the em dash character anywhere in UI labels, tooltips, preset titles, error banners, or comments. Use colons, commas, periods, or middle dots (`•`) instead.
* **Direct Engineering Terminology:** Label controls with exact technical terms (**120 RPS**, **P99: 42ms**, **Outage (503)**, **Step Single Request**) rather than vague marketing language.
* **Non-Destructive Error Messaging:** When Mermaid syntax is invalid mid-typing, display a concise single-line banner at the bottom of the editor stating the exact line number and parser expectation while keeping the last valid SVG diagram rendered on the stage.

## 6. Layout Architecture & Component Specifications

### A. Viewport Lock & Split Workspace (**src/App.tsx**)

1. **Viewport Lock:** The root container must be locked to `w-screen h-screen overflow-hidden flex flex-col bg-[#050810] text-slate-100 select-none`. Page-level scrollbars are strictly prohibited.
2. **Top Header Bar (Height 56px):**
   * Left: Brand mark, application title, and **Architecture Preset** selector dropdown.
   * Center: Segmented **Traffic Mode** switcher (**Live Flow**, **Step-by-Step Trace**, **Latency Heatmap**).
   * Right: Action buttons (**Copy Mermaid**, **Download SVG**, **Share URL**).
3. **Left Authoring Pane (Width 420px, Collapsible):**
   * Top strip: Quick-insert syntax buttons (**+ Service**, **+ Database**, **+ Queue**, **+ Subgraph**, **+ Telemetry Directive**).
   * Center: Line-numbered monospace code editor (`flex-1 overflow-y-auto`) supporting standard Mermaid syntax and `%% @node` directives.
   * Bottom strip: Live parser status indicator (**Syntax Valid • 6 Nodes • 7 Edges** or pinned line error).
4. **Right Interactive Blueprint Stage (`flex-1 relative overflow-hidden`):**
   * Full-bleed interactive SVG pan-and-zoom viewport with a subtle radial dot matrix background (`background-size: 24px 24px`).
   * Top-Right Floating Toolbar: **Zoom In**, **Zoom Out**, **Fit to Screen**, and zoom level readout.

### B. Contextual Node Chaos Inspector Popover

Clicking any `.node` element on the rendered Mermaid SVG opens a floating glass card (`w-72 p-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl`) anchored near the selected node:

* **Header:** Node ID, parsed label, and live status dot.
* **Health State Selector:** 3-way segmented control:
  * **Healthy (200):** Normal packet pass-through and emerald indicator.
  * **Degraded (High Latency):** Multiplies edge traversal duration by 4x and switches node ring to pulsing amber.
  * **Outage (503):** Drops all incoming packets at the node boundary, halts downstream edges, and increments global error rate.
* **Throughput & Latency Sliders:** Interactive range inputs for **Target RPS** (0 to 5000) and **Base Latency** (1ms to 1000ms) that immediately update the SVG animation cadence and sync back to the `%% @node` comment directive in the code editor.

### C. Bottom Floating Heartbeat & Telemetry Dock

Centered at the bottom of the right canvas (`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-5 px-5 py-2.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80`):

* **Playback Controls:** **Play / Pause** toggle button, **Step Request** button (fires a single highlighted trace sphere hop-by-hop from ingress to leaf nodes), and **Load Multiplier** pills (**1x**, **5x**, **20x**).
* **Live Cluster Telemetry Readout:** 4 compact tabular metric blocks separated by vertical hairlines:
  * **Active Nodes:** Healthy count over total nodes.
  * **Throughput:** Aggregate cluster RPS with a mini cyan sparkline.
  * **End-to-End P99:** Calculated critical-path latency in milliseconds.
  * **Success Rate:** Percentage of non-dropped packets (`100.0%` in emerald, dropping to crimson when any active node enters **Outage**).

## 7. Craftsmanship & Quality Locks (C-1 to C-5)

1. **C-1 Intentionality:** Every animated particle, badge, and color shift reflects a concrete property of the Mermaid graph or user-configured telemetry directive.
2. **C-2 Functional Completeness:** Every preset item, quick-insert snippet button, Traffic Mode tab, Chaos Inspector toggle, playback control, and export action must execute a real state mutation. Dead or placeholder buttons are forbidden.
3. **C-3 Content-Driven Composition:** The application launches directly into a populated, live-animated microservices architecture diagram. No marketing landing page or unrequested hero banners.
4. **C-4 Resilience:** Typing incomplete Mermaid syntax in the editor must never crash the React tree or wipe the canvas; the previous valid SVG diagram remains interactive while the syntax error banner guides the fix.
5. **C-5 Evidence Over Claims:** Unit tests (**Vitest**) and automated headless browser checks (**Playwright**) must verify Mermaid parsing, SVG packet injection, node click chaos simulation, and zero viewport overflow before completion.
