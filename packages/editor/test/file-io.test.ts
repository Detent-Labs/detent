import { describe, expect, it } from "bun:test";
import { mintId } from "../src/draft/ids";
import { parseDraftJson, stringifyDraft, DraftLoadError } from "../src/draft/io";
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
    label: "Test process",
    fields: [],
    workflow: {
      initialStep: step,
      steps: [{ id: step, key: "start", label: "Start", type: "task", terminal: true }],
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
