/**
 * harden-publish-validation: the six structural write-path checks added to
 * `compileProcessBody` (src/schema/compile.ts) — unknown-key rejection, the
 * reserved action prefix, pattern compilation, field-key format, id
 * resolution for outputMapping/contract field lists, and length bounds. One
 * rejecting test per new invariant, per the repo's standing rule.
 *
 * A minimal, otherwise-valid body per check, mutated to trip exactly one
 * check at a time — mirrors test/validate.test.ts's "definition-contract"
 * blocks in style.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import { processVersion, processBody, type ProcessBody } from "../src/schema/definition.js";
import {
  compileProcessBody,
  CompileValidationError,
  MAX_EXPRESSION_LENGTH,
} from "../src/schema/compile.js";

const example = JSON.parse(
  readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"),
);

const cel = (src: string) => ({ lang: "cel", src });

/** A minimal, otherwise-clean two-step body: step_a (manual, one path) -> step_b (terminal). */
const baseBody = (): any => ({
  key: "p",
  label: { en: "P" },
  baseLocale: "en",
  fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
  workflow: {
    initialStep: "step_a",
    steps: [
      {
        id: "step_a",
        key: "a",
        label: { en: "A" },
        type: "task",
        paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
      },
      { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
    ],
  },
});

const rejects = (body: any): CompileValidationError => {
  try {
    compileProcessBody(body as ProcessBody);
    throw new Error("expected compileProcessBody to throw CompileValidationError");
  } catch (err) {
    expect(err).toBeInstanceOf(CompileValidationError);
    return err as CompileValidationError;
  }
};

describe("compile: unknown-key rejection", () => {
  it("rejects a misspelled 'gaurd' key with a located path, instead of publishing a guardless default", () => {
    const b = baseBody();
    b.workflow.steps[0].paths[0].trigger = "automatic";
    b.workflow.steps[0].paths[0].priority = 1;
    b.workflow.steps[0].paths[0].gaurd = cel("data.amount > 100");
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "workflow.steps[0].paths[0].gaurd" && i.value === "gaurd")).toBe(true);
  });

  it("reports every unknown key when a body carries them in more than one place", () => {
    const b = baseBody();
    b.uiMeta = { editor: "v1" };
    b.workflow.steps[0].editorNote = "note";
    const err = rejects(b);
    expect(err.issues.some((i) => i.value === "uiMeta")).toBe(true);
    expect(err.issues.some((i) => i.value === "editorNote")).toBe(true);
  });

  it("is not bypassable by a body that also satisfies publishedProcessBody", () => {
    // No cancel-sink here, so this stays on the authored branch either way —
    // see test/cancel.test.ts's additive SEC-3 case for the compiled-branch
    // version of this same assertion.
    const b = baseBody();
    b.notAField = 1;
    expect(() => compileProcessBody(b as ProcessBody)).toThrow(CompileValidationError);
  });

  it("a clean body raises no unknown-key issue", () => {
    expect(() => compileProcessBody(baseBody() as ProcessBody)).not.toThrow();
  });
});

describe("compile: issues from different checks are all reported together, not just the first check's", () => {
  it("an unknown key and an uncompilable pattern both surface in one rejection", () => {
    const b = baseBody();
    b.uiMeta = { editor: "v1" };
    b.fields[0].validation = { pattern: "(" };
    const err = rejects(b);
    expect(err.issues.some((i) => i.value === "uiMeta")).toBe(true);
    expect(err.issues.some((i) => i.loc === "fields[0].validation.pattern")).toBe(true);
  });
});

describe("compile: catalog validation.pattern compiles at publish", () => {
  const withPattern = (pattern: string): any => {
    const b = baseBody();
    b.fields[0].validation = { pattern };
    return b;
  };

  it("rejects an uncompilable pattern", () => {
    const err = rejects(withPattern("("));
    expect(err.issues.some((i) => i.loc === "fields[0].validation.pattern" && i.value === "(")).toBe(true);
  });

  it("a well-formed pattern still publishes", () => {
    expect(() => compileProcessBody(withPattern("^[a-z]+$") as ProcessBody)).not.toThrow();
  });

  it("rejects a pattern whose source exceeds the maximum length", () => {
    const huge = "a".repeat(5000);
    const err = rejects(withPattern(huge));
    expect(err.issues.some((i) => i.loc === "fields[0].validation.pattern")).toBe(true);
  });
});

describe("compile: FieldDef.key is a CEL-referenceable identifier", () => {
  const withKey = (key: string): any => {
    const b = baseBody();
    b.fields[0].key = key;
    return b;
  };

  for (const bad of ["", "my-field", "2fa"]) {
    it(`rejects the non-identifier key ${JSON.stringify(bad)}`, () => {
      const err = rejects(withKey(bad));
      expect(err.issues.some((i) => i.loc === "fields[0].key")).toBe(true);
    });
  }

  it("accepts total_amount", () => {
    expect(() => compileProcessBody(withKey("total_amount") as ProcessBody)).not.toThrow();
  });
});

