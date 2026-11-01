import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProcessTab } from "../src/areas/studio/routing.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { draftFields } from "../src/areas/studio/draft/fields.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FormEditorScreen, formCardBodyId, formCardNameInputId } from "../src/areas/studio/screens/FormEditorScreen.js";

/**
 * The form editor's names (`studio-form-editor`): a card prints its field's
 * label and kind and never its key, a field with no label keeps its name
 * input, and a breadcrumb leads out. A server render observes the first
 * draw, so `naming` stays unset here: the input below shows because the
 * label is empty in both the content locale and the base locale, the second
 * case of design.md D3.
 */

const AMOUNT = "field_00000000-0000-4000-8000-0000000000e1";
const FULL_NAME = "field_00000000-0000-4000-8000-0000000000e2";
const UNNAMED = "field_00000000-0000-4000-8000-0000000000e3";
const UNNAMED_GROUP = "field_00000000-0000-4000-8000-0000000000e4";
const REASON = "field_00000000-0000-4000-8000-0000000000e5";
const RAW = "field_00000000-0000-4000-8000-0000000000e6";

function validation(): ValidationResult {
  return {
    zodValid: true,
    issues: [],
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

function contextValue(draft: Draft, contentLocale: string): DraftContextValue {
  return {
    draft,
    mutate: () => {},
    replace: () => {},
    validation: validation(),
    loadedChildren: {},
    setChildForStep: () => {},
    registry: undefined,
    loadedChainingTargets: {},
    contentLocale,
    setContentLocale: () => {},
    usedLocales: [contentLocale],
    loadGeneration: 0,
  };
}

type Field = Record<string, unknown>;
type Entry = Record<string, unknown>;

/** One step whose view places `entries`, over the catalog `fields`. */
function draftWith(fields: Field[], entries: Entry[]): Draft {
  return {
    baseLocale: "en",
    fields,
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "approve_step",
          label: { en: "Approve" },
          type: "task",
          view: { fields: entries },
          paths: [{ id: "path_1", to: "step_b", trigger: "automatic", priority: 1 }],
        },
        { id: "step_b", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  } as unknown as Draft;
}

function render(draft: Draft, { contentLocale = "en", originTab = "steps" }: { contentLocale?: string; originTab?: ProcessTab } = {}): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(draft, contentLocale)}>
      <FormEditorScreen
        step={draft.workflow!.steps![0]!}
        index={0}
        fields={draftFields(draft)}
        onBack={() => {}}
        originTab={originTab}
        onOpenStep={() => {}}
      />
    </DraftContext.Provider>,
  );
}

/** The canvas region alone, bounded by its own `aria-label` and the
 * preview's, so a label the preview prints too cannot satisfy a search. */
function canvasHtml(html: string): string {
  const start = html.indexOf('aria-label="Form layout"');
  const end = html.indexOf('aria-label="What a participant meets"');
  expect(start, "expected to find the canvas region").toBeGreaterThan(-1);
  expect(end, "expected to find the preview pane").toBeGreaterThan(-1);
  return html.slice(start, end);
}

/** The header alone, from its opening tag to its close. */
function headerHtml(html: string): string {
  const start = html.indexOf("<header");
  const end = html.indexOf("</header>");
  expect(start, "expected to find the editor's header").toBeGreaterThan(-1);
  return html.slice(start, end + "</header>".length);
}

/** One card's own `<li>`, found by a text it holds. A leaf card nests no
 * `<li>`, so the nearest enclosing pair bounds it. */
function cardBlock(region: string, marker: string): string {
  const at = region.indexOf(marker);
  expect(at, `expected to find "${marker}"`).toBeGreaterThan(-1);
  return region.slice(region.lastIndexOf("<li", at), region.indexOf("</li>", at) + "</li>".length);
}

/** The opening tag of the element carrying `id`. */
function tagWithId(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  expect(at, `expected an element with id "${id}"`).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf(">", at) + 1);
}

