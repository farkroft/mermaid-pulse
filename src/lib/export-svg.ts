const INTERACTIVE_ATTRS = /\s(on[a-z]+|contenteditable|tabindex)="[^"]*"/gi;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitizeFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "mermaidpulse-diagram"}.svg`;
}

export function buildStandaloneSvg(svgMarkup: string, overlayMarkup: string, title: string): string {
  const cleaned = svgMarkup.replace(INTERACTIVE_ATTRS, "");
  const viewBox = cleaned.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1200 800";
  const [, , width = "1200", height = "800"] = viewBox.split(/[\s,]+/);
  const inner = cleaned
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<style[\s\S]*?<\/style>/g, "");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}">
<title>${escapeXml(title)}</title>
<rect x="0" y="0" width="100%" height="100%" fill="#050810"/>
${inner}
${overlayMarkup}
</svg>`;
}
