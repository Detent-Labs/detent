import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { draftFields, type DraftField } from "../src/areas/studio/draft/fields.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { DraftContext, type DraftContextValue, type Mutate } from "../src/areas/studio/draft/store.js";
import {
  commitKeyInput,
  FieldCatalogPanel,
  MoveFieldControl,
  writeLabelFromCatalog,
} from "../src/areas/studio/panels/FieldCatalogPanel.js";
import {
  ADD_FIRST_FIELD_ID,
  fieldKeyNoticeId,
  fieldLabelInputId,
  isFieldKeyLocked,
  keyInputStep,
  keyNoticeFor,
  keyRefusalFor,
  type KeyCommitProblem,
  type KeyInputEvent,
  labelChangePatch,
  moveControlId,
  removeControlId,
  rewriteLineFor,
} from "../src/areas/studio/panels/fieldCatalogLogic.js";
import { PublishedFieldIdsContext } from "../src/areas/studio/draft/publishedFields.js";

const NOOP = () => {};

/** Each `<button>` element whole, from its opening tag to its own
 * `</button>`. No button holds another, so the first close is its own. */
function buttonElements(html: string): string[] {
  return html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

const fld = (id: string, key: string, extra: object = {}): DraftField =>
  ({ id, key, label: { en: key }, type: "string", ...extra }) as unknown as DraftField;

const grp = (id: string, key: string, children: DraftField[]): DraftField =>
  ({ id, key, label: { en: key }, type: "group", fields: children }) as unknown as DraftField;

/**
 * `MoveFieldControl`'s own value/disabled wiring (final-review Minor 2): the
 * deleted per-row rail picker pinned these three states, and
 * `studio-fieldCatalogLogic.test.ts::moveTargetsFor` covers only the data
 * behind the control, not the rendered `<select>` itself.
 */
describe("MoveFieldControl", () => {
  it("selects a nested field's current group", () => {
    const fields = [grp("field_g", "g", [fld("field_a", "a")])];
    const html = renderToStaticMarkup(
      <MoveFieldControl fieldId="field_a" fields={fields} contentLocale="en" baseLocale="en" onMoveField={NOOP} />,
    );
    expect(html).toContain('value="field_g" selected=""');
  });

  it("selects the top level for a top-level field", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", [])];
    const html = renderToStaticMarkup(
      <MoveFieldControl fieldId="field_a" fields={fields} contentLocale="en" baseLocale="en" onMoveField={NOOP} />,
    );
    expect(html).toContain('value="" selected=""');
  });

  it("disables the control in a catalog with no group", () => {
    const fields = [fld("field_a", "a")];
    const html = renderToStaticMarkup(
      <MoveFieldControl fieldId="field_a" fields={fields} contentLocale="en" baseLocale="en" onMoveField={NOOP} />,
    );
    expect(html).toContain('disabled=""');
  });
});

function validation(issues: EditorIssue[] = []): ValidationResult {
  return {
    zodValid: true,
    issues,
    dimensions: {
      zod: "ran",
      duration: "ran",
      structural: "ran",
      actionType: "ran",
      assignmentType: "ran",
      dataSourceType: "ran",
      registryConfig: "not-run",
      cel: "ran",
    },
    subprocessStepStatus: {},
    chainingSiteStatus: {},
  };
}

function contextValue(draft: Draft, issues: EditorIssue[] = []): DraftContextValue {
  return {
    draft,
    mutate: () => {},
    replace: () => {},
    validation: validation(issues),
    loadedChildren: {},
    setChildForStep: () => {},
    registry: undefined,
    loadedChainingTargets: {},
    contentLocale: "en",
    setContentLocale: () => {},
    usedLocales: ["en"],
    loadGeneration: 0,
  };
}

/**
 * `FieldEditor` draws the selected field's own two halves at any nesting
 * depth, a nested field the same way as a top-level one (`studio-app`: "A
 * nested field takes the same two halves"). Only a selected `group` field's
 * own editor adds the "Fields inside this group" zone (`studio-app`: "Only a
 * group field holds the sixth zone"); a group's child renders in its own
 * instance of this same component, with its own move control, never inside
 * its parent's. `FieldCatalogPanel` reads `useDraft()` directly, so each test
 * below supplies `DraftContext.Provider`, the way `studio-formsTab.test.tsx`
 * already does.
 */
