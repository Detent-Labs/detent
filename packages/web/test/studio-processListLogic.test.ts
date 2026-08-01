import { describe, expect, it } from "bun:test";
import { authoredProcessBody } from "workflow-engine/schema";
import { deriveProcessRows, seedVersionFor, seededDraftInput } from "../src/areas/studio/screens/processListLogic.js";
import type { DraftSummary, ProcessSummary } from "../src/areas/studio/api/types.js";

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

describe("seedVersionFor", () => {
  it("names the published version for a published row", () => {
    const [row] = deriveProcessRows([published], []);
    expect(seedVersionFor(row!)).toBe(3);
  });

  it("names the published version even when a draft already exists", () => {
    const row = deriveProcessRows([published], [{ ...draftOnly, processId: "proc_pub" }])[0]!;
    expect(seedVersionFor(row)).toBe(3);
  });

  it("names nothing for a draft-only row", () => {
    const [row] = deriveProcessRows([], [draftOnly]);
    expect(seedVersionFor(row!)).toBeUndefined();
  });

  it("names nothing for a row with neither", () => {
    // The transient state a freshly minted `+ New process` id is in.
    expect(seedVersionFor({ processId: "proc_new" })).toBeUndefined();
  });
});

describe("seededDraftInput", () => {
  const compiledBody = () => ({
    key: "wf",
    contract: { outcomes: ["approved", "cancelled"] },
    workflow: { steps: [{ id: "step_a" }, { id: "step_cancel_sink", key: "cancel_sink" }] },
  });

  it("returns a base-locale-only draft and no base version without a seed version", async () => {
    let reads = 0;
    const input = await seededDraftInput(undefined, async () => (reads++, compiledBody()));
    expect(input).toEqual({ body: { baseLocale: "en" }, layout: {}, revision: 0 });
    expect(reads).toBe(0);
  });

  // Publish requires `baseLocale` and no structural panel wrote it before this
  // seed did, so a process authored only through the panels could never be
  // published. Parsing the seed itself is the check that keeps it that way.
  it("seeds a body that reports no missing baseLocale", async () => {
    const input = await seededDraftInput(undefined, async () => compiledBody());
    const parsed = authoredProcessBody.safeParse(input.body);
    expect(parsed.success).toBe(false); // still missing key/label/fields/workflow
    const paths = parsed.error!.issues.map((i) => i.path.join("."));
    expect(paths).not.toContain("baseLocale");
  });

  it("returns the stripped published body stamped with its version", async () => {
    const input = await seededDraftInput(3, async (v) => (expect(v).toBe(3), compiledBody()));
    expect(input.revision).toBe(0);
    expect(input.layout).toEqual({});
    expect(input.baseVersion).toBe(3);
    const body = input.body as ReturnType<typeof compiledBody>;
    expect(body.workflow.steps.map((s) => s.id)).toEqual(["step_a"]);
    expect(body.contract.outcomes).toEqual(["approved"]);
  });

  it("propagates a failed read so the caller writes nothing", async () => {
    let caught: unknown;
    try {
      await seededDraftInput(1, async () => {
        throw new Error("read failed");
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toBe("read failed");
  });
});
