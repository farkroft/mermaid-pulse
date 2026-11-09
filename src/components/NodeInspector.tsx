import { useEffect, useRef } from "react";
import { Activity, ArrowDownRight, CircleSlash, Gauge, ShieldCheck, TriangleAlert, X } from "lucide-react";
import type { DiagramModel, Health } from "../lib/diagram";
import { aggregateRps } from "../lib/telemetry";

export interface InspectorAnchor {
  x: number;
  y: number;
}

interface NodeInspectorProps {
  nodeId: string;
  model: DiagramModel;
  anchor: InspectorAnchor;
  stageSize: { width: number; height: number };
  onClose: () => void;
  onHealth: (health: Health) => void;
  onRps: (rps: number) => void;
  onLatency: (latency: number) => void;
  onHoverLine: (line: number | null) => void;
}

const HEALTH_OPTIONS: Array<{
  value: Health;
  label: string;
  detail: string;
  icon: typeof ShieldCheck;
  tone: string;
}> = [
  { value: "healthy", label: "Healthy", detail: "200 OK", icon: ShieldCheck, tone: "emerald" },
  { value: "degraded", label: "Degraded", detail: "600ms", icon: TriangleAlert, tone: "amber" },
  { value: "outage", label: "Outage", detail: "503", icon: CircleSlash, tone: "crimson" },
];

const TONE_CLASS: Record<string, string> = {
  emerald: "border-emerald-400/70 bg-emerald-400/12 text-emerald-300",
  amber: "border-amber-400/70 bg-amber-400/12 text-amber-300",
  crimson: "border-rose-500/70 bg-rose-500/12 text-rose-300",
};

export default function NodeInspector({
  nodeId,
  model,
  anchor,
  stageSize,
  onClose,
  onHealth,
  onRps,
  onLatency,
  onHoverLine,
}: NodeInspectorProps) {
  const node = model.nodeById[nodeId];
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!node) return null;

  const width = 288;
  const left = Math.min(Math.max(anchor.x + 26, 12), Math.max(12, stageSize.width - width - 12));
  const top = Math.min(Math.max(anchor.y - 40, 12), Math.max(12, stageSize.height - 320));
  const rps = node.rps ?? aggregateRps(model, node.id);
  const latency = node.latency || 1;
  const statusColor =
    node.health === "outage" ? "#f43f5e" : node.health === "degraded" ? "#f59e0b" : "#10b981";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Chaos inspector for ${node.label}`}
      tabIndex={-1}
      data-testid="node-inspector"
      style={{ left, top, width }}
      className="absolute z-30 rounded-xl border border-slate-700/80 bg-slate-900/92 p-3.5 shadow-2xl shadow-black/50 backdrop-blur-md outline-none"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Chaos inspector</p>
          <h2 className="mt-1 truncate text-[13px] font-semibold text-slate-50">{node.label}</h2>
          <button
            type="button"
            onClick={() => onHoverLine(node.line)}
            className="mt-1 flex items-center gap-1 font-mono text-[10px] text-sky-300 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-200"
          >
            <ArrowDownRight size={11} aria-hidden="true" />
            node {node.id} • line {node.line}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="rounded border border-slate-700/70 p-1 text-slate-400 transition hover:border-slate-500 hover:text-slate-100"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {HEALTH_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = node.health === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onHealth(option.value)}
              className={[
                "flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] font-medium transition",
                active
                  ? TONE_CLASS[option.tone]
                  : "border-slate-700/70 bg-slate-950/50 text-slate-400 hover:border-slate-500 hover:text-slate-200",
              ].join(" ")}
            >
              <Icon size={13} aria-hidden="true" />
              <span>{option.label}</span>
              <span className="font-mono text-[9px] opacity-80">{option.detail}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-2.5">
        <label className="block">
          <span className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="flex items-center gap-1.5">
              <Activity size={11} aria-hidden="true" className="text-sky-400" />
              Target throughput
            </span>
            <span className="font-mono tabular-nums text-sky-300">{Math.round(rps)} RPS</span>
          </span>
          <input
            type="range"
            min={0}
            max={5000}
            step={10}
            value={Math.min(5000, Math.round(rps))}
            onChange={(event) => onRps(Number(event.target.value))}
            className="mt-1 h-1 w-full appearance-none rounded bg-slate-700 accent-sky-400"
            aria-label="Target throughput in requests per second"
          />
        </label>

        <label className="block">
          <span className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="flex items-center gap-1.5">
              <Gauge size={11} aria-hidden="true" className="text-amber-400" />
              Base latency
            </span>
            <span className="font-mono tabular-nums text-amber-300">{latency} ms</span>
          </span>
          <input
            type="range"
            min={1}
            max={1000}
            step={1}
            value={latency}
            onChange={(event) => onLatency(Number(event.target.value))}
            className="mt-1 h-1 w-full appearance-none rounded bg-slate-700 accent-amber-400"
            aria-label="Base latency in milliseconds"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/50 px-2 py-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
            aria-hidden="true"
          />
          {node.health.toUpperCase()}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-slate-400">
          cpu {node.cpu ?? 0}%
        </span>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        Edits write back to the <span className="font-mono text-slate-400">%% @node</span> directive in source.
      </p>
    </div>
  );
}
