import mermaid from "mermaid";

export type MermaidThemeName = "dark" | "light";

const THEME_VARIABLES: Record<MermaidThemeName, Record<string, string>> = {
  dark: {
    background: "#050810",
    primaryColor: "#0f172a",
    primaryTextColor: "#f8fafc",
    primaryBorderColor: "#334155",
    secondaryColor: "#111c33",
    tertiaryColor: "#0b1120",
    lineColor: "#475569",
    textColor: "#e2e8f0",
    mainBkg: "#0f172a",
    nodeBorder: "#334155",
    clusterBkg: "rgba(15,23,42,0.6)",
    clusterBorder: "#334155",
    edgeLabelBackground: "#0b1120",
    actorBkg: "#0f172a",
    actorBorder: "#334155",
    actorTextColor: "#e2e8f0",
    signalColor: "#38bdf8",
    signalTextColor: "#cbd5e1",
    noteBkgColor: "#111c33",
    noteBorderColor: "#334155",
  },
  light: {
    background: "#f4f7fb",
    primaryColor: "#ffffff",
    primaryTextColor: "#0f172a",
    primaryBorderColor: "#94a3b8",
    secondaryColor: "#e8eef7",
    tertiaryColor: "#eef2f8",
    lineColor: "#94a3b8",
    textColor: "#1e293b",
    mainBkg: "#ffffff",
    nodeBorder: "#94a3b8",
    clusterBkg: "rgba(226,233,242,0.75)",
    clusterBorder: "#b3c1d4",
    edgeLabelBackground: "#eef2f8",
    actorBkg: "#ffffff",
    actorBorder: "#94a3b8",
    actorTextColor: "#0f172a",
    signalColor: "#0284c7",
    signalTextColor: "#334155",
    noteBkgColor: "#f1f5f9",
    noteBorderColor: "#94a3b8",
  },
};

let readyTheme: MermaidThemeName | null = null;

export function initMermaid(theme: MermaidThemeName = "dark"): void {
  if (readyTheme === theme) return;
  readyTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    fontFamily: "'Inter', system-ui, sans-serif",
    themeVariables: THEME_VARIABLES[theme],
    flowchart: { curve: "basis", padding: 22, htmlLabels: true, useMaxWidth: false },
    sequence: { useMaxWidth: false, mirrorActors: false, messageAlign: "center" },
  });
}

let renderSeq = 0;

export async function validateMermaid(code: string, theme: MermaidThemeName = "dark"): Promise<void> {
  initMermaid(theme);
  await mermaid.parse(code);
}

export async function renderMermaid(code: string, theme: MermaidThemeName = "dark"): Promise<string> {
  initMermaid(theme);
  renderSeq += 1;
  const id = `mermaidpulse-${Date.now().toString(36)}-${renderSeq}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}
