import { describe, expect, it } from "bun:test";
import { extractFields } from "../src/areas/studio/screens/toolsScratchpadLogic.js";

describe("extractFields", () => {
  it("returns the fields array from a body-shaped object", () => {
    const fields = [{ id: "field_a", key: "a", label: { en: "A" }, type: "string" }];
    expect(extractFields({ fields })).toBe(fields as never);
  });

  it("returns an empty array when fields is missing", () => {
    expect(extractFields({})).toEqual([]);
  });

  it("returns an empty array when fields is not an array", () => {
    expect(extractFields({ fields: "not-an-array" })).toEqual([]);
  });

  it("returns an empty array for a non-object body", () => {
    expect(extractFields(null)).toEqual([]);
    expect(extractFields(undefined)).toEqual([]);
    expect(extractFields("a string")).toEqual([]);
  });
});
