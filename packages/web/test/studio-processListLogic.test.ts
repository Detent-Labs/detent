import { describe, expect, it } from "bun:test";
import { authoredProcessBody } from "workflow-engine/schema";
import {
  createInFlightGuard,
  deriveProcessRows,
  narrowToAccessible,
  seedVersionFor,
  seededDraftInput,
  templateDraftInput,
  templateDisplayName,
} from "../src/areas/studio/screens/processListLogic.js";
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

describe("templateDraftInput", () => {
  const template = { body: { key: "wf", label: { en: "Approval" }, baseLocale: "en" }, layout: { step_a: { x: 4, y: 8 } } };

  it("carries the template's body and layout through unchanged", async () => {
    const input = await templateDraftInput("approval", async (key) => (expect(key).toBe("approval"), template));
    expect(input.body).toEqual(template.body);
    expect(input.layout).toEqual(template.layout);
    expect(input.revision).toBe(0);
  });

  // A template is no published version of the new process, so stamping one
  // would offer the Versions screen a diff against an unrelated body — and the
  // write path rejects an unresolvable baseVersion anyway.
  it("claims no base version", async () => {
    const input = await templateDraftInput("approval", async () => template);
    expect(input.baseVersion).toBeUndefined();
  });

  it("propagates a failed read so the caller writes nothing", async () => {
    let caught: unknown;
    try {
      await templateDraftInput("approval", async () => {
        throw new Error("read failed");
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toBe("read failed");
  });
});

describe("templateDisplayName", () => {
  it("prefers the displayed locale", () => {
    expect(templateDisplayName({ en: "Approval", de: "Freigabe" }, "de", "approval")).toBe("Freigabe");
  });

  it("falls back to another locale rather than to the key", () => {
    expect(templateDisplayName({ en: "Approval" }, "de", "approval")).toBe("Approval");
  });

  // The store checks the envelope only, so a template may declare no label at
  // all. A nameless row is worse than a keyed one.
  it("falls back to the key for a body declaring no label", () => {
    expect(templateDisplayName(null, "en", "approval")).toBe("approval");
    expect(templateDisplayName(undefined, "en", "approval")).toBe("approval");
    expect(templateDisplayName({}, "en", "approval")).toBe("approval");
  });

  it("skips an empty string rather than rendering a blank name", () => {
    expect(templateDisplayName({ en: "" }, "de", "approval")).toBe("approval");
  });
});

describe("createInFlightGuard", () => {
  it("resolves false for a second call on a held key; once the held write rejects, a third call for that key runs its write", async () => {
    const guard = createInFlightGuard(() => {});
    const failure = new Error("write failed");
    let rejectFirst: ((err: unknown) => void) | undefined;
    const first = guard("p1", () => new Promise<void>((_resolve, reject) => (rejectFirst = reject)));

    let secondWriteRan = false;
    const second = await guard("p1", async () => {
      secondWriteRan = true;
    });

    expect(second).toBe(false);
    expect(secondWriteRan).toBe(false);

    rejectFirst!(failure);
    let caught: unknown;
    try {
      await first;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);

    let thirdWriteRan = false;
    const third = await guard("p1", async () => {
      thirdWriteRan = true;
    });
    expect(third).toBe(true);
    expect(thirdWriteRan).toBe(true);
  });

  it("frees a rejected write's key and rethrows the same error, so a later call for that key runs its write", async () => {
    const guard = createInFlightGuard(() => {});
    const failure = new Error("write failed");
    let caught: unknown;
    try {
      await guard("p1", async () => {
        throw failure;
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);

    let laterRan = false;
    const later = await guard("p1", async () => {
      laterRan = true;
    });
    expect(later).toBe(true);
    expect(laterRan).toBe(true);
  });

  it("keeps a resolved write's key held, so a later call for that key resolves false", async () => {
    const guard = createInFlightGuard(() => {});
    const first = await guard("p1", async () => {});
    expect(first).toBe(true);

    let laterRan = false;
    const later = await guard("p1", async () => {
      laterRan = true;
    });
    expect(later).toBe(false);
    expect(laterRan).toBe(false);
  });

  it("leaves another key free to run its write while one key is held", async () => {
    const guard = createInFlightGuard(() => {});
    let resolveFirst: (() => void) | undefined;
    const first = guard("p1", () => new Promise<void>((resolve) => (resolveFirst = resolve)));

    let otherRan = false;
    const other = await guard("p2", async () => {
      otherRan = true;
    });
    expect(other).toBe(true);
    expect(otherRan).toBe(true);

    resolveFirst!();
    await first;
  });

  it("passes a new set object to onHeldChange after each add and each free", async () => {
    const sets: ReadonlySet<string>[] = [];
    const guard = createInFlightGuard((held) => sets.push(held));
    const failure = new Error("boom");
    try {
      await guard("p1", async () => {
        throw failure;
      });
    } catch {
      // asserted by the rejection test above; this test only reads onHeldChange
    }

    expect(sets.length).toBe(2);
    expect(sets[0]!.has("p1")).toBe(true);
    expect(sets[1]!.has("p1")).toBe(false);
    expect(sets[0]).not.toBe(sets[1]);
  });
});

describe("narrowToAccessible", () => {
  const processA: ProcessSummary = { processId: "proc_a", version: 1, definitionHash: "hash_a", key: "a", label: { en: "A" }, baseLocale: "en" };
  const processB: ProcessSummary = { processId: "proc_b", version: 1, definitionHash: "hash_b", key: "b", label: { en: "B" }, baseLocale: "en" };

  // studio-app spec, "A process outside the actor's lists stays hidden": an
  // actor on process A's Developer list but not process B's, both published.
  it("shows a process on the actor's Developer list and hides one that isn't", () => {
    const rows = deriveProcessRows([processA, processB], []);
    const narrowed = narrowToAccessible(rows, { developer: ["proc_a"], owner: [] }, false);

    expect(narrowed.map((r) => r.processId)).toEqual(["proc_a"]);
  });

  it("shows a process on the actor's Owner list the same way", () => {
    const rows = deriveProcessRows([processA, processB], []);
    const narrowed = narrowToAccessible(rows, { developer: [], owner: ["proc_a"] }, false);

    expect(narrowed.map((r) => r.processId)).toEqual(["proc_a"]);
  });

  // studio-app spec, "An admin sees every process": unnarrowed regardless of
  // the access lists' own content, including empty lists.
  it("returns every row unfiltered for an admin, regardless of the access lists", () => {
    const rows = deriveProcessRows([processA, processB], []);
    const narrowed = narrowToAccessible(rows, { developer: [], owner: [] }, true);

    expect(narrowed).toEqual(rows);
  });
});