describe("FieldCatalogPanel", () => {
  it("renders a nested field's own move control, Technical checkbox and effect-half zones", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [grp("field_g", "g", [fld("field_c", "c")])] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_c"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).toContain(`id="${moveControlId("field_c")}"`);
    expect(html).toContain(`id="${fieldLabelInputId("field_c")}"`);

    // Narrowed to the Technical checkbox's own <label>...</label>, since the
    // "Ask for this" checkbox elsewhere in the same markup is legitimately
    // disabled for a field no step view references.
    const technicalAt = html.indexOf("Technical");
    expect(technicalAt).toBeGreaterThan(-1);
    const technicalLabel = html.slice(html.lastIndexOf("<label", technicalAt), html.indexOf("</label>", technicalAt));
    expect(technicalLabel).toContain('type="checkbox"');
    expect(technicalLabel).not.toContain('disabled=""');

    expect(html).toContain("Default value");
    expect(html).toContain("How it will look");
    expect(html).toContain("Used in");
  });

  it("renders a selected group's own zone, with no move control for its child", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [grp("field_g", "g", [fld("field_c", "c")])] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_g"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).toContain("Fields inside this group");
    expect(html).toContain("+ Add field to this group");
    expect(html).not.toContain(`id="${moveControlId("field_c")}"`);

    // The zone stands directly after "Validation": the next zone heading after
    // "Validation" is its own, and the group's preview follows it.
    const validationAt = html.indexOf(">Validation<");
    const zoneAt = html.indexOf(">Fields inside this group<");
    expect(validationAt).toBeGreaterThan(-1);
    expect(html.indexOf("<h4", validationAt)).toBe(html.lastIndexOf("<h4", zoneAt));
    expect(zoneAt).toBeLessThan(html.indexOf(">How it will look<"));
  });

  it("renders no group zone for a selected top-level field", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [fld("field_a", "a")] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_a"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).not.toContain("Fields inside this group");
    expect(html).toContain(`id="${fieldLabelInputId("field_a")}"`);
  });

  // `FieldsTab` points the removal dialog's trigger ref at Remove field by
  // this id, so a declined removal hands focus back to that control.
  it("puts the field's own remove id on Remove field", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [grp("field_g", "g", [fld("field_c", "c")])] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_c"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    const remove = buttonElements(html).find((b) => b.includes(`id="${removeControlId("field_c")}"`));
    expect(remove).toBeDefined();
    expect(remove).toEndWith(">Remove field</button>");
  });

  // A removal that leaves the entity rail with no entry hands focus to this
  // control, by this id (`fieldCatalogLogic.ts::focusAfterRemove`).
  it("puts the stable first-field id on the start state's Add the first field", () => {
    const draft: Draft = { baseLocale: "en", fields: [] as unknown as Draft["fields"] };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId={undefined}
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    const addFirst = buttonElements(html).find((b) => b.includes(`id="${ADD_FIRST_FIELD_ID}"`));
    expect(addFirst).toBeDefined();
    expect(addFirst).toEndWith(">Add the first field</button>");
  });

  // A kind switch rewrote `resolution` out of `group` and left its `fields` in
  // place. Only a group's editor holds the zone, so the child's rail entry is
  // its one route in. The panel finds that child through `flattenDraftFields`,
  // whatever its parent's `type`.
  it("renders the own editor of a field whose parent is no group", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [{ ...fld("field_r", "resolution"), fields: [fld("field_c", "discrepancy_note")] }] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_c"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).toContain(`id="${moveControlId("field_c")}"`);
    expect(html).toContain(`id="${fieldLabelInputId("field_c")}"`);
  });

  // `FieldsTab` passes `undefined` while no field carries an id, since the rail
  // lists no entry for an id-less field. Without the lookup's guard, the
  // id-less field would match that `undefined` and open an editor whose every
  // write `updateField` drops.
  it("renders the start state for a catalog whose only field carries no id", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [{ key: "unsaved", type: "string" }] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId={undefined}
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).toContain("This process collects nothing yet");
    expect(html).not.toContain("studio-field-label-");
  });

  // `studio-app`: "A group's child row keeps its own list". The key check on a
  // nested field stands in that field's own "What this field asks" zone, whose
  // heading carries `data-checked`, and the group's editor carries none.
  it("stands a nested field's check in its own zone, and none in its group's editor", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [grp("field_g", "g", [fld("field_c", "c")])] as unknown as Draft["fields"],
    };
    const issues: EditorIssue[] = [
      { entityType: "field", entityId: "field_c", loc: "fields[0].fields[0].key", source: "structural", message: "x" },
    ];
    const render = (selectedId: string) =>
      renderToStaticMarkup(
        <DraftContext.Provider value={contextValue(draft, issues)}>
          <FieldCatalogPanel
            token="test-token"
            selectedId={selectedId}
            onAdd={NOOP}
            onRemove={NOOP}
            onShowStep={NOOP}
            onOpenForm={NOOP}
            onMoveField={NOOP}
          />
        </DraftContext.Provider>,
      );

    const child = render("field_c");
    expect(child.split('data-checked="failed"').length - 1).toBe(1);
    expect(child).toMatch(/data-checked="failed"[^>]*>What this field asks</);

    expect(render("field_g")).not.toContain("data-checked");
  });
});