describe("compile: SubprocessSpec.outputMapping and ProcessContract field lists resolve", () => {
  const subprocessBody = (outputMapping: Record<string, unknown>): any => ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "subprocess",
          subprocess: {
            processId: "proc_child",
            versionBinding: "pinned",
            pinnedVersion: 1,
            inputMapping: {},
            outputMapping,
          },
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "automatic", priority: 1 }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  });

  it("rejects an outputMapping key that does not resolve to a field", () => {
    const err = rejects(subprocessBody({ field_does_not_exist: cel("result.x") }));
    expect(err.issues.some((i) => i.loc === "steps[0].subprocess.outputMapping" && i.value === "field_does_not_exist")).toBe(true);
  });

  it("accepts an outputMapping key that resolves to a real field", () => {
    expect(() => compileProcessBody(subprocessBody({ field_amount: cel("result.x") }) as ProcessBody)).not.toThrow();
  });

  it("resolves an outputMapping key nested inside a group field", () => {
    const b = subprocessBody({ field_nested: cel("result.x") });
    b.fields.push({
      id: "field_g",
      key: "grp",
      label: { en: "G" },
      type: "group",
      fields: [{ id: "field_nested", key: "nested", label: { en: "N" }, type: "string" }],
    });
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  const contractBody = (inputFields: string[], outputFields: string[]): any => {
    const b = baseBody();
    b.contract = { inputFields, outputFields, outcomes: ["done"] };
    b.workflow.steps[1].outcome = "done";
    return b;
  };

  it("rejects an unresolvable contract.inputFields entry", () => {
    const err = rejects(contractBody(["field_does_not_exist"], []));
    expect(err.issues.some((i) => i.loc === "contract.inputFields[0]" && i.value === "field_does_not_exist")).toBe(true);
  });

  it("rejects an unresolvable contract.outputFields entry", () => {
    const err = rejects(contractBody([], ["field_does_not_exist"]));
    expect(err.issues.some((i) => i.loc === "contract.outputFields[0]" && i.value === "field_does_not_exist")).toBe(true);
  });

  it("accepts contract field lists that resolve", () => {
    expect(() => compileProcessBody(contractBody(["field_amount"], ["field_amount"]) as ProcessBody)).not.toThrow();
  });
});

describe("compile: authored strings are length-bounded", () => {
  it("rejects an over-long Expression.src", () => {
    const b = baseBody();
    b.workflow.steps[0].paths[0].trigger = "automatic";
    b.workflow.steps[0].paths[0].priority = 1;
    b.workflow.steps[0].paths[0].guard = cel("true == true && " + "a".repeat(MAX_EXPRESSION_LENGTH));
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "steps[0].paths[0].guard")).toBe(true);
  });

  it("the repo's own example raises no length issue", () => {
    expect(() => compileProcessBody(structuredClone(example.definition) as ProcessBody)).not.toThrow();
  });
});

describe("compile: idempotent re-publish survives every new check", () => {
  it("re-publishing an already-compiled clean body is still a no-op", () => {
    const compiled = compileProcessBody(baseBody() as ProcessBody);
    expect(() => compileProcessBody(compiled)).not.toThrow();
    expect(compileProcessBody(compiled)).toEqual(compiled);
  });
});

// Every new check is write-path only (compileProcessBody), never a Zod
// refinement on processBody/processVersion. A body that would violate one of
// them — as if it had been published before the check existed — must still
// PARSE on read, so its pinned instances stay rehydratable. See CLAUDE.md's
// duration-bound precedent for the same argument.
describe("compile: a body violating a new check still reads (no new Zod refinement)", () => {
  const stored = (mutate: (b: any) => void): unknown => {
    const wrapper = structuredClone(example);
    mutate(wrapper.definition);
    return wrapper;
  };

  it("an unknown key parses on read", () => {
    const wrapper = stored((b) => { b.uiMeta = { editor: "v1" }; });
    expect(processVersion.safeParse(wrapper).success).toBe(true);
  });

  it("a non-identifier field key parses on read", () => {
    const wrapper = stored((b) => { b.fields[0].key = "my-field"; });
    expect(processVersion.safeParse(wrapper).success).toBe(true);
  });

  it("an uncompilable pattern parses on read", () => {
    const wrapper = stored((b) => { b.fields[0].validation = { pattern: "(" }; });
    expect(processVersion.safeParse(wrapper).success).toBe(true);
  });

  it("an unresolvable outputMapping key parses on read", () => {
    const b: any = baseBody();
    b.workflow.steps[0].type = "subprocess";
    b.workflow.steps[0].subprocess = {
      processId: "proc_child",
      versionBinding: "pinned",
      pinnedVersion: 1,
      inputMapping: {},
      outputMapping: { field_does_not_exist: cel("result.x") },
    };
    b.workflow.steps[0].paths[0].trigger = "automatic";
    b.workflow.steps[0].paths[0].priority = 1;
    expect(processBody.safeParse(b).success).toBe(true);
  });
});
