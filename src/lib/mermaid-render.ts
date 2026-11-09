export function extractErrorLine(message: string, totalLines: number): number {
  const patterns = [
    /Parse error on line (\d+)/i,
    /"first_line"\s*:\s*(\d+)/i,
    /line (\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return Math.min(totalLines, Math.max(1, parsed));
    }
  }
  return Math.max(1, totalLines);
}

export function cleanErrorMessage(message: string): string {
  const firstLine = message.split("\n").find((line) => line.trim().length > 0) ?? "Invalid Mermaid syntax";
  return firstLine.replace(/^Error:\s*/i, "").trim().slice(0, 180);
}