/**
 * `studio-condition-builder`: "The Fields tab's divergent state says the steps
 * disagree". The steps that ask a field hold different `visible` overrides, so
 * the condition input reads no single source, yet "this always matches" would
 * be false for those steps.
 */
describe("the Fields tab's \"Only ask this when\" row", () => {
  const stepsWith = (a: unknown, b: unknown): Draft =>
    ({
      baseLocale: "en",
      fields: [fld("field_a", "a")],
      workflow: {
        initialStep: "step_a",
        steps: [
          { id: "step_a", key: "sa", label: { en: "A" }, type: "task", view: { fields: [{ ref: "field_a", visible: a }] } },
          { id: "step_b", key: "sb", label: { en: "B" }, type: "task", view: { fields: [{ ref: "field_a", visible: b }] } },
        ],
      },
    }) as unknown as Draft;
  const render = (draft: Draft) =>
    renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_a"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );
  const DIVERGENT = "The steps hold different conditions. Build one here to set it on every step.";

  it("says the steps hold different conditions, and not that it always matches", () => {
    const html = render(stepsWith({ lang: "cel", src: "data.a == \"x\"" }, { lang: "cel", src: "data.a == \"y\"" }));

    expect(html).toContain("These steps currently disagree");
    expect(html).toContain(DIVERGENT);
    expect(html).not.toContain("this always matches");
  });

  it("says the same when one step holds a literal beside an expression", () => {
    const html = render(stepsWith(false, { lang: "cel", src: "data.a == \"x\"" }));

    expect(html).toContain(DIVERGENT);
    expect(html).not.toContain("this always matches");
  });

  it("keeps the empty sentence where every step holds no condition", () => {
    const html = render(stepsWith(undefined, undefined));

    expect(html).toContain("No condition yet: this always matches.");
    expect(html).not.toContain(DIVERGENT);
  });
});

/** A `Mutate` that runs each recipe on the draft in place and counts the
 * calls, the way the store's reducer runs it on its own copy. */
function applyingMutate(draft: Draft): { mutate: Mutate; calls: () => number } {
  let calls = 0;
  return {
    mutate: (recipe) => {
      calls += 1;
      recipe(draft);
    },
    calls: () => calls,
  };
}

const cel = (src: string) => ({ lang: "cel" as const, src });

type Guard = { lang: "cel"; src: string };

/** A draft holding `fields`, and one step whose one way out carries `guard`
 * and whose view holds `view`. */
const stepDraft = (fields: DraftField[], guard?: string, view: unknown[] = []): Draft =>
  ({
    baseLocale: "en",
    fields,
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: view },
          paths: [{ id: "path_a", key: "p", label: "P", to: "step_a", trigger: "automatic", ...(guard ? { guard: cel(guard) } : {}) }],
        },
      ],
    },
  }) as unknown as Draft;

const fieldOf = (draft: Draft, id: string): DraftField => draftFields(draft).find((f) => f.id === id)!;
const guardOf = (draft: Draft): string =>
  ((draft.workflow as unknown as { steps: { paths: { guard: Guard }[] }[] }).steps[0]!.paths[0]!.guard).src;
const viewEntries = (draft: Draft) =>
  (draft.workflow as unknown as { steps: { view: { fields: { group?: string; visible?: Guard }[] } }[] }).steps[0]!.view.fields;

const source = readFileSync(new URL("../src/areas/studio/panels/FieldCatalogPanel.tsx", import.meta.url).pathname, "utf8");

/**
 * What `FieldEditor::updateLabel` writes for a label change. It calls
 * `writeLabelFromCatalog`, which writes through the form editor's
 * `writeFieldLabel` and counts the rewrites first. The panel renders to static
 * markup in this suite, which fires no change event, so these cases call
 * `writeLabelFromCatalog` with a `Mutate` that applies its recipe.
 */
