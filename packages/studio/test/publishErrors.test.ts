import { describe, expect, it } from "bun:test";
import { describeError } from "../src/errors.js";
import type { ClientError } from "../src/api/types.js";

/**
 * The six publish-time rejections a developer meets when publishing a draft or
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
    const text = describeError(error, 422);
    expect(text).toContain("steps[1].timers[0].onFire.actions[0]: action type 'notify.email' is not registered");
    expect(text).toContain("steps[2].onEntry[0]: action type 'accounting.postInvoice' is not registered");
  });

  it("drops the separator for an issue with no location", () => {
    const text = describeError({ type: "publish-validation", kind: "schema-validation", issues: [{ loc: "", message: "invalid body" }] }, 422);
    expect(text).toContain("invalid body");
    expect(text).not.toContain(": invalid body");
  });

  it("still says something when the server sends no issues at all", () => {
    const text = describeError({ type: "publish-validation", kind: "cel-validation", issues: [] }, 422);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toBe("");
  });

  it("shows a cross-process rejection's own message", () => {
    const message = "subprocess step 'check' references child 'proc_credit_check' (version 1) which is not published";
    expect(describeError({ type: "cross-process-validation", message }, 422)).toContain(message);
  });

  it("does not collapse a publish rejection into the generic server error", () => {
    const generic = describeError({ type: "internal", message: "" }, 500);
    const rejection = describeError({ type: "publish-validation", kind: "compile-validation", issues: [{ loc: "uiMeta", message: "unknown key 'uiMeta'" }] }, 422);
    expect(rejection).not.toBe(generic);
    expect(rejection).toContain("uiMeta");
  });
});
