import { describe, expect, it } from "bun:test";
import { parseDraftText, formatDraftText } from "../src/panels/draftJsonLogic.js";

describe("parseDraftText", () => {
  it("treats empty or whitespace-only text as an empty draft", () => {
    expect(parseDraftText("")).toEqual({ draft: {} });
    expect(parseDraftText("   \n  ")).toEqual({ draft: {} });
  });

  it("parses and round-trips a valid draft object", () => {
    const text = formatDraftText({ key: "expense-approval", fields: [] });
    expect(parseDraftText(text)).toEqual({ draft: { key: "expense-approval", fields: [] } });
  });

  it("reports an error for malformed JSON, never throws", () => {
    const result = parseDraftText("{not json");
    expect("error" in result).toBe(true);
  });

  it("reports an error for a non-object JSON value", () => {
    expect("error" in parseDraftText("[]")).toBe(true);
    expect("error" in parseDraftText('"hello"')).toBe(true);
    expect("error" in parseDraftText("42")).toBe(true);
    expect("error" in parseDraftText("null")).toBe(true);
  });

  it("reports an error mentioning the field for a wrong-typed known field", () => {
    const result = parseDraftText('{"fields": "oops"}');
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("fields");
  });
});

describe("formatDraftText", () => {
  it("pretty-prints a draft", () => {
    expect(formatDraftText({ key: "a" })).toBe('{\n  "key": "a"\n}');
  });
});