describe("a label change in the field catalog", () => {
  const amountLabel = { en: "Amount" };
  const totalLabel = { en: "Total amount" };
  const amount = () => fld("field_amount", "amount", { label: amountLabel });

  it("routes the label control through writeLabelFromCatalog", () => {
    const update = source.slice(source.indexOf("const updateLabel = "), source.indexOf("const keyNotice ="));

    expect(update).toContain("writeLabelFromCatalog(draft, mutate, field, label, baseLocale, published)");
    expect(update).toContain("setDefinitionWrites((n) => n + 1)");
    expect(update).not.toContain("onChange(");
  });

  it("lets a key that a guard reads follow the label, and rewrites the guard in the same write", () => {
    const draft = stepDraft([amount()], "data.amount > 1000.0");
    const { mutate, calls } = applyingMutate(draft);

    expect(writeLabelFromCatalog(draft, mutate, fieldOf(draft, "field_amount"), totalLabel, "en", new Set())).toBe(1);
    expect(calls()).toBe(1);
    expect(fieldOf(draft, "field_amount").key).toBe("total_amount");
    expect(guardOf(draft)).toBe("data.total_amount > 1000.0");
  });

  it("answers no rewrite for a field nothing reads", () => {
    const draft = stepDraft([amount()]);
    const { mutate } = applyingMutate(draft);

    expect(writeLabelFromCatalog(draft, mutate, fieldOf(draft, "field_amount"), totalLabel, "en", new Set())).toBe(0);
    expect(fieldOf(draft, "field_amount").key).toBe("total_amount");
  });

  it("leaves a published field's key and its guard, and answers no rewrite", () => {
    const draft = stepDraft([amount()], "data.amount > 1000.0");
    const { mutate } = applyingMutate(draft);

    expect(writeLabelFromCatalog(draft, mutate, fieldOf(draft, "field_amount"), totalLabel, "en", new Set(["field_amount"]))).toBe(0);
    expect(fieldOf(draft, "field_amount").key).toBe("amount");
    expect(fieldOf(draft, "field_amount").label).toEqual(totalLabel);
    expect(guardOf(draft)).toBe("data.amount > 1000.0");
  });

  it("leaves the key while the base version has not loaded", () => {
    const draft = { baseLocale: "en", fields: [amount()] } as unknown as Draft;
    const patch = labelChangePatch(draft, fieldOf(draft, "field_amount"), totalLabel, "en", undefined);

    expect(patch).toEqual({ label: totalLabel });
  });

  it("follows the label for an unread field the base version lacks", () => {
    const draft = { baseLocale: "en", fields: [amount()] } as unknown as Draft;
    const patch = labelChangePatch(draft, fieldOf(draft, "field_amount"), totalLabel, "en", new Set(["field_other"]));

    expect(patch).toEqual({ label: totalLabel, key: "total_amount" });
  });

  it("derives a key for an empty-key field even when its id is published", () => {
    const draft = { baseLocale: "en", fields: [fld("field_new", "", { label: undefined })] } as unknown as Draft;
    const patch = labelChangePatch(draft, fieldOf(draft, "field_new"), totalLabel, "en", new Set(["field_new"]));

    expect(patch).toEqual({ label: totalLabel, key: "total_amount" });
  });

  it("does not count a field with no id as published", () => {
    const field = { key: "amount", label: amountLabel, type: "string" } as unknown as DraftField;

    expect(isFieldKeyLocked(field, undefined)).toBe(false);
  });

  it("keeps a group field following its label, rewrites its view entries, and answers no rewrite", () => {
    const draft = stepDraft([grp("field_request", "request", [fld("field_child", "child")])], undefined, [
      { ref: "field_request" },
      { ref: "field_child", group: "request" },
    ]);
    (fieldOf(draft, "field_request") as { label: unknown }).label = { en: "Request" };
    const { mutate } = applyingMutate(draft);

    expect(writeLabelFromCatalog(draft, mutate, fieldOf(draft, "field_request"), { en: "Order request" }, "en", new Set(["field_request"]))).toBe(0);
    expect(fieldOf(draft, "field_request").key).toBe("order_request");
    expect(viewEntries(draft)[1]!.group).toBe("order_request");
  });
});

/**
 * `commitKeyInput`, the commit `FieldKeyInput` runs on blur and on Enter. Each
 * case drives it with a `Mutate` that applies its recipe, so a refusal shows
 * as a draft the commit left alone.
 */
