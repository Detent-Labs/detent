import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FieldCatalogPanel, MoveFieldControl } from "../src/areas/studio/panels/FieldCatalogPanel.js";
import {
  ADD_FIRST_FIELD_ID,
  fieldKeyNoticeId,
  fieldLabelInputId,
  keyInputStep,
  keyNoticeFor,
  type KeyInputEvent,
  labelChangePatch,
  moveControlId,
  removeControlId,
} from "../src/areas/studio/panels/fieldCatalogLogic.js";
import { PublishedFieldIdsContext } from "../src/areas/studio/draft/publishedFields.js";
import { writeGroupLabel } from "../src/areas/studio/draft/view-group-sync.js";

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

/**
 * What `FieldEditor::updateLabel` writes for a label change. It reads the lock
 * through `labelChangePatch` and `writeGroupLabel`. The panel renders to static
 * markup in this suite, which fires no change event, so these cases call the
 * two writes `updateLabel` calls.
 */
describe("a label change in the field catalog", () => {
  const cel = (src: string) => ({ lang: "cel" as const, src });
  const amountLabel = { en: "Amount" };
  const totalLabel = { en: "Total amount" };

  const guardedDraft = (): Draft =>
    ({
      baseLocale: "en",
      fields: [fld("field_amount", "amount", { label: amountLabel })],
      workflow: {
        initialStep: "step_a",
        steps: [
          {
            id: "step_a",
            key: "a",
            label: { en: "A" },
            type: "task",
            paths: [{ id: "path_a", key: "p", label: "P", to: "step_a", trigger: "automatic", guard: cel("data.amount > 1000.0") }],
          },
        ],
      },
    }) as unknown as Draft;

  const fieldOf = (draft: Draft, id: string): DraftField => (draft.fields as unknown as DraftField[]).find((f) => f.id === id)!;

  it("leaves a key that a guard reads when the label changes", () => {
    const draft = guardedDraft();
    const patch = labelChangePatch(draft, fieldOf(draft, "field_amount"), totalLabel, "en", new Set());

    expect(patch).toEqual({ label: totalLabel });
  });

  it("leaves a published field's key when the label changes", () => {
    const draft = { baseLocale: "en", fields: [fld("field_amount", "amount", { label: amountLabel })] } as unknown as Draft;
    const patch = labelChangePatch(draft, fieldOf(draft, "field_amount"), totalLabel, "en", new Set(["field_amount"]));

    expect(patch).toEqual({ label: totalLabel });
  });

  it("leaves the key while the base version has not loaded", () => {
    const draft = { baseLocale: "en", fields: [fld("field_amount", "amount", { label: amountLabel })] } as unknown as Draft;
    const patch = labelChangePatch(draft, fieldOf(draft, "field_amount"), totalLabel, "en", undefined);

    expect(patch).toEqual({ label: totalLabel });
  });

  it("follows the label for an unread field the base version lacks", () => {
    const draft = { baseLocale: "en", fields: [fld("field_amount", "amount", { label: amountLabel })] } as unknown as Draft;
    const patch = labelChangePatch(draft, fieldOf(draft, "field_amount"), totalLabel, "en", new Set(["field_other"]));

    expect(patch).toEqual({ label: totalLabel, key: "total_amount" });
  });

  it("follows the label in a draft with no base version", () => {
    const draft = { baseLocale: "en", fields: [fld("field_amount", "amount", { label: amountLabel })] } as unknown as Draft;
    const patch = labelChangePatch(draft, fieldOf(draft, "field_amount"), totalLabel, "en", new Set());

    expect(patch).toEqual({ label: totalLabel, key: "total_amount" });
  });

  it("derives a key for an empty-key field even when its id is published", () => {
    const draft = { baseLocale: "en", fields: [fld("field_new", "", { label: undefined })] } as unknown as Draft;
    const patch = labelChangePatch(draft, fieldOf(draft, "field_new"), totalLabel, "en", new Set(["field_new"]));

    expect(patch).toEqual({ label: totalLabel, key: "total_amount" });
  });

  it("does not count a field with no id as published", () => {
    const field = { key: "amount", label: amountLabel, type: "string" } as unknown as DraftField;
    const draft = { baseLocale: "en", fields: [field] } as unknown as Draft;
    const patch = labelChangePatch(draft, field, totalLabel, "en", undefined);

    expect(patch).toEqual({ label: totalLabel, key: "total_amount" });
  });

  it("keeps a group field following its label and rewrites its view entries", () => {
    const draft = {
      baseLocale: "en",
      fields: [grp("field_request", "request", [fld("field_child", "child")])],
      workflow: {
        initialStep: "step_a",
        steps: [
          {
            id: "step_a",
            key: "a",
            label: { en: "A" },
            type: "task",
            view: { fields: [{ ref: "field_request" }, { ref: "field_child", group: "request" }] },
          },
        ],
      },
    } as unknown as Draft;
    (fieldOf(draft, "field_request") as { label: unknown }).label = { en: "Request" };

    writeGroupLabel(draft, "field_request", { en: "Order request" }, "en");

    expect(fieldOf(draft, "field_request").key).toBe("order_request");
    const entries = (draft.workflow as unknown as { steps: { view: { fields: { group?: string }[] } }[] }).steps[0]!.view.fields;
    expect(entries[1]!.group).toBe("order_request");
  });
});

