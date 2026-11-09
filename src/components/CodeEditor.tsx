import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, GitBranch, Layers, Plus, Radio, Workflow, WrapText } from "lucide-react";
import type { SnippetKind } from "../lib/diagram";
import { insertSnippet } from "../lib/diagram";

export interface EditorError {
  line: number;
  message: string;
}

interface CodeEditorProps {
  code: string;
  onChange: (next: string) => void;
  error: EditorError | null;
  highlightLine: number | null;
  highlightNodeIds: string[];
  selectedNodeId: string | null;
  selectedLine: number | null;
  selectedLines: number[];
  stats: { nodes: number; edges: number };
  onInsert: (kind: SnippetKind) => void;
  onCursorLine: (line: number) => void;
  presetName: string;
}

const SNIPPETS: Array<{ kind: SnippetKind; label: string; icon: typeof Plus; hint: string }> = [
  { kind: "service", label: "+ Service", icon: Workflow, hint: "Append a service node" },
  { kind: "database", label: "+ Database", icon: Database, hint: "Append a cylinder database" },
  { kind: "queue", label: "+ Queue", icon: Radio, hint: "Append a hexagon queue" },
  { kind: "subgraph", label: "+ Subgraph", icon: Layers, hint: "Append a subgraph block" },
  { kind: "directive", label: "+ Telemetry", icon: GitBranch, hint: "Append a %% @node directive" },
];

const LINE_HEIGHT = 22;