describe("a key commit in the field catalog", () => {
  const amount = () => fld("field_amount", "amount", { label: { en: "Amount" } });

  it("writes the typed key, and the guard and form condition that read the old one", () => {
    const draft = stepDraft([amount()], "data.amount > 1000.0", [{ ref: "field_amount", visible: cel("data.amount > 0.0") }]);
    const { mutate } = applyingMutate(draft);
    const result = commitKeyInput(draft, mutate, fieldOf(draft, "field_amount"), "total");

    expect(result).toEqual({ typed: undefined, wrote: true, rewrote: 2 });
    expect(fieldOf(draft, "field_amount").key).toBe("total");
    expect(guardOf(draft)).toBe("data.total > 1000.0");
    expect(viewEntries(draft)[0]!.visible!.src).toBe("data.total > 0.0");
    expect(rewriteLineFor(result.rewrote)).toBe("Updated 2 conditions.");
  });

  it("writes a published field's key and rewrites its readers", () => {
    const draft = stepDraft([amount()], "data.amount > 1000.0");
    const { mutate } = applyingMutate(draft);

    expect(commitKeyInput(draft, mutate, fieldOf(draft, "field_amount"), "total").rewrote).toBe(1);
    expect(guardOf(draft)).toBe("data.total > 1000.0");
  });

  it("writes nothing for a commit with no typed text, or the field's own key", () => {
    const draft = stepDraft([amount()]);
    const { mutate, calls } = applyingMutate(draft);

    expect(commitKeyInput(draft, mutate, fieldOf(draft, "field_amount"), undefined)).toEqual({ typed: undefined, wrote: false, rewrote: 0 });
    expect(commitKeyInput(draft, mutate, fieldOf(draft, "field_amount"), "amount")).toEqual({ typed: undefined, wrote: false, rewrote: 0 });
    expect(calls()).toBe(0);
  });

  const refused: [string, string, string][] = [
    ["true", "literal", "Conditions read this word as a value. Pick another key."],
    ["Total Amount", "grammar", "A key starts with a letter or _ and holds only lower-case letters, digits and _."],
    ["status", "taken", "Another field already uses this key."],
    ["", "empty", "Type a key, or press Escape to keep the current one."],
  ];
  for (const [typed, problem, sentence] of refused) {
    it(`refuses ${JSON.stringify(typed)}, keeps the typed text and leaves the draft as it was`, () => {
      const draft = stepDraft([amount(), fld("field_status", "status")], "data.amount > 1000.0");
      const before = structuredClone(draft);
      const { mutate, calls } = applyingMutate(draft);
      const result = commitKeyInput(draft, mutate, fieldOf(draft, "field_amount"), typed);

      expect(result).toEqual({ typed, problem: problem as KeyCommitProblem, wrote: false, rewrote: 0 });
      expect(calls()).toBe(0);
      expect(draft).toEqual(before);
      expect(keyRefusalFor(result.problem!)).toBe(sentence);
    });
  }

  it("commits a group's empty key, which no refusal stops", () => {
    const draft = stepDraft([grp("field_request", "request", [])]);
    const { mutate } = applyingMutate(draft);

    expect(commitKeyInput(draft, mutate, fieldOf(draft, "field_request"), "")).toEqual({ typed: undefined, wrote: true, rewrote: 0 });
    expect(fieldOf(draft, "field_request").key).toBe("");
  });

  it("rewrites nothing while another field shares the old key", () => {
    const draft = stepDraft([amount(), fld("field_twin", "amount")], "data.amount > 1000.0");
    const { mutate } = applyingMutate(draft);

    expect(commitKeyInput(draft, mutate, fieldOf(draft, "field_amount"), "total")).toEqual({ typed: undefined, wrote: true, rewrote: 0 });
    expect(guardOf(draft)).toBe("data.amount > 1000.0");
  });

  it("counts only the rewritten readers of a commit onto a key only an expression reads", () => {
    const draft = stepDraft([fld("field_sum", "sum")], "data.amount > 1000.0", [{ ref: "field_sum", visible: cel("data.sum > 0.0") }]);
    const { mutate } = applyingMutate(draft);

    expect(commitKeyInput(draft, mutate, fieldOf(draft, "field_sum"), "amount").rewrote).toBe(1);
    expect(viewEntries(draft)[0]!.visible!.src).toBe("data.amount > 0.0");
  });
});

describe("rewriteLineFor", () => {
  it("reads the singular for one rewrite and the plural above one", () => {
    expect(rewriteLineFor(1)).toBe("Updated 1 condition.");
    expect(rewriteLineFor(3)).toBe("Updated 3 conditions.");
  });

  it("reads nothing before a write rewrote an expression", () => {
    expect(rewriteLineFor(undefined)).toBe("");
    expect(rewriteLineFor(0)).toBe("");
  });

  it("keeps the line when a write rewrote nothing", () => {
    const keep = source.slice(source.indexOf("const noteRewrites = "), source.indexOf("};", source.indexOf("const noteRewrites = ")));
    expect(keep).toContain("if (rewrote > 0) setRewritten(rewrote);");
  });
});

