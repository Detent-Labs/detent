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
 * the control naming its own act, the badge, and the miniature taking no
 * keyboard focus.
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

function render(over: { draft?: Draft; issues?: EditorIssue[] } = {}): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(over.draft ?? DRAFT, over.issues ?? [])}>
      <FormsTab onOpenForm={() => {}} onOpenChecks={() => {}} />
    </DraftContext.Provider>,
  );
}

/** Everything between the miniature's own `aria-hidden="true"` element and
 * its close. The miniature carries no name and no role of its own, so the
 * element itself is what a test matches — a backreference to the tag name,
 * since the element is not pinned to one tag. */
function miniatures(html: string): string[] {
  return [...html.matchAll(/<(\w+)[^>]*\saria-hidden="true"[^>]*>(.*?)<\/\1>/gs)].map((m) => m[2]!);
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
    const miniatureIndex = html.indexOf('aria-hidden="true"');
    const countIndex = html.indexOf(">1 field, 1 required<");
    const controlIndex = html.indexOf("Open the form");

    expect(miniatureIndex).toBeGreaterThan(-1);
    expect(countIndex).toBeGreaterThan(miniatureIndex);
    expect(controlIndex).toBeGreaterThan(countIndex);
  });

  it("says so in words when no step declares a form at all", () => {
    const bare = {
      baseLocale: "en",
      workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "only", label: { en: "Only" }, type: "task" }] },
    } as unknown as Draft;

    expect(render({ draft: bare })).toContain("No step in this process declares a form yet.");
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

  it("gives a required entry's mark a different compiled class than an ordinary one", () => {
    const twoEntries = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: { fields: [{ ref: AMOUNT, required: true }, { ref: AMOUNT }] },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;
    const [inner] = miniatures(render({ draft: twoEntries }));
    const classes = [...inner!.matchAll(/<span class="([^"]*)"/g)].map((m) => m[1]);

    expect(classes).toHaveLength(2);
    expect(classes[0]).not.toBe(classes[1]);
  });
});

/** One HTML attribute's value off a tag string, or `undefined` where the tag
 * carries none. Reads the attribute by name, so the test does not depend on
 * `useId`'s id format. */
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

describe("A plate's open control", () => {
  it("names its step through aria-labelledby: its own id, then the span holding the step label", () => {
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
      const nameSpan = html.match(new RegExp(`<span id="${nameIdRef}"[^>]*>([^<]*)</span>`));
      expect(nameSpan).not.toBeNull();
      return nameSpan![1];
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

  it("reads the number of open issues naming that step's view", () => {
    expect(render({ issues: [ISSUE, { ...ISSUE, message: "a second one" }] })).toContain(
      'aria-label="2 open issues on this form"',
    );
  });

  it("names one issue in the singular", () => {
    expect(render({ issues: [ISSUE] })).toContain('aria-label="1 open issue on this form"');
  });

  it("draws no badge on a plate whose view draws no issue", () => {
    expect(render()).not.toContain("open issue on this form");
  });
});
