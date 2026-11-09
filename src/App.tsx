import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  Monitor,
  Moon,
  PanelLeft,
  Share2,
  Sun,
  Terminal,
} from "lucide-react";
import CodeEditor from "./components/CodeEditor";
import DiagramStage from "./components/DiagramStage";
import TelemetryDock from "./components/TelemetryDock";
import type { LinkPayload, TraceState, TrafficMode } from "./components/OverlayLayer";
import type { EditorError } from "./components/CodeEditor";
import {
  findElementAtLine,
  findNodeLines,
  insertSnippet,
  parseDiagram,
  upsertNodeDirective,
} from "./lib/diagram";
import type { Health, SnippetKind } from "./lib/diagram";
import { PRESETS, DEFAULT_PRESET } from "./lib/presets";
import { buildStandaloneSvg, sanitizeFileName } from "./lib/export-svg";
import { cleanErrorMessage, extractErrorLine } from "./lib/mermaid-render";
import { renderMermaid, validateMermaid, type MermaidThemeName } from "./lib/mermaid";
import { decodeShare, encodeShare } from "./lib/share";
import { computeBlastRadius, computeTelemetry, findTracePath } from "./lib/telemetry";

const MODES: Array<{ value: TrafficMode; label: string }> = [
  { value: "live", label: "Live Flow" },
  { value: "trace", label: "Step-by-Step Trace" },
  { value: "heatmap", label: "Latency Heatmap" },
];

const DEFAULT_EDITOR_WIDTH = 420;
const MIN_EDITOR_WIDTH = 280;
const MAX_EDITOR_WIDTH = 760;

function clampEditorWidth(width: number): number {
  return Math.min(MAX_EDITOR_WIDTH, Math.max(MIN_EDITOR_WIDTH, Math.round(width)));
}

function readEditorWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem("mermaidpulse-editor-width"));
    if (Number.isFinite(stored)) return clampEditorWidth(stored);
  } catch {
    // Storage unavailable; fall back to the default pane width.
  }
  return DEFAULT_EDITOR_WIDTH;
}

function initialCode(): { code: string; presetId: string } {
  const fromHash = decodeShare(window.location.hash);
  if (fromHash) return { code: fromHash, presetId: "custom" };
  return { code: DEFAULT_PRESET.code, presetId: DEFAULT_PRESET.id };
}

function initialTheme(): MermaidThemeName {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: MermaidThemeName): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem("mermaidpulse-theme", theme);
  } catch {
    // Storage can be unavailable (private mode); the session still keeps the choice.
  }
}

