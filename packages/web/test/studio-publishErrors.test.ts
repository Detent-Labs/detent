import { describe, expect, it } from "bun:test";
import { describeError, describePublishRefusal } from "../src/areas/studio/errors.js";
import type { ClientError } from "../src/areas/studio/api/types.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { validateStructure } from "workflow-engine/validate";

/**
 * The seven publish-time rejections a developer meets when publishing a draft or
 * importing a promoted version. Before `add-environment-promotion` every one of
 * them fell through `parseErrorBody`'s default into `internal`, and rendered as
 * "The server hit an error. Try again." — discarding the located detail that is
 * the only actionable part of a publish rejection.
 */
describe("a publish-time rejection keeps its located detail", () => {
  it("names every issue, with its location", () => {
    const error: ClientError = {
      type: "publish-validation",
      kind: "registry-validation",
      issues: [
        { loc: "steps[1].timers[0].onFire.actions[0]", message: "action type 'notify.email' is not registered" },
        { loc: "steps[2].onEntry[0]", message: "action type 'accounting.postInvoice' is not registered" },
      ],
    };
    const text = describeError(error);
    expect(text).toContain("steps[1].timers[0].onFire.actions[0]: action type 'notify.email' is not registered");
    expect(text).toContain("steps[2].onEntry[0]: action type 'accounting.postInvoice' is not registered");
  });

  it("drops the separator for an issue with no location", () => {
    const text = describeError({ type: "publish-validation", kind: "schema-validation", issues: [{ loc: "", message: "invalid body" }] });
    expect(text).toContain("invalid body");
    expect(text).not.toContain(": invalid body");
  });

  it("still says something when the server sends no issues at all", () => {
    const text = describeError({ type: "publish-validation", kind: "cel-validation", issues: [] });
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toBe("");
  });

  it("shows a cross-process rejection's own message", () => {
    const message = "subprocess step 'check' references child 'proc_credit_check' (version 1) which is not published";
    expect(describeError({ type: "cross-process-validation", message })).toContain(message);
  });

  it("does not collapse a publish rejection into the generic server error", () => {
    const generic = describeError({ type: "internal", message: "" });
    const rejection = describeError({ type: "publish-validation", kind: "compile-validation", issues: [{ loc: "uiMeta", message: "unknown key 'uiMeta'" }] });
    expect(rejection).not.toBe(generic);
    expect(rejection).toContain("uiMeta");
  });

  it("names a group-scope-validation rejection's offending group id", () => {
    const text = describeError({
      type: "publish-validation",
      kind: "group-scope-validation",
      issues: [{ loc: "", message: '{"groupId":"group_finance","reason":"not-found"}' }],
    });
    expect(text).toContain("group_finance");
  });
});

/** One task step with a timer, so a located issue reads a sentence. */
const refusalDraft = {
  key: "invoice",
  label: { en: "Invoice" },
  baseLocale: "en",
  workflow: {
    initialStep: "step_0",
    steps: [
      {
        id: "step_0",
        key: "review",
        label: { en: "Review" },
        type: "task",
        timers: [{ id: "timer_0", duration: "P1X", onFire: {} }],
      },
    ],
  },
} as unknown as Draft;

const GRAMMAR = "unsupported ISO 8601 duration (W/D/H/M/S only, no calendar units, at least one component)";