const readAmount = (src: string) => ({ lang: "cel", src });

/** A draft whose `amount` field is read by `readers` CEL expressions. */
function draftWithReaders(readers: string[], key = "amount", label = "amount"): Draft {
  return {
    baseLocale: "en",
    fields: [fld("field_amount", key, { label: { en: label } })],
    workflow: { guards: readers.map(readAmount) },
  } as unknown as Draft;
}

function renderKeyEditor(
  draft: Draft,
  selectedId: string,
  published: ReadonlySet<string> | undefined,
  issues: EditorIssue[] = [],
): string {
  return renderToStaticMarkup(
    <PublishedFieldIdsContext.Provider value={published}>
      <DraftContext.Provider value={contextValue(draft, issues)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId={selectedId}
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>
    </PublishedFieldIdsContext.Provider>,
  );
}

/** The `<input>` element that carries the field's key, whole. */
function keyInput(html: string): string {
  const labelAt = html.indexOf(">Key<");
  expect(labelAt).toBeGreaterThan(-1);
  const inputAt = html.indexOf("<input", labelAt);
  return html.slice(inputAt, html.indexOf(">", inputAt) + 1);
}

/** The opening tag of the `<details>` that holds the key input. */
function keyDetails(html: string): string {
  const detailsAt = html.lastIndexOf("<details", html.indexOf(">Key<"));
  return html.slice(detailsAt, html.indexOf(">", detailsAt) + 1);
}

/** Feeds a key input the events of one gesture and collects what it would write. */
function runKeyInput(currentKey: string, events: KeyInputEvent[]): { writes: (string | undefined)[]; shown: string } {
  let typed: string | undefined;
  const writes: (string | undefined)[] = [];
  for (const event of events) {
    const step = keyInputStep(typed, event, currentKey);
    typed = step.typed;
    writes.push(step.write);
  }
  return { writes, shown: typed ?? currentKey };
}

describe("keyInputStep", () => {
  it("writes nothing while the author types, and one key after the commit", () => {
    const typing = [..."total"].map((_, i, chars): KeyInputEvent => ({ kind: "type", text: chars.slice(0, i + 1).join("") }));
    const typedOnly = runKeyInput("amount", typing);
    expect(typedOnly.writes.every((write) => write === undefined)).toBe(true);
    expect(typedOnly.shown).toBe("total");

    const committed = runKeyInput("amount", [...typing, { kind: "commit" }]);
    expect(committed.writes.filter((write) => write !== undefined)).toEqual(["total"]);
    expect(committed.shown).toBe("amount");
  });

  it("writes once when Enter is followed by the blur", () => {
    const { writes } = runKeyInput("amount", [
      { kind: "type", text: "total_amount" },
      { kind: "commit" },
      { kind: "commit" },
    ]);
    expect(writes.filter((write) => write !== undefined)).toEqual(["total_amount"]);
  });

  it("writes nothing for the text the field already carries", () => {
    const { writes } = runKeyInput("amount", [
      { kind: "type", text: "amoun" },
      { kind: "type", text: "amount" },
      { kind: "commit" },
    ]);
    expect(writes.every((write) => write === undefined)).toBe(true);
  });

  it("writes nothing for a commit with no typing", () => {
    expect(runKeyInput("amount", [{ kind: "commit" }]).writes).toEqual([undefined]);
  });

  it("hands an empty text to the commit, which keyCommitProblem then refuses", () => {
    const { writes } = runKeyInput("amount", [{ kind: "type", text: "" }, { kind: "commit" }]);
    expect(writes).toEqual([undefined, ""]);
  });

  it("puts the key back on Escape and writes nothing, the blur after it included", () => {
    const { writes, shown } = runKeyInput("amount", [{ kind: "type", text: "other" }, { kind: "escape" }, { kind: "commit" }]);
    expect(shown).toBe("amount");
    expect(writes.every((write) => write === undefined)).toBe(true);
  });
});

describe("keyNoticeFor", () => {
  it("names the rule for an unpublished key that follows its label", () => {
    expect(keyNoticeFor("amount", false, true)).toBe("The key follows the label until the first publish.");
  });

  it("says the label no longer sets an unpublished key that stopped following", () => {
    expect(keyNoticeFor("sum", false, false)).toBe("The label no longer sets this key.");
  });

  it("names the publication, which wins over following", () => {
    expect(keyNoticeFor("amount", true, true)).toBe("This field is in a published version. The label no longer sets its key.");
    expect(keyNoticeFor("amount", true, false)).toBe("This field is in a published version. The label no longer sets its key.");
  });

  it("shows nothing while the base version loads", () => {
    expect(keyNoticeFor("amount", undefined, true)).toBeUndefined();
  });

  it("shows nothing for an empty key, whatever the rest says", () => {
    expect(keyNoticeFor("", true, false)).toBeUndefined();
    expect(keyNoticeFor("", false, true)).toBeUndefined();
  });
});

describe("the field editor's Developer view and key input", () => {
  it("holds the key input behind a closed Developer view, after the description and before the move control", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", new Set());
    const detailsAt = html.lastIndexOf("<details", html.indexOf(">Key<"));
    const inputAt = html.indexOf(keyInput(html));

    expect(keyDetails(html)).not.toContain("open");
    expect(html.slice(detailsAt, inputAt)).toContain(">Developer view</summary>");
    expect(html.indexOf("</details>", detailsAt)).toBeGreaterThan(inputAt);
    expect(html.indexOf(">Description")).toBeLessThan(detailsAt);
    expect(html.indexOf(`id="${moveControlId("field_amount")}"`)).toBeGreaterThan(html.indexOf("</details>", detailsAt));
  });

  it("holds a group's key input behind the Developer view too", () => {
    const draft = { baseLocale: "en", fields: [grp("field_g", "g", [])] } as unknown as Draft;
    const html = renderKeyEditor(draft, "field_g", new Set());
    const detailsAt = html.lastIndexOf("<details", html.indexOf(">Key<"));

    expect(detailsAt).toBeGreaterThan(-1);
    expect(html.indexOf("</details>", detailsAt)).toBeGreaterThan(html.indexOf(keyInput(html)));
  });

  it("opens the Developer view while a check on the key stands", () => {
    const issues: EditorIssue[] = [{ entityType: "field", entityId: "field_amount", loc: "fields[0].key", source: "structural", message: "x" }];
    expect(keyDetails(renderKeyEditor(draftWithReaders([]), "field_amount", new Set(), issues))).toContain('open=""');
  });

  it("keeps the Developer view closed for a check on the label", () => {
    const issues: EditorIssue[] = [{ entityType: "field", entityId: "field_amount", loc: "fields[0].label", source: "zod", message: "x" }];
    expect(keyDetails(renderKeyEditor(draftWithReaders([]), "field_amount", new Set(), issues))).not.toContain("open");
  });

  it("asks the browser for no spell check, no autofill and no translation", () => {
    const input = keyInput(renderKeyEditor(draftWithReaders([]), "field_amount", new Set()));

    expect(input).toContain('spellCheck="false"');
    expect(input).toContain('autoComplete="off"');
    expect(input).toContain('translate="no"');
    expect(input).not.toContain("aria-invalid");
  });

  it("points the input at a refusal and the notice, and marks it invalid while a refusal shows", () => {
    const commit = source.slice(source.indexOf("function FieldKeyInput("), source.indexOf("/**\n * Applies a kind switch"));

    expect(commit).toContain("aria-invalid={problem !== undefined ? true : undefined}");
    expect(commit).toContain("const describedBy = [refusalId, noticeId]");
    const typing = commit.slice(commit.indexOf("onChange={(e) =>"), commit.indexOf("onBlur={commit}"));
    expect(typing).toContain("setProblem(undefined);");
    expect(commit).toContain('{ kind: "escape" }');
  });

  it("shows the draft's key while nothing is typed", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", new Set());
    expect(keyInput(html)).toContain('value="amount"');
  });

  it("stands an always-present polite status line under the label row, empty before any rewrite", () => {
    const html = renderKeyEditor(draftWithReaders(["data.amount > 1.0"]), "field_amount", new Set());
    const lineAt = html.indexOf('role="status"');
    const line = html.slice(html.lastIndexOf("<p", lineAt), html.indexOf("</p>", lineAt) + 4);

    expect(line).toContain('aria-live="polite"');
    expect(line).toMatch(/><\/p>$/);
    expect(lineAt).toBeGreaterThan(html.indexOf(`id="${fieldLabelInputId("field_amount")}"`));
    expect(lineAt).toBeLessThan(html.indexOf(">Description"));
    expect(html).not.toContain("Updated");
  });
});

