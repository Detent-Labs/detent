import { describe, expect, it } from "bun:test";
import { parseSpecText, formatSpecText } from "../src/screens/migrationPlanLogic.js";

describe("parseSpecText", () => {
  it("treats empty input as an empty plan", () => {
    expect(parseSpecText("")).toEqual({ spec: {} });
    expect(parseSpecText("   ")).toEqual({ spec: {} });
  });

  it("parses valid JSON", () => {
    expect(parseSpecText('{"fieldMap": {"field_a": "field_b"}}')).toEqual({ spec: { fieldMap: { field_a: "field_b" } } });
  });

  it("reports an error for malformed JSON, never throws", () => {
    const result = parseSpecText("{not json");
    expect("error" in result).toBe(true);
  });
});

describe("formatSpecText", () => {
  it("pretty-prints a spec", () => {
    expect(formatSpecText({ fieldMap: { field_a: "field_b" } })).toBe('{\n  "fieldMap": {\n    "field_a": "field_b"\n  }\n}');
  });

  it("formats undefined as an empty object", () => {
    expect(formatSpecText(undefined)).toBe("{}");
  });
});
