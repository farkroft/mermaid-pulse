import { Pause, Play, SkipForward, Zap } from "lucide-react";
import type { Telemetry } from "../lib/telemetry";

interface TelemetryDockProps {
  telemetry: Telemetry;
  running: boolean;
  multiplier: number;
  tracing: boolean;
  onToggleRun: () => void;
  onStep: () => void;
  onMultiplier: (value: number) => void;
}

const MULTIPLIERS = [
  { value: 1, label: "1x Normal" },
  { value: 5, label: "5x Peak" },
  { value: 20, label: "20x DDoS" },
];

function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const width = 46;
  const height = 16;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - value * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke={tone} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export default function TelemetryDock({
  telemetry,
  running,
  multiplier,
  tracing,
  onToggleRun,
  onStep,
  onMultiplier,
}: TelemetryDockProps) {
  const successTone = telemetry.successRate >= 99 ? "#10b981" : telemetry.successRate >= 90 ? "#f59e0b" : "#f43f5e";
  const p99Tone = telemetry.p99 >= 500 ? "#f43f5e" : telemetry.p99 >= 180 ? "#f59e0b" : "#38bdf8";

  return (
    <div
      data-testid="telemetry-dock"
      className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-4 py-2.5 shadow-xl shadow-black/40 backdrop-blur-md"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleRun}
          aria-pressed={running}
          className={[
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition",
            running
              ? "border-sky-400/60 bg-sky-400/15 text-sky-200 hover:bg-sky-400/25"
              : "border-emerald-400/60 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25",
          ].join(" ")}
        >
          {running ? <Pause size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}
          {running ? "Pause traffic" : "Play traffic"}
        </button>
        <button
          type="button"
          onClick={onStep}
          aria-pressed={tracing}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/60 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-violet-400/60 hover:text-violet-200"
        >
          <SkipForward size={12} aria-hidden="true" />
          Step request
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-slate-700/70 bg-slate-950/50 p-0.5" role="group" aria-label="Traffic load multiplier">
        <Zap size={11} aria-hidden="true" className="ml-1 text-amber-400" />
        {MULTIPLIERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={multiplier === item.value}
            onClick={() => onMultiplier(item.value)}
            className={[
              "rounded px-1.5 py-1 font-mono text-[10px] transition",
              multiplier === item.value
                ? "bg-amber-400/20 text-amber-200"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Metric label="Active nodes" value={`${telemetry.activeNodes}/${telemetry.totalNodes}`} tone="#cbd5e1" />
        <Divider />
        <Metric
          label="Throughput"
          value={`${telemetry.throughput.toLocaleString("en-US")} rps`}
          tone="#38bdf8"
          extra={<Sparkline values={telemetry.spark} tone="#38bdf8" />}
        />
        <Divider />
        <Metric label="P99 latency" value={`${telemetry.p99} ms`} tone={p99Tone} />
        <Divider />
        <Metric
          label="Success rate"
          value={`${telemetry.successRate.toFixed(1)}%`}
          tone={successTone}
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  extra,
}: {
  label: string;
  value: string;
  tone: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-[12px] font-medium tabular-nums" style={{ color: tone }}>
        {value}
        {extra}
      </span>
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="h-6 w-px bg-slate-700/70" />;
}