describe("the sentence in a field's Developer view", () => {
  it("names the rule for an unpublished field, and ties it to the input", () => {
    const html = renderKeyEditor(draftWithReaders(["data.amount > 1.0"]), "field_amount", new Set());

    expect(html).toContain("The key follows the label until the first publish.");
    expect(keyInput(html)).toContain(`aria-describedby="${fieldKeyNoticeId("field_amount")}"`);
    expect(html).toContain(`<p id="${fieldKeyNoticeId("field_amount")}"`);
    expect(html.indexOf(`id="${fieldKeyNoticeId("field_amount")}"`)).toBeLessThan(html.indexOf("</details>", html.indexOf(">Key<")));
  });

  it("puts the sentence beside the key's label, never inside it", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", new Set());
    const noticeAt = html.indexOf(`id="${fieldKeyNoticeId("field_amount")}"`);
    expect(noticeAt).toBeGreaterThan(-1);
    expect(html.lastIndexOf("<label", noticeAt)).toBeLessThan(html.lastIndexOf("</label>", noticeAt));
  });

  it("says the label no longer sets a hand-committed key", () => {
    const html = renderKeyEditor(draftWithReaders([], "sum", "Amount"), "field_amount", new Set());
    expect(html).toContain("The label no longer sets this key.");
  });

  it("names the publication of a published field", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", new Set(["field_amount"]));
    expect(html).toContain("This field is in a published version. The label no longer sets its key.");
    expect(keyInput(html)).toContain(`aria-describedby="${fieldKeyNoticeId("field_amount")}"`);
  });

  it("shows no sentence while the base version loads", () => {
    const html = renderKeyEditor(draftWithReaders(["data.amount > 1.0"]), "field_amount", undefined);
    expect(html).not.toContain(fieldKeyNoticeId("field_amount"));
    expect(keyInput(html)).not.toContain("aria-describedby");
  });

  it("shows no sentence for an empty key", () => {
    const draft = { baseLocale: "en", fields: [fld("field_amount", "")] } as unknown as Draft;
    const html = renderKeyEditor(draft, "field_amount", new Set(["field_amount"]));
    expect(html).not.toContain(fieldKeyNoticeId("field_amount"));
  });

  it("shows no sentence for a group, though an expression names its key", () => {
    const draft = {
      baseLocale: "en",
      fields: [grp("field_g", "amount", [])],
      workflow: { guards: [readAmount("data.amount > 1.0")] },
    } as unknown as Draft;
    const html = renderKeyEditor(draft, "field_g", new Set(["field_g"]));
    expect(html).not.toContain(fieldKeyNoticeId("field_g"));
    expect(keyInput(html)).not.toContain("aria-describedby");
  });
});

