import { describe, expect, it } from "bun:test";
import { authoredProcessBody } from "workflow-engine/schema";
import { validateStructure } from "workflow-engine/validate";
import {
  createInFlightGuard,
  deriveProcessRows,
  describeProcessRow,
  isPlainLeftClick,
  localizedText,
  narrowToAccessible,
  relativeAgo,
  seedVersionFor,
  seededDraftInput,
  sortProcessRows,
  templateDraftInput,
  templateDisplayName,
} from "../src/areas/studio/screens/processListLogic.js";
import { studioCatalog } from "../src/i18n/catalogs/studio.js";
import type { DraftSummary, ProcessSummary } from "../src/areas/studio/api/types.js";

const published: ProcessSummary = {
  processId: "proc_pub",
  version: 3,
  definitionHash: "hash_abc",
  key: "wf",
  label: { en: "Workflow" },
  baseLocale: "en",
  publishedAt: "2026-07-20T00:00:00.000Z",
};

const draftOnly: DraftSummary = {
  processId: "proc_draft",
  revision: 2,
  baseVersion: null,
  updatedBy: "user_a",
  updatedAt: "2026-07-27T00:00:00.000Z",
  key: "draft_key",
  label: { en: "Draft name" },
  baseLocale: "en",
  updatedByDisplayName: "Ada Lovelace",
};

const draftForPublished: DraftSummary = {
  processId: "proc_pub",
  revision: 1,
  baseVersion: 3,
  updatedBy: "user_b",
  updatedAt: "2026-07-27T01:00:00.000Z",
  key: "wf_draft",
  label: { en: "Workflow v4" },
  baseLocale: "en",
  updatedByDisplayName: null,
};