export default function App() {
  const initial = useMemo(initialCode, []);
  const [code, setCode] = useState(initial.code);
  const [committedCode, setCommittedCode] = useState(initial.code);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [error, setError] = useState<EditorError | null>(null);
  const [presetId, setPresetId] = useState(initial.presetId);
  const [mode, setMode] = useState<TrafficMode>("live");
  const [running, setRunning] = useState(true);
  const [multiplier, setMultiplier] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [link, setLink] = useState<LinkPayload | null>(null);
  const [trace, setTrace] = useState<TraceState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"source" | "canvas">("canvas");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [theme, setTheme] = useState<MermaidThemeName>(initialTheme);
  const [editorWidth, setEditorWidth] = useState(readEditorWidth);
  const renderToken = useRef(0);
  const widthDrag = useRef<{ startX: number; startWidth: number } | null>(null);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: MermaidThemeName = current === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  const persistEditorWidth = useCallback((width: number) => {
    try {
      window.localStorage.setItem("mermaidpulse-editor-width", String(width));
    } catch {
      // Storage unavailable; the session keeps the choice.
    }
  }, []);

  const setEditorWidthClamped = useCallback(
    (width: number) => {
      persistEditorWidth(clampEditorWidth(width));
      setEditorWidth(clampEditorWidth(width));
    },
    [persistEditorWidth],
  );

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    widthDrag.current = { startX: event.clientX, startWidth: editorWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, [editorWidth]);

  const handleResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = widthDrag.current;
      if (!drag) return;
      setEditorWidth(clampEditorWidth(drag.startWidth + (event.clientX - drag.startX)));
    },
    [],
  );

  const handleResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      widthDrag.current = null;
      if (typeof event.currentTarget.hasPointerCapture === "function" && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      persistEditorWidth(editorWidth);
    },
    [editorWidth, persistEditorWidth],
  );

  const handleResizeKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 48 : 24;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setEditorWidthClamped(editorWidth - step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setEditorWidthClamped(editorWidth + step);
      } else if (event.key === "Home") {
        event.preventDefault();
        setEditorWidthClamped(MIN_EDITOR_WIDTH);
      } else if (event.key === "End") {
        event.preventDefault();
        setEditorWidthClamped(MAX_EDITOR_WIDTH);
      }
    },
    [editorWidth, setEditorWidthClamped],
  );

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const token = renderToken.current + 1;
    renderToken.current = token;
    const candidate = code.trim();
    if (!candidate) {
      // Blank source is an explicit empty state, not a parse error.
      setSvgMarkup("");
      setCommittedCode("");
      setError(null);
      setRendering(false);
      return;
    }
    setRendering(true);
    const timer = window.setTimeout(() => {
      const candidate = code;
      const mermaidTheme: MermaidThemeName = theme;
      validateMermaid(candidate, mermaidTheme)
        .then(() => renderMermaid(candidate, mermaidTheme))
        .then((svg) => {
          if (renderToken.current !== token) return;
          setSvgMarkup(svg);
          setCommittedCode(candidate);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (renderToken.current !== token) return;
          const raw = cause instanceof Error ? cause.message : String(cause);
          const totalLines = candidate.split("\n").length;
          setError({
            line: extractErrorLine(raw, totalLines),
            message: cleanErrorMessage(raw),
          });
        })
        .finally(() => {
          if (renderToken.current === token) setRendering(false);
        });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [code, theme]);

  const model = useMemo(() => parseDiagram(committedCode), [committedCode]);
  const telemetry = useMemo(
    () => computeTelemetry(model, { multiplier, tick: Math.round(telemetryTick()) }),
    [model, multiplier],
  );
  const outageIds = useMemo(
    () => model.nodes.filter((node) => node.health === "outage").map((node) => node.id),
    [model],
  );
  const blast = useMemo(() => computeBlastRadius(model, outageIds), [model, outageIds]);
  const preset = PRESETS.find((item) => item.id === presetId);

  const flash = useCallback((message: string) => setToast(message), []);

  const handleCode = useCallback((next: string) => {
    setCode(next);
    setPresetId("custom");
  }, []);

  const handleInsert = useCallback(
    (kind: SnippetKind) => {
      setCode((current) => insertSnippet(current, kind));
      setPresetId("custom");
    },
    [],
  );

  const handlePreset = useCallback((id: string) => {
    const next = PRESETS.find((item) => item.id === id);
    if (!next) return;
    setPresetId(next.id);
    setCode(next.code);
    setSelectedId(null);
    setTrace(null);
  }, []);

  const applyDirective = useCallback(
    (nodeId: string, patch: Record<string, string | number | undefined>) => {
      setCode((current) => upsertNodeDirective(current, nodeId, patch));
      setPresetId("custom");
    },
    [],
  );

  const handleHealth = useCallback(
    (health: Health) => {
      if (!selectedId) return;
      applyDirective(selectedId, { health });
      if (health === "outage") setTrace(null);
    },
    [applyDirective, selectedId],
  );

  const handleRps = useCallback(
    (rps: number) => {
      if (!selectedId) return;
      applyDirective(selectedId, { rps });
    },
    [applyDirective, selectedId],
  );

  const handleLatency = useCallback(
    (latency: number) => {
      if (!selectedId) return;
      applyDirective(selectedId, { latency });
    },
    [applyDirective, selectedId],
  );

  const handleStep = useCallback(() => {
    const path = findTracePath(model);
    if (!path) {
      flash("No edges to trace in this diagram");
      return;
    }
    setMode("trace");
    setTrace((current) => {
      if (!current || current.hop >= current.edgeIds.length - 1) {
        return { nodeIds: path.nodeIds, edgeIds: path.edgeIds, hop: 0 };
      }
      return { ...current, hop: current.hop + 1 };
    });
  }, [flash, model]);

  const handleMode = useCallback((next: TrafficMode) => {
    setMode(next);
    if (next === "live") setTrace(null);
  }, []);

  const handleCursorLine = useCallback(
    (line: number) => {
      const hit = findElementAtLine(model, line);
      if (!hit) {
        setLink((current) => (current && current.nodes.length === 0 ? null : current));
        return;
      }
      setLink({ nodes: hit.nodes, edges: hit.edges, line });
    },
    [model],
  );

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      flash("Copied source to clipboard");
    } catch {
      flash("Clipboard blocked by browser, select the editor to copy");
    }
  }, [code, flash]);

  const downloadSvg = useCallback(() => {
    const overlay = document.querySelector<SVGSVGElement>("[data-overlay-svg]");
    const base = document.querySelector<SVGSVGElement>("svg.mp-base-svg");
    if (!base) {
      flash("No rendered diagram to export yet");
      return;
    }
    const markup = buildStandaloneSvg(
      base.outerHTML,
      overlay?.innerHTML ?? "",
      preset?.name ?? "MermaidPulse diagram",
    );
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sanitizeFileName(preset?.name ?? "mermaidpulse-diagram");
    anchor.click();
    URL.revokeObjectURL(url);
    flash("Animated SVG downloaded");
  }, [flash, preset]);

  const shareUrl = useCallback(() => {
    const hash = encodeShare(code);
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    window.history.replaceState(null, "", hash);
    navigator.clipboard?.writeText(url).catch(() => undefined);
    flash("Share link ready in the URL bar");
  }, [code, flash]);

  const highlightLine = link?.line ?? null;
  const highlightNodes = link?.nodes ?? [];
  const selectedNode = selectedId ? model.nodeById[selectedId] : null;
  const selectedLines = useMemo(
    () => (selectedId ? findNodeLines(model, selectedId) : []),
    [model, selectedId],
  );

  return (
    <div className="flex h-screen w-screen select-none flex-col overflow-hidden bg-void text-slate-100">
      <header
        data-testid="app-header"
        className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-800/80 bg-panel px-3 md:px-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-sky-400/40 bg-sky-400/10"
            aria-hidden="true"
          >
            <Activity size={16} className="text-sky-400" />
          </span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 text-[15px] font-semibold leading-none tracking-tight text-slate-50">
              MermaidPulse
              <span className="rounded border border-slate-700/80 bg-slate-900 px-1 py-px font-mono text-[9px] font-medium text-slate-400">
                v1.0
              </span>
            </h1>
            <p className="mt-1 hidden text-[10px] leading-none text-slate-400 sm:block">
              Live topology traffic simulator
            </p>
          </div>
        </div>

        <div className="relative ml-1 flex min-w-0 items-center">
          <GitBranch size={13} aria-hidden="true" className="pointer-events-none absolute left-2 text-slate-400" />
          <select
            aria-label="Architecture preset"
            value={presetId}
            onChange={(event) => handlePreset(event.target.value)}
            className="h-9 w-[150px] min-w-0 appearance-none truncate rounded-lg border border-slate-700/80 bg-slate-900/80 pl-7 pr-7 text-[11px] font-medium text-slate-200 transition hover:border-slate-500 focus:border-sky-400 sm:w-[190px] lg:w-[320px]"
          >
            {presetId === "custom" ? <option value="custom">Custom diagram</option> : null}
            {PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} aria-hidden="true" className="pointer-events-none absolute right-2 text-slate-400" />
        </div>

        <div
          className="ml-auto hidden items-center gap-0.5 rounded-lg border border-slate-700/70 bg-slate-950/60 p-0.5 md:flex"
          role="group"
          aria-label="Traffic mode"
        >
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={mode === item.value}
              onClick={() => handleMode(item.value)}
              className={[
                "rounded px-2.5 py-1.5 text-[11px] font-medium transition",
                mode === item.value
                  ? "bg-sky-400/15 text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-1.5 md:ml-0 md:flex">
          <HeaderAction label="Copy Mermaid" onClick={copyCode}>
            <Copy size={13} aria-hidden="true" />
          </HeaderAction>
          <HeaderAction label="Download SVG" onClick={downloadSvg}>
            <Download size={13} aria-hidden="true" />
          </HeaderAction>
          <HeaderAction label="Share URL" onClick={shareUrl}>
            <Share2 size={13} aria-hidden="true" />
          </HeaderAction>
          <ThemeAction theme={theme} onClick={toggleTheme} />
        </div>

        <button
          type="button"
          onClick={() => setMobileView((current) => (current === "canvas" ? "source" : "canvas"))}
          className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2 text-[11px] font-medium text-slate-300 md:hidden"
        >
          {mobileView === "canvas" ? (
            <>
              <PanelLeft size={13} aria-hidden="true" />
              Show source
            </>
          ) : (
            <>
              <Monitor size={13} aria-hidden="true" />
              Show canvas
            </>
          )}
        </button>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-800/80 bg-[#0b1120] px-2 md:hidden">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={mode === item.value}
            onClick={() => handleMode(item.value)}
            className={[
              "shrink-0 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
              mode === item.value ? "bg-sky-400/15 text-sky-200" : "text-slate-400",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-slate-700/70" />
        <MobileAction label="Copy Mermaid" onClick={copyCode}>
          <Copy size={14} aria-hidden="true" />
        </MobileAction>
        <MobileAction label="Download SVG" onClick={downloadSvg}>
          <Download size={14} aria-hidden="true" />
        </MobileAction>
        <MobileAction label="Share URL" onClick={shareUrl}>
          <Share2 size={14} aria-hidden="true" />
        </MobileAction>
        <ThemeAction theme={theme} onClick={toggleTheme} />
      </div>

      <main
        className="flex min-h-0 flex-1"
        style={{ ["--editor-w" as string]: `${editorWidth}px` } as React.CSSProperties}
      >
        <div
          className={[
            "h-full min-h-0 w-full shrink-0 md:block md:w-[var(--editor-w)]",
            mobileView === "source" ? "block" : "hidden",
          ].join(" ")}
        >
          <CodeEditor
            code={code}
            onChange={handleCode}
            error={error}
            highlightLine={highlightLine}
            highlightNodeIds={highlightNodes}
            selectedNodeId={selectedNode?.id ?? null}
            selectedLine={selectedNode?.line ?? null}
            selectedLines={selectedLines}
            stats={{ nodes: model.nodes.length, edges: model.edges.length }}
            onInsert={handleInsert}
            onCursorLine={handleCursorLine}
            presetName={preset?.name ?? "Custom diagram"}
          />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize source pane"
          data-editor-resize
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onDoubleClick={() => setEditorWidthClamped(DEFAULT_EDITOR_WIDTH)}
          onKeyDown={handleResizeKey}
          title="Drag to resize the source pane — double-click to reset"
          className="relative hidden w-1 shrink-0 cursor-ew-resize bg-slate-800/60 transition-colors hover:bg-sky-400/50 focus-visible:bg-sky-400/70 md:block"
        >
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-9 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-600"
          />
        </div>

        <div
          className={[
            "relative flex min-w-0 flex-1 flex-col",
            mobileView === "canvas" ? "flex" : "hidden md:flex",
          ].join(" ")}
        >
          {rendering && !svgMarkup ? (
            <div className="canvas-grid flex flex-1 items-center justify-center">
              <div className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-400">
                <Terminal size={13} aria-hidden="true" className="animate-pulse text-sky-400" />
                Rendering Mermaid SVG
              </div>
            </div>
          ) : svgMarkup ? (
            <DiagramStage
              model={model}
              svgMarkup={svgMarkup}
              telemetry={telemetry}
              blast={blast}
              mode={mode}
              running={running}
              multiplier={multiplier}
              selectedId={selectedId}
              link={link}
              trace={trace}
              reducedMotion={reducedMotion}
              showBadges
              onSelect={(id) => {
                setSelectedId(id);
                setLink(null);
              }}
              onHover={setLink}
              onHealth={handleHealth}
              onRps={handleRps}
              onLatency={handleLatency}
              onHoverLine={(line) =>
                setLink(line ? { nodes: [], edges: [], line } : null)
              }
              error={error ? `${error.line}: ${error.message}` : null}
            />
          ) : (
            <div className="canvas-grid flex flex-1 items-center justify-center">
              <div className="max-w-xs rounded-lg border border-slate-700/80 bg-slate-900/80 p-4 text-center">
                <p className="text-[12px] font-medium text-slate-200">No diagram rendered yet</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Write a flowchart or sequenceDiagram in the source pane to start the traffic simulation.
                </p>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-2">
            <div className="max-w-full overflow-x-auto">
              <TelemetryDock
                telemetry={telemetry}
                running={running}
                multiplier={multiplier}
                tracing={Boolean(trace)}
                onToggleRun={() => setRunning((current) => !current)}
                onStep={handleStep}
                onMultiplier={setMultiplier}
              />
            </div>
          </div>
        </div>
      </main>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-sky-400/40 bg-slate-900/95 px-3 py-2 text-[11px] text-sky-100 shadow-xl shadow-black/50"
        >
          <ExternalLink size={12} aria-hidden="true" className="text-sky-400" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function telemetryTick(): number {
  return Math.floor(Date.now() / 1400);
}

function ThemeAction({ theme, onClick }: { theme: MermaidThemeName; onClick: () => void }) {
  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      data-theme-toggle
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-slate-300 transition hover:border-amber-400/60 hover:text-amber-300 active:bg-slate-800"
    >
      {isLight ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
    </button>
  );
}

function HeaderAction({
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
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2 text-[11px] font-medium text-slate-300 transition hover:border-sky-400/60 hover:text-sky-200 active:bg-slate-800"
    >
      {children}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function MobileAction({
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
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-700/70 bg-slate-900/70 text-slate-300"
    >
      {children}
    </button>
  );
}
