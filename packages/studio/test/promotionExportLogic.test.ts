import { describe, expect, it } from "bun:test";
import { buildPromotionFile, promotionFilename } from "../src/screens/promotionExportLogic.js";
import type { VersionSummary } from "../src/api/types.js";

const version: VersionSummary = {
  version: 4,
  definitionHash: "hash_source",
  status: "published",
  publishedAt: "2026-07-31T00:00:00.000Z",
};

/** A compiled body: it carries the cancel sink the compile pass injects. */
const compiled = {
  key: "expense_approval",
  label: { en: "Expense approval" },
  baseLocale: "en",
  workflow: { steps: [{ id: "step_a" }, { id: "step_cancelled" }] },
};

describe("buildPromotionFile", () => {
  it("carries the source processId, version and hash", () => {
    expect(buildPromotionFile("proc_x", version, compiled)).toEqual({
      processId: "proc_x",
      version: 4,
      definitionHash: "hash_source",
      body: compiled,
    });
  });

  it("passes the compiled body through unstripped, cancel sink included", () => {
    const file = buildPromotionFile("proc_x", version, compiled);
    // The whole promotion contract rests on this: the target re-publishes the
    // same compiled body and therefore recomputes the same definitionHash.
    // Stripping here would still reach that hash, but by a longer road.
    expect(file.body).toBe(compiled);
    expect((file.body as typeof compiled).workflow.steps).toHaveLength(2);
  });
});

describe("promotionFilename", () => {
  it("names the file after the process key and version", () => {
    expect(promotionFilename(compiled, 4, "proc_x")).toBe("expense_approval-v4.json");
  });

  it("collapses characters a filename cannot carry", () => {
    expect(promotionFilename({ key: "Expense / Approval (EU)" }, 2, "proc_x")).toBe("expense-approval-eu-v2.json");
  });

  it("falls back to the processId when the key is missing or unusable", () => {
    expect(promotionFilename({}, 1, "proc_x")).toBe("proc_x-v1.json");
    expect(promotionFilename({ key: "///" }, 1, "proc_x")).toBe("proc_x-v1.json");
    expect(promotionFilename(null, 1, "proc_x")).toBe("proc_x-v1.json");
  });
});
