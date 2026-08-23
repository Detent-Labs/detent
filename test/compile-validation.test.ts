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
import { processVersion, processBody, publishedProcessBody, type ProcessBody } from "../src/schema/definition.js";
import {
  compileProcessBody,
  CompileValidationError,
  MAX_EXPRESSION_LENGTH,
} from "../src/schema/compile.js";
import { canonicalize } from "../src/schema/canonical-json.js";

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

  // migrate-to-zod-v4: the key sets behind this check come from `shapeKeys`,
  // which reads `.shape` off each schema at module load, so a Zod upgrade can
  // move what they contain.
  //
  // Two failure modes, measured against mutants rather than assumed. An EMPTY
  // key set is loud: it makes every key unknown, and eight tests in this file
  // already fail on it, "a clean body raises no unknown-key issue" first. A
  // level that stops being WALKED is silent: every other test in this file
  // still passes. This case is the guard for that second mode, which is why
  // each level is planted separately — the failure names the level that
  // stopped rejecting.
  it("rejects an unknown key at every level whose key set is derived from a schema", () => {
    const planted: Array<[string, (b: any) => void]> = [
      ["body", (b) => (b.zzBody = 1)],
      ["field", (b) => (b.fields[0].zzField = 1)],
      ["fieldValidation", (b) => (b.fields[0].validation = { min: 1, zzValidation: 1 })],
      ["workflow", (b) => (b.workflow.zzWorkflow = 1)],
      ["step", (b) => (b.workflow.steps[0].zzStep = 1)],
      ["path", (b) => (b.workflow.steps[0].paths[0].zzPath = 1)],
      ["expression", (b) => (b.workflow.steps[0].paths[0].guard = { ...cel("true"), zzExpr: 1 })],
      [
        "action",
        (b) => (b.workflow.steps[0].onEntry = [{ id: "action_x", type: "t", config: {}, zzAction: 1 }]),
      ],
      [
        "timer",
        (b) =>
          (b.workflow.steps[0].timers = [
            { id: "timer_x", duration: "PT1H", onFire: { targetPath: "path_ab" }, zzTimer: 1 },
          ]),
      ],
      [
        "timerAction",
        (b) =>
          (b.workflow.steps[0].timers = [
            {
              id: "timer_x",
              duration: "PT1H",
              onFire: { targetPath: "path_ab", zzTimerAction: 1 },
            },
          ]),
      ],
      ["view", (b) => (b.workflow.steps[0].view = { fields: [], zzView: 1 })],
      [
        "viewField",
        (b) => (b.workflow.steps[0].view = { fields: [{ ref: "field_amount", zzViewField: 1 }] }),
      ],
      ["assignment", (b) => (b.workflow.steps[0].assignment = { zzAssignment: 1 })],
      ["plugin", (b) => (b.fields[0].type = { type: "custom", config: {}, zzPlugin: 1 })],
      [
        "fieldOption",
        (b) => {
          b.fields[0].type = "select";
          b.fields[0].options = [{ value: "a", label: { en: "A" }, zzOption: 1 }];
        },
      ],
      [
        "dataSourceDef",
        (b) => (b.dataSources = [{ id: "ds_x", key: "x", type: "static", config: {}, zzDs: 1 }]),
      ],
    ];

    for (const [level, plant] of planted) {
      const b = baseBody();
      plant(b);
      const err = rejects(b);
      const keys = err.issues.map((i) => i.value);
      expect(keys.some((k) => typeof k === "string" && k.startsWith("zz"))).toBe(true);
      // Name the level in the assertion so a regression says which one broke.
      expect([level, keys.some((k) => typeof k === "string" && k.startsWith("zz"))]).toEqual([
        level,
        true,
      ]);
    }
  });

  // drop-view-renderer-unused-field: view.renderer was a declared, unread
  // field. Deleting it from the schema turns an authored `view.renderer`
  // into an unknown key, through the same generic mechanism the "view"
  // case above already exercises for other unknown keys on this object.
  it("rejects an authored view.renderer as an unknown key", () => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [], renderer: { type: "custom", config: {} } };
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "workflow.steps[0].view.renderer" && i.value === "renderer")).toBe(true);
  });

  // design.md's Risk section: this is the counterexample that rules out
  // "parse the whole body, then diff" as the detection mechanism. `assignment`
  // requires `strategy` (definition.ts), so a naive parse-then-diff approach
  // throws a ZodError on the missing field before it ever gets to report the
  // unknown key. checkUnknownKeys inspects each object's own keys
  // independently of whether the rest of the body is well-typed, so it must
  // still report `zzAssignment` here, as its own explicit assertion — not
  // folded into the shared planted-cases loop above — so a future regression
  // on this exact case fails loudly and by name.
  it("locates an unknown key even when the same object is also missing a required field", () => {
    const b = baseBody();
    b.workflow.steps[0].assignment = { zzAssignment: 1 }; // no `strategy`: also invalid on its own
    const err = rejects(b);
    expect(err).toBeInstanceOf(CompileValidationError);
    expect(err.issues.some((i) => i.value === "zzAssignment")).toBe(true);
  });

  describe("union-dispatch sites", () => {
    // FieldDef.type: BaseFieldType | Plugin is already covered by the "plugin"
    // planted case above. The three ViewField sites are lower risk (a boolean
    // value is never a plain object, so there is no object-vs-object
    // ambiguity to disambiguate) but still need their own coverage: no
    // existing test plants an unknown key inside an expression-shaped
    // visible/required/readonly value.
    it("catches an unknown key inside an expression-shaped ViewField.visible", () => {
      const b = baseBody();
      b.workflow.steps[0].view = {
        fields: [{ ref: "field_amount", visible: { ...cel("true"), zzVisible: 1 } }],
      };
      const err = rejects(b);
      expect(err.issues.some((i) => i.loc === "workflow.steps[0].view.fields[0].visible.zzVisible" && i.value === "zzVisible")).toBe(true);
    });

    // FieldDef.default: Expression | Literal needs its own disambiguation
    // rule (design.md's Decisions section): Literal recurses through
    // z.record(z.string(), literal), so it can ALSO be a plain object, and
    // the general primitive-vs-object rule cannot tell the two apart.
    it("catches an unknown key on the Expression-shaped branch of FieldDef.default", () => {
      const b = baseBody();
      b.fields[0].default = { ...cel("true"), zzDefault: 1 };
      const err = rejects(b);
      expect(err.issues.some((i) => i.loc === "fields[0].default.zzDefault" && i.value === "zzDefault")).toBe(true);
    });

    it("raises no unknown-key issue for an object-shaped, non-lang default (an opaque Literal)", () => {
      const b = baseBody();
      b.fields[0].default = { foo: "bar" }; // no `lang`: not Expression-shaped, so this is Literal data
      expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
    });
  });

  // A cheap regression guard on the walker's own correctness (design.md's
  // "keep canonicalize out of the detection path" decision), not the
  // detection mechanism itself: for a body the new walker reports zero
  // unknown-key issues on, and that also parses cleanly under processBody,
  // stripping must have changed nothing.
  it("a full Zod parse leaves a clean body's canonical form unchanged (consistency oracle)", () => {
    const b = baseBody();
    expect(() => compileProcessBody(structuredClone(b) as ProcessBody)).not.toThrow();
    const parsed = processBody.parse(b);
    expect(canonicalize(parsed)).toEqual(canonicalize(b));
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

describe("compile: step-level validation.pattern compiles at publish", () => {
  const withStepPattern = (pattern: string): any => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", validation: { pattern } }] };
    return b;
  };

  it("rejects an uncompilable step-level pattern", () => {
    const err = rejects(withStepPattern("("));
    expect(err.issues.some((i) => i.loc === "steps[0].view.fields[0].validation.pattern" && i.value === "(")).toBe(true);
  });

  it("a well-formed step-level pattern still publishes", () => {
    expect(() => compileProcessBody(withStepPattern("^[a-z]+$") as ProcessBody)).not.toThrow();
  });

  it("rejects a step-level pattern whose source exceeds the maximum length", () => {
    const huge = "a".repeat(5000);
    const err = rejects(withStepPattern(huge));
    expect(err.issues.some((i) => i.loc === "steps[0].view.fields[0].validation.pattern")).toBe(true);
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

  it("rejects an over-long field validation.rule", () => {
    const b = baseBody();
    b.fields[0].validation = { rule: cel("true == true && " + "a".repeat(MAX_EXPRESSION_LENGTH)) };
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "fields[0].validation.rule")).toBe(true);
  });

  it("rejects an over-long field default", () => {
    const b = baseBody();
    b.fields[0].default = cel("true == true && " + "a".repeat(MAX_EXPRESSION_LENGTH));
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "fields[0].default")).toBe(true);
  });

  it("rejects an over-long step-level validation.rule", () => {
    const b = baseBody();
    b.workflow.steps[0].view = {
      fields: [{ ref: "field_amount", validation: { rule: cel("true == true && " + "a".repeat(MAX_EXPRESSION_LENGTH)) } }],
    };
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "steps[0].view.fields[0].validation.rule")).toBe(true);
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

  it("an unwritten required+readonly pair parses on read", () => {
    const b: any = baseBody();
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", required: true, readonly: true }] };
    expect(processBody.safeParse(b).success).toBe(true);
  });
});

