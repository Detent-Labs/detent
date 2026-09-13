import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FormsTab } from "../src/areas/studio/panels/FormsTab.js";

/**
 * The Forms tab as it renders (`studio-forms-overview`). The row set, the
 * counts and the miniature's own values are asserted in
 * `studio-formCardRows.test.ts`; this covers what only the markup can say —
 * the legend, the control naming its own act and its step's heading, the
 * badge's sentence, and the miniature taking no keyboard focus.
 *
 * `FormsTab` reads `draft`, `validation` and `contentLocale` off `useDraft()`,
 * so the test supplies `DraftContext.Provider` directly rather than a live
 * `DraftProvider`, the way `studio-stepsRail.test.tsx` already does.
 */

const AMOUNT = "field_00000000-0000-4000-8000-0000000000a1";

function validation(issues: EditorIssue[]): ValidationResult {
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

function contextValue(draft: Draft, issues: EditorIssue[]): DraftContextValue {
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

const DRAFT = {
  baseLocale: "en",
  fields: [{ id: AMOUNT, key: "amount", type: "number", label: { en: "Amount" } }],
  workflow: {
    initialStep: "step_a",
    steps: [
      {
        id: "step_a",
        key: "intake",
        label: { en: "Intake" },
        type: "task",
        view: { fields: [{ ref: AMOUNT, required: true }] },
        paths: [{ id: "path_1", to: "step_b" }],
      },
      { id: "step_b", key: "review", label: { en: "Review" }, type: "task", view: { fields: [] } },
      { id: "step_c", key: "done", label: { en: "Done" }, type: "task", terminal: true },
    ],
  },
} as unknown as Draft;

/** A draft whose one step declares no view: the Forms tab holds no card. */
const NO_VIEW = {
  baseLocale: "en",
  workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "only", label: { en: "Only" }, type: "task" }] },
} as unknown as Draft;

function render(over: { draft?: Draft; issues?: EditorIssue[] } = {}): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(over.draft ?? DRAFT, over.issues ?? [])}>
      <FormsTab onOpenForm={() => {}} onOpenChecks={() => {}} />
    </DraftContext.Provider>,
  );
}

/** The grid's own label. The compiled `class` precedes `aria-label` on the
 * grid's `<ul>`, so a test finds the grid by the attribute alone. Nothing else
 * on the tab carries this label. */
const GRID_ANCHOR = 'aria-label="Forms in this process"';

/** Where the grid starts in the markup. The legend stands ahead of it, and its
 * sample groups carry `aria-hidden="true"` as the miniature does, so every
 * miniature lookup reads from this point onward. */
function gridStart(html: string): number {
  const start = html.indexOf(GRID_ANCHOR);
  expect(start).toBeGreaterThan(-1);
  return start;
}

/** Everything between the miniature's own `aria-hidden="true"` element and
 * its close, in the grid alone. The miniature carries no name and no role of
 * its own, so the element itself is what a test matches — a backreference to
 * the tag name, since the element is not pinned to one tag. */
function miniatures(html: string): string[] {
  const grid = html.slice(gridStart(html));
  return [...grid.matchAll(/<(\w+)[^>]*\saria-hidden="true"[^>]*>(.*?)<\/\1>/gs)].map((m) => m[2]!);
}

describe("The Forms tab's plates", () => {
  it("carries one plate per step declaring a view, and none for a step declaring none", () => {
    const html = render();

    expect(html).toContain("Intake");
    expect(html).toContain("Review");
    expect(html).not.toContain("Done");
  });

  it("names the step's kind above its label", () => {
    const html = render();

    expect(html.indexOf("Initial")).toBeLessThan(html.indexOf("Intake"));
  });

  it("states the count alone for a view of one optional entry", () => {
    const oneOptional = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          { ...DRAFT.workflow!.steps![0], view: { fields: [{ ref: AMOUNT }] } },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(render({ draft: oneOptional })).toContain(">1 field<");
  });

  it("states the required count beside the field count for one required entry", () => {
    // DRAFT: step_a's one entry declares `required: true`.
    expect(render()).toContain(">1 field, 1 required<");
  });

  it("states the required count beside several field entries", () => {
    const four = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: { fields: [{ ref: AMOUNT, required: true }, { ref: AMOUNT }, { ref: AMOUNT }, { ref: AMOUNT }] },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(render({ draft: four })).toContain(">4 fields, 1 required<");
  });

  it("counts a view holding several entries in its own sentence, with none required", () => {
    const four = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: { fields: [{ ref: AMOUNT }, { ref: AMOUNT }, { ref: AMOUNT }, { ref: AMOUNT }] },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(render({ draft: four })).toContain(">4 fields<");
  });

  it("holds the control alone in an empty card's foot, with no count span", () => {
    const html = render();
    const noFieldsIndex = html.indexOf("No fields yet");
    const startFormIndex = html.indexOf("Start the form");

    expect(html).not.toContain("Empty form");
    expect(noFieldsIndex).toBeGreaterThan(-1);
    expect(startFormIndex).toBeGreaterThan(noFieldsIndex);
    expect(html.slice(noFieldsIndex, startFormIndex)).not.toContain("<span");
  });

  it("offers to start the form on an empty one and to open an existing one", () => {
    const html = render();

    expect(html).toContain("Start the form");
    expect(html).toContain("Open the form");
  });

  it("puts the count in the foot, after the miniature and before the open control", () => {
    // studio-forms-overview: "The count stands beside the open control" —
    // the field count and the open control share the card's last row, after
    // the miniature that stands above it.
    const html = render();
    const miniatureIndex = html.indexOf('aria-hidden="true"', gridStart(html));
    const countIndex = html.indexOf(">1 field, 1 required<");
    const controlIndex = html.indexOf("Open the form");

    expect(miniatureIndex).toBeGreaterThan(-1);
    expect(countIndex).toBeGreaterThan(miniatureIndex);
    expect(controlIndex).toBeGreaterThan(countIndex);
  });

  it("says so in words when no step declares a form at all", () => {
    expect(render({ draft: NO_VIEW })).toContain("No step in this process declares a form yet.");
  });
});

