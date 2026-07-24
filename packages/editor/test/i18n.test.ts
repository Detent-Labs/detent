import { describe, expect, it } from "bun:test";
import { t } from "../src/i18n/catalog";
import { describeError } from "../src/panels/FileToolbar";

describe("t", () => {
  it("resolves a key to its catalog entry", () => {
    expect(t("app.title")).toBe("Workflow Editor");
  });

  it("resolves a different key to its own distinct entry", () => {
    expect(t("fileToolbar.legend")).toBe("File");
  });
});

describe("describeError", () => {
  it("returns null for an aborted picker (user cancelled, not an error)", () => {
    expect(describeError(new DOMException("aborted", "AbortError"), "operation failed")).toBeNull();
  });

  it("passes a real Error's own message through unchanged, ignoring the fallback", () => {
    // Platform/browser-sourced text is never translated — same treatment as engine validation
    // messages (design.md). The fallback param here is deliberately not what gets returned.
    expect(describeError(new Error("disk is full"), "operation failed")).toBe("disk is full");
  });

  it("returns the translated fallback for a non-Error throw", () => {
    expect(describeError("some string throw", "Vorgang fehlgeschlagen")).toBe("Vorgang fehlgeschlagen");
    expect(describeError(undefined, "Vorgang fehlgeschlagen")).toBe("Vorgang fehlgeschlagen");
  });
});