describe("describePublishRefusal", () => {
  it("prints a located issue as its sentence and keeps the server's lines for the Developer view", () => {
    const error: ClientError = {
      type: "publish-validation",
      kind: "duration-validation",
      issues: [{ loc: "workflow.steps[0].timers[0].duration", message: GRAMMAR }],
    };
    const refusal = describePublishRefusal(error, refusalDraft)!;
    expect(refusal.text.split("\n")[0]).toBe("Publishing stopped. Fix these, then publish again:");
    expect(refusal.text).toContain("Review");
    expect(refusal.text).not.toContain("workflow.steps");
    expect(refusal.text).not.toContain("ISO 8601");
    expect(refusal.detail).toContain("duration-validation");
    expect(refusal.detail).toContain(`workflow.steps[0].timers[0].duration: ${GRAMMAR}`);
  });

  it("reads the fallback sentence for an issue with no location", () => {
    const error: ClientError = { type: "publish-validation", kind: "schema-validation", issues: [{ loc: "", message: "Refused by the smoke suite." }] };
    const refusal = describePublishRefusal(error, refusalDraft)!;
    expect(refusal.text).toContain("Something in this process does not pass a check. The Developer view below names it.");
    expect(refusal.text).not.toContain("On the Checks tab");
    expect(refusal.text).not.toContain("Refused by the smoke suite.");
    expect(refusal.detail).toContain("Refused by the smoke suite.");
  });

  it("reads a schema refusal's dotted path as its sentences", () => {
    const draft = {
      key: "invoice",
      label: { en: "Invoice" },
      baseLocale: "en",
      fields: [],
      workflow: {
        initialStep: "step_00000000-0000-4000-8000-000000000001",
        steps: [
          {
            id: "step_00000000-0000-4000-8000-000000000001",
            key: "review",
            label: { en: "Review" },
            type: "task",
            paths: [{ id: "path_00000000-0000-4000-8000-000000000001", key: "go", to: "step_00000000-0000-4000-8000-000000000002", trigger: "manual" }],
          },
          { id: "step_00000000-0000-4000-8000-000000000002", key: "book", label: { en: "Book" }, type: "task", paths: [] },
        ],
      },
    } as unknown as Draft;
    const zodIssues = validateStructure(draft).zodIssues;
    const issues = zodIssues.map((issue) => ({ loc: issue.path.join("."), message: issue.message }));

    // The wire form holds a bare index, or this test proves nothing.
    expect(issues.some((issue) => /steps\.\d/.test(issue.loc))).toBe(true);

    const text = describePublishRefusal({ type: "publish-validation", kind: "schema-validation", issues }, draft)!.text;
    expect(text).toContain("A way out of “Review” has no name. Under Ways out, type one.");
    expect(text).toContain("“Book” has no way out yet.");
    expect(text).not.toContain("does not pass a check");
  });

  it("reads a source's dotted path by the source's name", () => {
    const draft = {
      key: "invoice",
      label: { en: "Invoice" },
      baseLocale: "en",
      fields: [],
      dataSources: [{ id: "ds_00000000-0000-4000-8000-000000000001", key: "data", type: "static", config: {} }],
      workflow: {
        initialStep: "step_00000000-0000-4000-8000-000000000001",
        steps: [{ id: "step_00000000-0000-4000-8000-000000000001", key: "done", label: { en: "Done" }, type: "task", terminal: true, paths: [] }],
      },
    } as unknown as Draft;
    const issues = validateStructure(draft).zodIssues.map((issue) => ({ loc: issue.path.join("."), message: issue.message }));

    expect(issues.some((issue) => /dataSources\.\d/.test(issue.loc))).toBe(true);

    const text = describePublishRefusal({ type: "publish-validation", kind: "schema-validation", issues }, draft)!.text;
    expect(text).toContain("“data” uses a name the studio keeps for itself.");
  });

  it("reads a nested field's dotted path by its chain", () => {
    const draft = {
      ...refusalDraft,
      fields: [{ id: "field_g", key: "g", label: { en: "Group" }, type: "group", fields: [{ id: "field_i", key: "i", label: { en: "Inner" }, type: "string" }] }],
    } as unknown as Draft;
    const text = describePublishRefusal({ type: "publish-validation", kind: "schema-validation", issues: [{ loc: "fields.0.fields.0.key", message: "Too small: expected string to have >=1 characters" }] }, draft)!.text;
    expect(text).toContain("The internal name of “Inner” cannot be used.");
  });

  it("swaps a tier 4 answer for the refusal's fallback, on a step and on the contract", () => {
    for (const loc of ["workflow.steps.0.zzz", "contract.zzz"]) {
      const refusal = describePublishRefusal({ type: "publish-validation", kind: "x", issues: [{ loc, message: "A brand new message" }] }, refusalDraft)!;
      expect(refusal.text).toContain("Something in this process does not pass a check. The Developer view below names it.");
      expect(refusal.text).not.toContain("On the Checks tab");
      expect(refusal.detail).toContain(`${loc}: A brand new message`);
    }
  });

  it("states a fallback once however many issues fall to it", () => {
    const issues = [
      { loc: "", message: "one" },
      { loc: "", message: "two" },
    ];
    const text = describePublishRefusal({ type: "publish-validation", kind: "x", issues }, refusalDraft)!.text;
    expect(text.match(/does not pass a check/g)).toHaveLength(1);
  });

  it("still says something when the server sends no issues", () => {
    const refusal = describePublishRefusal({ type: "publish-validation", kind: "cel-validation", issues: [] }, refusalDraft)!;
    expect(refusal.text).toContain("does not pass a check");
  });

  it("reads the cross-process sentence and keeps the server's message", () => {
    const message = "subprocess step 'check' references child 'proc_credit_check' (version 1) which is not published";
    const refusal = describePublishRefusal({ type: "cross-process-validation", message }, refusalDraft)!;
    expect(refusal.text).toContain("depends on another process");
    expect(refusal.text).not.toContain("proc_credit_check");
    expect(refusal.detail).toBe(message);
  });

  it("returns nothing for any other error, so the caller keeps describeError", () => {
    expect(describePublishRefusal({ type: "authorization", message: "no" } as ClientError, refusalDraft)).toBeUndefined();
    expect(describePublishRefusal({ type: "network" } as ClientError, refusalDraft)).toBeUndefined();
  });
});