/** The legend's own label. Like the grid's, it follows the compiled `class`,
 * so a test finds the legend by the attribute alone. */
const LEGEND_ANCHOR = 'aria-label="What the marks mean"';

/** The legend's `<ul>`: where its opening tag starts, the tag itself, and the
 * markup inside it. The legend holds no list of its own, so the first `</ul>`
 * after the tag closes it. */
function legend(html: string): { index: number; tag: string; inner: string } {
  const anchor = html.indexOf(LEGEND_ANCHOR);
  expect(anchor).toBeGreaterThan(-1);
  const index = html.lastIndexOf("<", anchor);
  const tagEnd = html.indexOf(">", anchor) + 1;
  return { index, tag: html.slice(index, tagEnd), inner: html.slice(tagEnd, html.indexOf("</ul>", tagEnd)) };
}

/** The markup inside each of the legend's `<li>` elements. */
function legendItems(html: string): string[] {
  return [...legend(html).inner.matchAll(/<li\b[^>]*>(.*?)<\/li>/gs)].map((m) => m[1]!);
}

/**
 * One item's markup, split at its `aria-hidden="true"` subtrees: the text a
 * screen reader reads, the text inside a hidden subtree, how many hidden
 * subtrees the item holds, and the `class` of each element inside them, in
 * order, `""` for an element carrying none. It reads the tags in order and
 * counts depth, so a subtree's nested `<span>` does not end the subtree early.
 */
function splitHidden(markup: string): { visible: string; hidden: string; groups: number; hiddenClasses: string[] } {
  const out = { visible: "", hidden: "", groups: 0, hiddenClasses: [] as string[] };
  // Elements open inside the current hidden subtree; 0 outside one.
  let depth = 0;
  for (const m of markup.matchAll(/<(\/?)\w+[^>]*>|[^<]+/g)) {
    const token = m[0];
    if (!token.startsWith("<")) {
      if (depth > 0) out.hidden += token;
      else out.visible += token;
    } else if (m[1] === "/") {
      if (depth > 0) depth--;
    } else if (depth > 0) {
      depth++;
      out.hiddenClasses.push(/\sclass="([^"]*)"/.exec(token)?.[1] ?? "");
    } else if (/\saria-hidden="true"/.test(token)) {
      depth = 1;
      out.groups++;
    }
  }
  return out;
}

