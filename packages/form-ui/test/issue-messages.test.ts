import { describe, expect, it } from "bun:test";
import { issueMessage } from "../src/issue-messages.js";
import type { SubmissionIssue } from "../src/types.js";

describe("issueMessage: every SubmissionIssue kind the engine can produce", () => {
  const kinds: SubmissionIssue["kind"][] = [
    "unknown-field",
    "readonly-field",
    "type-mismatch",
    "invalid-option",
    "constraint",
    "rule-failed",
    "required-missing",
  ];

  for (const kind of kinds) {
    it(`renders a localized (non-raw) message for "${kind}" in en`, () => {
      const message = issueMessage({ kind, fieldId: "f1" }, "en");
      expect(message).not.toBe(kind);
      expect(message.length).toBeGreaterThan(0);
    });

    it(`renders a localized (non-raw) message for "${kind}" in de`, () => {
      const message = issueMessage({ kind, fieldId: "f1" }, "de");
      expect(message).not.toBe(kind);
      expect(message.length).toBeGreaterThan(0);
    });
  }
});

describe("issueMessage: constraint sub-kind", () => {
  it("names the constraint that failed", () => {
    const message = issueMessage({ kind: "constraint", fieldId: "f1", constraint: "maxLength" }, "en");
    expect(message.toLowerCase()).toContain("long");
  });

  it("still renders a generic message when the constraint sub-kind is missing", () => {
    const message = issueMessage({ kind: "constraint", fieldId: "f1" }, "en");
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("issueMessage: type-mismatch names the expected type when present", () => {
  it("includes the expected type", () => {
    const message = issueMessage({ kind: "type-mismatch", fieldId: "f1", expected: "number" }, "en");
    expect(message).toContain("number");
  });
});

describe("issueMessage: unknown kind falls back to the raw discriminator", () => {
  it("returns the raw kind rather than crashing or rendering nothing", () => {
    const message = issueMessage({ kind: "some-future-kind", fieldId: "f1" }, "en");
    expect(message).toBe("some-future-kind");
  });
});

describe("issueMessage: locale fallback", () => {
  it("falls back to baseLocale when the active locale has no catalog", () => {
    const message = issueMessage({ kind: "required-missing", fieldId: "f1" }, "fr", "de");
    expect(message).toBe(issueMessage({ kind: "required-missing", fieldId: "f1" }, "de"));
  });

  it("falls back to en when neither locale nor baseLocale has a catalog", () => {
    const message = issueMessage({ kind: "required-missing", fieldId: "f1" }, "fr", "it");
    expect(message).toBe(issueMessage({ kind: "required-missing", fieldId: "f1" }, "en"));
  });
});
