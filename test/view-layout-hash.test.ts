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
 * `expense-approval.json`'s literal does not carry the original provenance
 * (a `git archive HEAD` copy taken before this file's optional layout keys
 * existed). `give-the-example-a-reachable-target` rewrote its three action
 * bodies, which moves the hash, so this file's entry was a fresh measurement
 * against the CURRENT schema, taken in the same run that confirmed the other
 * two literals still pass. `dedup-runtime-pagination-webhook-sink` moved it
 * again: its `book` and `escalated_review` steps' `http.request` targets
 * changed from `webhook-sink:8080` to `localhost:8080`, so the literal below
 * is a second fresh measurement, taken the same way —
 * `definitionHash(processBody.parse(bodyOf("expense-approval.json")))`, run
 * against the post-edit body and the current schema.
 *
 * `require-path-key-label` moved `subprocess-credit-check-child.json` and
 * `subprocess-loan-parent.json` too: both gained a non-empty `label` on
 * every path that lacked one, once `Path.label` became required. Their two
 * literals below are fresh measurements taken the same way, against the
 * post-edit bodies and the current schema. All three files remain the
 * regression guard from here on: a schema change that alters what
 * `processBody.parse` emits for any of these bodies moves its hash and fails
 * here.
 *
 * `redactable-field-flag` moved `expense-approval.json` again: `review_note`
 * gained `redactable: true`, a declared key present in the canonical JSON,
 * so its literal below is a third fresh measurement, taken the same way,
 * against the post-edit body and the current schema.
 */
const PRE_CHANGE_HASHES: Record<string, string> = {
  "expense-approval.json": "d9782fcbc99eacf57499c8c9aa406537b8c5a422b2fe8941a2440b04b03df165",
  "subprocess-credit-check-child.json": "aa07358556ff42fc66275e8c2908093a085d501075539768693bb7c01619e5b8",
  "subprocess-loan-parent.json": "c3afcb3c7e5c3b95c63c443ebb054f5b90ab883a2fdc78c8c02f534ee838c208",
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
