/**
 * field-model-type-format-control: the engine half of the type/format/control
 * split. `type` carries the value form, `format` the semantics, `control` the
 * input form. One rejecting test per invariant this change lands, per the
 * repo's standing rule.
 *
 * Four surfaces: `formatMatches`/`typeMatches` (the value check submission and
 * outbox writeback share), `expectedTypeLabel` (the diagnostic), `celType`
 * (`format: "integer"` reports `int`), and `compile.ts`'s allowed-pair check
 * (the publish-time verdict a hand-written body cannot bypass).
 *
 * The minimal-body-mutated-to-trip-one-check style follows
 * test/compile-validation.test.ts, the sibling suite for the write path.
 */
import { describe, it, expect } from "bun:test";
import {
  formatMatches,
  typeMatches,
  expectedTypeLabel,
  ALLOWED_BY_TYPE,
  baseFieldType,
  fieldFormat,
  fieldControl,
  fieldDef,
  type BaseFieldType,
  type FieldDef,
  type FieldFormat,
  type ProcessBody,
} from "../src/schema/definition.js";
import { compileProcessBody, CompileValidationError } from "../src/schema/compile.js";
import { celType, checkAgainstFields } from "../src/cel/check.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fld = (over: any): FieldDef => ({ id: "field_x", key: "x", label: { en: "X" }, ...over }) as FieldDef;

/** The pair `formatMatches` takes: `format` required, unlike `FieldDef`'s. */
const ff = (type: BaseFieldType, format: FieldFormat) => ({ type, format });

