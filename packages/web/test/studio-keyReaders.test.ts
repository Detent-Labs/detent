import { describe, expect, it } from "bun:test";
import type { FieldId } from "workflow-engine/schema";
import { countKeyReaders, keyReaderSites, readKeys, rewriteFieldRead, rewriteKeyReaders } from "../src/areas/studio/draft/key-readers";
import type { Draft } from "../src/areas/studio/draft/types";

// The expressions that read `data.<key>`, anywhere in the draft. One
// expression counts once. Nothing is skipped: the field's own rule counts, and
// so does a `process.start` mapping value inside a plugin `config`. Each case
// builds only the parts of a draft it reads.

const cel = (src: string) => ({ lang: "cel" as const, src });

const draftOf = (body: Record<string, unknown>): Draft => body as unknown as Draft;

const step = (stepId: string, parts: Record<string, unknown> = {}) => ({
  id: stepId,
  key: stepId,
  label: { en: stepId },
  type: "task",
  ...parts,
});

const stepsOf = (...steps: ReturnType<typeof step>[]) => ({ workflow: { initialStep: steps[0]?.id, steps } });

const guarded = (pathId: string, src: string) => ({ id: pathId, key: pathId, label: pathId, to: "step_a", trigger: "automatic", guard: cel(src) });

const amount = (extra: Record<string, unknown> = {}) => ({ id: "fld_amount" as FieldId, key: "amount", label: { en: "Amount" }, type: "number", ...extra });

describe("countKeyReaders", () => {
  it("counts a path guard that reads the key", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount > 1000.0")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts a visible flag on a view entry", () => {
    const draft = draftOf({
      fields: [amount()],
      ...stepsOf(step("step_a", { view: { fields: [{ ref: "fld_amount", visible: cel("data.amount > 0.0") }] } })),
    });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts the field's own validation rule", () => {
    const draft = draftOf({ fields: [amount({ validation: { rule: cel("data.amount > 0.0") } })] });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts a process.start mapping value inside an action config", () => {
    const action = { id: "act_start", type: "process.start", config: { inputMapping: { fld_child: cel("data.amount") } } };
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { onEntry: [action] })) });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts one expression once, however often it reads the key", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount > 1.0 && data.amount < 9.0")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts each expression that reads the key", () => {
    const draft = draftOf({
      fields: [amount({ validation: { rule: cel("data.amount > 0.0") } })],
      ...stepsOf(
        step("step_a", {
          paths: [guarded("path_a", "data.amount > 1000.0")],
          view: { fields: [{ ref: "fld_amount", visible: cel("data.amount > 0.0") }] },
        }),
      ),
    });

    expect(countKeyReaders(draft, "amount")).toBe(3);
  });

  it("does not count a string literal that holds the path", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.name == 'data.amount'")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(0);
  });

  it("does not count an expression that reads another key with the same prefix", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount_total > 1.0")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(0);
  });

  it("counts source that fails to parse by its text", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount >")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("does not count bad source that lacks the path", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.other >")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(0);
  });

  it("answers 0 for the empty key", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount > 1.0")] })) });

    expect(countKeyReaders(draft, "")).toBe(0);
  });

  it("answers 0 for a draft with no expressions", () => {
    expect(countKeyReaders(draftOf({ fields: [amount()] }), "amount")).toBe(0);
  });
});

// `studio-condition-builder`: "A field rename rewrites CEL source through the
// parsed tree", "A field rename leaves what is not a field read" and "Source
// that does not parse changes by text". One test per scenario.
describe("rewriteFieldRead", () => {
  it("moves a comparison onto the new key", () => {
    expect(rewriteFieldRead('data.amount > 1000.0 && data.status == "open"', "amount", "total")).toBe(
      'data.total > 1000.0 && data.status == "open"',
    );
  });

  it("keeps the rest of the text as written", () => {
    expect(rewriteFieldRead("( data . amount  >  5.0 )", "amount", "total")).toBe("( data . total  >  5.0 )");
  });

  it("changes a read inside a macro or a call", () => {
    expect(rewriteFieldRead("has(data.amount) && size(data.amount) > 0", "amount", "total")).toBe(
      "has(data.total) && size(data.total) > 0",
    );
  });

  it("leaves a string literal, an index read and a child read", () => {
    const src = '"data.amount" == data.note && data["amount"] > 1.0 && child.data.amount > 1.0';
    expect(rewriteFieldRead(src, "amount", "total")).toBe(src);
  });

  it("leaves a longer key that shares the start", () => {
    expect(rewriteFieldRead("data.amount_2 > 1.0", "amount", "total")).toBe("data.amount_2 > 1.0");
  });

  it("changes source that does not parse by text", () => {
    expect(rewriteFieldRead("data.amount >", "amount", "total")).toBe("data.total >");
  });

  it("changes every text match in source that does not parse, and no child read", () => {
    expect(rewriteFieldRead("data.amount > child.data.amount && data.amount <", "amount", "total")).toBe(
      "data.total > child.data.amount && data.total <",
    );
  });

  it("changes a read inside a comprehension, a map value and a receiver call", () => {
    expect(rewriteFieldRead('data.items.exists(x, x > data.amount) && {"a": data.amount}.a > 0.0 && data.amount.size() > 0', "amount", "total")).toBe(
      'data.items.exists(x, x > data.total) && {"a": data.total}.a > 0.0 && data.total.size() > 0',
    );
  });

  it("changes a key into a longer and a shorter one alike", () => {
    expect(rewriteFieldRead("data.a > 1.0 && data.a < 9.0", "a", "amount_total")).toBe("data.amount_total > 1.0 && data.amount_total < 9.0");
    expect(rewriteFieldRead("data.amount_total > 1.0 && data.amount_total < 9.0", "amount_total", "a")).toBe("data.a > 1.0 && data.a < 9.0");
  });
});

