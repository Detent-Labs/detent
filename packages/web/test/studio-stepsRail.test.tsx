import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { registerOrder } from "../src/areas/studio/draft/registerOrder.js";
import { StepsRail } from "../src/areas/studio/panels/StepsRail.js";

/**
 * The Steps tab's leading column (`studio-step-page`: "The steps rail lists
 * each step by number and label", "A rail row carries its own open issue
 * count", "The rail reorders steps and adds new ones").
 *
 * `development-toolchain`'s split rule sends these to assertions: the row
 * order, the numbers, the badge and the disabled state of each end control
 * are all properties of the rendered string.
 *
 * `StepsRail` reads `draft`, `validation` and `contentLocale` off
 * `useDraft()`, which reads `useContext(DraftContext)` — never a live
 * `DraftProvider`, whose registry and chaining fetches resolve async and never
 * fire under `renderToStaticMarkup`. Rendering `<DraftContext.Provider>`
 * directly supplies exactly the shape each case needs, the way
 * `studio-actionListEditor-registryBadge.test.tsx` already does.
 */

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

/** Three kinds in one draft: a task step, a call to another process, and an
 * end. `step_a` reaches `step_b`, which reaches `step_end`. */
const DRAFT = {
  baseLocale: "en",
  workflow: {
    initialStep: "step_a",
    steps: [
      {
        id: "step_a",
        key: "intake",
        label: { en: "Intake" },
        type: "task",
        assignment: { strategy: { type: "org.group-members", config: { groupId: "grp_1" } } },
        view: { fields: [{ ref: "field_1" }, { ref: "field_2" }] },
        paths: [{ id: "path_1", to: "step_b" }],
      },
      {
        id: "step_b",
        key: "check",
        label: { en: "Credit check" },
        type: "subprocess",
        subprocess: { processId: "proc_credit" },
        paths: [{ id: "path_2", to: "step_end" }],
      },
      { id: "step_end", key: "done", label: { en: "Done" }, type: "task", terminal: true, outcome: "approved" },
    ],
  },
} as unknown as Draft;

function render(over: { current?: string; issues?: EditorIssue[]; draft?: Draft } = {}): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(over.draft ?? DRAFT, over.issues ?? [])}>
      <StepsRail
        currentStepId={over.current}
        onSelectStep={() => {}}
        onReorder={() => {}}
        onAddStep={() => {}}
      />
    </DraftContext.Provider>,
  );
}

/** Every `<button ...>` open tag in a rendered string, in DOM order. */
function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

/** Every rendered rail row, one `<li>…</li>` per step, with every tag
 * stripped. A move control's name sits in an attribute, so the strip removes
 * it. */
function rowTexts(html: string): string[] {
  return (html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? []).map((row) => row.replace(/<[^>]+>/g, ""));
}

describe("The steps rail's order and numbering", () => {
  it("lists every step of the draft, in the order `registerOrder` reads", () => {
    const html = render();
    const expected = registerOrder(DRAFT.workflow?.steps, DRAFT.workflow?.initialStep).map((s) => s.label?.en as string);

    let cursor = -1;
    for (const name of expected) {
      const at = html.indexOf(`>${name}<`);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(expected).toEqual(["Intake", "Credit check", "Done"]);
  });

  it("numbers the rows from one", () => {
    const html = render();

    expect(html).toContain(">1<");
    expect(html).toContain(">2<");
    expect(html).toContain(">3<");
  });

  it("marks the row the step page holds, and only that one", () => {
    const marked = buttonTags(render({ current: "step_b" })).filter((b) => b.includes('aria-current="true"'));

    expect(marked).toHaveLength(1);
  });
});

/**
 * `spa-accessibility`: "A disclosure is a button that carries its expanded
 * state". A rail row is not a disclosure. It opens the step page, so it takes
 * `aria-current` and never `aria-expanded`.
 */
describe("A steps rail row selects rather than discloses", () => {
  it("gives each row a button that carries `aria-current` and no `aria-expanded`", () => {
    // The row's own button is the one carrying neither a move control's
    // `aria-label` nor an add control's shared `btn` class.
    const rows = buttonTags(render({ current: "step_b" })).filter(
      (b) => !b.includes("aria-label=") && !b.includes("btn-secondary"),
    );

    expect(rows).toHaveLength(3);
    expect(rows.filter((b) => b.includes('aria-current="true"'))).toHaveLength(1);
    for (const row of rows) expect(row).not.toContain("aria-expanded");
  });
});

describe("A steps-rail row carries only its number and label", () => {
  it("gives a task row its number and label, and no assignment or field count", () => {
    expect(rowTexts(render())[0]).toBe("1Intake");
  });

  it("gives a call row its number and label, and no process name", () => {
    expect(rowTexts(render())[1]).toBe("2Credit check");
  });

  it("gives an end row its number and label, and no outcome", () => {
    expect(rowTexts(render())[2]).toBe("3Done");
  });
});

describe("A steps-rail row's issue badge", () => {
  it("carries no badge on a step with no issue", () => {
    expect(render()).not.toContain("open issue");
  });

  it("counts the step's own issues and those of its paths", () => {
    const issues: EditorIssue[] = [
      { entityType: "step", entityId: "step_a", message: "no", source: "zod", loc: "" },
      { entityType: "path", entityId: "path_1", message: "no", source: "cel", loc: "" },
    ];

    expect(render({ issues })).toContain('aria-label="2 open issues"');
  });

  it("names one issue in the singular", () => {
    const issues: EditorIssue[] = [{ entityType: "step", entityId: "step_a", message: "no", source: "zod", loc: "" }];

    expect(render({ issues })).toContain('aria-label="1 open issue"');
  });

  it("names one badge per step carrying an issue, and no other", () => {
    const issues: EditorIssue[] = [{ entityType: "step", entityId: "step_end", message: "no", source: "zod", loc: "" }];
    const html = render({ issues });

    expect(html.match(/open issue"/g)).toHaveLength(1);
  });
});

describe("The steps rail's reorder controls", () => {
  it("refuses the move-earlier control on the first row", () => {
    const earlier = buttonTags(render()).filter((b) => b.includes('aria-label="Move earlier"'));

    expect(earlier).toHaveLength(3);
    expect(earlier[0]).toContain("disabled");
    expect(earlier[1]).not.toContain("disabled");
    expect(earlier[2]).not.toContain("disabled");
  });

  it("refuses the move-later control on the last row", () => {
    const later = buttonTags(render()).filter((b) => b.includes('aria-label="Move later"'));

    expect(later).toHaveLength(3);
    expect(later[0]).not.toContain("disabled");
    expect(later[2]).toContain("disabled");
  });

  it("gives a lone step both refusals, since it is first and last at once", () => {
    const one = {
      baseLocale: "en",
      workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "only", label: { en: "Only" }, type: "task" }] },
    } as unknown as Draft;
    const moves = buttonTags(render({ draft: one })).filter((b) => b.includes("Move "));

    expect(moves).toHaveLength(2);
    for (const move of moves) expect(move).toContain("disabled");
  });
});

describe("The steps rail's foot", () => {
  it("carries three add controls: a step, a call to another process, and an end", () => {
    const html = render();

    expect(html).toContain("Add a step");
    expect(html).toContain("Add a call to another process");
    expect(html).toContain("Add an end");
  });

  it("keeps the add controls on a draft holding no step, and says the rail is empty", () => {
    const none = { baseLocale: "en", workflow: {} } as unknown as Draft;
    const html = render({ draft: none });

    expect(html).toContain("This process carries no step yet.");
    expect(html).toContain("Add an end");
  });
});
