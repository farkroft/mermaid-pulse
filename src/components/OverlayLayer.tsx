import type { DiagramModel, DiagramNode, EdgeKind } from "../lib/diagram";
import type { BlastRadius, EdgeVisualState, ParticleSpec, Telemetry } from "../lib/telemetry";
import { buildParticles, edgeColor, edgeVisualState, effectiveEdgeRps, latencyColor, nodeLatency } from "../lib/telemetry";
import type { OverlayGeometry } from "../lib/overlay-geometry";
import { pointsAlongPath } from "../lib/overlay-geometry";

export type TrafficMode = "live" | "trace" | "heatmap";

export interface LinkPayload {
  nodes: string[];
  edges: string[];
  line: number | null;
}

export interface TraceState {
  nodeIds: string[];
  edgeIds: string[];
  hop: number;
}

interface OverlayProps {
  geometry: OverlayGeometry;
  model: DiagramModel;
  telemetry: Telemetry;
  blast: BlastRadius;
  mode: TrafficMode;
  running: boolean;
  multiplier: number;
  selectedId: string | null;
  link: LinkPayload | null;
  trace: TraceState | null;
  reducedMotion: boolean;
  showBadges: boolean;
  onSelect: (id: string) => void;
  onHover: (payload: LinkPayload | null) => void;
}

function midpoint(path: string): { x: number; y: number } {
  const points = pointsAlongPath(path, 5);
  return points[2] ?? points[0] ?? { x: 0, y: 0 };
}

function formatRps(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `${Math.round(value)}`;
}

function nodeRps(node: DiagramNode, model: DiagramModel): number {
  if (node.rps && node.rps > 0) return node.rps;
  const incoming = model.edges.filter((e) => e.to === node.id);
  if (incoming.length) return incoming.reduce((sum, e) => sum + effectiveEdgeRps(e, model), 0);
  const outgoing = model.edges.filter((e) => e.from === node.id);
  return outgoing.reduce((sum, e) => sum + effectiveEdgeRps(e, model), 0);
}

function isLinked(list: string[], id: string): boolean {
  return list.includes(id);
}

function EdgeParticles({
  edgeId,
  path,
  spec,
  state,
  beginOffset = 0,
}: {
  edgeId: string;
  path: string;
  spec: ParticleSpec;
  state: EdgeVisualState;
  beginOffset?: number;
}) {
  if (state === "halted") return null;

  return (
    <>
      {Array.from({ length: spec.count }).map((_, index) => {
        const begin = `${(((index * spec.duration) / spec.count + beginOffset) % spec.duration).toFixed(2)}s`;
        return (
          <circle
            key={`${edgeId}-p-${index}`}
            data-packet={edgeId}
            r={spec.size}
            fill={spec.color}
            opacity={0.95}
            style={{ filter: `drop-shadow(0 0 ${spec.size + 2}px ${spec.color})` }}
          >
            {spec.bounce ? (
              <>
                <animateMotion
                  dur={`${spec.duration}s`}
                  begin={begin}
                  repeatCount="indefinite"
                  keyPoints="0;0.78;0.78;0"
                  keyTimes="0;0.42;0.56;1"
                  calcMode="linear"
                  path={path}
                />
                <animate
                  attributeName="opacity"
                  values="1;1;0.15;0.15;1"
                  keyTimes="0;0.42;0.5;0.56;1"
                  dur={`${spec.duration}s`}
                  begin={begin}
                  repeatCount="indefinite"
                />
              </>
            ) : (
              <animateMotion dur={`${spec.duration}s`} begin={begin} repeatCount="indefinite" path={path} />
            )}
          </circle>
        );
      })}
    </>
  );
}