describe("keyReaderSites", () => {
  it("answers each reading expression with its JSON path from the draft root", () => {
    const draft = draftOf({
      fields: [amount({ validation: { rule: cel("data.amount > 0.0") } })],
      ...stepsOf(step("step_a", { paths: [guarded("path_x", "data.other > 1.0"), guarded("path_a", "data.amount > 1000.0")] })),
    });

    expect(keyReaderSites(draft, "amount")).toEqual([
      { path: ["fields", 0, "validation", "rule"], src: "data.amount > 0.0" },
      { path: ["workflow", "steps", 0, "paths", 1, "guard"], src: "data.amount > 1000.0" },
    ]);
  });

  it("answers no site for the empty key", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount > 1.0")] })) });

    expect(keyReaderSites(draft, "")).toEqual([]);
  });
});

describe("rewriteKeyReaders", () => {
  const everyReader = () => {
    const action = { id: "act_start", type: "process.start", config: { inputMapping: { fld_child: cel("data.amount") } } };
    return draftOf({
      fields: [amount({ validation: { rule: cel("data.amount > 0.0") } })],
      ...stepsOf(
        step("step_a", {
          paths: [guarded("path_a", "data.amount > 1000.0")],
          view: { fields: [{ ref: "fld_amount", visible: cel("data.amount > 0.0") }] },
          onEntry: [action],
        }),
      ),
    });
  };

  it("reaches a guard, a view flag, a field rule and a mapping value", () => {
    const draft = everyReader();

    expect(rewriteKeyReaders(draft, "fld_amount", "amount", "total")).toBe(4);

    const body = draft as unknown as {
      fields: { validation: { rule: { src: string } } }[];
      workflow: { steps: { paths: { guard: { src: string } }[]; view: { fields: { visible: { src: string } }[] }; onEntry: { config: { inputMapping: { fld_child: { src: string } } } }[] }[] };
    };
    const [stepA] = body.workflow.steps;
    expect(stepA!.paths[0]!.guard.src).toBe("data.total > 1000.0");
    expect(stepA!.view.fields[0]!.visible.src).toBe("data.total > 0.0");
    expect(body.fields[0]!.validation.rule.src).toBe("data.total > 0.0");
    expect(stepA!.onEntry[0]!.config.inputMapping.fld_child.src).toBe("data.total");
    expect(countKeyReaders(draft, "amount")).toBe(0);
    expect(countKeyReaders(draft, "total")).toBe(4);
  });

  // `studio-app`: "A shared old key keeps its readers".
  it("writes nothing and answers 0 while another field carries the old key", () => {
    const draft = everyReader();
    (draft as unknown as { fields: unknown[] }).fields.push({ id: "fld_twin", key: "amount", label: { en: "Twin" }, type: "number" });
    const before = JSON.stringify(draft);

    expect(rewriteKeyReaders(draft, "fld_amount", "amount", "total")).toBe(0);
    expect(JSON.stringify(draft)).toBe(before);
  });

  it("finds another field carrying the old key inside a group", () => {
    const draft = everyReader();
    (draft as unknown as { fields: unknown[] }).fields.push({
      id: "fld_group",
      key: "details",
      label: { en: "Details" },
      type: "group",
      fields: [{ id: "fld_twin", key: "amount", label: { en: "Twin" }, type: "number" }],
    });

    expect(rewriteKeyReaders(draft, "fld_amount", "amount", "total")).toBe(0);
  });

  it("ignores the moving field itself, before or after its key moves", () => {
    const draft = everyReader();
    (draft as unknown as { fields: { key: string }[] }).fields[0]!.key = "total";

    expect(rewriteKeyReaders(draft, "fld_amount", "amount", "total")).toBe(4);
  });

  it("writes nothing for an empty old key", () => {
    const draft = everyReader();
    const before = JSON.stringify(draft);

    expect(rewriteKeyReaders(draft, "fld_amount", "", "total")).toBe(0);
    expect(JSON.stringify(draft)).toBe(before);
  });
});

describe("readKeys", () => {
  it("answers every name read as data.<name>, by the tree and by text", () => {
    const draft = draftOf({
      fields: [amount({ validation: { rule: cel("data.amount > 0.0") } })],
      ...stepsOf(
        step("step_a", {
          paths: [guarded("path_a", 'data.status == "open" && "data.quoted" == data.note'), guarded("path_b", "data.broken >")],
          view: { fields: [{ ref: "fld_amount", visible: cel("child.data.inner > 1.0 && data.flag") }] },
        }),
      ),
    });

    expect([...readKeys(draft)].sort()).toEqual(["amount", "broken", "flag", "note", "status"]);
  });

  it("answers the empty set for a draft with no expressions", () => {
    expect(readKeys(draftOf({ fields: [amount()] })).size).toBe(0);
  });
});