describe("The Forms tab's legend", () => {
  it("stands ahead of the grid as one list, named for what it explains", () => {
    const html = render();
    const { index, tag } = legend(html);

    expect(html.split(LEGEND_ANCHOR)).toHaveLength(2);
    expect(tag).toMatch(/^<ul\b/);
    expect(tag).toContain('role="list"');
    expect(index).toBeLessThan(gridStart(html));
  });

  it("names the five marks in the legend table's order, one item each", () => {
    expect(legendItems(render()).map((item) => splitHidden(item).visible)).toEqual([
      "field",
      "required",
      "required if a condition holds",
      "section",
      "taller asks for more",
    ]);
  });

  it("hides each item's sample group from a screen reader and keeps the item's words outside it", () => {
    const items = legendItems(render()).map(splitHidden);

    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.groups).toBe(1);
      expect(item.hidden).toBe("");
    }
  });

  it("draws each sample with the class stack the miniature gives the mark it names", () => {
    // A miniature holding an ordinary, a required and a CEL-conditional entry,
    // then a group entry, in that order.
    const SECTION = "field_00000000-0000-4000-8000-0000000000a5";
    const fourMarks = {
      ...DRAFT,
      fields: [...DRAFT.fields!, { id: SECTION, key: "section", type: "group", label: { en: "Section" } }],
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: {
              fields: [
                { ref: AMOUNT },
                { ref: AMOUNT, required: true },
                { ref: AMOUNT, required: { lang: "cel", src: "data.amount > 100" } },
                { ref: SECTION },
              ],
            },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;
    const [inner] = miniatures(render({ draft: fourMarks }));
    const miniatureClasses = [...inner!.matchAll(/<span class="([^"]*)"/g)].map((m) => m[1]!);

    // Four styled marks that differ, so an unstyled sample matches none.
    expect(miniatureClasses).toHaveLength(4);
    expect(new Set(miniatureClasses).size).toBe(4);
    expect(miniatureClasses).not.toContain("");
    const [outline, fill, dash, groupBreak] = miniatureClasses;

    // One mark each for field, required, the conditional and the section's
    // group break; three outlines for the heights.
    expect(legendItems(render()).map((item) => splitHidden(item).hiddenClasses)).toEqual([
      [outline],
      [fill],
      [dash],
      [groupBreak],
      [outline, outline, outline],
    ]);
  });

  it("takes no keyboard focus, so a walk with the Tab key never lands inside it", () => {
    const { tag, inner } = legend(render());
    const markup = tag + inner;

    expect(markup).toContain("<li");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("tabindex");
  });

  it("stands on no tab without a card", () => {
    const html = render({ draft: NO_VIEW });

    expect(html).toContain("No step in this process declares a form yet.");
    expect(html).not.toContain("What the marks mean");
    expect(html).not.toContain("taller asks for more");
  });
});

describe("A plate's miniature", () => {
  it("draws one miniature per plate whose view holds a field entry", () => {
    // DRAFT: step_a holds one field entry, step_b's view is empty and draws
    // "No fields yet" in the miniature's place instead, step_c has no view.
    expect(miniatures(render())).toHaveLength(1);
  });

  it("takes no keyboard focus, so a walk with the Tab key never lands inside one", () => {
    const inners = miniatures(render());
    expect(inners.length).toBeGreaterThan(0);
    for (const inner of inners) {
      expect(inner).not.toContain("<button");
      expect(inner).not.toContain("<a ");
      expect(inner).not.toContain("tabindex");
    }
  });

  it("carries no name and no role of its own, so a screen reader hears the counts once, from the foot", () => {
    // step_a's view holds one required entry; the foot already states "1
    // field, 1 required" (see "The Forms tab's plates" above) — the
    // miniature must add nothing to what a screen reader reads.
    const html = render();

    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('aria-label="1 field, 1 required"');
  });

  it("says the form has no fields yet where the miniature would stand on an empty view", () => {
    expect(render()).toContain("No fields yet");
  });

  it("keeps the empty form's sentence in the accessibility tree", () => {
    const html = render();
    const sentence = html.match(/<p[^>]*>No fields yet<\/p>/);

    expect(sentence).not.toBeNull();
    expect(sentence![0]).not.toContain("aria-hidden");
  });

  it("names a view holding only a note as an empty form, offering to start it", () => {
    // Only step_a and step_c: step_b is dropped so this card is the only
    // source of "No fields yet"/"Start the form" in the render, and the
    // negative assertions below have something to catch a notes-only card
    // drawn as non-empty.
    const notesOnly = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          { ...DRAFT.workflow!.steps![0], view: { fields: [{ kind: "note", text: { en: "Read this first" } }] } },
          DRAFT.workflow!.steps![2],
        ],
      },
    } as unknown as Draft;
    const html = render({ draft: notesOnly });

    expect(html).toContain("No fields yet");
    expect(html).toContain("Start the form");
    expect(html).not.toContain("Open the form");
    expect(miniatures(html)).toHaveLength(0);
  });

  it("names a view holding only a group entry as an empty form, offering to start it", () => {
    // Same fixture shape as the notes-only test: step_b is dropped, so this
    // card alone can supply the empty-form texts.
    const SECTION = "field_00000000-0000-4000-8000-0000000000a5";
    const groupOnly = {
      ...DRAFT,
      fields: [...DRAFT.fields!, { id: SECTION, key: "section", type: "group", label: { en: "Section" } }],
      workflow: {
        ...DRAFT.workflow,
        steps: [{ ...DRAFT.workflow!.steps![0], view: { fields: [{ ref: SECTION }] } }, DRAFT.workflow!.steps![2]],
      },
    } as unknown as Draft;
    const html = render({ draft: groupOnly });

    expect(html).toContain("No fields yet");
    expect(html).toContain("Start the form");
    expect(html).not.toContain("Open the form");
    expect(miniatures(html)).toHaveLength(0);
  });

  it("gives a required, a CEL-conditional and an ordinary entry's marks three different compiled classes", () => {
    const threeEntries = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: {
              fields: [
                { ref: AMOUNT, required: true },
                { ref: AMOUNT, required: { lang: "cel", src: "data.amount > 100" } },
                { ref: AMOUNT },
              ],
            },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;
    const [inner] = miniatures(render({ draft: threeEntries }));
    const classes = [...inner!.matchAll(/<span class="([^"]*)"/g)].map((m) => m[1]);

    // A solid fill, a dashed outline and an ordinary outline.
    expect(classes).toHaveLength(3);
    expect(new Set(classes).size).toBe(3);
  });
});

