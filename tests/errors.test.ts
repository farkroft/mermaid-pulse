import { describe, expect, it } from "vitest";
import { extractErrorLine } from "../src/lib/mermaid-render";

describe("mermaid error extraction", () => {
  it("reads the line from a parse error message", () => {
    const message = "Parse error on line 4:\n... A --> \n----------^\nExpecting 'NODE_STRING'";
    expect(extractErrorLine(message, 8)).toBe(4);
  });

  it("reads the line from a hash payload", () => {
    const message = "Syntax error in text\nmermaid version 11.12.0\n{\"hash\":{\"loc\":{\"first_line\":6}}}";
    expect(extractErrorLine(message, 10)).toBe(6);
  });

  it("clamps to the document bounds", () => {
    expect(extractErrorLine("Parse error on line 99: nope", 5)).toBe(5);
    expect(extractErrorLine("Parse error on line 0: nope", 5)).toBe(1);
  });

  it("falls back to the last line when no number is present", () => {
    expect(extractErrorLine("Something broke", 12)).toBe(12);
  });
});
