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
  keyHolderName,
  keyInputStep,
  keyNoticeFor,
  keyRefusalFor,
  nextRewriteLine,
  type KeyCommitProblem,
  type KeyInputEvent,
  labelChangePatch,
  moveControlId,
  removeControlId,
  rewriteLineFor,
  showsChoices,
} from "../src/areas/studio/panels/fieldCatalogLogic.js";
import { PublishedFieldIdsContext, PublishedOptionValuesContext } from "../src/areas/studio/draft/publishedFields.js";
import type { ReadByTarget } from "../src/areas/studio/panels/readByRows.js";

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
 * `MoveFieldControl`'s own value/disabled wiring: `studio-fieldCatalogLogic.test.ts
 * ::moveTargetsFor` covers only the data behind the control, not the rendered
 * `<select>` itself.
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

interface RenderOptions {
  issues?: EditorIssue[];
  /** The base version's field ids; `new Set()` stands for a draft with none. */
  published?: ReadonlySet<string> | undefined;
  /** The base version's choice values per field id. */
  publishedValues?: ReadonlyMap<string, ReadonlySet<string>> | undefined;
  onOpenPlace?: (target: ReadByTarget) => void;
}

/**
 * The panel over `selectedId`, in a hand-built context: a live
 * `DraftProvider` resolves its fetches async and never settles under
 * `renderToStaticMarkup`. A static render fires no event, so a press is
 * pinned at the source where a test needs one.
 */
function renderPanel(draft: Draft, selectedId: string | undefined, options: RenderOptions = {}): string {
  const { issues = [], onOpenPlace = NOOP } = options;
  // An explicit `undefined` stands for a base version still loading, so only
  // an absent key takes the default.
  const published = "published" in options ? options.published : new Set<string>();
  const publishedValues = "publishedValues" in options ? options.publishedValues : new Map<string, ReadonlySet<string>>();
  return renderToStaticMarkup(
    <PublishedFieldIdsContext.Provider value={published}>
      <PublishedOptionValuesContext.Provider value={publishedValues}>
        <DraftContext.Provider value={contextValue(draft, issues)}>
          <FieldCatalogPanel
            token="test-token"
            selectedId={selectedId}
            onAdd={NOOP}
            onRemove={NOOP}
            onShowStep={NOOP}
            onOpenForm={NOOP}
            onOpenPlace={onOpenPlace}
            onMoveField={NOOP}
          />
        </DraftContext.Provider>
      </PublishedOptionValuesContext.Provider>
    </PublishedFieldIdsContext.Provider>,
  );
}

/** Every `<h4>` heading's text, in document order. */
const headings = (html: string): string[] => [...html.matchAll(/<h4[^>]*>([^<]*)<\/h4>/g)].map((m) => m[1]!);

/** The markup of one section, from its heading to the next `<h4>`. */
function sectionOf(html: string, heading: string): string {
  const at = html.indexOf(`>${heading}</h4>`);
  expect(at).toBeGreaterThan(-1);
  const next = html.indexOf("<h4", at);
  return html.slice(at, next === -1 ? undefined : next);
}

/** The opening tag of the `<details>` More draws. */
function moreDetails(html: string): string {
  const at = html.lastIndexOf("<details", html.indexOf(">More</h4>"));
  return html.slice(at, html.indexOf(">", at) + 1);
}

/** More's markup, from its summary to the Remove field row after it. */
function moreBody(html: string): string {
  const at = html.indexOf(">More</h4>");
  return html.slice(at, html.indexOf(`id="${removeControlId("field_a")}"`));
}

const cel = (src: string) => ({ lang: "cel" as const, src });

const step = (id: string, label: string, view: unknown[] = [], extra: object = {}) => ({
  id,
  key: id,
  label: { en: label },
  type: "task",
  view: { fields: view },
  ...extra,
});

const draftOf = (fields: DraftField[], steps: object[] = [], extra: object = {}): Draft =>
  ({
    baseLocale: "en",
    fields,
    workflow: { initialStep: (steps[0] as { id?: string } | undefined)?.id ?? "step_a", steps },
    ...extra,
  }) as unknown as Draft;

// `studio-app`: "The Fields view draws one card in sections".
describe("the field card's sections", () => {
  it("reads the name line, the Name input, then Kind, Choices, Asked on, Read by and More, in that order", () => {
    const html = renderPanel(draftOf([fld("field_a", "a", { label: { en: "Amount" } })]), "field_a");

    expect(headings(html)).toEqual(["Kind", "Choices", "Asked on", "Read by", "More"]);
    const nameLine = html.indexOf(">Amount</h3>");
    const nameInput = html.indexOf(`id="${fieldLabelInputId("field_a")}"`);
    expect(nameLine).toBeGreaterThan(-1);
    expect(nameLine).toBeLessThan(nameInput);
    expect(html.slice(nameLine, nameInput)).not.toContain("<h4");
    expect(html.slice(nameLine, nameInput)).toContain(">Name<");
  });

  it("draws no half, no zone heading and no retired label", () => {
    const html = renderPanel(draftOf([fld("field_a", "a")]), "field_a");

    for (const retired of ["What this field asks", "What kind of field", "Used in", "Ask for this", "What this field is", "Where it acts"]) {
      expect(html).not.toContain(retired);
    }
  });

  it("rules every section after Kind with a hairline, and Kind with none", () => {
    const html = renderPanel(draftOf([fld("field_a", "a")]), "field_a");
    const sectionTag = (heading: string) => {
      const at = html.lastIndexOf("<section", html.indexOf(`>${heading}</h4>`));
      return html.slice(at, html.indexOf(">", at) + 1);
    };

    expect(sectionTag("Kind")).not.toContain("sectionRuled");
    for (const heading of ["Choices", "Asked on", "Read by"]) expect(sectionTag(heading)).toContain("sectionRuled");
    expect(moreDetails(html)).toContain("sectionRuled");
  });

  it("closes the card with Remove field, under a hairline of its own", () => {
    const html = renderPanel(draftOf([grp("field_g", "g", [fld("field_c", "c")])]), "field_c");
    const card = html.slice(0, html.indexOf("</article>"));
    const remove = buttonElements(card).at(-1);

    expect(remove).toContain(`id="${removeControlId("field_c")}"`);
    expect(remove).toEndWith(">Remove field</button>");
    expect(card.slice(card.lastIndexOf("<div", card.indexOf(removeControlId("field_c"))))).toContain("removeRow");
  });

  it("shows a group's \"Fields inside this group\" directly before More, and no Read by", () => {
    const html = renderPanel(draftOf([grp("field_g", "g", [fld("field_c", "c")])]), "field_g");

    expect(headings(html)).toEqual(["Kind", "Asked on", "Fields inside this group", "More"]);
    expect(sectionOf(html, "Fields inside this group")).toContain(">+ Add field to this group</button>");
    expect(html).not.toContain(`id="${moveControlId("field_c")}"`);
  });

  it("draws no \"Fields inside this group\" for a field that is no group", () => {
    expect(renderPanel(draftOf([fld("field_a", "a")]), "field_a")).not.toContain("Fields inside this group");
  });

  it("draws a nested field's own card, with its own move control and its label input", () => {
    const html = renderPanel(draftOf([grp("field_g", "g", [fld("field_c", "c")])]), "field_c");

    expect(html).toContain(`id="${moveControlId("field_c")}"`);
    expect(html).toContain(`id="${fieldLabelInputId("field_c")}"`);
    expect(html).toContain("Default value");
    expect(html).toContain("How it will look");
  });

  // A kind switch rewrote `resolution` out of `group` and left its `fields` in
  // place. The panel finds that child through `flattenDraftFields`, whatever
  // its parent's `type`.
  it("draws the card of a field whose parent is no group", () => {
    const draft = draftOf([{ ...fld("field_r", "resolution"), fields: [fld("field_c", "discrepancy_note")] } as unknown as DraftField]);
    const html = renderPanel(draft, "field_c");

    expect(html).toContain(`id="${moveControlId("field_c")}"`);
    expect(html).toContain(`id="${fieldLabelInputId("field_c")}"`);
  });

  it("puts the stable first-field id on the start state's Add the first field", () => {
    const html = renderPanel(draftOf([]), undefined);
    const addFirst = buttonElements(html).find((b) => b.includes(`id="${ADD_FIRST_FIELD_ID}"`));

    expect(addFirst).toBeDefined();
    expect(addFirst).toEndWith(">Add the first field</button>");
    expect(html).not.toContain("<article");
  });

  // `FieldsTab` passes `undefined` while no field carries an id. Without the
  // lookup's guard, the id-less field would match that `undefined`.
  it("draws the start state for a catalog whose only field carries no id", () => {
    const html = renderPanel(draftOf([{ key: "unsaved", type: "string" } as unknown as DraftField]), undefined);

    expect(html).toContain("This process collects nothing yet");
    expect(html).not.toContain("studio-field-label-");
  });
});

// `studio-app`: "The Choices section shows for a field that can take choices".
describe("the Choices section", () => {
  it("shows for a text field, with the free-typing sentence and the add command", () => {
    const choices = sectionOf(renderPanel(draftOf([fld("field_a", "a")]), "field_a"), "Choices");

    expect(choices).toContain("No choice yet, so a participant types freely. Add one to offer a list instead.");
    expect(choices).toContain(">+ Add a choice</button>");
  });

  it("stays out for a number field and for a date field", () => {
    expect(headings(renderPanel(draftOf([fld("field_a", "a", { type: "number" })]), "field_a"))).not.toContain("Choices");
    expect(headings(renderPanel(draftOf([fld("field_a", "a", { format: "date" })]), "field_a"))).not.toContain("Choices");
  });

  it("decides by the control, the format and what the field already carries", () => {
    expect(showsChoices({ type: "string" })).toBe(true);
    expect(showsChoices({ type: "list" })).toBe(true);
    expect(showsChoices({ type: "list", format: "person" })).toBe(false);
    expect(showsChoices({ type: "string", format: "email", control: "radio" })).toBe(true);
    expect(showsChoices({ type: "string", format: "email", options: [{ value: "a", label: { en: "A" } }] } as never)).toBe(true);
    expect(showsChoices({ type: "string", format: "date", dataSource: "ds_1" } as never)).toBe(true);
    expect(showsChoices({ type: "boolean" })).toBe(false);
    expect(showsChoices({ type: "group" })).toBe(false);
  });
});

// `studio-app`: "A choice reads by its name alone".
describe("a choice row", () => {
  const status = () =>
    fld("field_a", "status", {
      options: [
        { value: "open", label: { en: "Open" } },
        { value: "closed", label: { en: "Closed" } },
      ],
    });
  /** The Choices section's markup before its Developer view. */
  const rows = (html: string) => {
    const choices = sectionOf(html, "Choices");
    return choices.slice(0, choices.indexOf("<details"));
  };
  /** The Choices section's Developer view. */
  const developerView = (html: string) => {
    const choices = sectionOf(html, "Choices");
    return choices.slice(choices.indexOf("<details"), choices.indexOf("</details>") + "</details>".length);
  };

  it("holds one name input and a Remove command per choice, and no value outside the Developer view", () => {
    const html = renderPanel(draftOf([status()]), "field_a");
    const listed = rows(html);

    expect(listed.match(/<li/g)).toHaveLength(2);
    expect(listed.match(/<input/g)).toHaveLength(2);
    expect(listed).toContain('value="Open"');
    expect(listed).toContain('value="Closed"');
    expect(buttonElements(listed).filter((b) => b.endsWith(">Remove</button>"))).toHaveLength(2);
    expect(listed).not.toContain('value="open"');
    expect(listed).not.toContain('value="closed"');
    expect(listed).toContain(">+ Add a choice</button>");
  });

  it("prints the authoring commands in the authoring command style", () => {
    const remove = buttonElements(rows(renderPanel(draftOf([status()]), "field_a"))).find((b) => b.endsWith(">Remove</button>"));

    expect(remove).toContain('class="btn btn-ghost command"');
  });

  it("keeps the stored values in a closed Developer view, in mono inputs captioned Stored value", () => {
    const view = developerView(renderPanel(draftOf([status()]), "field_a"));

    expect(view).toMatch(/^<details(?![^>]*\sopen)/);
    expect(view).toContain(">Developer view</summary>");
    expect(view.match(/>Stored value</g)).toHaveLength(2);
    expect(view).toMatch(/<input[^>]*class="studioMono"[^>]*value="open"/);
    expect(view).toMatch(/<input[^>]*class="studioMono"[^>]*value="closed"/);
  });

  it("says the value follows the name while no choice is published", () => {
    expect(developerView(renderPanel(draftOf([status()]), "field_a"))).toContain("The value follows the name until the first publish.");
  });

  it("says the name no longer sets the values once the base version holds a choice", () => {
    const html = renderPanel(draftOf([status()]), "field_a", { publishedValues: new Map([["field_a", new Set(["open"])]]) });

    expect(developerView(html)).toContain("This field is in a published version. The name no longer sets its values.");
  });

  it("counts every stored value as locked while the base version loads", () => {
    const html = renderPanel(draftOf([status()]), "field_a", { publishedValues: undefined });

    expect(developerView(html)).toContain("This field is in a published version. The name no longer sets its values.");
  });

  it("writes a name through applyChoiceName, the lock read per choice", () => {
    const source = readFileSync(new URL("../src/areas/studio/panels/FieldCatalogPanel.tsx", import.meta.url).pathname, "utf8");
    const write = source.slice(source.indexOf("const nameChoice = "), source.indexOf("const addChoice = "));

    expect(write).toContain("const locked = isLocked(option);");
    expect(write).toContain("applyChoiceName(target, index, label, baseLocale, locked)");
    expect(source).toContain('setOptions([...options, { value: "", label: seedLocalizedText(contentLocale) }])');
  });
});

// `studio-app`: "A field bound to a source states where its choices come from".
describe("a field bound to a data source", () => {
  const draft = draftOf([fld("field_a", "a", { dataSource: "ds_1" })], [], {
    dataSources: [
      { id: "ds_1", key: "Cost centres", type: "db.list", config: {} },
      { id: "ds_2", key: "", type: "db.list", config: {} },
    ],
  });

  it("names its source, and draws no choice row and no add command", () => {
    const choices = sectionOf(renderPanel(draft, "field_a"), "Choices");

    expect(choices).toContain("The choices come from Cost centres.");
    expect(choices).toContain("Pick another source under More.");
    expect(choices).not.toContain("<input");
    expect(choices).not.toContain("+ Add a choice");
  });

  // `studio-app`: "The source picker names each source".
  it("offers each source by name in More's picker, and no id", () => {
    const more = moreBody(renderPanel(draft, "field_a"));
    const picker = more.slice(more.indexOf(">Values come from"), more.indexOf("</select>"));
    const optionTexts = [...picker.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);

    expect(optionTexts).toEqual(["Nowhere: this field lists its own choices", "Cost centres", "(unnamed source)"]);
  });
});

// `studio-app`: "Asked on lists each step's marks as words" and its siblings.
describe("the Asked on section", () => {
  const amount = () => fld("field_a", "amount", { label: { en: "Amount" }, type: "number" });

  it("prints each step's marks as words, and no flag key", () => {
    const html = renderPanel(
      draftOf(
        [amount()],
        [
          step("step_r", "Review", [{ ref: "field_a", required: true }]),
          step("step_p", "Approve", [{ ref: "field_a", readonly: true }]),
          step("step_h", "Archive", [{ ref: "field_a", visible: false }]),
        ],
      ),
      "field_a",
    );
    const asked = sectionOf(html, "Asked on");
    const rowOf = (label: string) => asked.slice(asked.indexOf(`>${label}<`), asked.indexOf("</li>", asked.indexOf(`>${label}<`)));

    expect(rowOf("Review")).toContain(">Required<");
    expect(rowOf("Approve")).toContain(">Read-only<");
    expect(rowOf("Archive")).toContain(">Not asked<");
    expect(asked).not.toContain(">required<");
    expect(asked).not.toContain(">readonly<");
    expect(asked).not.toContain("studioMono");
  });

  it("reads a step's own condition as a sentence, and prints no mark for a conditional requiredness", () => {
    const html = renderPanel(
      draftOf(
        [amount()],
        [
          step("step_r", "Review", [{ ref: "field_a", visible: cel("data.amount > 0.0") }]),
          step("step_p", "Approve", [{ ref: "field_a", required: cel("data.amount > 0.0") }]),
        ],
      ),
      "field_a",
    );
    const asked = sectionOf(html, "Asked on");
    const register = asked.slice(asked.indexOf("<ul"), asked.indexOf("</ul>"));

    expect(register).toContain(">Amount is greater than 0.<");
    expect(register.match(/greater than/g)).toHaveLength(1);
    expect(register).not.toContain(">Required<");
  });

  it("closes each row with Open the form and Show on the map", () => {
    const html = renderPanel(draftOf([amount()], [step("step_r", "Review", [{ ref: "field_a" }])]), "field_a");
    const row = sectionOf(html, "Asked on");
    const commands = buttonElements(row.slice(row.indexOf("<li"), row.indexOf("</li>")));

    expect(commands.map((b) => b.replace(/<[^>]*>/g, ""))).toEqual(["Open the form", "Show on the map"]);
    for (const b of commands) expect(b).toContain('class="btn btn-ghost command"');
  });

  it("stands the requiredness checkbox and Only ask this when under the rows", () => {
    const html = renderPanel(draftOf([amount()], [step("step_r", "Review", [{ ref: "field_a" }])]), "field_a");
    const asked = sectionOf(html, "Asked on");

    expect(asked.indexOf("</ul>")).toBeLessThan(asked.indexOf("Required on every step that asks for it"));
    expect(asked.indexOf("Required on every step that asks for it")).toBeLessThan(asked.indexOf(">Only ask this when<"));
  });

  it("shows the empty state, with no checkbox and no condition, while no step asks for the field", () => {
    const html = renderPanel(draftOf([amount()], [step("step_r", "Review")]), "field_a");
    const asked = sectionOf(html, "Asked on");

    expect(asked).toContain(">No step asks for this field yet.<");
    expect(asked).not.toContain("Required on every step");
    expect(asked).not.toContain("Only ask this when");
    expect(asked).not.toContain('type="checkbox"');
  });

  it("disables the requiredness checkbox for a technical field", () => {
    const html = renderPanel(draftOf([fld("field_a", "a", { technical: true })], [step("step_r", "Review", [{ ref: "field_a" }])]), "field_a");
    const asked = sectionOf(html, "Asked on");
    const at = asked.indexOf("Required on every step that asks for it");
    const label = asked.slice(asked.lastIndexOf("<label", at), at);

    expect(label).toContain('disabled=""');
  });
});

// `studio-app`: "More folds the rest of the card" and "A field's checks stand
// at the zone each one belongs to".
describe("More", () => {
  const issue = (loc: string, entityId = "field_a"): EditorIssue => ({ entityType: "field", entityId, loc, source: "structural", message: `check on ${loc}` });

  it("stands closed with no check, and holds its seven parts in order", () => {
    const html = renderPanel(draftOf([fld("field_a", "a")]), "field_a");
    const more = moreBody(html);
    const order = [
      ">Where values come from<",
      ">Default value<",
      ">Validation<",
      ">Technical: the process fills this in by itself",
      ">Move this field to",
      ">How it will look<",
      'class="studioDevviewSummary">Developer view<',
    ].map((part) => more.indexOf(part));

    expect(moreDetails(html)).not.toMatch(/\sopen/);
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(more.indexOf(">Key<")).toBeGreaterThan(more.indexOf('class="studioDevviewSummary">Developer view<'));
  });

  it("opens by itself while a validation check stands, and shows the check under Validation", () => {
    const html = renderPanel(draftOf([fld("field_a", "a")]), "field_a", { issues: [issue("fields[0].validation.pattern")] });
    const more = moreBody(html);

    expect(moreDetails(html)).toContain('open=""');
    expect(html).toMatch(/data-checked="failed"[^>]*>More<\/h4>/);
    expect(more.indexOf("check on fields[0].validation.pattern")).toBeGreaterThan(more.indexOf(">Validation<"));
  });

  it("opens with its Developer view while a key check stands, and prints the check beside the name line", () => {
    const html = renderPanel(draftOf([fld("field_a", "a")]), "field_a", { issues: [issue("fields[0].key")] });
    const keyDetails = html.slice(html.lastIndexOf("<details", html.indexOf(">Key<")), html.indexOf(">", html.lastIndexOf("<details", html.indexOf(">Key<"))) + 1);

    expect(moreDetails(html)).toContain('open=""');
    expect(keyDetails).toContain('open=""');
    expect(html.indexOf("check on fields[0].key")).toBeLessThan(html.indexOf(`id="${fieldLabelInputId("field_a")}"`));
    expect(html).toMatch(/data-checked="failed"[^>]*>a<\/h3>/);
  });

  it("prints a Technical check under Kind and opens More", () => {
    const html = renderPanel(draftOf([fld("field_a", "a")]), "field_a", { issues: [issue("fields[0].technical")] });

    expect(sectionOf(html, "Kind")).toContain("check on fields[0].technical");
    expect(moreDetails(html)).toContain('open=""');
  });

  it("stands a check it cannot place at the card's top", () => {
    const html = renderPanel(draftOf([fld("field_a", "a")]), "field_a", { issues: [issue("fields[0].somethingElse")] });

    expect(html.indexOf("check on fields[0].somethingElse")).toBeLessThan(html.indexOf(`id="${fieldLabelInputId("field_a")}"`));
  });

  it("stands an option check at the top of a card that draws no Choices section", () => {
    const html = renderPanel(draftOf([fld("field_a", "a", { type: "number" })]), "field_a", { issues: [issue("fields[0].options[0].value")] });

    expect(headings(html)).not.toContain("Choices");
    expect(html.indexOf("check on fields[0].options[0].value")).toBeLessThan(html.indexOf(`id="${fieldLabelInputId("field_a")}"`));
  });

  // `src/schema/compile.ts` raises a `columnMapping` check exactly when the
  // mapping editor stays out: no source, or no string field.
  it("prints a column-mapping check inside More on a field the mapping editor no longer shows", () => {
    const html = renderPanel(draftOf([fld("field_a", "a", { columnMapping: { price: "field_b" } })]), "field_a", {
      issues: [issue("fields[0].columnMapping")],
    });
    const more = moreBody(html);

    expect(moreDetails(html)).toContain('open=""');
    expect(more).not.toContain(">Column mapping<");
    expect(more).toMatch(/data-checked="failed"[^>]*>Where values come from</);
    expect(more.indexOf("check on fields[0].columnMapping")).toBeGreaterThan(more.indexOf(">Where values come from<"));
    expect(more.indexOf("check on fields[0].columnMapping")).toBeLessThan(more.indexOf(">Default value<"));
  });

  // `studio-app`: "A group's child row keeps its own list".
  it("stands a nested field's check in its own card, and none in its group's card", () => {
    const draft = draftOf([grp("field_g", "g", [fld("field_c", "c")])]);
    const issues = [issue("fields[0].fields[0].key", "field_c")];

    expect(renderPanel(draft, "field_c", { issues })).toContain("check on fields[0].fields[0].key");
    expect(renderPanel(draft, "field_g", { issues })).not.toContain("data-checked");
  });

  it("holds the Technical checkbox, enabled for a nested field and disabled for a group", () => {
    const technical = (html: string) => {
      const at = html.indexOf("Technical: the process fills this in by itself");
      return html.slice(html.lastIndexOf("<label", at), at);
    };
    const draft = draftOf([grp("field_g", "g", [fld("field_c", "c")])]);

    expect(technical(renderPanel(draft, "field_c"))).toContain('type="checkbox"');
    expect(technical(renderPanel(draft, "field_c"))).not.toContain('disabled=""');
    expect(technical(renderPanel(draft, "field_g"))).toContain('disabled=""');
  });

  it("opens itself on FieldsTab's request in an effect, and clears the request", () => {
    const source = readFileSync(new URL("../src/areas/studio/panels/FieldCatalogPanel.tsx", import.meta.url).pathname, "utf8");
    const effect = source.slice(source.indexOf("useEffect(() => {\n    if (!openMore) return;"), source.indexOf("}, [openMore, onMoreOpened]);"));

    expect(effect).toContain("setMoreOpen(true);");
    expect(effect).toContain("onMoreOpened();");
    expect(source).toContain("open={moreOpen || moreChecked}");
    expect(source).toContain("onToggle={(e) => setMoreOpen(e.currentTarget.open)}");
  });

  it("prints a column mapping's target by its label", () => {
    const source = readFileSync(new URL("../src/areas/studio/panels/FieldCatalogPanel.tsx", import.meta.url).pathname, "utf8");
    const target = source.slice(source.indexOf('aria-label={t("columnMapping.targetAria")}'), source.indexOf("</select>", source.indexOf('aria-label={t("columnMapping.targetAria")}')));

    expect(target).toContain("{fieldName(f)}");
    expect(target).not.toContain("f.key");
  });
});

/**
 * `studio-condition-builder`: "The Fields tab's divergent state says the steps
 * disagree". The steps that ask a field hold different `visible` overrides, so
 * the condition input reads no single source, yet "this always matches" would
 * be false for those steps.
 */
describe("the Asked on section's \"Only ask this when\"", () => {
  const stepsWith = (a: unknown, b: unknown): Draft =>
    draftOf([fld("field_a", "a")], [step("step_a", "A", [{ ref: "field_a", visible: a }]), step("step_b", "B", [{ ref: "field_a", visible: b }])]);
  const DIVERGENT = "The steps hold different conditions. Build one here to set it on every step.";

  it("says the steps hold different conditions, and not that it always matches", () => {
    const html = renderPanel(stepsWith(cel('data.a == "x"'), cel('data.a == "y"')), "field_a");

    expect(html).toContain("These steps currently disagree");
    expect(html).toContain(DIVERGENT);
    expect(html).not.toContain("this always matches");
  });

  it("says the same when one step holds a literal beside an expression", () => {
    const html = renderPanel(stepsWith(false, cel('data.a == "x"')), "field_a");

    expect(html).toContain(DIVERGENT);
    expect(html).not.toContain("this always matches");
  });

  it("keeps the empty sentence where every step holds no condition", () => {
    const html = renderPanel(stepsWith(undefined, undefined), "field_a");

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
    ["Total Amount", "grammar", "A key starts with a letter or an underscore and holds only lower-case letters, digits and underscores."],
    ["status", "taken", "Status already uses this key."],
    ["", "empty", "Type a key, or press Escape to keep the current one."],
  ];
  for (const [typed, problem, sentence] of refused) {
    it(`refuses ${JSON.stringify(typed)}, keeps the typed text and leaves the draft as it was`, () => {
      const draft = stepDraft([amount(), fld("field_status", "status", { label: { en: "Status" } })], "data.amount > 1000.0");
      const before = structuredClone(draft);
      const { mutate, calls } = applyingMutate(draft);
      const result = commitKeyInput(draft, mutate, fieldOf(draft, "field_amount"), typed);

      expect(result).toEqual({ typed, problem: problem as KeyCommitProblem, wrote: false, rewrote: 0 });
      expect(calls()).toBe(0);
      expect(draft).toEqual(before);
      expect(keyRefusalFor(result.problem!, keyHolderName(draft, fieldOf(draft, "field_amount"), typed, "en"))).toBe(sentence);
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
    const shown = nextRewriteLine({ count: undefined, write: 0 }, 2);
    expect(nextRewriteLine(shown, 0)).toBe(shown);
    expect(source).toContain("const noteRewrites = (rewrote: number) => setRewriteLine((state) => nextRewriteLine(state, rewrote));");
  });

  // A screen reader announces a live region's change. The same count twice
  // changes no text, so the text node is keyed on the write and replaced.
  it("takes a new write for a second rewrite with the same count, and keys the line's text on it", () => {
    const first = nextRewriteLine({ count: undefined, write: 0 }, 1);
    const second = nextRewriteLine(first, 1);

    expect(first).toEqual({ count: 1, write: 1 });
    expect(second).toEqual({ count: 1, write: 2 });
    expect(source).toContain("<span key={rewriteLine.write}>{rewriteLineFor(rewriteLine.count)}</span>");
  });
});

/** One compiled style's body in `FieldCatalogPanel.tsx`, from its name to its close. */
const panelRule = (name: string) => {
  const start = source.indexOf(`  ${name}: {`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n  },", start));
};

describe("the key's notes and refusal", () => {
  const keyInputSource = () => source.slice(source.indexOf("function FieldKeyInput("), source.indexOf("/**\n * Applies a kind switch"));

  it("announces a refusal as an alert, in the warning callout", () => {
    expect(keyInputSource()).toContain('<p id={refusalId} role="alert" {...stylex.props(styles.studioWarning, styles.studioRefusalAtInput)}>');
  });

  it("prints the key notice as a plain muted note, with no advisory rule", () => {
    expect(keyInputSource()).toContain("<p id={noticeId} {...stylex.props(styles.studioNote)}>");
    expect(panelRule("studioNote")).not.toContain("borderLeft");
  });

  it("puts space under the rewrite line, so it reads with the label above", () => {
    expect(panelRule("rewriteLineShown")).toContain("marginBlockEnd: space.s2");
  });

  it("gives the field editor's Developer views the condition input's summary look", () => {
    const summary = panelRule("studioDevviewSummary");
    expect(summary).toContain("fontSize: 11");
    expect(summary).toContain('textTransform: "uppercase"');
    expect(summary).toContain('letterSpacing: "0.1em"');
    expect(summary).not.toContain("fonts.mono");
    expect(panelRule("studioDevview")).toContain("borderTopWidth: 1");
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
  return renderPanel(draft, selectedId, { published, issues });
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
  it("holds the key input behind a closed Developer view, last in More, after the move control", () => {
    const html = renderKeyEditor(draftWithReaders([]), "field_amount", new Set());
    const detailsAt = html.lastIndexOf("<details", html.indexOf(">Key<"));
    const inputAt = html.indexOf(keyInput(html));

    expect(keyDetails(html)).not.toContain("open");
    expect(html.slice(detailsAt, inputAt)).toContain(">Developer view</summary>");
    expect(html.indexOf("</details>", detailsAt)).toBeGreaterThan(inputAt);
    expect(html.indexOf(">More</h4>")).toBeLessThan(detailsAt);
    expect(html.indexOf(`id="${moveControlId("field_amount")}"`)).toBeLessThan(detailsAt);
    expect(html.indexOf(`id="${removeControlId("field_amount")}"`)).toBeGreaterThan(html.indexOf("</details>", detailsAt));
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

    expect(commit).toContain("aria-invalid={refusal !== undefined ? true : undefined}");
    expect(commit).toContain("const describedBy = [refusalId, noticeId]");
    const typing = commit.slice(commit.indexOf("onChange={(e) =>"), commit.indexOf("onBlur={commit}"));
    expect(typing).toContain("setRefusal(undefined);");
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
 * Asked on's empty-state route (`studio-app`: "The effect half states its own
 * empty state"). It opens the form editor for the first step a person works,
 * `firstWorkedStepId` (`studio-performedBy.test.ts` covers the pick), and
 * stands absent where no such step exists. A static render fires no click, so
 * the press's target is pinned at the source.
 */
describe("Asked on's route to a step's form", () => {
  const ROUTE = "Put this field on a step";
  const task = (id: string, extra: object = {}) => ({ id, key: id, label: { en: id }, type: "task", ...extra });
  const routeDraft = (initialStep: string, steps: object[]): Draft =>
    ({ baseLocale: "en", fields: [fld("field_a", "a")], workflow: { initialStep, steps } }) as unknown as Draft;

  it("opens the form of the first step a person works", () => {
    const html = renderPanel(routeDraft("step_a", [task("step_a"), task("step_b", { terminal: true })]), "field_a");
    const emptyAt = source.indexOf('t("fieldCatalog.usedInEmpty")');
    const emptyState = source.slice(emptyAt, source.indexOf('t("fieldCatalog.effectEmptyRoute")', emptyAt));

    expect(html).toContain(`>${ROUTE}</button>`);
    expect(source).toContain("const routeStepId = firstWorkedStepId(draft);");
    expect(emptyState).toContain("onClick={() => onOpenForm(routeStepId)}");
    expect(emptyState).not.toContain("onShowStep(");
  });

  it("skips an initial step that calls another process", () => {
    const html = renderPanel(routeDraft("step_a", [task("step_a", { type: "subprocess" }), task("step_b")]), "field_a");

    expect(html).toContain(`>${ROUTE}</button>`);
  });

  it("offers no route where no step is one a person works", () => {
    const html = renderPanel(routeDraft("step_a", [task("step_a", { type: "subprocess" }), task("step_b", { terminal: true })]), "field_a");

    expect(html).toContain("No step asks for this field yet.");
    expect(html).not.toContain(ROUTE);
  });

  it("wires each row's commands to the form editor and the map", () => {
    const rows = source.slice(source.indexOf("{asked.map((row) => ("), source.indexOf("</ul>", source.indexOf("{asked.map((row) => (")));

    expect(rows).toContain("onClick={() => onOpenForm(row.stepId)}");
    expect(rows).toContain("onClick={() => onShowStep(row.stepId)}");
  });
});

// `studio-app`: "The field editor lists what reads the field" and "A Read by
// row opens the place it names".
describe("the Read by section", () => {
  const amount = (extra: object = {}) => fld("field_amount", "amount", { label: { en: "Amount" }, type: "number", ...extra });
  const reviewStep = (guards: string[]) => ({
    id: "step_review",
    key: "review",
    label: { en: "Review" },
    type: "task",
    paths: guards.map((src, i) => ({ id: `path_${i}`, key: `p${i}`, label: "Approve", to: "step_book", trigger: "automatic", priority: i, guard: cel(src) })),
  });
  const guardDraft = (fields: DraftField[], guards: string[]): Draft =>
    ({
      baseLocale: "en",
      fields,
      workflow: {
        initialStep: "step_review",
        steps: [reviewStep(guards), { id: "step_book", key: "book", label: { en: "Book" }, type: "task" }],
      },
    }) as unknown as Draft;
  const section = (html: string) => sectionOf(html, "Read by");

  it("reads a guard as its way out and its sentence, with an Open command", () => {
    const html = section(renderPanel(guardDraft([amount()], ["data.amount > 1000.0"]), "field_amount"));

    expect(html).toContain(">On Review: way out Approve → Book<");
    expect(html).toContain(">Amount is greater than 1,000.<");
    const open = buttonElements(html);
    expect(open).toHaveLength(1);
    expect(open[0]).toEndWith(">Open</button>");
    expect(open[0]).toContain('class="btn btn-ghost command"');
  });

  it("draws no Open on a fallback row", () => {
    const html = section(renderPanel(draftWithReaders(["data.amount > 1.0"]), "field_amount"));

    expect(html).toContain(">Another rule in this process<");
    expect(buttonElements(html)).toHaveLength(0);
  });

  it("hands the row's own target to onOpenPlace", () => {
    expect(source).toContain("onClick={() => row.target && onOpenPlace(row.target)}");
  });

  it("says so where nothing reads the field", () => {
    const html = section(renderPanel(guardDraft([amount()], []), "field_amount"));

    expect(html).toContain(">No condition reads this field.<");
    expect(html).not.toContain("<li");
  });

  it("prints no CEL and no key over three readers", () => {
    const html = section(renderPanel(guardDraft([amount()], ["data.amount > 1000.0", "data.amount < 5.0", "data.amount == 7.0"]), "field_amount"));

    expect(html.match(/<li/g)?.length).toBe(3);
    expect(html).not.toContain("data.");
    expect(html).not.toContain("amount");
    expect(html).not.toContain("field_amount");
  });

  it("stands after Asked on", () => {
    const order = headings(renderPanel(guardDraft([amount()], []), "field_amount"));

    expect(order.indexOf("Read by")).toBe(order.indexOf("Asked on") + 1);
  });

  it("memoizes its rows on the draft, the key and the locale", () => {
    expect(source).toContain("readByRows(draft, fieldKey, contentLocale)");
    expect(source).toContain("[draft, fieldKey, contentLocale, isGroup]");
  });
});

// The fix wave after the browser check: Asked on prints no "Writes to:" line,
// reads a requiredness disagreement as a note over an indeterminate box, and a
// group's card holds neither the box nor a condition.
describe("Asked on's notes and a group's card", () => {
  const twoSteps = (a: object, b: object, field: DraftField = fld("field_a", "a")): Draft =>
    draftOf([field], [step("step_a", "A", [{ ref: field.id, ...a }]), step("step_b", "B", [{ ref: field.id, ...b }])]);

  it("prints no Writes to line under the rows or under Only ask this when", () => {
    const html = renderPanel(twoSteps({ required: true }, { visible: cel('data.a == "x"') }), "field_a");

    expect(sectionOf(html, "Asked on")).not.toContain("Writes to");
  });

  it("reads a requiredness disagreement as a ruled note, not a warning", () => {
    const asked = sectionOf(renderPanel(twoSteps({ required: true }, {}), "field_a"), "Asked on");
    const at = asked.indexOf("These steps currently disagree");
    const tag = asked.slice(asked.lastIndexOf("<p", at), at);

    expect(at).toBeGreaterThan(-1);
    expect(tag).toContain("studioNoteRuled");
    expect(tag).not.toContain("studioWarning");
  });

  it("keeps the condition disagreement in the warning tone", () => {
    const asked = sectionOf(renderPanel(twoSteps({ visible: cel('data.a == "x"') }, { visible: cel('data.a == "y"') }), "field_a"), "Asked on");
    const at = asked.indexOf("These steps currently disagree");
    const tag = asked.slice(asked.lastIndexOf("<p", at), at);

    expect(tag).toContain("studioWarning");
  });

  it("sets the box indeterminate while the steps disagree", () => {
    expect(source).toContain("requiredBox.current.indeterminate = requiredMixed");
    expect(source).toContain('const requiredMixed = requiredState.kind === "divergent"');
    expect(source).toContain("ref={requiredBox}");
  });

  it("keeps a group's rows and commands, and draws neither the box nor Only ask this when", () => {
    const group = grp("field_g", "g", [fld("field_c", "c")]);
    const html = renderPanel(twoSteps({}, {}, group), "field_g");
    const asked = sectionOf(html, "Asked on");

    expect(asked).toContain(">A<");
    expect(asked).toContain(">Open the form</button>");
    expect(asked).toContain(">Show on the map</button>");
    expect(asked).not.toContain("Required on every step that asks for it");
    expect(asked).not.toContain('type="checkbox"');
    expect(asked).not.toContain("Only ask this when");
  });
});

describe("the Kind note over a Text field with choices", () => {
  it("says one pick from the choices for a Text field with options", () => {
    const html = renderPanel(draftOf([fld("field_a", "a", { options: [{ value: "x", label: { en: "X" } }] })]), "field_a");
    const kind = sectionOf(html, "Kind");

    expect(kind).toContain(">One pick from the choices below.<");
    expect(kind).not.toContain(">A line of text.<");
  });

  it("says the same for a Text field bound to a data source", () => {
    const html = renderPanel(draftOf([fld("field_a", "a", { dataSource: "ds_a" })], [], { dataSources: [{ id: "ds_a", key: "src", type: "db.list", config: {} }] }), "field_a");

    expect(sectionOf(html, "Kind")).toContain(">One pick from the choices below.<");
  });

  it("keeps Text's own note with no choice", () => {
    expect(sectionOf(renderPanel(draftOf([fld("field_a", "a")]), "field_a"), "Kind")).toContain(">A line of text.<");
  });
});
