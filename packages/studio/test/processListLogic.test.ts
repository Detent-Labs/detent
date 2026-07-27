import { describe, expect, it } from "bun:test";
import { deriveProcessRows } from "../src/screens/processListLogic.js";
import type { DraftSummary, ProcessSummary } from "../src/api/types.js";

const published: ProcessSummary = {
  processId: "proc_pub",
  version: 3,
  definitionHash: "hash_abc",
  key: "wf",
  label: { en: "Workflow" },
  baseLocale: "en",
};

const draftOnly: DraftSummary = {
  processId: "proc_draft",
  revision: 2,
  baseVersion: null,
  updatedBy: "user_a",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

const draftForPublished: DraftSummary = {
  processId: "proc_pub",
  revision: 1,
  baseVersion: 3,
  updatedBy: "user_b",
  updatedAt: "2026-07-27T01:00:00.000Z",
};

describe("deriveProcessRows", () => {
  it("renders a published-only process with no draft", () => {
    const rows = deriveProcessRows([published], []);
    expect(rows).toEqual([{ processId: "proc_pub", published: { version: 3, definitionHash: "hash_abc", key: "wf", label: { en: "Workflow" }, baseLocale: "en" } }]);
  });

  it("renders a draft-only process with no published version", () => {
    const rows = deriveProcessRows([], [draftOnly]);
    expect(rows).toEqual([{ processId: "proc_draft", draft: { revision: 2, baseVersion: null, updatedBy: "user_a", updatedAt: "2026-07-27T00:00:00.000Z" } }]);
  });

  it("merges a process that has both a draft and a published version", () => {
    const rows = deriveProcessRows([published], [draftForPublished]);
    expect(rows).toEqual([
      {
        processId: "proc_pub",
        published: { version: 3, definitionHash: "hash_abc", key: "wf", label: { en: "Workflow" }, baseLocale: "en" },
        draft: { revision: 1, baseVersion: 3, updatedBy: "user_b", updatedAt: "2026-07-27T01:00:00.000Z" },
      },
    ]);
  });

  it("sorts rows by processId for a stable render order", () => {
    const rows = deriveProcessRows([published], [draftOnly]);
    expect(rows.map((r) => r.processId)).toEqual(["proc_draft", "proc_pub"]);
  });

  it("returns no rows when both sources are empty", () => {
    expect(deriveProcessRows([], [])).toEqual([]);
  });

  it("discarding a draft (dropping it from the drafts listing and re-deriving) leaves only the published version, untouched, and doesn't affect other rows", () => {
    // Before discard: proc_pub carries both a draft and a published version;
    // proc_draft is an unrelated draft-only row that must be unaffected.
    const before = deriveProcessRows([published], [draftForPublished, draftOnly]);
    expect(before.find((r) => r.processId === "proc_pub")?.draft).toBeDefined();

    // ProcessesScreen's discard() calls DELETE /drafts/:processId then reloads
    // both listings — the reload is exactly a fresh deriveProcessRows call
    // with that draft summary now absent from the drafts array.
    const after = deriveProcessRows([published], [draftOnly]);

    expect(after).toEqual([
      { processId: "proc_draft", draft: { revision: 2, baseVersion: null, updatedBy: "user_a", updatedAt: "2026-07-27T00:00:00.000Z" } },
      { processId: "proc_pub", published: { version: 3, definitionHash: "hash_abc", key: "wf", label: { en: "Workflow" }, baseLocale: "en" } },
    ]);
    expect(after.find((r) => r.processId === "proc_pub")?.draft).toBeUndefined();
  });
});