export default function CodeEditor({
  code,
  onChange,
  error,
  highlightLine,
  highlightNodeIds,
  selectedNodeId,
  selectedLine,
  selectedLines,
  stats,
  onInsert,
  onCursorLine,
  presetName,
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeLine, setActiveLine] = useState(1);
  const lastJumpTarget = useRef<number | null>(null);
  const [wrap, setWrap] = useState<boolean>(() => readWrapPreference());
  // Row heights are only known after the browser lays out the mirrored text;
  // gutter + scroll math consume them so wrapped lines stay aligned.
  const [rowHeights, setRowHeights] = useState<number[]>([]);

  const lines = useMemo(() => code.split("\n"), [code]);
  const selectedSet = useMemo(() => new Set(selectedLines), [selectedLines]);

  const measureRows = useCallback(() => {
    const node = mirrorRef.current;
    if (!node) return;
    const next = Array.from(node.children, (child) => (child as HTMLElement).offsetHeight);
    setRowHeights((current) =>
      current.length === next.length && current.every((height, index) => height === next[index])
        ? current
        : next,
    );
  }, []);

  useLayoutEffect(measureRows, [measureRows, code, wrap]);

  const viewportNode = viewportRef.current;
  useEffect(() => {
    if (!viewportNode) return;
    const observer = new ResizeObserver(() => measureRows());
    observer.observe(viewportNode);
    return () => observer.disconnect();
  }, [measureRows, viewportNode]);

  const heightAt = useCallback(
    (index: number): number => rowHeights[index] ?? LINE_HEIGHT,
    [rowHeights],
  );

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const scrollTop = -(textarea?.scrollTop ?? 0);
    const scrollLeft = -(textarea?.scrollLeft ?? 0);
    if (gutterRef.current) gutterRef.current.scrollTop = -scrollTop;
    if (mirrorRef.current) {
      mirrorRef.current.style.transform = `translate3d(${scrollLeft}px, ${scrollTop}px, 0)`;
    }
  }, []);

  const jumpToLine = useCallback((line: number, stealFocus = true) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const rows = code.split("\n");
    const offset = rows.slice(0, Math.max(0, line - 1)).reduce((sum, row) => sum + row.length + 1, 0);
    const end = offset + (rows[line - 1]?.length ?? 0);
    // Only pull focus when the user is already working inside the editor. A
    // hover or focus coming from the canvas must not steal keyboard focus.
    const ownsFocus =
      document.activeElement === textarea || document.activeElement === document.body;
    if (stealFocus && ownsFocus) {
      textarea.focus();
      textarea.setSelectionRange(offset, end);
    }
    // With wrapped rows the target line does not sit at (line-1) * 22px;
    // sum the rendered row heights instead, keeping a little context above.
    let top = Math.max(0, (line - 4) * LINE_HEIGHT);
    if (rowHeights.length === rows.length && rowHeights.length > 0) {
      let above = 0;
      for (let index = 0; index < Math.max(0, line - 1); index += 1) above += rowHeights[index] ?? LINE_HEIGHT;
      top = Math.max(0, above - 3 * LINE_HEIGHT);
    }
    textarea.scrollTop = top;
    syncScroll();
    setActiveLine(line);
  }, [code, rowHeights, syncScroll]);

  useEffect(() => {
    if (highlightLine) jumpToLine(highlightLine, false);
  }, [highlightLine, jumpToLine]);

  // A canvas selection scrolls the editor to the node's declaration once per
  // selection instead of re-aiming mid-edit while the user types.
  useEffect(() => {
    if (selectedLine === lastJumpTarget.current) return;
    lastJumpTarget.current = selectedLine;
    if (selectedLine) jumpToLine(selectedLine, false);
  }, [selectedLine, jumpToLine]);

  const updateActiveLine = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const line = code.slice(0, cursor).split("\n").length;
    setActiveLine(line);
    onCursorLine(line);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${code.slice(0, start)}  ${code.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    });
  };

  const insert = (kind: SnippetKind) => {
    onInsert(kind);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      textarea.scrollTop = textarea.scrollHeight;
      syncScroll();
    });
  };

  const toggleWrap = useCallback(() => {
    setWrap((current) => {
      const next = !current;
      persistWrapPreference(next);
      return next;
    });
  }, []);

  const linkedChip = highlightNodeIds.length > 0;

  return (
    <section
      aria-label="Mermaid authoring pane"
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-slate-800/80 bg-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Source</span>
          <span className="max-w-[190px] truncate rounded border border-slate-700/70 bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {presetName}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleWrap}
            aria-pressed={wrap}
            aria-label="Toggle line wrap"
            data-wrap-toggle
            title={wrap ? "Disable line wrap" : "Enable line wrap"}
            className={[
              "grid h-6 w-6 place-items-center rounded border transition",
              wrap
                ? "border-sky-400/70 bg-sky-400/15 text-sky-300"
                : "border-slate-700/60 bg-slate-900/60 text-slate-400 hover:border-sky-400/60 hover:text-sky-300",
            ].join(" ")}
          >
            <WrapText size={12} aria-hidden="true" />
          </button>
          <span className="font-mono text-[10px] text-slate-400">{lines.length} lines</span>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-1 border-b border-slate-800/70 bg-gutter px-2 py-1.5"
        role="toolbar"
        aria-label="Quick insert snippets"
      >
        {SNIPPETS.map(({ kind, label, icon: Icon, hint }) => (
          <button
            key={kind}
            type="button"
            onClick={() => insert(kind)}
            title={hint}
            className="flex items-center gap-1 rounded border border-slate-700/70 bg-slate-900/70 px-1.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-sky-400/70 hover:bg-sky-400/10 hover:text-sky-200 active:bg-sky-400/20"
          >
            <Icon size={12} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="w-11 shrink-0 overflow-hidden border-r border-slate-800/60 bg-gutter py-2 text-right font-mono text-[12px] leading-[22px] text-slate-400"
        >
          {lines.map((_, index) => {
            const lineNo = index + 1;
            const isAnchor = lineNo === selectedLine;
            const isGlow = selectedSet.has(lineNo);
            const isActive = lineNo === activeLine;
            const isLinked = highlightLine === lineNo;
            const isError = error?.line === lineNo;
            return (
              <div
                key={lineNo}
                style={{ height: heightAt(index) }}
                className={[
                  "pr-2 tabular-nums",
                  isActive ? "text-sky-300" : "",
                  isGlow ? "gutter-selected" : "",
                  isAnchor ? "gutter-selected-anchor" : "",
                  isLinked ? "bg-sky-400/10 text-sky-300" : "",
                  isError ? "bg-rose-500/20 text-rose-300" : "",
                ].join(" ")}
              >
                {lineNo}
              </div>
            );
          })}
        </div>

        <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 select-none overflow-hidden"
          >
            <div
              ref={mirrorRef}
              data-code-mirror
              className="absolute left-0 top-0 w-full py-2 font-mono text-[13px] leading-[22px] text-slate-100"
              style={{ transform: "translate3d(0, 0, 0)", willChange: "transform" }}
            >
              {lines.map((text, index) => {
                const lineNo = index + 1;
                const isAnchor = lineNo === selectedLine;
                const isGlow = selectedSet.has(lineNo);
                const isLinked = highlightLine === lineNo;
                return (
                  <div
                    key={lineNo}
                    style={{ minHeight: LINE_HEIGHT }}
                    className={[
                      wrap ? "whitespace-pre-wrap" : "whitespace-pre",
                      isGlow && !isAnchor ? "band-selected-line" : "",
                      isAnchor ? "band-selected-anchor" : "",
                      isLinked ? "line-flash" : "",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "block pl-3",
                        wrap ? "whitespace-pre-wrap pr-[21px]" : "whitespace-pre pr-3",
                        isGlow ? (isAnchor ? "code-node-glow-strong" : "code-node-glow") : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {text || " "}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <textarea
            ref={textareaRef}
            aria-label="Mermaid code editor"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={code}
            onChange={(event) => onChange(event.target.value)}
            onScroll={syncScroll}
            onInput={updateActiveLine}
            onClick={updateActiveLine}
            onKeyUp={updateActiveLine}
            onKeyDown={handleKeyDown}
            className={[
              "scrollbar-thin absolute inset-0 h-full min-h-0 w-full resize-none bg-transparent px-3 py-2 font-mono text-[13px] leading-[22px] text-transparent caret-sky-400 outline-none",
              wrap
                ? "overflow-x-hidden overflow-y-scroll [scrollbar-gutter:stable] whitespace-pre-wrap"
                : "overflow-y-auto overflow-x-auto whitespace-pre",
            ].join(" ")}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-800/70 bg-gutter px-3 py-2 text-[11px]">
        {error ? (
          <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-rose-300">
            <AlertTriangle size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">
              <span className="font-mono">Line {error.line}</span>: {error.message}
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 text-slate-400">
            <CheckCircle2 size={12} aria-hidden="true" className="shrink-0 text-emerald-400" />
            <span className="truncate">
              Syntax valid <span className="text-slate-400">•</span>{" "}
              <span className="font-mono tabular-nums text-slate-300">{stats.nodes}</span> nodes{" "}
              <span className="text-slate-400">•</span>{" "}
              <span className="font-mono tabular-nums text-slate-300">{stats.edges}</span> edges
            </span>
            {selectedNodeId ? (
              <span
                data-selected-node
                className="ml-auto shrink-0 rounded border border-sky-400/50 bg-sky-400/15 px-1.5 py-0.5 font-mono text-[10px] text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.35)]"
              >
                {selectedNodeId}
              </span>
            ) : null}
            {linkedChip ? (
              <span
                data-linked-node
                className="ml-auto shrink-0 rounded border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300"
              >
                {highlightNodeIds.slice(0, 2).join(" · ")}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function readWrapPreference(): boolean {
  try {
    return window.localStorage.getItem("mermaidpulse-wrap") === "1";
  } catch {
    return false;
  }
}

function persistWrapPreference(wrap: boolean): void {
  try {
    window.localStorage.setItem("mermaidpulse-wrap", wrap ? "1" : "0");
  } catch {
    // Storage unavailable; the toggle still works for this session.
  }
}

export { insertSnippet };
