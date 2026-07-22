import { describe, expect, it } from "bun:test";
import { CANCEL_SINK_STEP_ID, CANCEL_SINK_KEY, RESERVED_CANCEL_OUTCOME, type ProcessBody } from "workflow-engine/schema";
import { mintId } from "../src/draft/ids";
import { parseDraftJson, parseImportedProcessJson, stringifyDraft, DraftLoadError } from "../src/draft/io";
import { exportProcessBody } from "../src/draft/file-io";
import type { Draft } from "../src/draft/types";

// `saveDraft`/`loadDraftViaPicker`/`exportDraft` are thin file-handle wrappers
// around these two pure functions (no browser File System Access API exists
// in bun:test) — exercising the wrapped logic directly is what the save-then-
// load round trip actually needs to prove.
function validDraft(): Draft {
  const step = mintId("step");
  return {
    key: "test_process",
    label: { en: "Test process" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: step,
      steps: [{ id: step, key: "start", label: { en: "Start" }, type: "task", terminal: true }],
    },
  } as Draft;
}

describe("Draft save/load round-trip (task 6.6)", () => {
  it("preserves every field and entity id through stringify -> parse", () => {
    const draft = validDraft();
    const reloaded = parseDraftJson(stringifyDraft(draft));
    expect(reloaded).toEqual(draft);
    expect(reloaded.workflow?.initialStep).toBe(draft.workflow!.initialStep);
    expect(reloaded.workflow?.steps?.[0]?.id).toBe(draft.workflow!.steps![0]!.id);
  });

  it("rejects a malformed file with a clear load-guard error instead of accepting it (editor-draft-io spec)", () => {
    expect(() => parseDraftJson(JSON.stringify({ workflow: "not-an-object" }))).toThrow(DraftLoadError);
    try {
      parseDraftJson(JSON.stringify({ workflow: "not-an-object" }));
    } catch (e) {
      expect(e).toBeInstanceOf(DraftLoadError);
      expect((e as DraftLoadError).issues).toEqual([{ path: "workflow", message: "'workflow' must be an object if present" }]);
    }
  });

  it("rejects a published DefinitionVersion wrapper instead of silently loading an all-undefined Draft", () => {
    // Same on-disk shape as examples/*.json: real content lives under `.definition`,
    // not at the top level, so it must not pass through as a Draft.
    const wrapper = { processId: "proc_x", version: 1, definitionHash: "abc", status: "published", definition: { key: "x" } };
    expect(() => parseDraftJson(JSON.stringify(wrapper))).toThrow(DraftLoadError);
  });

  it("still accepts a fresh, empty Draft (no recognized keys is not the same as unrecognized keys)", () => {
    expect(parseDraftJson("{}")).toEqual({});
  });
});

describe("exportProcessBody (task 6.4)", () => {
  it("produces a ProcessBody that parses successfully for a valid draft", () => {
    const draft = validDraft();
    const body = exportProcessBody(draft);
    expect(body.workflow.initialStep).toBe(draft.workflow!.initialStep!);
  });

  it("throws loudly on a structurally incomplete draft rather than exporting silently", () => {
    expect(() => exportProcessBody({ key: "incomplete" })).toThrow();
  });
});

/** A complete, uncompiled ProcessBody (single terminal step, no contract). */
function simpleProcessBody(): ProcessBody {
  const step = mintId("step");
  return {
    key: "imported_process",
    label: { en: "Imported process" },
    baseLocale: "en",
    fields: [],
    workflow: { initialStep: step, steps: [{ id: step, key: "start", label: { en: "Start" }, type: "task", terminal: true }] },
  };
}

/** A compiled, contracted ProcessBody: the engine-injected cancel-sink alongside one real terminal step. */
function compiledProcessBodyWithSink(): ProcessBody {
  const realStep = mintId("step");
  return {
    key: "compiled_process",
    label: { en: "Compiled process" },
    baseLocale: "en",
    contract: { outcomes: ["done", RESERVED_CANCEL_OUTCOME] },
    fields: [],
    workflow: {
      initialStep: realStep,
      steps: [
        { id: realStep, key: "done_step", label: { en: "Done" }, type: "task", terminal: true, outcome: "done" },
        { id: CANCEL_SINK_STEP_ID, key: CANCEL_SINK_KEY, label: { en: "Cancelled" }, type: "task", terminal: true, outcome: RESERVED_CANCEL_OUTCOME },
      ],
    },
  };
}

describe("parseImportedProcessJson (editor-import-process change, task 1.3/4.1)", () => {
  it("imports a published DefinitionVersion wrapper's process content", () => {
    const body = simpleProcessBody();
    const wrapper = { processId: "proc_x", version: 1, definitionHash: "abc", status: "published", definition: body };
    const draft = parseImportedProcessJson(JSON.stringify(wrapper));
    expect(draft.key).toBe(body.key);
    expect(draft.workflow?.initialStep).toBe(body.workflow.initialStep);
    expect(draft.workflow?.steps?.[0]?.id).toBe(body.workflow.steps[0]!.id);
  });

  it("imports a raw, unwrapped ProcessBody directly", () => {
    const body = simpleProcessBody();
    const draft = parseImportedProcessJson(JSON.stringify(body));
    expect(draft.key).toBe(body.key);
    expect(draft.workflow?.steps?.length).toBe(1);
  });

  it("rejects a file that doesn't parse as a process body, instead of loading a partial Draft", () => {
    expect(() => parseImportedProcessJson(JSON.stringify({ key: "incomplete" }))).toThrow();
    expect(() => parseImportedProcessJson("not json")).toThrow();
  });
});

describe("cancel-sink strip on import (editor-import-process change, task 4.2)", () => {
  it("removes the engine-injected cancel-sink step and reserved outcome from an imported Draft", () => {
    const body = compiledProcessBodyWithSink();
    const draft = parseImportedProcessJson(JSON.stringify(body));
    expect(draft.workflow?.steps?.some((s) => s.id === CANCEL_SINK_STEP_ID)).toBe(false);
    expect(draft.workflow?.steps?.length).toBe(1);
    expect(draft.contract?.outcomes).toEqual(["done"]);
  });

  it("is a no-op for a body that was never compiled (no sink present)", () => {
    const body = simpleProcessBody();
    const draft = parseImportedProcessJson(JSON.stringify(body));
    expect(draft.workflow?.steps?.length).toBe(body.workflow.steps.length);
  });
});

describe("imported Draft round-trips through Export (editor-import-process change, task 4.3)", () => {
  it("a stripped, imported compiled body re-exports without throwing on the reserved identity", () => {
    const draft = parseImportedProcessJson(JSON.stringify(compiledProcessBodyWithSink()));
    const reExported = exportProcessBody(draft);
    expect(reExported.workflow.steps.some((s) => s.id === CANCEL_SINK_STEP_ID)).toBe(false);
    expect(reExported.contract?.outcomes).toEqual(["done"]);
  });
});
