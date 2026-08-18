import { describe, expect, it } from "bun:test";
import { resolveLoc } from "../src/areas/studio/draft/issues.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

const FIELD_A = "field_00000000-0000-4000-8000-00000000000a";

function body(fields: unknown[]): Draft {
  return { baseLocale: "en", fields } as Draft;
}

describe("resolveLoc", () => {
  it("resolves checkPatterns' string-form loc to the field, not the process fallback", () => {
    // Regression: `checkPatterns` (compile.ts) locates a pattern issue as
    // "fields[0].validation.pattern" — a `default:`-branch bug once mistook
    // the "validation" segment for a field-id reference (the shape a bare
    // "fields" token with no bracketed index expects), sending every
    // `validation.pattern` structural issue to the process-level fallback.
    const b = body([{ id: FIELD_A, key: "amount", label: { en: "Amount" } }]);
    expect(resolveLoc(b, "fields[0].validation.pattern")).toEqual({ entityType: "field", entityId: FIELD_A });
  });

  it("still resolves a bare field-id reference, the authored-content-localization invariant's own shape", () => {
    const b = body([{ id: FIELD_A, key: "amount", label: { en: "Amount" } }]);
    expect(resolveLoc(b, ["fields", FIELD_A, "label"])).toEqual({ entityType: "field", entityId: FIELD_A });
  });

  it("falls back to the process when no path segment resolves", () => {
    expect(resolveLoc(body([]), "baseLocale")).toEqual({ entityType: "process", entityId: "process" });
  });

  // compile.ts's generic unknown-key walker (checkUnknownKeys) reports a
  // nested unknown key with a loc like "fields[0].validation.zz" — the same
  // shape as "fields[0].validation.pattern" above, no "steps" token. Process
  // Studio's inspector calls resolveLoc to locate an issue's field, and
  // studio-publishErrors.test.ts / studio-draftValidationLogic.test.ts do not
  // cover this: the former only unit-tests client-side message formatting on
  // a synthetic object and never calls resolveLoc; the latter documents a
  // KNOWN GAP where studio's live validator strips an unknown key before
  // compileProcessBody runs, so the key never reaches runValidation's
  // structural-issue path there. Neither locates an unknown-key issue's
  // field, so neither proves the inspector does.
  it("resolves an unknown-key loc inside a field's validation to that field", () => {
    const b = body([{ id: FIELD_A, key: "amount", label: { en: "Amount" } }]);
    expect(resolveLoc(b, "fields[0].validation.zz")).toEqual({ entityType: "field", entityId: FIELD_A });
  });
});
