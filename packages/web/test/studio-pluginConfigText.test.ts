import { describe, expect, it } from "bun:test";
import { shownConfig, type ConfigEdit } from "../src/areas/studio/panels/shared/pluginConfigText.js";
import { deadlinePatch } from "../src/areas/studio/draft/timer-deadline.js";

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

describe("deadlinePatch", () => {
  it("writes an empty CEL expression for cleared text, so the timer keeps its deadline", () => {
    const patch = deadlinePatch(undefined);
    expect(patch).toEqual({ deadline: { lang: "cel", src: "" } });
    expect("duration" in patch).toBe(false);
  });

  it("passes a typed expression through", () => {
    const deadline = { lang: "cel" as const, src: "data.due_at" };
    expect(deadlinePatch(deadline)).toEqual({ deadline });
  });
});