/** A minimal, otherwise-clean two-step body carrying one catalog field. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bodyWith = (field: any): any => ({
  key: "p",
  label: { en: "P" },
  baseLocale: "en",
  fields: [field],
  workflow: {
    initialStep: "step_a",
    steps: [
      {
        id: "step_a",
        key: "a",
        label: { en: "A" },
        type: "task",
        paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
      },
      { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
    ],
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rejects = (body: any): CompileValidationError => {
  try {
    compileProcessBody(body as ProcessBody);
    throw new Error("expected compileProcessBody to throw CompileValidationError");
  } catch (err) {
    expect(err).toBeInstanceOf(CompileValidationError);
    return err as CompileValidationError;
  }
};

// ============================================================
// The six value forms, and the two closed enums beside them.
// ============================================================

describe("the type enum", () => {
  it("holds exactly the six value forms", () => {
    expect([...baseFieldType.options].sort()).toEqual(["boolean", "file", "group", "list", "number", "string"]);
  });

  it("names every type in the allowed-pairs table", () => {
    expect(Object.keys(ALLOWED_BY_TYPE).sort()).toEqual([...baseFieldType.options].sort());
  });

  it("admits only format and control members the two enums declare", () => {
    for (const row of Object.values(ALLOWED_BY_TYPE)) {
      for (const f of row.formats) expect(fieldFormat.options).toContain(f);
      for (const c of row.controls) expect(fieldControl.options).toContain(c);
    }
  });
});

// ============================================================
// The format value checks (design.md Decision 3, D19).
// ============================================================

describe("formatMatches: date", () => {
  it("accepts an ISO-8601 calendar date", () => {
    expect(formatMatches(ff("string", "date"), "2026-02-28")).toBe(true);
  });

  it("rejects a date the calendar does not hold", () => {
    expect(formatMatches(ff("string", "date"), "2026-02-30")).toBe(false);
  });

  it("rejects free text, which the type check alone accepted", () => {
    expect(formatMatches(ff("string", "date"), "banane")).toBe(false);
  });

  it("rejects a datetime, which carries a time part", () => {
    expect(formatMatches(ff("string", "date"), "2026-02-28T10:00")).toBe(false);
  });
});

describe("formatMatches: datetime", () => {
  it("accepts what a datetime-local input produces", () => {
    expect(formatMatches(ff("string", "datetime"), "2026-02-28T10:00")).toBe(true);
  });

  it("accepts a seconds part, a fractional part and a zone offset", () => {
    expect(formatMatches(ff("string", "datetime"), "2026-02-28T10:00:30")).toBe(true);
    expect(formatMatches(ff("string", "datetime"), "2026-02-28T10:00:30.250Z")).toBe(true);
    expect(formatMatches(ff("string", "datetime"), "2026-02-28T10:00:30+02:00")).toBe(true);
  });

  it("rejects an out-of-range hour", () => {
    expect(formatMatches(ff("string", "datetime"), "2026-02-28T24:00")).toBe(false);
  });

  it("rejects a date with no time part", () => {
    expect(formatMatches(ff("string", "datetime"), "2026-02-28")).toBe(false);
  });
});

describe("formatMatches: integer", () => {
  it("accepts a whole number", () => {
    expect(formatMatches(ff("number", "integer"), 3)).toBe(true);
  });

  it("rejects a decimal", () => {
    expect(formatMatches(ff("number", "integer"), 3.5)).toBe(false);
  });

  it("rejects a numeric string", () => {
    expect(formatMatches(ff("number", "integer"), "3")).toBe(false);
  });
});

describe("formatMatches: email", () => {
  it("accepts what the native control accepts", () => {
    expect(formatMatches(ff("string", "email"), "a.b+c@example.co.uk")).toBe(true);
  });

  it("rejects an address with no domain", () => {
    expect(formatMatches(ff("string", "email"), "roman@")).toBe(false);
  });

  it("rejects an address carrying a space", () => {
    expect(formatMatches(ff("string", "email"), "a b@example.com")).toBe(false);
  });
});

// The first format `ALLOWED_BY_TYPE` admits on `list`, so the first one whose
// rule forks on the field's own type rather than reading the value alone
// (field-model-person-format design.md Decision 2).
describe("formatMatches: person", () => {
  it("accepts one prefixed id on a string field", () => {
    expect(formatMatches(ff("string", "person"), "user_a")).toBe(true);
    expect(formatMatches(ff("string", "person"), "group_finance")).toBe(true);
  });

  it("accepts a list of prefixed ids on a list field", () => {
    expect(formatMatches(ff("list", "person"), ["user_a", "group_finance"])).toBe(true);
    expect(formatMatches(ff("list", "person"), [])).toBe(true);
  });

  it("rejects an id carrying neither prefix", () => {
    expect(formatMatches(ff("string", "person"), "roman")).toBe(false);
    expect(formatMatches(ff("string", "person"), "role_finance")).toBe(false);
  });

  it("rejects a list where one element carries no prefix", () => {
    expect(formatMatches(ff("list", "person"), ["user_a", "not-a-principal-id"])).toBe(false);
  });

  it("forks on the field's type, so each rejects the other's value shape", () => {
    expect(formatMatches(ff("string", "person"), ["user_a"])).toBe(false);
    expect(formatMatches(ff("list", "person"), "user_a")).toBe(false);
  });
});

// ============================================================
// typeMatches: the JS shape first, then the format's value domain.
// ============================================================

describe("typeMatches", () => {
  it("checks the JS shape of every value form", () => {
    expect(typeMatches(fld({ type: "string" }), "x")).toBe(true);
    expect(typeMatches(fld({ type: "string" }), 1)).toBe(false);
    expect(typeMatches(fld({ type: "number" }), 1.5)).toBe(true);
    expect(typeMatches(fld({ type: "number" }), "1")).toBe(false);
    expect(typeMatches(fld({ type: "boolean" }), true)).toBe(true);
    expect(typeMatches(fld({ type: "list" }), ["a", "b"])).toBe(true);
    expect(typeMatches(fld({ type: "list" }), "a")).toBe(false);
    expect(typeMatches(fld({ type: "list" }), [1])).toBe(false);
  });

  it("runs the format check after the shape check", () => {
    const dateField = fld({ type: "string", format: "date" });
    expect(typeMatches(dateField, "2026-02-28")).toBe(true);
    expect(typeMatches(dateField, "banane")).toBe(false);
    expect(typeMatches(dateField, 20260228)).toBe(false);
  });

  it("rejects a decimal for an integer-formatted number field", () => {
    expect(typeMatches(fld({ type: "number", format: "integer" }), 3)).toBe(true);
    expect(typeMatches(fld({ type: "number", format: "integer" }), 3.5)).toBe(false);
  });

  it("accepts any value for a file field and for a plugin envelope", () => {
    expect(typeMatches(fld({ type: "file" }), "anything")).toBe(true);
    expect(typeMatches(fld({ type: { type: "org.signature", config: {} } }), 42)).toBe(true);
  });
});

describe("expectedTypeLabel", () => {
  it("names the format where the field declares one, since that is the narrower rule", () => {
    expect(expectedTypeLabel(fld({ type: "string", format: "date" }))).toBe("date");
    expect(expectedTypeLabel(fld({ type: "number", format: "integer" }))).toBe("integer");
  });

  it("names the JS shape otherwise", () => {
    expect(expectedTypeLabel(fld({ type: "string" }))).toBe("string");
    expect(expectedTypeLabel(fld({ type: "list" }))).toBe("string[]");
    expect(expectedTypeLabel(fld({ type: { type: "org.signature", config: {} } }))).toBe("any");
  });
});

// ============================================================
// The Zod schema: both keys optional, both closed (D6, D20, D21).
// ============================================================

describe("fieldDef parses format and control", () => {
  it("accepts a body field declaring both keys", () => {
    const parsed = fieldDef.parse({ id: "field_x", key: "x", label: { en: "X" }, type: "string", format: "date", control: "multiline" });
    expect(parsed.format).toBe("date");
    expect(parsed.control).toBe("multiline");
  });

  it("rejects a format member the enum does not declare", () => {
    expect(() => fieldDef.parse({ id: "field_x", key: "x", label: { en: "X" }, type: "string", format: "phone" })).toThrow();
  });

  it("rejects a control member the enum does not declare", () => {
    expect(() => fieldDef.parse({ id: "field_x", key: "x", label: { en: "X" }, type: "string", control: "slider" })).toThrow();
  });

  it("leaves a field declaring neither key unchanged, so no existing body moves", () => {
    const parsed = fieldDef.parse({ id: "field_x", key: "x", label: { en: "X" }, type: "string" });
    expect(parsed.format).toBeUndefined();
    expect(parsed.control).toBeUndefined();
  });
});

// ============================================================
// celType: format: "integer" reports int (D24, Decision 5).
// ============================================================

describe("celType", () => {
  it("maps each of the six value forms to one CEL type", () => {
    expect(celType(fld({ type: "string" }))).toBe("string");
    expect(celType(fld({ type: "number" }))).toBe("double");
    expect(celType(fld({ type: "boolean" }))).toBe("bool");
    expect(celType(fld({ type: "list" }))).toBe("list<string>");
    expect(celType(fld({ type: "file" }))).toBe("dyn");
    expect(celType(fld({ type: "group" }))).toBe("dyn");
  });

  it("reports int under an integer format, and dyn for a plugin envelope", () => {
    expect(celType(fld({ type: "number", format: "integer" }))).toBe("int");
    expect(celType(fld({ type: { type: "org.signature", config: {} } }))).toBe("dyn");
  });

  it("leaves a format the CEL type does not read alone", () => {
    expect(celType(fld({ type: "string", format: "date" }))).toBe("string");
  });
});

describe("an integer field's CEL expressions", () => {
  const anzahl = (format?: string) =>
    fld({ id: "field_anzahl", key: "anzahl", type: "number", ...(format ? { format } : {}) });

  it("type-checks a modulo against an integer-formatted field", () => {
    expect(checkAgainstFields("data.anzahl % 2 == 0", [anzahl("integer")]).ok).toBe(true);
  });

  it("fails the same expression against an unmarked number field, which stays a double", () => {
    expect(checkAgainstFields("data.anzahl % 2 == 0", [anzahl()]).ok).toBe(false);
  });

  it("type-checks a bare integer comparison, which a double field refuses", () => {
    expect(checkAgainstFields("data.anzahl == 5", [anzahl("integer")]).ok).toBe(true);
    expect(checkAgainstFields("data.anzahl == 5", [anzahl()]).ok).toBe(false);
  });

  it("truncates integer division, so a halved odd count still type-checks as an int", () => {
    expect(checkAgainstFields("data.anzahl / 2 == 3", [anzahl("integer")]).ok).toBe(true);
  });

  it("refuses equality and arithmetic mixing an integer field with a decimal field (D24's second consequence)", () => {
    const betrag = fld({ id: "field_betrag", key: "betrag", type: "number" });
    const both = [anzahl("integer"), betrag];
    expect(checkAgainstFields("data.anzahl == data.betrag", both).ok).toBe(false);
    expect(checkAgainstFields("data.anzahl + data.betrag > 1.0", both).ok).toBe(false);
    // The ordering comparators are the exception: the library holds a
    // cross-numeric overload for `<`/`>`, so those two mix without an error.
    expect(checkAgainstFields("data.anzahl > data.betrag", both).ok).toBe(true);
  });
});

// ============================================================
// The publish-time allowed-pair check (D22, Decision 2).
// ============================================================

describe("compile: the allowed-pair check", () => {
  it("accepts every pair the table declares", () => {
    for (const [type, row] of Object.entries(ALLOWED_BY_TYPE)) {
      for (const format of row.formats) {
        expect(() =>
          compileProcessBody(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type, format }) as ProcessBody),
        ).not.toThrow();
      }
      for (const control of row.controls) {
        expect(() =>
          compileProcessBody(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type, control }) as ProcessBody),
        ).not.toThrow();
      }
    }
  });

  it("rejects an integer format on a string field", () => {
    const err = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "string", format: "integer" }));
    expect(err.issues.some((i) => i.loc === "fields[0].format" && i.value === "integer")).toBe(true);
  });

  it("rejects a date format on a number field", () => {
    const err = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "number", format: "date" }));
    expect(err.issues.some((i) => i.loc === "fields[0].format")).toBe(true);
  });

  it("rejects a checkboxes control on a string field", () => {
    const err = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "string", control: "checkboxes" }));
    expect(err.issues.some((i) => i.loc === "fields[0].control" && i.value === "checkboxes")).toBe(true);
  });

  it("rejects a multiline control on a list field", () => {
    const err = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "list", control: "multiline" }));
    expect(err.issues.some((i) => i.loc === "fields[0].control")).toBe(true);
  });

  it("rejects a control on a file field, which the table gives no row of members", () => {
    const err = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "file", control: "radio" }));
    expect(err.issues.some((i) => i.loc === "fields[0].control")).toBe(true);
  });

  it("rejects either key on a plugin-typed field, which the table holds no row for (D6)", () => {
    const plug = { type: "org.signature", config: {} };
    const errF = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: plug, format: "date" }));
    expect(errF.issues.some((i) => i.loc === "fields[0].format")).toBe(true);
    const errC = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: plug, control: "radio" }));
    expect(errC.issues.some((i) => i.loc === "fields[0].control")).toBe(true);
  });

  it("accepts a person format on a list field, the table's first non-empty list row", () => {
    const parsed = fieldDef.parse({ id: "field_x", key: "x", label: { en: "X" }, type: "list", format: "person" });
    expect(parsed.format).toBe("person");
    expect(() =>
      compileProcessBody(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "list", format: "person" }) as ProcessBody),
    ).not.toThrow();
  });

  it("rejects a person format on a boolean field, which the table gives no formats", () => {
    const err = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "boolean", format: "person" }));
    expect(err.issues.some((i) => i.loc === "fields[0].format" && i.value === "person")).toBe(true);
  });

  it("reaches a field nested inside a group, so a group cannot hide a bad pair", () => {
    const err = rejects(
      bodyWith({
        id: "field_g",
        key: "g",
        label: { en: "G" },
        type: "group",
        fields: [{ id: "field_inner", key: "inner", label: { en: "Inner" }, type: "boolean", format: "email" }],
      }),
    );
    expect(err.issues.some((i) => i.loc === "fields[0].fields[0].format")).toBe(true);
  });
});

// ============================================================
// The literal default, checked against the format (Decision 9).
// ============================================================

describe("compile: a literal default faces the format", () => {
  it("rejects a default the declared format refuses", () => {
    const err = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "string", format: "date", default: "banane" }));
    expect(err.issues.some((i) => i.loc === "fields[0].default")).toBe(true);
  });

  it("rejects a decimal default on an integer field", () => {
    const err = rejects(bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "number", format: "integer", default: 3.5 }));
    expect(err.issues.some((i) => i.loc === "fields[0].default")).toBe(true);
  });

  it("accepts a default the format admits", () => {
    expect(() =>
      compileProcessBody(
        bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "string", format: "date", default: "2026-02-28" }) as ProcessBody,
      ),
    ).not.toThrow();
  });

  // `isLiteralDefault` returns `true` for an array, so a `list` field's
  // default reaches the same widened `formatMatches` call the `string` arm
  // does. No `list`-specific branch exists, and none is needed.
  it("rejects an unprefixed person default on a string field", () => {
    const err = rejects(
      bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "string", format: "person", default: "role_finance" }),
    );
    expect(err.issues.some((i) => i.loc === "fields[0].default")).toBe(true);
  });

  it("rejects a person default list carrying one unprefixed element", () => {
    const err = rejects(
      bodyWith({ id: "field_x", key: "x", label: { en: "X" }, type: "list", format: "person", default: ["user_a", "not-a-principal-id"] }),
    );
    expect(err.issues.some((i) => i.loc === "fields[0].default")).toBe(true);
  });

  it("skips an Expression default, which the CEL layer types and which reads no format", () => {
    expect(() =>
      compileProcessBody(
        bodyWith({
          id: "field_x",
          key: "x",
          label: { en: "X" },
          type: "string",
          format: "date",
          default: { lang: "cel", src: "'2026-02-28'" },
        }) as ProcessBody,
      ),
    ).not.toThrow();
  });
});

// ============================================================
// checkColumnMapping now keys off `string`, not the removed `select`.
// ============================================================

describe("compile: columnMapping's type rule", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappingBody = (type: string): any => {
    const b = bodyWith({
      id: "field_pick",
      key: "pick",
      label: { en: "Pick" },
      type,
      dataSource: "ds_rows",
      columnMapping: { city: "field_city" },
    });
    b.fields.push({ id: "field_city", key: "city", label: { en: "City" }, type: "string" });
    b.dataSources = [{ id: "ds_rows", key: "rows", type: "db", config: {} }];
    return b;
  };

  it("rejects a list field declaring a columnMapping: several picks cannot fill one target", () => {
    const err = rejects(mappingBody("list"));
    expect(err.issues.some((i) => i.loc === "fields[0].columnMapping" && i.value === "list")).toBe(true);
  });

  it("draws no columnMapping type issue on a string field", () => {
    let issues: CompileValidationError["issues"] = [];
    try {
      compileProcessBody(mappingBody("string") as ProcessBody);
    } catch (err) {
      issues = (err as CompileValidationError).issues ?? [];
    }
    expect(issues.some((i) => i.loc === "fields[0].columnMapping")).toBe(false);
  });
});
