import { describe, expect, it } from "bun:test";
import { parseLines, parsedConfigBase, shownConfig, shownLines, type ConfigEdit, type LinesEdit } from "../src/areas/studio/panels/shared/pluginConfigText.js";

/** `studio-plugin-config-form`: the raw JSON text follows the stored config. */

const typed = (text: string, config: unknown, error: string | null = null): ConfigEdit => ({
  text,
  base: JSON.stringify(config),
  error,
});

describe("shownConfig", () => {
  it("prints the stored config when nothing was typed", () => {
    expect(shownConfig(null, { listKey: "countries" })).toEqual({ text: '{\n  "listKey": "countries"\n}', error: null });
    expect(shownConfig(null, undefined)).toEqual({ text: "{}", error: null });
  });

  it("replaces stale text when a picker writes a list key", () => {
    const edit = typed("{}", {});
    expect(shownConfig(edit, { listKey: "countries" })).toEqual({ text: '{\n  "listKey": "countries"\n}', error: null });
  });

  it("shows a generated form write after a switch to JSON", () => {
    // `switchToJson` clears the edit, so the text is the stored config.
    expect(shownConfig(null, { url: "https://example.test" }).text).toBe('{\n  "url": "https://example.test"\n}');
  });

  it("keeps the exact text the author typed while it parses to the stored config", () => {
    const text = '{"listKey":   "countries"}';
    const config = JSON.parse(text);
    expect(shownConfig(typed(text, config), config)).toEqual({ text, error: null });
  });

  it("keeps invalid text and its error while the stored config holds", () => {
    const config = { listKey: "countries" };
    const edit = typed('{"listKey": ', config, "Unexpected end of JSON input");
    expect(shownConfig(edit, config)).toEqual({ text: '{"listKey": ', error: "Unexpected end of JSON input" });
  });

  it("replaces invalid text and drops its error when the config moves", () => {
    const edit = typed('{"listKey": ', {}, "Unexpected end of JSON input");
    expect(shownConfig(edit, { listKey: "countries" })).toEqual({ text: '{\n  "listKey": "countries"\n}', error: null });
  });
});

describe("parsedConfigBase", () => {
  it("reads the valid text `null` as the empty config, the way shownConfig reads a stored null", () => {
    const edit: ConfigEdit = { text: "null", base: parsedConfigBase(null), error: null };
    expect(edit.base).toBe("{}");
    expect(shownConfig(edit, null)).toEqual({ text: "null", error: null });
  });

  it("stringifies any other parsed value as is", () => {
    expect(parsedConfigBase({ listKey: "countries" })).toBe('{"listKey":"countries"}');
    expect(parsedConfigBase([])).toBe("[]");
  });
});

describe("shownLines", () => {
  const typedLines = (text: string): LinesEdit => ({ text, base: JSON.stringify(parseLines(text)) });

  it("keeps a trailing newline after Enter", () => {
    expect(shownLines(typedLines("requester\n"), ["requester"])).toBe("requester\n");
  });

  it("keeps a typed space while the list holds", () => {
    expect(shownLines(typedLines("finance "), ["finance"])).toBe("finance ");
    expect(shownLines(typedLines("finance approver"), ["finance approver"])).toBe("finance approver");
  });

  it("keeps a trailing blank line and stores no empty value", () => {
    const text = "a\nb\n\n";
    expect(parseLines(text)).toEqual(["a", "b"]);
    expect(shownLines(typedLines(text), ["a", "b"])).toBe(text);
  });

  it("replaces the text when another write changes the list", () => {
    expect(shownLines(typedLines("a\n"), ["x", "y"])).toBe("x\ny");
  });

  it("prints the stored list with no edit, and nothing for a non-list", () => {
    expect(shownLines(null, ["a", "b"])).toBe("a\nb");
    expect(shownLines(null, undefined)).toBe("");
  });
});
