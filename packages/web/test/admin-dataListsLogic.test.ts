import { describe, it, expect } from "bun:test";
import {
  activeRows,
  attributesPayload,
  attributesToInputs,
  badNumberAttributes,
  droppedColumns,
  duplicateValues,
  readLabel,
  toPayload,
  validateColumns,
  validateValues,
  MAX_DATA_LIST_COLUMNS,
  MAX_DATA_LIST_VALUES,
  type ColumnRow,
  type ValueRow,
} from "../src/areas/admin/screens/dataListsLogic.js";

const row = (value: string, label = value, retired = false, attributes: Record<string, string> = {}): ValueRow => ({
  value,
  label,
  attributes,
  retired,
});

const column = (key: string, type: ColumnRow["type"] = "string", label = key): ColumnRow => ({ key, label, type });

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
    expect(validateValues([row("a"), row("b")], "en")).toEqual([]);
  });

  it("refuses a set over the bound, counting only what is sent", () => {
    const over = Array.from({ length: MAX_DATA_LIST_VALUES + 1 }, (_, i) => row(`v${i}`));
    expect(validateValues(over, "en")).toHaveLength(1);
    over[0]!.retired = true;
    expect(validateValues(over, "en")).toEqual([]);
  });

  it("refuses an empty key, and an empty label on a row being sent", () => {
    expect(validateValues([row("")], "en")).toContain("Every value needs a key.");
    expect(validateValues([row("a", "")], "en")).toContain("Every value needs a label.");
    // A retired row is not sent, so its blank label blocks nothing.
    expect(validateValues([row("a", "A"), row("b", "", true)], "en")).toEqual([]);
  });

  it("names each duplicate", () => {
    expect(validateValues([row("a"), row("a")], "en")).toContain("'a' appears more than once.");
  });
});

describe("toPayload", () => {
  it("numbers sortOrder by row order and trims", () => {
    expect(toPayload([row(" a ", " A "), row("b", "B")], "en", {})).toEqual([
      { value: "a", label: { en: "A" }, attributes: {}, sortOrder: 0 },
      { value: "b", label: { en: "B" }, attributes: {}, sortOrder: 1 },
    ]);
  });

  it("carries the other locales of an existing value through untouched", () => {
    expect(toPayload([row("a", "Eins")], "de", { a: { en: "One", de: "Ein" } })).toEqual([
      { value: "a", label: { en: "One", de: "Eins" }, attributes: {}, sortOrder: 0 },
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

describe("validateValues follows the locale", () => {
  it("names the same problem differently in German", () => {
    // A label, so the missing key is the one problem in the list.
    const en = validateValues([row("", "A")], "en");
    const de = validateValues([row("", "A")], "de");
    expect(en).toHaveLength(1);
    expect(de).toHaveLength(1);
    expect(de[0]).not.toBe(en[0]);
  });
});

describe("validateColumns", () => {
  it("accepts a well-formed declaration", () => {
    expect(validateColumns([column("sku"), column("price", "number", "Price")], "en")).toEqual([]);
  });

  it("refuses a key outside the grammar", () => {
    expect(validateColumns([column("Unit Price")], "en")).toContain(
      "'Unit Price' is not a valid column key. Use lowercase letters, digits and underscores, starting with a letter.",
    );
  });

  it("refuses a blank heading and a duplicate key", () => {
    expect(validateColumns([column("sku", "string", "")], "en")).toContain("Column 'sku' needs a heading.");
    expect(validateColumns([column("sku"), column("sku")], "en")).toContain("Column 'sku' appears more than once.");
  });

  it("refuses a declaration over the bound", () => {
    const over = Array.from({ length: MAX_DATA_LIST_COLUMNS + 1 }, (_, i) => column(`c${i}`));
    expect(validateColumns(over, "en")).toContain(`A list declares at most ${MAX_DATA_LIST_COLUMNS} columns. This one has ${over.length}.`);
  });
});

describe("droppedColumns", () => {
  it("names what a save would remove, so the screen can warn first", () => {
    expect(droppedColumns([column("sku"), column("price")], [column("sku")])).toEqual(["price"]);
    expect(droppedColumns([column("sku")], [column("sku"), column("price")])).toEqual([]);
  });
});

describe("attributesPayload", () => {
  it("types each entry by its column", () => {
    const cols = [column("sku"), column("price", "number"), column("bulk", "boolean")];
    expect(attributesPayload({ sku: "A-1140", price: "12.5", bulk: "true" }, cols)).toEqual({
      sku: "A-1140",
      price: 12.5,
      bulk: true,
    });
  });

  it("omits a blank entry rather than writing a zero or an empty string", () => {
    // The engine's "an unfilled column writes nothing" rule depends on the
    // difference: a 0 would land in the mapped field and read as a real price.
    expect(attributesPayload({ price: "" }, [column("price", "number")])).toEqual({});
    expect(attributesPayload({ sku: "  " }, [column("sku")])).toEqual({});
  });

  it("ignores a key naming no declared column", () => {
    expect(attributesPayload({ gone: "x" }, [column("sku")])).toEqual({});
  });
});

describe("attributesToInputs", () => {
  it("gives one string per declared column, blank when unfilled", () => {
    expect(attributesToInputs({ price: 12.5 }, [column("price", "number"), column("sku")])).toEqual({ price: "12.5", sku: "" });
  });
});

describe("badNumberAttributes", () => {
  it("names a number column an operator filled with something else", () => {
    const rows = [row("a", "A", false, { price: "cheap" })];
    expect(badNumberAttributes(rows, [column("price", "number")], "en")).toContain("'cheap' is not a number, and column 'price' holds numbers.");
  });

  it("passes a blank entry and a retired row", () => {
    expect(badNumberAttributes([row("a", "A", false, { price: "" })], [column("price", "number")], "en")).toEqual([]);
    expect(badNumberAttributes([row("a", "A", true, { price: "cheap" })], [column("price", "number")], "en")).toEqual([]);
  });
});

describe("validateColumns produces repeatable sentences", () => {
  it("names two blank columns with the same sentence twice", () => {
    // This is why DataListScreen keys the problem list by position. Keying by
    // the message collides here, and a duplicate React key leaves stale
    // entries on screen after the problems clear.
    // Two blank columns: a key problem and a heading problem each, plus the
    // duplicate-key problem their shared empty key produces.
    const problems = validateColumns([column("", "string", ""), column("", "string", "")], "en");
    expect(problems).toHaveLength(5);
    expect(new Set(problems).size).toBe(3);
  });
});