/**
 * The effect half's empty-state route (`studio-app`: "The effect half states
 * its own empty state"). It opens the form editor for the first step a person
 * works, `firstWorkedStepId` (`studio-performedBy.test.ts` covers the pick),
 * and stands absent where no such step exists. A static render fires no
 * click, so the press's target is pinned at the source: the route calls
 * `onOpenForm` with that step, while the used-in rows keep `onShowStep`.
 */
describe("the effect half's route to a step's form", () => {
  const ROUTE = "Put this field on a step";
  const step = (id: string, extra: object = {}) => ({ id, key: id, label: { en: id }, type: "task", ...extra });
  const draftOf = (initialStep: string, steps: object[]): Draft =>
    ({ baseLocale: "en", fields: [fld("field_a", "a")], workflow: { initialStep, steps } }) as unknown as Draft;
  const render = (draft: Draft) =>
    renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_a"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onOpenForm={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );
  const source = readFileSync(new URL("../src/areas/studio/panels/FieldCatalogPanel.tsx", import.meta.url).pathname, "utf8");

  it("opens the form of the first step a person works", () => {
    const html = render(draftOf("step_a", [step("step_a"), step("step_b", { terminal: true })]));
    const emptyAt = source.indexOf('t("fieldCatalog.usedInEmpty")');
    const emptyState = source.slice(emptyAt, source.indexOf('t("fieldCatalog.effectEmptyRoute")', emptyAt));

    expect(html).toContain(`>${ROUTE}</button>`);
    expect(source).toContain("const routeStepId = firstWorkedStepId(draft);");
    expect(emptyState).toContain("onClick={() => onOpenForm(routeStepId)}");
    expect(emptyState).not.toContain("onShowStep(");
  });

  it("skips an initial step that calls another process", () => {
    const html = render(draftOf("step_a", [step("step_a", { type: "subprocess" }), step("step_b")]));

    expect(html).toContain(`>${ROUTE}</button>`);
  });

  it("offers no route where no step is one a person works", () => {
    const html = render(draftOf("step_a", [step("step_a", { type: "subprocess" }), step("step_b", { terminal: true })]));

    expect(html).toContain("No step asks for this field yet.");
    expect(html).not.toContain(ROUTE);
  });
});