// table-shaped-data-sources: a structural check. `columnMapping`
// bounds live here, not as a Zod refinement. An unbypassable check is the
// reason; see `definition-contract`.
describe("compile: columnMapping bounds", () => {
  /** A body whose one select field binds a data source and maps `price` onto a number field. */
  const mappingBody = (over: Record<string, unknown> = {}): any => {
    const b = baseBody();
    b.dataSources = [{ id: "ds_products", key: "products", type: "db.list", config: { listKey: "products" } }];
    b.fields = [
      { id: "field_product", key: "product", label: { en: "Product" }, type: "select", dataSource: "ds_products", columnMapping: { price: "field_amount" }, ...over },
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" },
    ];
    return b;
  };

  it("accepts a select field mapping a column onto another catalog field", () => {
    expect(() => compileProcessBody(mappingBody() as ProcessBody)).not.toThrow();
  });

  it("rejects a mapping with no dataSource: inline options declare no columns", () => {
    const b = mappingBody({ dataSource: undefined, options: [{ value: "a", label: { en: "A" } }] });
    delete b.fields[0].dataSource;
    expect(rejects(b).issues.some((i) => i.message.includes("needs a dataSource"))).toBe(true);
  });

  it("rejects a mapping on a multiselect: several rows cannot fill one target", () => {
    expect(rejects(mappingBody({ type: "multiselect" })).issues.some((i) => i.message.includes("needs a select field"))).toBe(true);
  });

  it("rejects a key outside the slug grammar", () => {
    const b = mappingBody();
    b.fields[0].columnMapping = { "Unit Price": "field_amount" };
    expect(rejects(b).issues.some((i) => i.message.includes("columnMapping key must match"))).toBe(true);
  });

  it("rejects a target that resolves to no field in the body", () => {
    const b = mappingBody();
    b.fields[0].columnMapping = { price: "field_missing" };
    expect(rejects(b).issues.some((i) => i.message.includes("does not resolve to a field"))).toBe(true);
  });

  it("rejects a target that is the mapping field itself", () => {
    const b = mappingBody();
    b.fields[0].columnMapping = { price: "field_product" };
    expect(rejects(b).issues.some((i) => i.message.includes("the mapping field itself"))).toBe(true);
  });

  it("rejects a group target, which takes no value", () => {
    const b = mappingBody();
    b.fields[1] = { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "group", fields: [] };
    expect(rejects(b).issues.some((i) => i.message.includes("is a group field"))).toBe(true);
  });

  it("rejects two keys naming one target, which would leave the write no order", () => {
    const b = mappingBody();
    b.fields[0].columnMapping = { price: "field_amount", cost: "field_amount" };
    expect(rejects(b).issues.some((i) => i.message.includes("targets one field twice"))).toBe(true);
  });

  it("publishes a key naming no declared column: publishing reads no data list", () => {
    const b = mappingBody();
    b.fields[0].columnMapping = { nothing_declares_this: "field_amount" };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("accepts attributes on an inline option and on a static data source config", () => {
    const b = baseBody();
    b.dataSources = [
      { id: "ds_s", key: "s", type: "static", config: { options: [{ value: "a", label: { en: "A" }, attributes: { sku: "A-1" } }] } },
    ];
    b.fields = [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" },
      { id: "field_pick", key: "pick", label: { en: "Pick" }, type: "select", options: [{ value: "a", label: { en: "A" }, attributes: { n: 1 } }] },
    ];
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("rejects a non-scalar attribute value", () => {
    const b = baseBody();
    b.fields[0] = { id: "field_pick", key: "pick", label: { en: "Pick" }, type: "select", options: [{ value: "a", label: { en: "A" }, attributes: { bad: { nested: 1 } } }] };
    expect(() => compileProcessBody(b as ProcessBody)).toThrow();
  });

  it("adds neither key to a body that declares neither, so its definitionHash cannot move", () => {
    // The hash is JCS over the compiled body. A key the compile pass or the
    // read path introduced would change it, and every stored pin with it. The
    // two keys are optional, so a body written before they existed has to come
    // out of compile carrying neither.
    const compiled = compileProcessBody(baseBody() as ProcessBody);
    const serialized = JSON.stringify(compiled);
    expect(serialized).not.toContain("attributes");
    expect(serialized).not.toContain("columnMapping");
  });
});

// technical-field-marker: the seventh structural check. Neither rule is a Zod
// refinement. An unbypassable check is the reason; see `definition-contract`.
describe("compile: technical field marker", () => {
  it("rejects technical: true on a group field", () => {
    const b = baseBody();
    b.fields.push({ id: "field_g", key: "g", label: { en: "G" }, type: "group", technical: true, fields: [] });
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "fields.field_g.technical")).toBe(true);
  });

  it("rejects a group field nested at any depth", () => {
    const b = baseBody();
    b.fields.push({
      id: "field_outer",
      key: "outer",
      label: { en: "Outer" },
      type: "group",
      fields: [{ id: "field_inner", key: "inner", label: { en: "Inner" }, type: "group", technical: true, fields: [] }],
    });
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "fields.field_inner.technical")).toBe(true);
  });

  it("publishes a technical field of a non-group type", () => {
    const b = baseBody();
    b.fields[0].technical = true;
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  for (const [label, mutate] of [
    ["required: true", (vf: any) => (vf.required = true)],
    ["readonly: true", (vf: any) => (vf.readonly = true)],
    ["readonly: false", (vf: any) => (vf.readonly = false)],
    ["required as CEL", (vf: any) => (vf.required = cel("true"))],
    ["readonly as CEL", (vf: any) => (vf.readonly = cel("true"))],
  ] as const) {
    it(`rejects a technical field's view entry declaring ${label}`, () => {
      const b = baseBody();
      b.fields[0].technical = true;
      b.workflow.steps[0].view = { fields: [{ ref: "field_amount" }] };
      mutate(b.workflow.steps[0].view.fields[0]);
      const err = rejects(b);
      const suffix = label.startsWith("required") ? "required" : "readonly";
      expect(err.issues.some((i) => i.loc === `steps[0].view.fields[0].${suffix}`)).toBe(true);
    });
  }

  it("accepts a technical field's view entry declaring only a display-only key", () => {
    const b = baseBody();
    b.fields[0].technical = true;
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", span: 2 }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("technical: false gates nothing: publishes on a group field", () => {
    const b = baseBody();
    b.fields.push({ id: "field_g", key: "g", label: { en: "G" }, type: "group", technical: false, fields: [] });
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("technical: false gates nothing: publishes with required: true on the view entry", () => {
    const b = baseBody();
    b.fields[0].technical = false;
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", required: true }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("a malformed body with no fields array reaches the Zod error, not a TypeError", () => {
    const b = baseBody();
    delete b.fields;
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow(TypeError);
  });

  it("a malformed view.fields entry with no ref reaches the Zod error, not a TypeError", () => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [{ required: true }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow(TypeError);
  });
});

// reject-unsatisfiable-required-readonly: the eighth structural check. A view
// entry declaring literal required: true and literal readonly: true strands
// an instance unless some source in the body writes the field. See
// design.md's writer-set decisions for the reasoning behind each case below.
describe("compile: unsatisfiable required+readonly pair", () => {
  const unwrittenPair = (): any => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", required: true, readonly: true }] };
    return b;
  };

  it("rejects a required+readonly pair no source in the body writes", () => {
    const err = rejects(unwrittenPair());
    expect(err.issues.some((i) => i.loc === "steps[0].view.fields[0]" && i.value === "field_amount")).toBe(true);
  });

  it("publishes a pair an action output writes on another step", () => {
    const b = unwrittenPair();
    b.workflow.steps[1].onEntry = [{ id: "action_x", type: "t", config: {}, output: { field_amount: cel("result.x") } }];
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes a pair the entry's own step's onEntry output writes", () => {
    const b = unwrittenPair();
    b.workflow.steps[0].onEntry = [{ id: "action_x", type: "t", config: {}, output: { field_amount: cel("result.x") } }];
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("rejects a pair whose only writer is the entry's own step's onExit output", () => {
    const b = unwrittenPair();
    b.workflow.steps[0].onExit = [{ id: "action_x", type: "t", config: {}, output: { field_amount: cel("result.x") } }];
    const err = rejects(b);
    expect(err.issues.some((i) => i.value === "field_amount")).toBe(true);
  });

  it("rejects a pair whose only writer is the entry's own step's onPath output", () => {
    const b = unwrittenPair();
    b.workflow.steps[0].paths[0].onPath = [{ id: "action_x", type: "t", config: {}, output: { field_amount: cel("result.x") } }];
    const err = rejects(b);
    expect(err.issues.some((i) => i.value === "field_amount")).toBe(true);
  });

  it("rejects a pair whose only writer is the entry's own step's onCancel output", () => {
    const b = unwrittenPair();
    b.workflow.steps[0].onCancel = [{ id: "action_x", type: "t", config: {}, output: { field_amount: cel("result.x") } }];
    const err = rejects(b);
    expect(err.issues.some((i) => i.value === "field_amount")).toBe(true);
  });

  it("publishes a pair the entry's own step's targetPath timer onFire writes", () => {
    const b = unwrittenPair();
    b.workflow.steps[0].timers = [
      { id: "timer_x", duration: "PT1H", onFire: { targetPath: "path_ab", actions: [{ id: "action_x", type: "t", config: {}, output: { field_amount: cel("result.x") } }] } },
    ];
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes a pair the entry's own step's reminder timer onFire writes", () => {
    const b = unwrittenPair();
    b.workflow.steps[0].timers = [
      { id: "timer_x", duration: "PT1H", onFire: { actions: [{ id: "action_x", type: "t", config: {}, output: { field_amount: cel("result.x") } }] } },
    ];
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes a pair a subprocess outputMapping writes", () => {
    const b = unwrittenPair();
    b.workflow.steps.push({
      id: "step_c",
      key: "c",
      label: { en: "C" },
      type: "subprocess",
      subprocess: {
        processId: "proc_child",
        versionBinding: "pinned",
        pinnedVersion: 1,
        inputMapping: {},
        outputMapping: { field_amount: cel("result.x") },
      },
      paths: [{ id: "path_cb", key: "cb", to: "step_b", trigger: "automatic" }],
    });
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  const columnMappingPairBody = (): any => {
    const b = unwrittenPair();
    b.dataSources = [{ id: "ds_products", key: "products", type: "db.list", config: { listKey: "products" } }];
    b.fields.push({
      id: "field_picker",
      key: "picker",
      label: { en: "Picker" },
      type: "select",
      dataSource: "ds_products",
      columnMapping: { price: "field_amount" },
    });
    return b;
  };

  it("publishes a pair a columnMapping target writes when the mapping field is editable on another step", () => {
    const b = columnMappingPairBody();
    b.workflow.steps[1].view = { fields: [{ ref: "field_picker" }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("rejects a pair whose only writer is a columnMapping target placed editable only on the entry's own step", () => {
    const b = columnMappingPairBody();
    b.workflow.steps[0].view.fields.push({ ref: "field_picker" });
    const err = rejects(b);
    expect(err.issues.some((i) => i.value === "field_amount")).toBe(true);
  });

  it("publishes a pair a contract.inputFields entry writes", () => {
    const b = unwrittenPair();
    b.contract = { inputFields: ["field_amount"], outcomes: ["done"] };
    b.workflow.steps[1].outcome = "done";
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes a pair an editable view entry on another step writes", () => {
    const b = unwrittenPair();
    b.workflow.steps[1].view = { fields: [{ ref: "field_amount" }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes a pair whose field carries a literal catalog default", () => {
    const b = unwrittenPair();
    b.fields[0].default = 5;
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("rejects a pair whose only writer is a CEL catalog default", () => {
    const b = unwrittenPair();
    b.fields[0].default = cel("42");
    const err = rejects(b);
    expect(err.issues.some((i) => i.value === "field_amount")).toBe(true);
  });

  it("publishes a CEL readonly with literal required", () => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", required: true, readonly: cel("true") }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes a CEL required with literal readonly", () => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", required: cel("true"), readonly: true }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes an entry declaring visible: false", () => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", required: true, readonly: true, visible: false }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("rejects an unwritten pair whose entry carries visible as a CEL expression", () => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [{ ref: "field_amount", required: true, readonly: true, visible: cel("true") }] };
    const err = rejects(b);
    expect(err.issues.some((i) => i.value === "field_amount")).toBe(true);
  });

  const EXAMPLE_FILES = [
    "expense-approval.json",
    "subprocess-credit-check-child.json",
    "subprocess-loan-parent.json",
    "purchase-requisition.json",
  ];

  it("publishes each example definition unchanged", () => {
    for (const name of EXAMPLE_FILES) {
      const raw = JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8"));
      const body = (raw.definition ?? raw) as ProcessBody;
      expect(() => compileProcessBody(body)).not.toThrow();
    }
  });

  it("rejects an unwritten pair even on a body that already satisfies publishedProcessBody", () => {
    const compiled: any = compileProcessBody(baseBody() as ProcessBody);
    compiled.workflow.steps[0].view = { fields: [{ ref: "field_amount", required: true, readonly: true }] };
    expect(publishedProcessBody.safeParse(compiled).success).toBe(true);
    expect(() => compileProcessBody(compiled)).toThrow(CompileValidationError);
  });

  it("publishes an unwritten pair on an all-automatic step", () => {
    const b = unwrittenPair();
    b.workflow.steps[0].paths[0].trigger = "automatic";
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes an unwritten pair on a terminal step", () => {
    const b = baseBody();
    b.workflow.steps[1].view = { fields: [{ ref: "field_amount", required: true, readonly: true }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes an unwritten pair on an all-automatic step whose only exit is a targetPath timer", () => {
    const b = unwrittenPair();
    b.workflow.steps[0].paths[0].trigger = "automatic";
    b.workflow.steps[0].paths[0].guard = cel("false");
    b.workflow.steps[0].timers = [{ id: "timer_x", duration: "PT1H", onFire: { targetPath: "path_ab" } }];
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("publishes a group field's view entry declaring required and readonly with no writer", () => {
    const b = baseBody();
    b.fields.push({ id: "field_g", key: "g", label: { en: "G" }, type: "group", fields: [] });
    b.workflow.steps[0].view = { fields: [{ ref: "field_g", required: true, readonly: true }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow();
  });

  it("a technical field's view entry carrying required and readonly reports only the technical-field issue", () => {
    const b = unwrittenPair();
    b.fields[0].technical = true;
    const err = rejects(b);
    expect(err.issues.some((i) => i.loc === "steps[0].view.fields[0].required")).toBe(true);
    expect(err.issues.some((i) => i.loc === "steps[0].view.fields[0].readonly")).toBe(true);
    expect(err.issues.some((i) => i.loc === "steps[0].view.fields[0]")).toBe(false);
  });

  it("a view entry with required and readonly but no ref reports no pair issue and does not throw a TypeError", () => {
    const b = baseBody();
    b.workflow.steps[0].view = { fields: [{ required: true, readonly: true }] };
    expect(() => compileProcessBody(b as ProcessBody)).not.toThrow(TypeError);
  });
});
