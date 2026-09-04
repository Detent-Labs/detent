/**
 * studio-field-authoring-surface: the named field-kind table beside
 * `ALLOWED_BY_TYPE`. The studio's kind picker reads it over the engine
 * package's `exports` map, so a drift between the two tables would first show
 * at publish. These tests hold the direction that prevents it: every entry the
 * table names compiles.
 *
 * `checkFieldFormatControl` is module-private, so every check below reaches it
 * through the exported `compileProcessBody` pass, never by name.
 */
import { describe, it, expect } from "bun:test";
import {
  ALLOWED_BY_TYPE,
  FIELD_KINDS,
  fieldKindOf,
  type BaseFieldType,
  type FieldKindName,
  type ProcessBody,
} from "../src/schema/definition.js";
import { compileProcessBody } from "../src/schema/compile.js";

/** A minimal, otherwise-clean two-step body carrying one catalog field, the
 * same shape test/field-format-control.test.ts uses for the same pass. */
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

/** The catalog field one kind entry mints: the triple's keys and nothing else,
 * which is exactly what the studio's kind picker writes. */
function fieldForKind(name: FieldKindName) {
  const kind = FIELD_KINDS[name];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const field: any = { id: "field_x", key: "x", label: { en: "X" }, type: kind.type };
  if (kind.format !== undefined) field.format = kind.format;
  if (kind.control !== undefined) field.control = kind.control;
  if (kind.type === "group") field.fields = [];
  return field;
}

const KIND_NAMES = Object.keys(FIELD_KINDS) as FieldKindName[];

/** Every `{type, format, control}` triple `ALLOWED_BY_TYPE` admits, as the
 * `type|format|control` string the tests below compare on. */
function allowedTriples(): string[] {
  const out: string[] = [];
  for (const [type, row] of Object.entries(ALLOWED_BY_TYPE) as [BaseFieldType, (typeof ALLOWED_BY_TYPE)[BaseFieldType]][]) {
    for (const format of [undefined, ...row.formats]) {
      for (const control of [undefined, ...row.controls]) {
        out.push(`${type}|${format ?? ""}|${control ?? ""}`);
      }
    }
  }
  return out;
}

const tripleOf = (name: FieldKindName) => `${FIELD_KINDS[name].type}|${FIELD_KINDS[name].format ?? ""}|${FIELD_KINDS[name].control ?? ""}`;

describe("every field kind compiles", () => {
  for (const name of KIND_NAMES) {
    it(`compiles a body declaring the "${name}" kind`, () => {
      expect(() => compileProcessBody(bodyWith(fieldForKind(name)) as ProcessBody)).not.toThrow();
    });
  }
});

describe("the field-kind table indexes into ALLOWED_BY_TYPE", () => {
  it("names a type the enum carries, with a format and control that type admits", () => {
    for (const name of KIND_NAMES) {
      const kind = FIELD_KINDS[name];
      const row = ALLOWED_BY_TYPE[kind.type];
      expect(row).toBeDefined();
      if (kind.format !== undefined) expect(row.formats).toContain(kind.format);
      if (kind.control !== undefined) expect(row.controls).toContain(kind.control);
    }
  });

  it("names each triple exactly once, so a field resolves back to one kind", () => {
    const triples = KIND_NAMES.map(tripleOf);
    expect(new Set(triples).size).toBe(triples.length);
  });

  it("is curated: it names fewer triples than the allowed table admits", () => {
    const named = new Set(KIND_NAMES.map(tripleOf));
    const allowed = allowedTriples();
    expect(allowed.length).toBeGreaterThan(named.size);
    // The omitted triples publish too. The JSON view stays their route, so no
    // entry here is a claim about what a body may declare.
    expect(allowed.filter((t) => !named.has(t)).length).toBe(allowed.length - named.size);
  });

  it("names every triple it carries as an allowed one", () => {
    const allowed = new Set(allowedTriples());
    for (const name of KIND_NAMES) expect(allowed.has(tripleOf(name))).toBe(true);
  });
});

describe("fieldKindOf", () => {
  it("reads back the kind that minted a field, for every entry", () => {
    for (const name of KIND_NAMES) expect(fieldKindOf(fieldForKind(name))).toBe(name);
  });

  it("answers undefined for a triple the table omits", () => {
    expect(fieldKindOf({ type: "string", format: "date", control: "multiline" })).toBeUndefined();
  });

  it("answers undefined for a plugin envelope, which declares neither key", () => {
    expect(fieldKindOf({ type: "acme.lookup" })).toBeUndefined();
  });
});
