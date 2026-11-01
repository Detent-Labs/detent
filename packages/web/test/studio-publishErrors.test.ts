import { describe, expect, it } from "bun:test";
import { describeError, describePublishRefusal } from "../src/areas/studio/errors.js";
import type { ClientError } from "../src/areas/studio/api/types.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

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
