import { describe, it, expect } from "bun:test";
import { DB_LIST_TYPE, keyOptions, listKeyOf, unknownListKeyWarning } from "../src/areas/studio/panels/dataListKeysLogic.js";
import { isDirty } from "../src/areas/studio/screens/draftToolbarState.js";

describe("listKeyOf", () => {
  it("reads a string listKey and treats anything else as unset", () => {
    expect(listKeyOf({ listKey: "cost_centres" })).toBe("cost_centres");
    expect(listKeyOf({})).toBe("");
    expect(listKeyOf({ listKey: 7 })).toBe("");
    expect(listKeyOf(undefined)).toBe("");
  });
});

describe("unknownListKeyWarning", () => {
  it("warns about a key the server does not report", () => {
    const warning = unknownListKeyWarning(DB_LIST_TYPE, { listKey: "ghost" }, ["cost_centres"]);
    expect(warning).toContain("ghost");
  });

  it("says nothing about a key the server reports", () => {
    expect(unknownListKeyWarning(DB_LIST_TYPE, { listKey: "cost_centres" }, ["cost_centres"])).toBeUndefined();
  });

  it("says nothing before the keys arrive, so a failed fetch does not warn about everything", () => {
    expect(unknownListKeyWarning(DB_LIST_TYPE, { listKey: "ghost" }, undefined)).toBeUndefined();
  });

  it("says nothing about an unset key or another data source type", () => {
    expect(unknownListKeyWarning(DB_LIST_TYPE, {}, ["cost_centres"])).toBeUndefined();
    expect(unknownListKeyWarning("static", { options: [] }, ["cost_centres"])).toBeUndefined();
  });

  it("is a plain string, not an EditorIssue, so nothing in the publish path reads it", () => {
    // Publishing is gated on a dirty draft alone; the warning has no way in.
    const warning = unknownListKeyWarning(DB_LIST_TYPE, { listKey: "ghost" }, []);
    expect(typeof warning).toBe("string");
    const body = { dataSources: [{ id: "ds_a", key: "a", type: DB_LIST_TYPE, config: { listKey: "ghost" } }] };
    expect(isDirty(body, structuredClone(body))).toBe(false);
  });
});

describe("keyOptions", () => {
  const SERVER_KEYS = ["cost_centres", "departments"];

  it("offers every key the server reports", () => {
    expect(keyOptions("", SERVER_KEYS)).toEqual(["cost_centres", "departments"]);
  });

  it("keeps the draft's own key in the list even when the server does not report it", () => {
    expect(keyOptions("ghost", SERVER_KEYS)).toEqual(["ghost", "cost_centres", "departments"]);
  });

  it("offers the server's keys unchanged for a key it already reports", () => {
    expect(keyOptions("departments", SERVER_KEYS)).toEqual(["cost_centres", "departments"]);
  });
});
