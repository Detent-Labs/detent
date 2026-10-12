import { describe, expect, it } from "bun:test";
import { safeMatch } from "../src/shell/safeMatch.js";

describe("safeMatch", () => {
  it("returns the fallback when the matcher throws a URIError", () => {
    const match = safeMatch((path: string) => decodeURIComponent(path), "fallback");
    expect(match("%E0%A4%A")).toBe("fallback");
  });

  it("passes a matcher result through when nothing throws", () => {
    const match = safeMatch((path: string) => decodeURIComponent(path), "fallback");
    expect(match("a%20b")).toBe("a b");
  });

  it("rethrows an error that is not a URIError", () => {
    const match = safeMatch((): string => {
      throw new TypeError("boom");
    }, "fallback");
    expect(() => match("/x")).toThrow(TypeError);
  });
});