const readAmount = (src: string) => ({ lang: "cel", src });

/** A draft whose `amount` field is read by `readers` CEL expressions. */
function draftWithReaders(readers: string[]): Draft {
  return {
    baseLocale: "en",
    fields: [fld("field_amount", "amount")],
    workflow: { guards: readers.map(readAmount) },
  } as unknown as Draft;
}

function renderKeyEditor(draft: Draft, selectedId: string, published: ReadonlySet<string> | undefined): string {
  return renderToStaticMarkup(
    <PublishedFieldIdsContext.Provider value={published}>
      <DraftContext.Provider value={contextValue(draft)}>
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

  it("writes an empty text that clears the key", () => {
    const { writes } = runKeyInput("amount", [{ kind: "type", text: "" }, { kind: "commit" }]);
    expect(writes).toEqual([undefined, ""]);
  });
});

describe("keyNoticeFor", () => {
  it("counts several readers", () => {
    expect(keyNoticeFor("amount", 3, false)).toBe(
      "Read by 3 expressions. The label no longer sets this key, and changing the key does not touch them.",
    );
  });

  it("uses the singular for one reader", () => {
    expect(keyNoticeFor("amount", 1, false)).toBe(
      "Read by 1 expression. The label no longer sets this key, and changing the key does not touch it.",
    );
  });

  it("names the publication of a field nothing reads", () => {
    expect(keyNoticeFor("amount", 0, true)).toBe("This field is in a published version. The label no longer sets its key.");
  });

  it("prefers the readers over the publication", () => {
    expect(keyNoticeFor("amount", 2, true)).toContain("Read by 2 expressions");
  });

  it("shows nothing for a new field nothing reads", () => {
    expect(keyNoticeFor("amount", 0, false)).toBeUndefined();
  });

  it("shows nothing for an empty key, whatever the rest says", () => {
    expect(keyNoticeFor("", 0, true)).toBeUndefined();
    expect(keyNoticeFor("", 2, true)).toBeUndefined();
  });
});

describe("the notice under a field's key input", () => {
  it("counts every expression that reads the key, and ties it to the input", () => {
    const draft = draftWithReaders(["data.amount > 1000.0", "data.amount < 5000.0", "data.amount + data.amount > 1.0"]);
    const html = renderKeyEditor(draft, "field_amount", new Set());
    expect(html).toContain("Read by 3 expressions.");
    expect(keyInput(html)).toContain(`aria-describedby="${fieldKeyNoticeId("field_amount")}"`);
    expect(html).toContain(`<p id="${fieldKeyNoticeId("field_amount")}"`);
  });

  it("puts the notice beside the key's label, never inside it", () => {
    const html = renderKeyEditor(draftWithReaders(["data.amount > 1.0"]), "field_amount", new Set());
    const noticeAt = html.indexOf(`id="${fieldKeyNoticeId("field_amount")}"`);
    expect(noticeAt).toBeGreaterThan(-1);
    expect(html.lastIndexOf("<label", noticeAt)).toBeLessThan(html.lastIndexOf("</label>", noticeAt));
  });

  it("uses the singular for one reader", () => {
    const html = renderKeyEditor(draftWithReaders(["data.amount > 1.0"]), "field_amount", new Set());
    expect(html).toContain("Read by 1 expression.");
    expect(html).not.toContain("Read by 1 expressions");
  });

  it("names the publication of a field nothing reads", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", new Set(["field_amount"]));
    expect(html).toContain("This field is in a published version. The label no longer sets its key.");
    expect(keyInput(html)).toContain(`aria-describedby="${fieldKeyNoticeId("field_amount")}"`);
  });

  it("shows no notice for a new field nothing reads", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", new Set());
    expect(html).not.toContain(fieldKeyNoticeId("field_amount"));
    expect(html).not.toContain("published version");
    expect(keyInput(html)).not.toContain("aria-describedby");
  });

  it("shows no notice while the base version loads and nothing reads the key", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", undefined);
    expect(html).not.toContain(fieldKeyNoticeId("field_amount"));
    expect(keyInput(html)).not.toContain("aria-describedby");
  });

  it("shows no notice for an empty key", () => {
    const draft = { baseLocale: "en", fields: [fld("field_amount", "")] } as unknown as Draft;
    const html = renderKeyEditor(draft, "field_amount", new Set(["field_amount"]));
    expect(html).not.toContain(fieldKeyNoticeId("field_amount"));
  });

  it("shows no notice for a group, though an expression names its key", () => {
    const draft = {
      baseLocale: "en",
      fields: [grp("field_g", "amount", [])],
      workflow: { guards: [readAmount("data.amount > 1.0")] },
    } as unknown as Draft;
    const html = renderKeyEditor(draft, "field_g", new Set(["field_g"]));
    expect(html).not.toContain(fieldKeyNoticeId("field_g"));
    expect(keyInput(html)).not.toContain("aria-describedby");
  });

  it("shows the draft's key while nothing is typed", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", new Set());
    expect(keyInput(html)).toContain('value="amount"');
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