describe("A field with no label keeps its name input", () => {
  const draft = draftWith(
    [
      { id: UNNAMED, key: "", type: "number", label: { en: "" } },
      { id: UNNAMED_GROUP, key: "", type: "group", label: {}, fields: [] },
    ],
    [{ ref: UNNAMED }, { ref: UNNAMED_GROUP }],
  );

  it("shows the input on an unnamed leaf card, in place of its draggable control", () => {
    const canvas = canvasHtml(render(draft));
    const input = tagWithId(canvas, formCardNameInputId(UNNAMED));

    expect(input.startsWith("<input")).toBe(true);
    expect(canvas).not.toContain(`id="${formCardBodyId(UNNAMED)}"`);
    expect(cardBlock(canvas, formCardNameInputId(UNNAMED))).toContain(">Number<");
  });

  it("shows the input on an unnamed group card's legend, beside its move and Remove controls", () => {
    const canvas = canvasHtml(render(draft));
    const legendStart = canvas.lastIndexOf("<legend", canvas.indexOf(formCardNameInputId(UNNAMED_GROUP)));
    const legend = canvas.slice(legendStart, canvas.indexOf("</legend>", legendStart));

    expect(legend).toContain(`id="${formCardNameInputId(UNNAMED_GROUP)}"`);
    expect(legend).toContain(">Move up<");
    expect(legend).toContain(">Remove (0)<");
    expect(canvas).not.toContain(`id="${formCardBodyId(UNNAMED_GROUP)}"`);
  });

  it("names the input Field name, with the placeholder Name this field…", () => {
    const input = tagWithId(canvasHtml(render(draft)), formCardNameInputId(UNNAMED));

    expect(input).toContain('aria-label="Field name"');
    expect(input).toContain('placeholder="Name this field…"');
    expect(input).toMatch(/autocomplete="off"/i);
  });
});

describe("A label in either locale keeps the card's own control", () => {
  it("prints a base-locale label when the content locale has none, and shows no input", () => {
    const draft = draftWith([{ id: AMOUNT, key: "amount", type: "number", label: { en: "Amount" } }], [{ ref: AMOUNT }]);
    const canvas = canvasHtml(render(draft, { contentLocale: "de" }));

    expect(tagWithId(canvas, formCardBodyId(AMOUNT)).startsWith("<button")).toBe(true);
    expect(cardBlock(canvas, formCardBodyId(AMOUNT))).toContain(">Amount<");
    expect(canvas).not.toContain(formCardNameInputId(AMOUNT));
  });

  it("prints the base-locale label when the content locale's entry was cleared, and shows no input", () => {
    const draft = draftWith([{ id: AMOUNT, key: "amount", type: "number", label: { en: "Amount", de: "" } }], [{ ref: AMOUNT }]);
    const canvas = canvasHtml(render(draft, { contentLocale: "de" }));

    expect(cardBlock(canvas, formCardBodyId(AMOUNT))).toContain(">Amount<");
    expect(canvas).not.toContain(formCardNameInputId(AMOUNT));
  });
});

