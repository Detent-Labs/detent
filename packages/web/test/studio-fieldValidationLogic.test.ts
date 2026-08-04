import { describe, expect, it } from "bun:test";
import {
  offeredKeys,
  carriedKeys,
  patchValidation,
  type ValidationKey,
} from "../src/areas/studio/panels/shared/fieldValidationLogic.js";

// This table mirrors `checkConstraints` in `src/runtime/api.ts`, which
// branches on the submitted value's JavaScript runtime type rather than the
// field's declared type.
describe("offeredKeys", () => {
  it("offers min, max and rule for a number field", () => {
    expect(offeredKeys("number")).toEqual(["min", "max", "rule"]);
  });

  it("offers minLength, maxLength, pattern and rule for a string-valued field", () => {
    for (const type of ["string", "date", "datetime", "select", "reference"] as const) {
      expect(offeredKeys(type)).toEqual(["minLength", "maxLength", "pattern", "rule"]);
    }
  });

  it("offers minLength, maxLength and rule for a multiselect field, since a list carries no pattern", () => {
    expect(offeredKeys("multiselect")).toEqual(["minLength", "maxLength", "rule"]);
  });

  it("offers rule alone for boolean and group, since neither ever reaches a checkConstraints branch", () => {
    expect(offeredKeys("boolean")).toEqual(["rule"]);
    expect(offeredKeys("group")).toEqual(["rule"]);
  });

  it("offers every key for file and a plugin type, since typeMatches treats both as opaque", () => {
    const every: ValidationKey[] = ["min", "max", "minLength", "maxLength", "pattern", "rule"];
    expect(offeredKeys("file")).toEqual(every);
    expect(offeredKeys({ type: "custom.rating", config: {} })).toEqual(every);
  });
});

describe("carriedKeys", () => {
  it("is empty for an absent validation", () => {
    expect(carriedKeys(undefined)).toEqual([]);
  });

  it("lists the keys a validation object holds, in canonical order", () => {
    expect(carriedKeys({ maxLength: 10, min: 0 })).toEqual(["min", "maxLength"]);
  });

  it("includes a key offeredKeys omits for the field's type", () => {
    // A `pattern` a number field's own offeredKeys row does not list.
    expect(carriedKeys({ pattern: "^[0-9]+$" })).toEqual(["pattern"]);
  });
});

describe("patchValidation", () => {
  it("sets a key on an absent validation", () => {
    expect(patchValidation(undefined, "min", 5)).toEqual({ min: 5 });
  });

  it("adds a key beside existing ones", () => {
    expect(patchValidation({ min: 5 }, "max", 10)).toEqual({ min: 5, max: 10 });
  });

  it("clears a key, leaving the rest", () => {
    expect(patchValidation({ min: 5, max: 10 }, "min", undefined)).toEqual({ max: 10 });
  });

  it("clearing the last key returns undefined, not {}", () => {
    expect(patchValidation({ min: 5 }, "min", undefined)).toBeUndefined();
  });

  it("clearing a key on an already-undefined validation stays undefined", () => {
    expect(patchValidation(undefined, "min", undefined)).toBeUndefined();
  });
});
