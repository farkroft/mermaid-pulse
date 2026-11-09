import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import type { DiagramModel } from "../lib/diagram";
import type { BlastRadius, Telemetry } from "../lib/telemetry";
import { buildOverlayGeometry } from "../lib/overlay-geometry";
import type { OverlayGeometry } from "../lib/overlay-geometry";
import OverlayLayer from "./OverlayLayer";
import type { LinkPayload, TraceState, TrafficMode } from "./OverlayLayer";
import NodeInspector from "./NodeInspector";
import type { InspectorAnchor } from "./NodeInspector";
import type { Health } from "../lib/diagram";

interface DiagramStageProps {
  model: DiagramModel;
  svgMarkup: string;
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
  onSelect: (id: string | null) => void;
  onHover: (payload: LinkPayload | null) => void;
  onHealth: (health: Health) => void;
  onRps: (rps: number) => void;
  onLatency: (latency: number) => void;
  onHoverLine: (line: number | null) => void;
  error: string | null;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

export function computeFit(
  viewBox: { x: number; y: number; width: number; height: number },
  stage: { width: number; height: number },
): { scale: number; offset: { x: number; y: number } } | null {
  if (!viewBox.width || !viewBox.height || !stage.width || !stage.height) return null;
  const scale = clamp(
    Math.min((stage.width - 96) / viewBox.width, (stage.height - 140) / viewBox.height),
    MIN_SCALE,
    MAX_SCALE,
  );
  // The base SVG and overlay both draw the viewBox from the wrapper origin,
  // so no viewBox.x/y correction applies here: centering is pure padding.
  return {
    scale,
    offset: {
      x: (stage.width - viewBox.width * scale) / 2,
      y: (stage.height - viewBox.height * scale) / 2,
    },
  };
}

export default function DiagramStage({
  model,
  svgMarkup,
  telemetry,
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
  onHealth,
  onRps,
  onLatency,
  onHoverLine,
  error,
}: DiagramStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [stageSize, setStageSize] = useState({ width: 900, height: 600 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    hostRef.current.innerHTML = svgMarkup;
    const next = hostRef.current.querySelector("svg");
    if (!next) return;
    next.classList.add("mp-base-svg");
    // Render at natural viewBox size. The wrapper owns all pan and zoom, so the
    // SVG must not letterbox itself into the container on top of that.
    const [, , vbWidth, vbHeight] = (next.getAttribute("viewBox") ?? "0 0 1000 800")
      .split(/[\s,]+/)
      .map(Number);
    next.setAttribute("width", String(vbWidth || 1000));
    next.setAttribute("height", String(vbHeight || 800));
    next.setAttribute("preserveAspectRatio", "xMinYMin meet");
    next.style.maxWidth = "none";
    setSvgEl(next as SVGSVGElement);
  }, [svgMarkup]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setStageSize({ width: rect.width, height: rect.height });
    });
    observer.observe(stage);
    setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    return () => observer.disconnect();
  }, []);

  const geometry: OverlayGeometry | null = useMemo(() => {
    if (!svgEl) return null;
    return buildOverlayGeometry(svgEl, model);
  }, [svgEl, model]);

  const fit = useCallback(() => {
    if (!geometry) return;
    const next = computeFit(geometry.viewBox, stageSize);
    if (!next) return;
    setScale(next.scale);
    setOffset(next.offset);
  }, [geometry, stageSize]);

  // Refit whenever the rendered diagram's bounds change (preset switch, edit),
  // so a taller TD topology does not inherit the previous LR scale.
  const boundsKey = geometry
    ? `${Math.round(geometry.viewBox.width)}x${Math.round(geometry.viewBox.height)}`
    : "";
  const lastBounds = useRef("");
  useEffect(() => {
    if (!geometry || !stageSize.width || !boundsKey) return;
    if (lastBounds.current === boundsKey) return;
    lastBounds.current = boundsKey;
    fit();
  }, [boundsKey, fit, geometry, stageSize.width]);

  const center = useCallback(() => {
    if (!geometry) return;
    const { viewBox } = geometry;
    setOffset({
      x: (stageSize.width - viewBox.width * scale) / 2,
      y: (stageSize.height - viewBox.height * scale) / 2,
    });
  }, [geometry, scale, stageSize]);

  const zoomTo = useCallback(
    (nextScale: number, originX?: number, originY?: number) => {
      const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const cx = originX ?? stageSize.width / 2;
      const cy = originY ?? stageSize.height / 2;
      setOffset((current) => {
        const ratio = clamped / scale;
        return {
          x: cx - (cx - current.x) * ratio,
          y: cy - (cy - current.y) * ratio,
        };
      });
      setScale(clamped);
    },
    [scale, stageSize],
  );

  const zoomStep = useCallback(
    (direction: 1 | -1, originX?: number, originY?: number) => {
      // Snap to the nearest discrete step so repeated presses land exactly on
      // the 25% / 50% / 100% / 300% clamps instead of drifting past them.
      const steps = [MIN_SCALE, 0.5, 0.75, 1, 1.5, 2, MAX_SCALE];
      const current = steps.findIndex((step) => step >= scale - 0.001);
      const index = current === -1 ? steps.length - 1 : current;
      const nextIndex = clamp(direction > 0 ? index + 1 : index - 1, 0, steps.length - 1);
      zoomTo(steps[nextIndex], originX, originY);
    },
    [scale, zoomTo],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest("[data-testid='node-inspector']")) return;
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomTo(scale * factor, event.clientX - rect.left, event.clientY - rect.top);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [scale, zoomTo]);

  const inspectorAnchor: InspectorAnchor | null = useMemo(() => {
    if (!selectedId || !geometry) return null;
    const geo = geometry.nodes.find((node) => node.id === selectedId);
    if (!geo) return null;
    return { x: geo.cx * scale + offset.x, y: geo.cy * scale + offset.y };
  }, [geometry, offset.x, offset.y, scale, selectedId]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-node-hit]")) return;
    if (target.closest("[data-testid='node-inspector']")) return;
    if (target.closest("button, select, input, a")) return;
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({ x: drag.ox + (event.clientX - drag.x), y: drag.oy + (event.clientY - drag.y) });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    const target = event.currentTarget as HTMLElement;
    if (typeof target.hasPointerCapture === "function" && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  };

  const selectedNode = selectedId ? model.nodeById[selectedId] : null;

  return (
    <div
      ref={stageRef}
      data-testid="diagram-stage"
      className="canvas-grid relative min-h-0 flex-1 overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={() => onSelect(null)}
      style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: geometry ? geometry.viewBox.width : "100%",
          height: geometry ? geometry.viewBox.height : "100%",
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />
        {geometry ? (
          <svg
            data-overlay-svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={geometry.viewBox.width}
            height={geometry.viewBox.height}
            viewBox={`${geometry.viewBox.x} ${geometry.viewBox.y} ${geometry.viewBox.width} ${geometry.viewBox.height}`}
            role="presentation"
          >
            <g style={{ pointerEvents: "none" }}>
              <OverlayLayer
                geometry={geometry}
                model={model}
                telemetry={telemetry}
                blast={blast}
                mode={mode}
                running={running}
                multiplier={multiplier}
                selectedId={selectedId}
                link={link}
                trace={trace}
                reducedMotion={reducedMotion}
                showBadges={showBadges}
                onSelect={onSelect}
                onHover={onHover}
              />
            </g>
          </svg>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-3">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-900/90 p-1 shadow-lg shadow-black/40 backdrop-blur-md">
          <IconButton label="Zoom out" onClick={() => zoomStep(-1)}>
            <Minus size={13} aria-hidden="true" />
          </IconButton>
          <span
            data-testid="zoom-readout"
            className="w-12 text-center font-mono text-[11px] tabular-nums text-slate-300"
          >
            {Math.round(scale * 100)}%
          </span>
          <IconButton label="Zoom in" onClick={() => zoomStep(1)}>
            <Plus size={13} aria-hidden="true" />
          </IconButton>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-slate-700/80" />
          <IconButton label="Fit to screen" onClick={fit}>
            <Maximize2 size={13} aria-hidden="true" />
          </IconButton>
          <IconButton label="Center diagram" onClick={center}>
            <Crosshair size={13} aria-hidden="true" />
          </IconButton>
          <IconButton label="Reset zoom" onClick={() => { setScale(1); center(); }}>
            <RotateCcw size={13} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {mode === "trace" ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded border border-violet-400/40 bg-violet-500/10 px-2 py-1 font-mono text-[10px] text-violet-200">
          {trace ? `hop ${trace.hop + 1}/${trace.edgeIds.length} · ${trace.nodeIds[trace.hop]}` : "Trace armed: press Step request"}
        </div>
      ) : null}

      {mode === "heatmap" ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded border border-slate-700/70 bg-slate-900/80 px-2 py-1 font-mono text-[10px] text-slate-300">
          <span>latency</span>
          <LegendSwatch color="#10b981" label="<60ms" />
          <LegendSwatch color="#38bdf8" label="60-180ms" />
          <LegendSwatch color="#f59e0b" label="180-500ms" />
          <LegendSwatch color="#f43f5e" label=">=500ms" />
        </div>
      ) : null}

      {error ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200"
        >
          Last valid diagram retained. Fix line {error.split(":")[0]?.replace(/\D/g, "") || "?"} to resume live render.
        </div>
      ) : null}

      {selectedNode && inspectorAnchor ? (
        <NodeInspector
          nodeId={selectedNode.id}
          model={model}
          anchor={inspectorAnchor}
          stageSize={stageSize}
          onClose={() => onSelect(null)}
          onHealth={onHealth}
          onRps={onRps}
          onLatency={onLatency}
          onHoverLine={onHoverLine}
        />
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-sky-300 active:bg-slate-700"
    >
      {children}
    </button>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-1.5 w-3 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