describe("deriveProcessRows", () => {
  it("renders a published-only process with no draft", () => {
    const rows = deriveProcessRows([published], []);
    expect(rows).toEqual([{ processId: "proc_pub", published: { version: 3, definitionHash: "hash_abc", key: "wf", label: { en: "Workflow" }, baseLocale: "en", publishedAt: "2026-07-20T00:00:00.000Z" } }]);
  });

  it("renders a draft-only process with no published version", () => {
    const rows = deriveProcessRows([], [draftOnly]);
    expect(rows).toEqual([{ processId: "proc_draft", draft: { revision: 2, baseVersion: null, updatedBy: "user_a", updatedAt: "2026-07-27T00:00:00.000Z", key: "draft_key", label: { en: "Draft name" }, baseLocale: "en", updatedByDisplayName: "Ada Lovelace" } }]);
  });

  it("merges a process that has both a draft and a published version", () => {
    const rows = deriveProcessRows([published], [draftForPublished]);
    expect(rows).toEqual([
      {
        processId: "proc_pub",
        published: { version: 3, definitionHash: "hash_abc", key: "wf", label: { en: "Workflow" }, baseLocale: "en", publishedAt: "2026-07-20T00:00:00.000Z" },
        draft: { revision: 1, baseVersion: 3, updatedBy: "user_b", updatedAt: "2026-07-27T01:00:00.000Z", key: "wf_draft", label: { en: "Workflow v4" }, baseLocale: "en", updatedByDisplayName: null },
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
      { processId: "proc_draft", draft: { revision: 2, baseVersion: null, updatedBy: "user_a", updatedAt: "2026-07-27T00:00:00.000Z", key: "draft_key", label: { en: "Draft name" }, baseLocale: "en", updatedByDisplayName: "Ada Lovelace" } },
      { processId: "proc_pub", published: { version: 3, definitionHash: "hash_abc", key: "wf", label: { en: "Workflow" }, baseLocale: "en", publishedAt: "2026-07-20T00:00:00.000Z" } },
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

  it("returns a draft with every list empty and no base version without a seed version", async () => {
    let reads = 0;
    const input = await seededDraftInput(undefined, async () => (reads++, compiledBody()));
    expect(input).toEqual({
      body: { key: "", label: {}, baseLocale: "en", fields: [], workflow: { steps: [] } },
      layout: {},
      revision: 0,
    });
    expect(reads).toBe(0);
  });

  // Publish requires `baseLocale` and no structural panel wrote it before this
  // seed did, so a process authored only through the panels could never be
  // published. Parsing the seed itself is the check that keeps it that way.
  it("seeds a body that reports no missing baseLocale", async () => {
    const input = await seededDraftInput(undefined, async () => compiledBody());
    const parsed = authoredProcessBody.safeParse(input.body);
    expect(parsed.success).toBe(false); // still missing workflow.initialStep
    const paths = parsed.error!.issues.map((i) => i.path.join("."));
    expect(paths).not.toContain("baseLocale");
  });

  it("seeds a body whose one Zod issue is the missing workflow.initialStep", async () => {
    const input = await seededDraftInput(undefined, async () => compiledBody());
    const { zodIssues } = validateStructure(input.body);
    expect(zodIssues.map((i) => i.path)).toEqual([["workflow", "initialStep"]]);
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
  const processA: ProcessSummary = { processId: "proc_a", version: 1, definitionHash: "hash_a", key: "a", label: { en: "A" }, baseLocale: "en", publishedAt: "2026-07-01T00:00:00.000Z" };
  const processB: ProcessSummary = { processId: "proc_b", version: 1, definitionHash: "hash_b", key: "b", label: { en: "B" }, baseLocale: "en", publishedAt: "2026-07-01T00:00:00.000Z" };

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

describe("localizedText", () => {
  it("prefers the requested locale", () => {
    expect(localizedText({ en: "Approval", de: "Freigabe" }, "de")).toBe("Freigabe");
  });

  it("falls through an empty entry for the locale to the first non-empty value", () => {
    expect(localizedText({ en: "", de: "Freigabe" }, "en")).toBe("Freigabe");
  });

  it("returns undefined when no entry holds text", () => {
    expect(localizedText(null, "en")).toBeUndefined();
    expect(localizedText(undefined, "en")).toBeUndefined();
    expect(localizedText({}, "en")).toBeUndefined();
    expect(localizedText({ en: "" }, "en")).toBeUndefined();
  });
});

describe("describeProcessRow", () => {
  const untitledDraft = { ...draftOnly, key: null, label: null, baseLocale: null };

  describe("a draft-only row", () => {
    const [row] = deriveProcessRows([], [draftOnly]);
    const view = describeProcessRow(row!);

    it("names the process by the draft's label", () => {
      expect(view.name).toBe("Draft name");
    });

    it("opens the draft", () => {
      expect(view.open).toEqual({ name: "edit", processId: "proc_draft" });
    });

    it("says who saved it and when, and nothing about a version", () => {
      expect(view.saved).toEqual({ by: "Ada Lovelace", at: "2026-07-27T00:00:00.000Z" });
      expect(view.published).toBeUndefined();
      expect(view.seedVersion).toBeUndefined();
    });

    it("reads the draft's key, revision and raw saver in the developer view, and no hash", () => {
      expect(view.developer).toEqual({ key: "draft_key", processId: "proc_draft", revision: 2, savedBy: "user_a" });
    });

    it("offers discard alone", () => {
      expect(view.commands).toEqual(["discard"]);
    });
  });

  describe("a published-only row", () => {
    const [row] = deriveProcessRows([published], []);
    const view = describeProcessRow(row!);

    it("names the process by the published label", () => {
      expect(view.name).toBe("Workflow");
    });

    it("opens the versions screen", () => {
      expect(view.open).toEqual({ name: "versions", processId: "proc_pub" });
    });

    it("says what runs and since when, and nothing about a draft", () => {
      expect(view.published).toEqual({ version: 3, at: "2026-07-20T00:00:00.000Z" });
      expect(view.saved).toBeUndefined();
      expect(view.seedVersion).toBe(3);
    });

    it("reads the published key and hash in the developer view, and no revision", () => {
      expect(view.developer).toEqual({ key: "wf", processId: "proc_pub", hash: "hash_abc" });
    });

    it("offers create draft alone", () => {
      expect(view.commands).toEqual(["createDraft"]);
    });
  });

  describe("a row with both", () => {
    const [row] = deriveProcessRows([published], [draftForPublished]);
    const view = describeProcessRow(row!);

    it("names the process by the draft's label over the published one", () => {
      expect(view.name).toBe("Workflow v4");
    });

    it("opens the draft", () => {
      expect(view.open).toEqual({ name: "edit", processId: "proc_pub" });
    });

    it("carries both facts, with no saver name for an account that has none", () => {
      expect(view.saved).toEqual({ by: null, at: "2026-07-27T01:00:00.000Z" });
      expect(view.published).toEqual({ version: 3, at: "2026-07-20T00:00:00.000Z" });
      expect(view.seedVersion).toBe(3);
    });

    it("prefers the draft's key and carries revision, saver and hash", () => {
      expect(view.developer).toEqual({ key: "wf_draft", processId: "proc_pub", revision: 1, savedBy: "user_b", hash: "hash_abc" });
    });

    it("offers versions, then discard", () => {
      expect(view.commands).toEqual(["versions", "discard"]);
    });
  });

  describe("the name", () => {
    it("falls back to the published label when the draft's label has no text", () => {
      const [row] = deriveProcessRows([published], [{ ...draftForPublished, label: {} }]);
      expect(describeProcessRow(row!).name).toBe("Workflow");
    });

    it("falls back to the published label when the draft declares no label", () => {
      const [row] = deriveProcessRows([published], [{ ...draftForPublished, label: null }]);
      expect(describeProcessRow(row!).name).toBe("Workflow");
    });

    it("reads the draft's label in the draft's base locale, else the published base locale, else en", () => {
      const label = { en: "English", de: "Deutsch" };
      const draftDe = deriveProcessRows([], [{ ...draftOnly, label, baseLocale: "de" }])[0]!;
      expect(describeProcessRow(draftDe).name).toBe("Deutsch");
      const publishedDe = { ...published, baseLocale: "de" };
      const both = deriveProcessRows([publishedDe], [{ ...draftForPublished, label, baseLocale: null }])[0]!;
      expect(describeProcessRow(both).name).toBe("Deutsch");
      const neither = deriveProcessRows([], [{ ...draftOnly, label, baseLocale: null }])[0]!;
      expect(describeProcessRow(neither).name).toBe("English");
    });

    it("is empty for an untitled draft-only process", () => {
      const [row] = deriveProcessRows([], [untitledDraft]);
      expect(describeProcessRow(row!).name).toBe("");
    });

    it("is empty for a published process whose label has no text", () => {
      const [row] = deriveProcessRows([{ ...published, label: { en: "" } }], []);
      expect(describeProcessRow(row!).name).toBe("");
    });
  });

  describe("the developer view's key", () => {
    it("is null with neither a draft key nor a published key", () => {
      const [row] = deriveProcessRows([], [untitledDraft]);
      expect(describeProcessRow(row!).developer.key).toBeNull();
    });

    it("skips an empty draft key for the published one", () => {
      const [row] = deriveProcessRows([published], [{ ...draftForPublished, key: "" }]);
      expect(describeProcessRow(row!).developer.key).toBe("wf");
    });

    it("is null when the draft's key is empty and nothing is published", () => {
      const [row] = deriveProcessRows([], [{ ...draftOnly, key: "" }]);
      expect(describeProcessRow(row!).developer.key).toBeNull();
    });
  });

  it("describes a row with neither a draft nor a version as an offer to create a draft", () => {
    const view = describeProcessRow({ processId: "proc_new" });
    expect(view).toEqual({
      processId: "proc_new",
      name: "",
      open: { name: "versions", processId: "proc_new" },
      developer: { key: null, processId: "proc_new" },
      commands: ["createDraft"],
    });
  });
});

describe("sortProcessRows", () => {
  const view = (processId: string, name: string) => describeProcessRow({ processId, published: { ...deriveProcessRows([published], [])[0]!.published!, label: { en: name } } });

  it("sorts by name, ignoring case", () => {
    const sorted = sortProcessRows([view("proc_1", "banana"), view("proc_2", "Apple"), view("proc_3", "cherry")]);
    expect(sorted.map((v) => v.name)).toEqual(["Apple", "banana", "cherry"]);
  });

  it("sorts an untitled row as the catalog's untitled text, so it does not lead", () => {
    const untitled = describeProcessRow({ processId: "proc_u" });
    expect(studioCatalog.en["processList.untitled"]).toBe("Untitled process");
    const sorted = sortProcessRows([untitled, view("proc_1", "Zebra"), view("proc_2", "Apple"), view("proc_3", "Untitled process")]);
    expect(sorted.map((v) => v.processId)).toEqual(["proc_2", "proc_3", "proc_u", "proc_1"]);
  });

  it("breaks a tie on processId and leaves its input unchanged", () => {
    const input = [view("proc_b", "Same"), view("proc_a", "Same")];
    expect(sortProcessRows(input).map((v) => v.processId)).toEqual(["proc_a", "proc_b"]);
    expect(input.map((v) => v.processId)).toEqual(["proc_b", "proc_a"]);
  });
});

describe("relativeAgo", () => {
  const now = Date.parse("2026-10-31T12:00:00.000Z");
  const ago = (seconds: number) => relativeAgo(new Date(now - seconds * 1000).toISOString(), now);
  const MIN = 60;
  const HOUR = 3600;
  const DAY = 86400;

  it("reads just now under a minute, from the catalog", () => {
    expect(ago(0)).toBe(studioCatalog.en["processList.justNow"]);
    expect(ago(59)).toBe("just now");
  });

  it("reads a future time as just now", () => {
    expect(ago(-3600)).toBe("just now");
  });

  it("reads minutes from 60 seconds up to the last second before an hour", () => {
    expect(ago(MIN)).toBe("1 minute ago");
    expect(ago(2 * MIN + 30)).toBe("2 minutes ago");
    expect(ago(HOUR - 1)).toBe("59 minutes ago");
  });

  it("reads hours from 60 minutes up to the last second before a day", () => {
    expect(ago(HOUR)).toBe("1 hour ago");
    expect(ago(DAY - 1)).toBe("23 hours ago");
  });

  it("reads days from 24 hours up to the last second before 30 days", () => {
    expect(ago(DAY)).toBe("1 day ago");
    expect(ago(30 * DAY - 1)).toBe("29 days ago");
  });

  it("reads months from 30 days, capped at 11 up to the last second before 365 days", () => {
    expect(ago(30 * DAY)).toBe("1 month ago");
    expect(ago(59 * DAY)).toBe("1 month ago");
    expect(ago(60 * DAY)).toBe("2 months ago");
    expect(ago(330 * DAY)).toBe("11 months ago");
    expect(ago(364 * DAY)).toBe("11 months ago");
    expect(ago(365 * DAY - 1)).toBe("11 months ago");
  });

  it("reads years from 365 days", () => {
    expect(ago(365 * DAY)).toBe("1 year ago");
    expect(ago(2 * 365 * DAY - 1)).toBe("1 year ago");
    expect(ago(2 * 365 * DAY)).toBe("2 years ago");
  });
});

describe("isPlainLeftClick", () => {
  const click = { button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

  it("accepts a plain primary click", () => {
    expect(isPlainLeftClick(click)).toBe(true);
  });

  it("refuses each modifier", () => {
    for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
      expect(isPlainLeftClick({ ...click, [modifier]: true })).toBe(false);
    }
  });

  it("refuses a middle click and a secondary click", () => {
    expect(isPlainLeftClick({ ...click, button: 1 })).toBe(false);
    expect(isPlainLeftClick({ ...click, button: 2 })).toBe(false);
  });

  it("refuses an event something already handled", () => {
    expect(isPlainLeftClick({ ...click, defaultPrevented: true })).toBe(false);
  });
});