describe("A placed field's card prints its label and its kind", () => {
  const draft = draftWith(
    [
      { id: FULL_NAME, key: "full_name", type: "string", label: { en: "First and last name" } },
      { id: REASON, key: "reason", type: "string", label: { en: "Reason" } },
    ],
    [
      { ref: FULL_NAME, required: true },
      { ref: REASON, visible: { lang: "cel", src: "data.full_name != \"\"" } },
      { kind: "note", text: { en: "Read this first" } },
    ],
  );

  it("reads the label and the kind name, and prints no key", () => {
    const canvas = canvasHtml(render(draft));
    const card = cardBlock(canvas, "First and last name");

    expect(card).toContain(">First and last name<");
    expect(card).toContain(">Text<");
    expect(card).toContain("<svg");
    expect(card).not.toContain("full_name");
    expect(card).not.toContain(">string<");
  });

  it("marks a literal override in words and prints no width mark", () => {
    const card = cardBlock(canvasHtml(render(draft)), "First and last name");

    expect(card).toContain(">Required<");
    expect(card).not.toContain(">Condition<");
    expect(card).not.toContain("1/1");
  });

  it("marks an expression override as Condition, and prints no CEL", () => {
    const card = cardBlock(canvasHtml(render(draft)), ">Reason<");

    expect(card).toContain(">Condition<");
    expect(card).not.toContain("CEL");
  });

  it("prints a note's text and the kind word Note", () => {
    const card = cardBlock(canvasHtml(render(draft)), "Read this first");

    expect(card).toContain(">Note<");
  });

  // Design-language rule 4: a triple no curated kind names prints as its raw
  // members, a machine value. The stylex stub renders a style's key as its
  // class, so the markup names the compiled style and the source pins what it
  // declares.
  it("prints a triple no kind names in mono, and a named kind in the Label role alone", () => {
    const raw = draftWith(
      [
        { id: RAW, key: "contact", type: "string", format: "email", control: "multiline", label: { en: "Contact" } },
        { id: AMOUNT, key: "amount", type: "number", label: { en: "Amount" } },
      ],
      [{ ref: RAW }, { ref: AMOUNT }],
    );
    const canvas = canvasHtml(render(raw));
    const source = readFileSync(new URL("../src/areas/studio/screens/FormEditorScreen.tsx", import.meta.url), "utf-8");
    const start = source.indexOf("  formCardKindRaw: {");
    const rule = source.slice(start, source.indexOf("\n  },", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("fontFamily: fonts.mono");
    expect(rule).toContain('textTransform: "none"');
    expect(cardBlock(canvas, ">Contact<")).toMatch(/<span class="[^"]*formCardKindRaw[^"]*"><svg[\s\S]*?<\/svg>string \/ email \/ multiline<\/span>/);
    expect(cardBlock(canvas, ">Amount<")).not.toContain("formCardKindRaw");
  });
});

describe("The breadcrumb leads out of the form editor", () => {
  const draft = draftWith([{ id: AMOUNT, key: "amount", type: "number", label: { en: "Amount" } }], [{ ref: AMOUNT }]);

  it("reads Steps, the step's label, then Form, in a navigation landmark named Breadcrumb", () => {
    const header = headerHtml(render(draft));

    expect(header).toContain('<nav aria-label="Breadcrumb">');
    expect(header).toMatch(/<button type="button"[^>]*>Steps<\/button>/);
    expect(header).toMatch(/<button type="button"[^>]*>Approve<\/button>/);
    expect(header).toMatch(/<span aria-current="page"[^>]*>Form<\/span>/);
    expect(header).not.toMatch(/<button[^>]*>Form<\/button>/);
    expect(header.indexOf(">Steps<")).toBeLessThan(header.indexOf(">Approve<"));
    expect(header.indexOf(">Approve<")).toBeLessThan(header.indexOf(">Form<"));
  });

  it("names the Forms tab first after a Forms card opened the editor", () => {
    expect(headerHtml(render(draft, { originTab: "forms" }))).toMatch(/<button type="button"[^>]*>Forms<\/button>/);
  });

  it("prints a dollar pattern in the step's label verbatim in the title", () => {
    const dollar = draftWith([], []);
    dollar.workflow!.steps![0]!.label = { en: "Pay $& now" };

    expect(headerHtml(render(dollar))).toMatch(/<h2[^>]*>The form for Pay \$&amp; now<\/h2>/);
  });

  it("titles the editor with the step's label, never its key", () => {
    const header = headerHtml(render(draft));

    expect(header).toMatch(/<h2[^>]*>The form for Approve<\/h2>/);
    expect(header).not.toContain("approve_step");
    expect(header).not.toContain("Back to the process");
  });
});

describe("The palette offers every curated kind", () => {
  it("lists sixteen kinds from Text to Group, each with its icon", () => {
    const html = render(draftWith([], []));
    const start = html.indexOf(">Add a field to the process<");
    const end = html.indexOf(">Notes<", start);
    const section = html.slice(start, end);
    const rows = section.match(/<li>/g) ?? [];

    expect(rows).toHaveLength(16);
    expect((section.match(/<svg/g) ?? []).length).toBe(16);
    expect(section.indexOf(">Text<")).toBeLessThan(section.indexOf(">Group<"));
    expect(section).toContain(">Number<");
  });
});

describe("A card reads its label, then its kind and marks on one line", () => {
  const draft = draftWith(
    [{ id: FULL_NAME, key: "full_name", type: "string", label: { en: "First and last name" } }],
    [{ ref: FULL_NAME, required: true, readonly: true }],
  );

  it("puts Required and Read-only after the kind word, in the kind line's own row", () => {
    const card = cardBlock(canvasHtml(render(draft)), "First and last name");
    const start = card.indexOf('class="formCardKindRow"');
    expect(start, "expected the card's kind row").toBeGreaterThan(-1);
    const row = card.slice(start);

    expect(row.indexOf(">Text<")).toBeGreaterThan(-1);
    expect(row.indexOf(">Text<")).toBeLessThan(row.indexOf(">Required<"));
    expect(row.indexOf(">Required<")).toBeLessThan(row.indexOf(">Read-only<"));
    expect(card.indexOf(">First and last name<")).toBeLessThan(start);
  });
});

describe("A card's controls name the entry they act on", () => {
  const GROUP = "field_00000000-0000-4000-8000-0000000000e7";
  const draft = draftWith(
    [
      { id: AMOUNT, key: "amount", type: "number", label: { en: "Cost $&" } },
      { id: GROUP, key: "applicant", type: "group", label: { en: "Applicant" }, fields: [] },
    ],
    [{ ref: AMOUNT }, { kind: "note", text: { en: "Read this first" } }, { ref: GROUP }],
  );
  const canvas = canvasHtml(render(draft));

  it("names the field in each leaf control and keeps the short visible text", () => {
    const card = cardBlock(canvas, formCardBodyId(AMOUNT));

    expect(card).toContain('aria-label="Move Cost $&amp; up"');
    expect(card).toContain('aria-label="Move Cost $&amp; down"');
    expect(card).toContain('aria-label="Remove Cost $&amp;"');
    expect(card).toContain(">Move up<");
    expect(card).toContain(">Remove<");
  });

  it("names a note as the note", () => {
    const card = cardBlock(canvas, "Read this first");

    expect(card).toContain('aria-label="Move the note up"');
    expect(card).toContain('aria-label="Move the note down"');
    expect(card).toContain('aria-label="Remove the note"');
  });

  it("names the group in a group card's controls", () => {
    const legendStart = canvas.lastIndexOf("<legend", canvas.indexOf(formCardBodyId(GROUP)));
    const legend = canvas.slice(legendStart, canvas.indexOf("</legend>", legendStart));

    expect(legend).toContain('aria-label="Move Applicant up"');
    expect(legend).toContain('aria-label="Move Applicant down"');
    expect(legend).toContain('aria-label="Remove Applicant"');
    expect(legend).toContain(">Remove (0)<");
  });
});

describe("The editor's controls keep their shared button classes", () => {
  const html = render(draftWith([], []));

  it("joins .btn with the compiled style on the Columns options and Add a note", () => {
    expect(html).toMatch(/<button type="button" class="btn btn-secondary formColumnsOptionPressed" aria-pressed="true">One<\/button>/);
    expect(html).toMatch(/<button type="button" class="btn btn-secondary" aria-pressed="false">Two<\/button>/);
    expect(html).toMatch(/<button type="button" class="btn btn-secondary formAddNote">Add a note<\/button>/);
  });

  it("lets the heading take the focus the editor hands it on open", () => {
    expect(headerHtml(html)).toMatch(/<h2 id="form-editor-heading" tabindex="-1"/);
  });
});

/** The source pins a server render cannot observe: a focus handler, and the
 * declarations of three compiled styles the stub renders as bare keys. */
describe("What a server render cannot show", () => {
  const source = readFileSync(new URL("../src/areas/studio/screens/FormEditorScreen.tsx", import.meta.url), "utf-8");
  const rule = (name: string) => {
    const start = source.indexOf(`  ${name}: {`);
    expect(start, `expected the style ${name}`).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf("\n  },", start));
  };

  // A focus event needs a DOM, and this suite has none: the pin holds the
  // wrapper's handler, which sets `naming` so a revisited empty input stays.
  it("starts the naming when the name input takes the focus", () => {
    expect(source).toMatch(/<div \{\.\.\.stylex\.props\(styles\.formCardNameBox\)\} onKeyDown=\{onKeyDown\} onFocus=\{onFocus\} onBlur=\{onBlur\}>/);
    expect(source).toContain("const nameFocus = (fieldId: FieldId) => () => setNaming(fieldId);");
    expect((source.match(/onFocus=\{nameFocus\(field\.id as FieldId\)\}/g) ?? []).length).toBe(2);
  });

  it("dashes only the mint row's bottom hairline", () => {
    const mint = rule("formPaletteFieldMint");

    expect(mint).toContain('borderBottomStyle: "dashed"');
    expect(mint).not.toMatch(/\bborderStyle:/);
  });

  it("gives the Developer view's summary a 24px target", () => {
    expect(rule("studioDevviewSummary")).toContain("minHeight: 24");
  });
});
