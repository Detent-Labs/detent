import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import { processBody, view, viewField } from "../src/schema/definition.js";
import { definitionHash } from "../src/schema/hash.js";
import { canonicalize } from "../src/schema/canonical-json.js";

/**
 * `view.columns` and `viewField.span` are optional layout keys added by the
 * `view-layout-and-form-editor` change. `definitionHash` is the JCS hash of
 * `ProcessBody` alone and a published version is immutable, so neither key may
 * move the hash of a body that declares neither.
 *
 * `subprocess-credit-check-child.json` and `subprocess-loan-parent.json` keep
 * their original provenance: their literals were computed against the schema
 * as it stood BEFORE both keys existed, from a `git archive HEAD` copy of the
 * tree, and neither file has changed since.
 *
 * `expense-approval.json`'s literal does not carry that provenance.
 * `give-the-example-a-reachable-target` rewrote its three action bodies, which
 * moves the hash, so this file's entry was a fresh measurement against the
 * CURRENT schema, taken in the same run that confirmed the other two literals
 * still pass. `dedup-runtime-pagination-webhook-sink` moved it again: its
 * `book` and `escalated_review` steps' `http.request` targets changed from
 * `webhook-sink:8080` to `localhost:8080`, so the literal below is a second
 * fresh measurement, taken the same way — `definitionHash(processBody.parse(
 * bodyOf("expense-approval.json")))`, run against the post-edit body and the
 * current schema. All three remain the regression guard from here on: a
 * schema change that alters what `processBody.parse` emits for any of these
 * bodies moves its hash and fails here.
 */
const PRE_CHANGE_HASHES: Record<string, string> = {
  "expense-approval.json": "bb641c63033baf8178df99f9e6f330ff3bd0b811b13d3a85bad4fea5382c541f",
  "subprocess-credit-check-child.json": "c585d1b2f94b0b8a8541144ab7fbf110344a245446dd25dd100ede94d63ad80a",
  "subprocess-loan-parent.json": "7faa040f7cbb6d5e310bf6440802e53a043929318eee9f436fa85ad3b47d18c5",
};

/** The example files come in two shapes: a versioned wrapper carrying the body
 * under `definition`, and a bare body. */
function bodyOf(file: string): unknown {
  const raw = JSON.parse(readFileSync(new URL(`../examples/${file}`, import.meta.url), "utf8"));
  return raw.definition ?? raw;
}

describe("view layout keys do not move definitionHash", () => {
  for (const [file, expected] of Object.entries(PRE_CHANGE_HASHES)) {
    it(`${file} hashes to its pre-change value`, () => {
      expect(definitionHash(processBody.parse(bodyOf(file)))).toBe(expected);
    });

    it(`${file} parses back carrying neither columns nor span`, () => {
      // The hash is taken over the canonicalized parse output, so an absent
      // optional that started materializing as a default would show up here
      // before it showed up as a moved hash.
      const canonical = canonicalize(processBody.parse(bodyOf(file)));
      expect(canonical).not.toContain('"columns"');
      expect(canonical).not.toContain('"span"');
    });
  }

  it("leaves an absent optional absent rather than defaulting it", () => {
    expect(view.parse({ fields: [] })).not.toHaveProperty("columns");
    expect(viewField.parse({ ref: "field_x" })).not.toHaveProperty("span");
  });

  it("keeps a body that declares the keys distinct from one that does not", () => {
    // A body that SETS either key is a different body and hashes differently.
    // That is correct: it reaches a hash only through a new published version.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = bodyOf("expense-approval.json") as any;
    const bare = processBody.parse(raw);
    const laid = processBody.parse({
      ...raw,
      workflow: {
        ...raw.workflow,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        steps: raw.workflow.steps.map((s: any) => (s.view ? { ...s, view: { ...s.view, columns: 2 } } : s)),
      },
    });
    expect(definitionHash(laid)).not.toBe(definitionHash(bare));
  });
});