export default function OverlayLayer({
  geometry,
  model,
  blast,
  mode,
  running,
  multiplier,
  selectedId,
  link,
  trace,
  reducedMotion,
  showBadges,
  onSelect,
  onHover,
}: OverlayProps) {
  const traceNodeSet = new Set(trace ? trace.nodeIds.slice(0, trace.hop + 1) : []);
  const currentTraceEdgeId = trace ? trace.edgeIds[trace.hop] : null;

  return (
    <g>
      {geometry.edges.map((geo, index) => {
        const edge = model.edgeById[geo.model.id] ?? geo.model;
        const state = edgeVisualState(edge, blast, model.nodeById);
        const rate = effectiveEdgeRps(edge, model);
        const spec = buildParticles(
          { ...edge, rps: rate },
          { multiplier, state },
        );
        const linked = link ? isLinked(link.edges, edge.id) : false;
        const baseColor =
          mode === "heatmap"
            ? latencyColor(edge.latency)
            : state === "dropped"
              ? "#f43f5e"
              : state === "halted"
                ? "#64748b"
                : state === "backpressure"
                  ? "#f59e0b"
                  : edgeColor(edge.kind);
        const active = state === "flow" || state === "backpressure";
        const mid = midpoint(geo.path);
        const showEdgeBadge = linked || mode === "heatmap";

        return (
          <g key={`edge-${edge.id}`}>
            <path
              d={geo.path}
              fill="none"
              stroke={baseColor}
              strokeWidth={linked ? 4 : mode === "heatmap" ? 3.2 : 2.2}
              strokeLinecap="round"
              strokeDasharray={edge.kind === "async" && mode === "live" ? "2 7" : undefined}
              opacity={state === "halted" ? 0.22 : linked ? 0.55 : 0.28}
              style={{ filter: linked ? `drop-shadow(0 0 6px ${baseColor})` : undefined }}
            />
            {mode !== "heatmap" && active && running && !reducedMotion ? (
              <EdgeParticles
                edgeId={edge.id}
                path={geo.path}
                spec={spec}
                state={state}
                beginOffset={index * 0.13}
              />
            ) : null}
            {mode !== "heatmap" && active && (!running || reducedMotion) ? (
              <>
                {pointsAlongPath(geo.path, spec.count + 1)
                  .slice(0, spec.count)
                  .map((point, index) => (
                    <circle
                      key={`static-${edge.id}-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={spec.size}
                      fill={baseColor}
                      opacity={0.85}
                    />
                  ))}
              </>
            ) : null}
            {showEdgeBadge ? (
              <g transform={`translate(${mid.x},${mid.y})`} pointerEvents="none">
                <rect
                  x={-32}
                  y={-9}
                  width={64}
                  height={18}
                  rx={4}
                  fill="#0b1120"
                  stroke={baseColor}
                  strokeOpacity={0.55}
                />
                <text
                  x={0}
                  y={3.5}
                  textAnchor="middle"
                  fill={baseColor}
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  className="tabular-nums"
                >
                  {mode === "heatmap" ? `${edge.latency}ms` : `${formatRps(rate)} rps`}
                </text>
              </g>
            ) : null}
            <path
              d={geo.path}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              pointerEvents="stroke"
              onPointerEnter={() =>
                onHover({
                  nodes: [edge.from, edge.to],
                  edges: [edge.id],
                  line: edge.line || null,
                })
              }
              onPointerLeave={() => onHover(null)}
              aria-hidden="true"
            />
            {currentTraceEdgeId === edge.id && trace ? (
              <circle r={5.2} fill="#38bdf8" opacity={1} style={{ filter: "drop-shadow(0 0 8px #38bdf8)" }}>
                <animateMotion
                  key={`trace-${trace.hop}`}
                  dur="0.6s"
                  fill="freeze"
                  path={geo.path}
                  repeatCount="1"
                />
              </circle>
            ) : null}
          </g>
        );
      })}

      {geometry.nodes.map((geo) => {
        const node = model.nodeById[geo.id] ?? geo.model;
        const linked = link ? isLinked(link.nodes, node.id) : false;
        const selected = selectedId === node.id;
        const traced = traceNodeSet.has(node.id);
        const latency = nodeLatency(node);
        const rate = nodeRps(node, model);
        const color =
          node.health === "outage"
            ? "#f43f5e"
            : node.health === "degraded"
              ? "#f59e0b"
              : "#10b981";
        const ringW = geo.width + 12;
        const ringH = geo.height + 12;
        const badgeText =
          mode === "heatmap" ? `${latency}ms` : `${latency}ms · ${formatRps(rate)} rps`;
        const badgeWidth = badgeText.length * 5.6 + 14;
        const badgeY = geo.cy - ringH / 2 - 20;

        return (
          <g key={`node-${node.id}`}>
            {traced ? (
              <rect
                x={geo.cx - ringW / 2 - 4}
                y={geo.cy - ringH / 2 - 4}
                width={ringW + 8}
                height={ringH + 8}
                rx={12}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="5 4"
                opacity={0.9}
              />
            ) : null}
            <rect
              data-heartbeat={node.id}
              x={geo.cx - ringW / 2}
              y={geo.cy - ringH / 2}
              width={ringW}
              height={ringH}
              rx={10}
              fill="none"
              stroke={selected ? "#38bdf8" : color}
              strokeWidth={selected ? 2.2 : 1.4}
              opacity={selected ? 1 : node.health === "healthy" ? 0.5 : 0.9}
              className={
                node.health === "outage" ? "ring-outage" : node.health === "degraded" ? "ring-pulse" : undefined
              }
              pointerEvents="none"
            />
            <circle
              cx={geo.cx + ringW / 2 - 2}
              cy={geo.cy - ringH / 2 + 2}
              r={3.4}
              fill={color}
              stroke="#050810"
              strokeWidth={1.4}
              className={node.health === "outage" ? "ring-outage" : undefined}
              pointerEvents="none"
            />
            {showBadges ? (
              <g transform={`translate(${geo.cx},${badgeY})`} pointerEvents="none" opacity={linked ? 1 : 0.82}>
                <rect
                  x={-badgeWidth / 2}
                  y={-9}
                  width={badgeWidth}
                  height={18}
                  rx={4}
                  fill="#0b1120"
                  stroke={linked ? "#38bdf8" : "#334155"}
                  strokeOpacity={linked ? 0.9 : 0.7}
                />
                <text
                  x={0}
                  y={3.5}
                  textAnchor="middle"
                  fill={linked ? "#38bdf8" : "#cbd5e1"}
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  className="tabular-nums"
                >
                  {badgeText}
                </text>
              </g>
            ) : null}
            <rect
              data-node-hit={node.id}
              x={geo.cx - geo.width / 2}
              y={geo.cy - geo.height / 2}
              width={geo.width}
              height={geo.height}
              rx={8}
              fill="transparent"
              pointerEvents="all"
              tabIndex={0}
              role="button"
              aria-label={`Inspect ${node.label}, ${node.health}, ${latency} milliseconds`}
              style={{ cursor: "pointer", outline: "none" }}
              onPointerEnter={() =>
                onHover({
                  nodes: [node.id],
                  edges: model.edges.filter((e) => e.from === node.id || e.to === node.id).map((e) => e.id),
                  line: node.line,
                })
              }
              onPointerLeave={() => onHover(null)}
              onFocus={() =>
                onHover({
                  nodes: [node.id],
                  edges: model.edges.filter((e) => e.from === node.id || e.to === node.id).map((e) => e.id),
                  line: node.line,
                })
              }
              onBlur={() => onHover(null)}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(node.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node.id);
                }
              }}
            />
          </g>
        );
      })}
    </g>
  );
}

export function edgeLaneColor(kind: EdgeKind): string {
  return edgeColor(kind);
}
