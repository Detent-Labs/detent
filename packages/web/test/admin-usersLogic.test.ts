import { describe, expect, it } from "bun:test";
import { parseRoles, appendRole } from "../src/areas/admin/screens/usersLogic.js";

describe("parseRoles", () => {
  it("splits on commas and trims each entry", () => {
    expect(parseRoles(" a , b ")).toEqual(["a", "b"]);
  });

  it("keeps the first occurrence of a duplicate and drops the rest", () => {
    expect(parseRoles("b, a, b")).toEqual(["b", "a"]);
  });

  it("drops an entry that is empty after trimming", () => {
    expect(parseRoles("a,,b")).toEqual(["a", "b"]);
    expect(parseRoles("a,   ,b")).toEqual(["a", "b"]);
  });

  it("drops a trailing comma", () => {
    expect(parseRoles("a, b,")).toEqual(["a", "b"]);
  });

  it("returns an empty array for empty or whitespace-only text", () => {
    expect(parseRoles("")).toEqual([]);
    expect(parseRoles("   ")).toEqual([]);
    expect(parseRoles(",,")).toEqual([]);
  });

  it("leaves a role string's own characters alone", () => {
    expect(parseRoles("Abteilung Süd / Freigabe-2")).toEqual(["Abteilung Süd / Freigabe-2"]);
  });
});

describe("appendRole", () => {
  it("appends to an empty editor", () => {
    expect(appendRole("", "system:admin")).toBe("system:admin");
  });

  it("appends after the existing roles", () => {
    expect(appendRole("a", "system:admin")).toBe("a, system:admin");
  });

  it("is a no-op when the role is already present", () => {
    expect(appendRole("a, system:admin", "system:admin")).toBe("a, system:admin");
  });

  it("leaves the typed text untouched when the role is already present, even if that text is unnormalized", () => {
    expect(appendRole(" a ,system:admin", "system:admin")).toBe(" a ,system:admin");
  });

  it("normalizes the existing text when it does append", () => {
    expect(appendRole(" a ,, b ", "system:reports")).toBe("a, b, system:reports");
  });
});
