import { describe, it, expect } from "bun:test";
import {
  activeRows,
  duplicateValues,
  readLabel,
  toPayload,
  validateValues,
  MAX_DATA_LIST_VALUES,
  type ValueRow,
} from "../src/areas/admin/screens/dataListsLogic.js";

const row = (value: string, label = value, retired = false): ValueRow => ({ value, label, retired });

describe("duplicateValues", () => {
  it("names a value that appears twice, retired or not", () => {
    expect(duplicateValues([row("a"), row("b"), row("a")])).toEqual(["a"]);
    // The primary key is (list_key, value), so a retired twin collides too.
    expect(duplicateValues([row("a"), row("a", "a", true)])).toEqual(["a"]);
  });

  it("reports nothing for a clean set", () => {
    expect(duplicateValues([row("a"), row("b")])).toEqual([]);
  });
});

describe("activeRows", () => {
  it("drops the retired rows, which is what deactivates them on save", () => {
    expect(activeRows([row("a"), row("b", "b", true)]).map((r) => r.value)).toEqual(["a"]);
  });
});

describe("validateValues", () => {
  it("accepts a well-formed set", () => {
    expect(validateValues([row("a"), row("b")])).toEqual([]);
  });

  it("refuses a set over the bound, counting only what is sent", () => {
    const over = Array.from({ length: MAX_DATA_LIST_VALUES + 1 }, (_, i) => row(`v${i}`));
    expect(validateValues(over)).toHaveLength(1);
    over[0]!.retired = true;
    expect(validateValues(over)).toEqual([]);
  });

  it("refuses an empty key, and an empty label on a row being sent", () => {
    expect(validateValues([row("")])).toContain("Every value needs a key.");
    expect(validateValues([row("a", "")])).toContain("Every value needs a label.");
    // A retired row is not sent, so its blank label blocks nothing.
    expect(validateValues([row("a", "A"), row("b", "", true)])).toEqual([]);
  });

  it("names each duplicate", () => {
    expect(validateValues([row("a"), row("a")])).toContain("'a' appears more than once.");
  });
});

describe("toPayload", () => {
  it("numbers sortOrder by row order and trims", () => {
    expect(toPayload([row(" a ", " A "), row("b", "B")], "en", {})).toEqual([
      { value: "a", label: { en: "A" }, sortOrder: 0 },
      { value: "b", label: { en: "B" }, sortOrder: 1 },
    ]);
  });

  it("carries the other locales of an existing value through untouched", () => {
    expect(toPayload([row("a", "Eins")], "de", { a: { en: "One", de: "Ein" } })).toEqual([
      { value: "a", label: { en: "One", de: "Eins" }, sortOrder: 0 },
    ]);
  });

  it("leaves retired rows out", () => {
    expect(toPayload([row("a"), row("b", "b", true)], "en", {})).toHaveLength(1);
  });
});

describe("readLabel", () => {
  it("prefers the locale asked for, falls back to any the value carries, then to nothing", () => {
    expect(readLabel({ en: "One", de: "Eins" }, "de")).toBe("Eins");
    // A list is global while a process is not, so a missing locale is legitimate.
    expect(readLabel({ en: "One" }, "de")).toBe("One");
    expect(readLabel({}, "de")).toBe("");
  });
});