/** One HTML attribute's value off a tag string, or `undefined` where the tag
 * carries none. Reads the attribute by name, so the test does not depend on
 * `useId`'s id format. */
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}
describe("A plate's open control", () => {
  it("names its step through aria-labelledby: its own id, then the h2 heading holding the step label", () => {
    const html = render();
    const controls = [...html.matchAll(/<button\b[^>]*>/g)]
      .map((m) => m[0])
      .map((tag) => ({ id: attr(tag, "id"), labelledby: attr(tag, "aria-labelledby") }))
      .filter((c): c is { id: string; labelledby: string } => c.id !== undefined && c.labelledby !== undefined);

    // step_a ("Intake") and step_b ("Review") each carry one open control;
    // the issue badge button carries no `aria-labelledby`, so it is not here.
    expect(controls).toHaveLength(2);

    const names = controls.map(({ id, labelledby }) => {
      const [ownIdRef, nameIdRef] = labelledby.split(" ");
      expect(ownIdRef).toBe(id);
      expect(nameIdRef).toBeTruthy();
      // By the `id` attribute alone: the compiled `class` may precede it.
      const heading = new RegExp(`<h2\\b[^>]*\\sid="${nameIdRef}"[^>]*>([^<]*)</h2>`).exec(html);
      expect(heading).not.toBeNull();
      // A heading cannot sit inside a span: every span opened ahead of the
      // heading has closed by the time it starts.
      const before = html.slice(0, heading!.index);
      expect(before.match(/<span\b/g)?.length ?? 0).toBe(before.match(/<\/span>/g)?.length ?? 0);
      return heading![1];
    });

    expect(names).toEqual(["Intake", "Review"]);
    expect(names[0]).not.toBe(names[1]);
  });
});

describe("A plate's issue badge", () => {
  const ISSUE: EditorIssue = {
    entityType: "step",
    entityId: "step_a",
    message: "view ref does not resolve",
    source: "zod",
    loc: "workflow.steps[0].view.fields[0].ref",
  };

  it("reads the number of open issues naming that step's view, then the step, in one sentence", () => {
    expect(render({ issues: [ISSUE, { ...ISSUE, message: "a second one" }] })).toContain(
      'aria-label="2 open issues on Intake"',
    );
  });

  it("names one issue in the singular, in one sentence naming the step", () => {
    expect(render({ issues: [ISSUE] })).toContain('aria-label="1 open issue on Intake"');
  });

  it("gives two cards' badges different names, each naming its own step", () => {
    // step_b's view is empty, and an issue naming it still reaches its card.
    const reviewIssue: EditorIssue = { ...ISSUE, entityId: "step_b", loc: "workflow.steps[1].view.fields[0].ref" };
    const html = render({ issues: [ISSUE, reviewIssue] });
    const names = [...html.matchAll(/aria-label="([^"]*open issues? on[^"]*)"/g)].map((m) => m[1]);

    expect(names).toEqual(["1 open issue on Intake", "1 open issue on Review"]);
  });

  it("prints a step label holding a replacement pattern as the author typed it", () => {
    const dollar = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [{ ...DRAFT.workflow!.steps![0], label: { en: "$&" } }, ...DRAFT.workflow!.steps!.slice(1)],
      },
    } as unknown as Draft;

    // The markup escapes the ampersand.
    expect(render({ draft: dollar, issues: [ISSUE] })).toContain('aria-label="1 open issue on $&amp;"');
  });

  it("fills the count before the step, so a label holding {count} prints as the author typed it", () => {
    const braces = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          { ...DRAFT.workflow!.steps![0], label: { en: "Collect {count} signatures" } },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    // One issue: the singular sentence holds no `{count}` of its own, so a
    // step-first fill would put the count into the label.
    expect(render({ draft: braces, issues: [ISSUE] })).toContain(
      'aria-label="1 open issue on Collect {count} signatures"',
    );
  });

  it("draws no badge on a plate whose view draws no issue", () => {
    // The same tab with one issue prints the words, so the negative below has
    // something to catch.
    expect(render({ issues: [ISSUE] })).toContain("open issue");
    expect(render()).not.toContain("open issue");
  });
});
