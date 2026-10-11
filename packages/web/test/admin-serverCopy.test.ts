import { describe, it, expect } from "bun:test";
import { absorbServerCopy, serverCopyChanged, type ServerCopies } from "../src/areas/admin/screens/serverCopy.js";

const same = (a: string, b: string) => a === b;

describe("absorbServerCopy", () => {
  it("seeds both copies on the first load, even with keepEdits set", () => {
    expect(absorbServerCopy<string>(undefined, "v1", true)).toEqual({
      copies: { baseline: "v1", latest: "v1" },
      reseed: true,
    });
  });

  it("moves the baseline on a clean refetch", () => {
    const prev: ServerCopies<string> = { baseline: "v1", latest: "v1" };
    expect(absorbServerCopy(prev, "v2", false)).toEqual({
      copies: { baseline: "v2", latest: "v2" },
      reseed: true,
    });
  });

  it("keeps the baseline and moves latest on a dirty refetch", () => {
    const prev: ServerCopies<string> = { baseline: "v1", latest: "v2" };
    expect(absorbServerCopy(prev, "v3", true)).toEqual({
      copies: { baseline: "v1", latest: "v3" },
      reseed: false,
    });
  });

  it("reseeds when the caller passes keepEdits false over unsaved input", () => {
    // The screen passes `dirty && !reseed`, so a save or a discard arrives
    // here as keepEdits false whatever the dirty flag says.
    const prev: ServerCopies<string> = { baseline: "v1", latest: "v2" };
    expect(absorbServerCopy(prev, "v3", false)).toEqual({
      copies: { baseline: "v3", latest: "v3" },
      reseed: true,
    });
  });
});

describe("serverCopyChanged", () => {
  it("answers false before the first load", () => {
    expect(serverCopyChanged<string>(undefined, same)).toBe(false);
  });

  it("answers false while latest matches the baseline", () => {
    expect(serverCopyChanged({ baseline: "v1", latest: "v1" }, same)).toBe(false);
  });

  it("answers true once latest differs from the baseline", () => {
    expect(serverCopyChanged({ baseline: "v1", latest: "v2" }, same)).toBe(true);
  });

  it("asks the comparison, not reference identity", () => {
    const copies = { baseline: { n: 1 }, latest: { n: 1 } };
    expect(serverCopyChanged(copies, (a, b) => a.n === b.n)).toBe(false);
  });
});
