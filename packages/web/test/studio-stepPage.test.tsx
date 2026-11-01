import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Step } from "workflow-engine/schema";
import type { DraftOf, Draft } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue, type Mutate } from "../src/areas/studio/draft/store.js";
import { updateInDraftArray } from "../src/areas/studio/draft/draft-array-crud.js";
import { StepPage } from "../src/areas/studio/panels/StepPage.js";
import { RemoveStepDialog } from "../src/areas/studio/panels/RemoveStepDialog.js";
import type { StepRemovalReach } from "../src/areas/studio/draft/stepRemoval.js";

/**
 * The Steps tab's wide page (`studio-step-page`: "The step page names its
 * step and keeps its key in the Developer view", "The step page folds its
 * sections into one accordion", "A step's kind decides its sections", "A
 * section header carries a summary and its state", "The page opens on the
 * section that needs the author", "Removing a step confirms first", "The
 * step page walks to the previous and the next step", "The step page carries
 * a Developer view of the step").
 *
 * `development-toolchain`'s split rule sends these to assertions: the section
 * set and its order, the header markup, the open state on first render, the
 * marks, the walk controls' names and refusals, and the closed disclosure are
 * all properties of the rendered string. A press needs a DOM, so the open
 * state after one is `nextOpenSection`'s, in `studio-stepSummaries.test.ts`.
 */

type DraftStep = DraftOf<Step>;

const SRC = new URL("../src/areas/studio/", import.meta.url).pathname;

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

const TASK_STEP = {
  id: "step_a",
  key: "intake",
  label: { en: "Intake" },
  type: "task",
  paths: [{ id: "path_1", to: "step_b" }],
} as unknown as DraftStep;

function draftWith(step: DraftStep, initialStep = "step_a"): Draft {
  return { baseLocale: "en", workflow: { initialStep, steps: [step] } } as unknown as Draft;
}

interface Over {
  step?: DraftStep;
  fields?: DraftField[];
  draft?: Draft;
  issues?: EditorIssue[];
  stepNumber?: number;
  previous?: { id: string; label: string };
  next?: { id: string; label: string };
  selectedPathId?: string;
}

function render(over: Over = {}): string {
  const step = over.step ?? TASK_STEP;
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(over.draft ?? draftWith(step), over.issues ?? [])}>
      <StepPage
        fields={over.fields ?? []}
        token="t"
        step={step}
        stepNumber={over.stepNumber ?? 1}
        previous={over.previous}
        next={over.next}
        onSelectStep={() => {}}
        onRemoveStep={() => {}}
        selectedPathId={over.selectedPathId}
        navigate={() => {}}
        processes={[]}
      />
    </DraftContext.Provider>,
  );
}

/** Every `<button ...>` open tag in a rendered string, in DOM order. */
function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

/** One rendered section: its header button's open tag, the button's inner
 * markup, and its body region's own markup. */
interface RenderedSection {
  name: string;
  button: string;
  header: string;
  body: string;
}

/** Every section in DOM order. A section's markup runs from its `<section>`
 * to the next one, or to the page's terminal note or walk. */
function sections(html: string): RenderedSection[] {
  const parts = html.split("<section").slice(1);
  return parts.map((part) => {
    const end = part.indexOf("</section>");
    const own = part.slice(0, end);
    const button = /<button[^>]*>/.exec(own)![0];
    const header = own.slice(own.indexOf(button) + button.length, own.indexOf("</button></h3>"));
    const name = /<span[^>]*>([^<]*)<\/span>/.exec(header)![1]!;
    const body = own.slice(own.indexOf("</h3>") + "</h3>".length);
    return { name, button, header, body };
  });
}

const names = (html: string) => sections(html).map((s) => s.name);
const section = (html: string, name: string) => sections(html).find((s) => s.name === name)!;
const openNames = (html: string) => sections(html).filter((s) => s.button.includes('aria-expanded="true"')).map((s) => s.name);

const ASSIGNED = {
  ...TASK_STEP,
  assignment: { strategy: { type: "org.group-members", config: { groupId: "g" } } },
} as unknown as DraftStep;

describe("The step page's masthead", () => {
  it("opens with a kicker naming the step's number and its kind", () => {
    const html = render({ stepNumber: 3 });

    expect(html).toContain("Step 3");
    expect(html).toContain("A step someone works");
  });

  it("makes the kicker the page's h2, so the section headings nest under the step", () => {
    const html = render({ stepNumber: 3 });
    const kicker = /<h2 class="kicker">([\s\S]*?)<\/h2>/.exec(html);

    expect(kicker).not.toBeNull();
    expect(kicker![1]).toContain("Step 3");
    expect(kicker![1]).toContain("A step someone works");
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
  });

  it("carries the step's label as a writable line, and keeps its key in the Developer view", () => {
    const html = render();
    // The step's own disclosure stands last in More, after the way-out rows'
    // own Developer views and their guards'.
    const developer = html.slice(html.lastIndexOf("<details"));

    expect(html).toContain('value="Intake"');
    expect(html.slice(0, html.indexOf("<details"))).not.toContain('value="intake"');
    expect(developer).toContain('value="intake"');
    expect(developer.indexOf('value="intake"')).toBeLessThan(developer.indexOf("<pre"));
    expect(developer).toContain("&quot;intake&quot;");
  });

  it("marks the draft's first step, and offers no set-first control there", () => {
    const html = render();

    expect(html).toContain("This is the process&#x27;s first step.");
    expect(html).not.toContain("Set as the process&#x27;s first step");
  });

  it("offers the set-first control on a step that is not the first", () => {
    const html = render({ draft: draftWith(TASK_STEP, "step_elsewhere") });

    expect(html).toContain("Set as the process&#x27;s first step");
  });

  it("carries one control that removes the step, in the destructive outline", () => {
    const html = render();

    expect(html.match(/Remove this step/g)).toHaveLength(1);
    expect(html).toMatch(/<button type="button" class="btn btn-secondary btn-destructive">Remove this step<\/button>/);
  });

  it("mounts no removal dialog until the control is pressed", () => {
    expect(render()).not.toContain("<dialog");
  });
});

describe("The step page's section set", () => {
  it("gives a task step six sections, in reading order", () => {
    expect(names(render())).toEqual(["Who acts", "Form", "Ways out", "Time limit", "When entered or left", "More"]);
  });

  it("leads a subprocess step with the process it calls", () => {
    const calls = { ...TASK_STEP, type: "subprocess" } as unknown as DraftStep;

    expect(names(render({ step: calls }))).toEqual(["Which process it calls", "Ways out", "Time limit", "When entered or left", "More"]);
  });

  it("gives an end step How the case ends, When entered, and no way out", () => {
    const ends = { ...TASK_STEP, terminal: true, paths: undefined } as unknown as DraftStep;
    const html = render({ step: ends });

    expect(names(html)).toEqual(["Who acts", "Form", "How the case ends", "When entered", "More"]);
    expect(html).toContain("A step that ends the process has no way out and no time limit.");
  });

  it("prints no section header in the contract's words", () => {
    for (const name of names(render())) {
      expect(["Path to", "Assignment", "On entry", "On exit", "Cancellable"]).not.toContain(name);
    }
  });

  it("stands the sections in one group, labelled for the page", () => {
    expect(render()).toContain('<div aria-label="Step settings" role="group"><section');
  });
});

describe("The step page's section headers", () => {
  it("makes each header a button inside an h3, naming its body", () => {
    const html = render();

    expect(html.match(/<h3[^>]*><button type="button"/g)).toHaveLength(6);
    for (const { button } of sections(html)) {
      const id = /\sid="([^"]+)"/.exec(button)![1]!;
      const controls = /aria-controls="([^"]+)"/.exec(button)![1]!;

      expect(button).toMatch(/aria-expanded="(true|false)"/);
      expect(html).toContain(`<div id="${controls}" role="region" aria-labelledby="${id}"`);
    }
  });

  it("stands exactly one section open", () => {
    expect(render().match(/aria-expanded="true"/g)).toHaveLength(1);
  });

  it("hides every closed body, and keeps it mounted", () => {
    const all = sections(render());

    for (const { button, body } of all) {
      const open = button.includes('aria-expanded="true"');
      const tag = /^<div[^>]*>/.exec(body)![0];

      expect(tag.includes(" hidden")).toBe(!open);
    }
    // The closed Ways out body still holds its row.
    expect(all.find((s) => s.name === "Ways out")!.body).toContain("<h4");
  });
});

describe("The step page opens on the section that needs the author", () => {
  it("opens Who acts on an unassigned task step with no check", () => {
    expect(openNames(render())).toEqual(["Who acts"]);
  });

  it("opens the first section on a complete step", () => {
    expect(openNames(render({ step: ASSIGNED }))).toEqual(["Who acts"]);
  });

  it("opens the first section still to do", () => {
    const noWayOut = { ...ASSIGNED, paths: undefined } as unknown as DraftStep;

    expect(openNames(render({ step: noWayOut }))).toEqual(["Ways out"]);
  });

  it("opens the first section carrying a check", () => {
    const timed = { ...TASK_STEP, timers: [{ id: "timer_1", duration: "P1D" }] } as unknown as DraftStep;
    const issues: EditorIssue[] = [{ entityType: "timer", entityId: "timer_1", message: "too long", source: "duration", loc: "" }];

    expect(openNames(render({ step: timed, issues }))).toEqual(["Time limit"]);
  });

  it("opens Ways out where a way out is selected", () => {
    expect(openNames(render({ selectedPathId: "path_1" }))).toEqual(["Ways out"]);
  });

  // The defect (ACCORDION-1): an effect keyed on the selected way out alone
  // never ran again for the same way out, so a folded Ways out stayed shut
  // when the Map tab opened that way out a second time.
  it("keys the Ways out effect on each open request, so a repeated one reopens it", () => {
    const source = readFileSync(SRC + "panels/StepPage.tsx", "utf8");
    const effect = /if \(selectedPathId !== undefined && holdsPaths\) setOpenSection\("paths"\);\s*\}, \[([^\]]*)\]\);/.exec(source);

    expect(effect).not.toBeNull();
    expect(effect![1].split(",").map((dep) => dep.trim())).toEqual(["selectedPathId", "holdsPaths", "waysOutRequest"]);
  });

  it("opens an unassigned step whose ways out all happen by themselves on Who acts only as the first section", () => {
    const automatic = {
      ...TASK_STEP,
      paths: [
        { id: "path_1", to: "step_b", trigger: "automatic", priority: 1, guard: { lang: "cel", src: "data.ok" } },
        { id: "path_2", to: "step_b", trigger: "automatic", priority: 2 },
      ],
    } as unknown as DraftStep;
    const html = render({ step: automatic });

    expect(section(html, "Who acts").header).not.toContain("To do");
    expect(openNames(html)).toEqual(["Who acts"]);
  });
});

describe("The open section header", () => {
  it("carries the current mark and prints its name in ink, and no closed header does", () => {
    const all = sections(render());

    for (const { name, button, header } of all) {
      const open = button.includes('aria-expanded="true"');

      expect(`${name}: ${button.includes("sectionHeaderOpen")}`).toBe(`${name}: ${open}`);
      expect(`${name}: ${header.includes("sectionNameOpen")}`).toBe(`${name}: ${open}`);
    }
    expect(all.filter((s) => s.button.includes("sectionHeaderOpen"))).toHaveLength(1);
  });

  it("draws the current mark as a 3px accent rule in the page's inline padding", () => {
    const source = readFileSync(SRC + "panels/StepPage.tsx", "utf8");
    const open = /sectionHeaderOpen: \{\s*"::before": \{([\s\S]*?)\n {4}\},/.exec(source);

    expect(open).not.toBeNull();
    expect(open![1]).toContain("width: 3,");
    expect(open![1]).toContain("backgroundColor: colors.accent,");
    expect(open![1]).toContain("left: `calc(-1 * max(${space.s3}, ${focus.reach}))`,");
    expect(source).toMatch(/sectionNameOpen: \{\s*color: colors\.text,\s*\}/);
  });
});

describe("A section header's summary and mark", () => {
  it("names the assignment in words and marks Who acts done", () => {
    const { header } = section(render({ step: ASSIGNED }), "Who acts");

    expect(header).toContain("Everyone in a group");
    expect(header).toContain('title="Done"');
    expect(header).toContain(">Done</span>");
    expect(header).toContain("<svg");
  });

  it("reads both way-out headings", () => {
    const twoWays = {
      ...TASK_STEP,
      paths: [
        { id: "path_1", label: "Approve", to: "step_b" },
        { id: "path_2", label: "Reject", to: "step_c" },
      ],
    } as unknown as DraftStep;
    const draft = {
      baseLocale: "en",
      workflow: {
        initialStep: "step_a",
        steps: [twoWays, { id: "step_b", key: "done", label: { en: "Done" } }, { id: "step_c", key: "rework", label: { en: "Rework" } }],
      },
    } as unknown as Draft;
    const { header } = section(render({ step: twoWays, draft }), "Ways out");

    expect(header).toContain("Approve → Done, Reject → Rework");
    expect(header).toContain('title="Done"');
  });

  it("says what is missing and reads To do on an empty section the step needs", () => {
    const { header } = section(render({ step: { ...TASK_STEP, paths: undefined } as unknown as DraftStep }), "Ways out");

    expect(header).toContain("No way out yet");
    expect(header).toContain('class="todoMark markPlace">To do</span>');
    expect(header).not.toContain('title="Done"');
    expect(header).not.toContain("open issue");
  });

  it("reads To do on Who acts on an unassigned task step with a manual way out", () => {
    expect(section(render(), "Who acts").header).toContain(">To do</span>");
  });

  it("carries no mark on an empty section the step works without", () => {
    const { header } = section(render(), "Time limit");

    expect(header).not.toContain("To do");
    expect(header).not.toContain('title="Done"');
    expect(header).not.toContain("open issue");
  });

  it("counts a check in the badge, in place of the Done mark", () => {
    const issues: EditorIssue[] = [
      { entityType: "step", entityId: "step_a", message: "no such group", source: "structural", loc: "workflow.steps[0].assignment.strategy.config.groupId" },
    ];
    const { header } = section(render({ step: ASSIGNED, issues }), "Who acts");

    expect(header).toMatch(/aria-label="1 open issue"[^>]*>1<\/span>/);
    expect(header).not.toContain('title="Done"');
  });

  it("summarizes More as following the process settings where the step overrides nothing", () => {
    expect(section(render(), "More").header).toContain("Follows the process settings");
  });

  it("prints an end step's outcome in its summary", () => {
    const ends = { ...TASK_STEP, terminal: true, paths: undefined, outcome: "approved" } as unknown as DraftStep;

    expect(section(render({ step: ends }), "How the case ends").header).toContain(">approved</span>");
  });
});

describe("The step page's Who acts section", () => {
  it("leads its body with the strategy's note, and leaves the name to the header", () => {
    const { header, body } = section(render({ step: ASSIGNED }), "Who acts");
    const note = "Whoever is in the group when an instance enters the step can act on it.";

    expect(header).toContain("Everyone in a group");
    expect(body).toContain(note);
    // The type picker still offers the name as an option; no paragraph
    // repeats it.
    expect(body).not.toMatch(/<p[^>]*>Everyone in a group<\/p>/);
    expect(body.indexOf(note)).toBeLessThan(body.indexOf("Who can act on this step"));
  });
});

describe("The step page's More section", () => {
  it("holds the cancelling control, the two collaboration controls, then the Developer view last", () => {
    const { body } = section(render(), "More");
    const cancelling = body.indexOf("Cancelling the case here");
    const comment = body.indexOf('aria-label="Comment"');
    const attachments = body.indexOf('aria-label="Attachments"');
    const developer = body.indexOf("<details");

    expect(cancelling).toBeGreaterThan(-1);
    expect(comment).toBeGreaterThan(cancelling);
    expect(attachments).toBeGreaterThan(comment);
    expect(developer).toBeGreaterThan(attachments);
    expect(body.slice(body.indexOf("</details>") + "</details>".length)).toBe("</div>");
  });

  it("carries no cancelling control on an end step", () => {
    const ends = { ...TASK_STEP, terminal: true, paths: undefined } as unknown as DraftStep;
    const { body } = section(render({ step: ends }), "More");

    expect(body).not.toContain("Cancelling the case here");
    expect(body).toContain('aria-label="Comment"');
  });

  it("carries no collaboration control on a subprocess step", () => {
    const calls = { ...TASK_STEP, type: "subprocess" } as unknown as DraftStep;
    const { body } = section(render({ step: calls }), "More");

    expect(body).toContain("Cancelling the case here");
    expect(body).not.toContain('aria-label="Comment"');
    expect(body).not.toContain('aria-label="Attachments"');
  });
});

describe("The step page's When entered or left section", () => {
  it("holds the entry, exit and cancel lists on a task step", () => {
    const { body } = section(render(), "When entered or left");

    expect(body).toContain("What happens when entered");
    expect(body).toContain("What happens when left");
    expect(body).toContain("What happens when cancelled");
  });

  it("holds the entry list alone on an end step", () => {
    const ends = { ...TASK_STEP, terminal: true, paths: undefined } as unknown as DraftStep;
    const { body } = section(render({ step: ends }), "When entered");

    expect(body).toContain("What happens when entered");
    expect(body).not.toContain("What happens when left");
    expect(body).not.toContain("What happens when cancelled");
  });
});

describe("More's cancelling control", () => {
  /**
   * The Cancellable <select>'s onChange writes through a local `updateStep`
   * closure over `updateInDraftArray` — not exported, so not directly
   * callable. `render()` uses `renderToStaticMarkup`, which never fires an
   * event (`studio-draftToolbarState.test.ts`'s documented convention: test
   * the extracted logic instead of simulating a DOM event). These two write
   * cases hand-drive that same `updateInDraftArray` call, with the same two
   * patches the select's non-inherit options produce.
   */
  function mutateStep(step: DraftStep, patch: Partial<DraftStep>): DraftStep {
    const draft = draftWith(step);
    const mutate: Mutate = (recipe) => recipe(draft);
    updateInDraftArray(mutate, (d) => d.workflow?.steps?.[0], patch);
    return step;
  }

  it("selecting 'Not cancellable' writes cancellable: false on the step", () => {
    const after = mutateStep({ ...TASK_STEP }, { cancellable: false });

    expect(after.cancellable).toBe(false);
  });

  it("returning to 'Inherit from process' leaves the step with no cancellable key, not a present undefined", () => {
    const after = mutateStep({ ...TASK_STEP, cancellable: true }, { cancellable: undefined });

    expect(after.cancellable).toBeUndefined();
    // Object.assign sets an explicit `cancellable: undefined` own property;
    // only a JSON round-trip (the shape canonicalize()/definitionHash see)
    // proves the key is truly absent rather than present-but-undefined.
    expect(JSON.stringify(after)).not.toContain("cancellable");
  });

  it("names the process's current default in the inherit state, and changes when that default changes", () => {
    const whenProcessAllows = render();
    expect(whenProcessAllows).toContain("Resolves to: cancellable.");
    expect(whenProcessAllows).not.toContain("Resolves to: not cancellable.");

    const whenProcessBans = render({ draft: { ...draftWith(TASK_STEP), cancellable: false } });
    expect(whenProcessBans).toContain("Resolves to: not cancellable.");
    expect(whenProcessBans).not.toContain("Resolves to: cancellable.");
  });
});

describe("More's collaboration controls", () => {
  it("gives a three-state control for Comment and one for Attachments, both starting on Default", () => {
    const html = render();

    expect(html.match(/>Default</g)).toHaveLength(2);
    expect(html.match(/>On</g)).toHaveLength(2);
    expect(html.match(/>Off</g)).toHaveLength(2);
  });

  it("names the process default's current resolved value while Default is selected", () => {
    const draft = { ...draftWith(TASK_STEP), collaboration: { attachments: false } } as unknown as Draft;
    const html = render({ draft });

    // Comment has no process-level entry, so it resolves the schema's own
    // `true` fallback; Attachments resolves the draft's explicit `false`.
    expect(html).toContain("Currently: on");
    expect(html).toContain("Currently: off");
  });

  it("shows On pressed for a step that overrides a field, with no Currently caption for it", () => {
    const overridden = { ...TASK_STEP, collaboration: { attachments: true } } as unknown as DraftStep;
    const draft = { ...draftWith(overridden), collaboration: { attachments: false } } as unknown as Draft;
    const html = render({ step: overridden, draft });

    const attachmentsControl = html.slice(html.indexOf('aria-label="Attachments"'));
    expect(attachmentsControl).toMatch(/aria-pressed="true"[^<]*>On</);
    expect(attachmentsControl).not.toContain("Currently:");
  });
});

describe("A step page section's own open issues", () => {
  it("prints an issue about the assignment once, inside the Who acts body", () => {
    const issues: EditorIssue[] = [
      {
        entityType: "step",
        entityId: "step_a",
        message: "no such group",
        source: "structural",
        loc: "workflow.steps[0].assignment.strategy.config.groupId",
      },
    ];
    const html = render({ issues });
    const { body } = section(html, "Who acts");

    // One print, at one section — never a second copy at another section.
    expect(html.match(/no such group/g)).toHaveLength(1);
    expect(body).toContain("no such group");
    // Above the section's own controls.
    expect(body.indexOf("no such group")).toBeLessThan(body.indexOf("Who can act on this step"));
  });

  it("prints an issue about the form once, inside the Form body", () => {
    const issues: EditorIssue[] = [
      {
        entityType: "step",
        entityId: "step_a",
        message: "required but hidden",
        source: "view",
        loc: "workflow.steps[0].view.fields[0].required",
      },
    ];
    const html = render({ issues });

    expect(html.match(/required but hidden/g)).toHaveLength(1);
    expect(section(html, "Form").body).toContain("required but hidden");
  });

  it("draws an advisory badge in slate, a blocker in refusal", () => {
    // The test runner's StyleX stub resolves a style to its own key
    // (`test/preload-stylex.ts`), so the class names the tone's style, and
    // the module's source binds each style to its role.
    const view: EditorIssue = { entityType: "step", entityId: "step_a", message: "a", source: "view", loc: "workflow.steps[0].view.fields[0].required" };
    const cel: EditorIssue = { ...view, message: "b", source: "cel" };
    const badge = (issues: EditorIssue[]) => /<span class="([^"]+)" aria-label="1 open issue"/.exec(section(render({ issues }), "Form").header)![1];
    const source = readFileSync(SRC + "panels/StepPage.tsx", "utf8");

    expect(badge([view])).toBe("badge badgeAdvisory markPlace");
    expect(badge([cel])).toBe("badge badgeBlocker markPlace");
    expect(source).toMatch(/badgeBlocker: \{\s*color: colors\.refusal,\s*\}/);
    expect(source).toMatch(/badgeAdvisory: \{\s*color: colors\.textMuted,\s*\}/);
  });

  it("keeps a step-level issue no section claims at the masthead's end, and no header counts it", () => {
    const issues: EditorIssue[] = [
      { entityType: "step", entityId: "step_a", message: "kind is unknown", source: "zod", loc: "workflow.steps[0].type" },
    ];
    const html = render({ issues });

    expect(html.match(/kind is unknown/g)).toHaveLength(1);
    expect(html.indexOf("kind is unknown")).toBeGreaterThan(html.indexOf("Set as"));
    expect(html.indexOf("kind is unknown")).toBeLessThan(html.indexOf("<section"));
    expect(html).not.toContain("open issue");
  });

  it("stands a name check directly under Name, and no header counts it", () => {
    const issues: EditorIssue[] = [
      { entityType: "step", entityId: "step_a", message: "name is missing", sentence: "This step needs a name.", source: "zod", loc: "workflow.steps[0].label" },
    ];
    const html = render({ issues });
    const nameInput = html.indexOf('id="step-page-name"');
    const sentence = html.indexOf("This step needs a name.");

    expect(nameInput).toBeGreaterThan(-1);
    expect(sentence).toBeGreaterThan(nameInput);
    // Only the close of the name's own label stands between them.
    expect(html.slice(nameInput, sentence)).not.toContain("<input");
    expect(html.slice(nameInput, sentence)).not.toContain(">Description<");
    expect(html.match(/This step needs a name\./g)).toHaveLength(1);
    expect(html).not.toContain("name is missing");
    expect(html).not.toContain("open issue");
  });

  it("stands a description check directly under Description", () => {
    const issues: EditorIssue[] = [
      { entityType: "step", entityId: "step_a", message: "no text", source: "zod", loc: "workflow.steps[0].description" },
    ];
    const html = render({ issues });
    const caption = html.indexOf(">Description<");
    const sentence = html.indexOf("no text");

    expect(sentence).toBeGreaterThan(caption);
    expect(html.slice(caption, sentence).match(/<input/g)).toHaveLength(1);
    expect(sentence).toBeLessThan(html.indexOf("<fieldset"));
  });

  it("stands a key check in More, where the header counts it and the masthead does not print it", () => {
    const issues: EditorIssue[] = [
      { entityType: "step", entityId: "step_a", message: "key is not a slug", source: "zod", loc: "workflow.steps[0].key" },
    ];
    const html = render({ issues });
    const more = section(html, "More");

    expect(html.match(/key is not a slug/g)).toHaveLength(1);
    expect(more.body).toContain("key is not a slug");
    expect(more.header).toContain('aria-label="1 open issue"');
    expect(html.slice(0, html.indexOf("<section"))).not.toContain("key is not a slug");
  });

  it("counts an output-target check on the section of the action it complains about", () => {
    const step = {
      ...TASK_STEP,
      paths: [{ id: "path_1", to: "step_b", label: "Go", onPath: [{ id: "act_1", output: { field_x: { lang: "cel", src: "result.a" } } }] }],
    } as unknown as DraftStep;
    const issues: EditorIssue[] = [
      { entityType: "step", entityId: "step_a", message: "action output targets unknown field: field_x", source: "zod", loc: "workflow.steps[0]" },
    ];
    const html = render({ step, issues });

    expect(section(html, "Ways out").header).toContain('aria-label="1 open issue"');
    expect(section(html, "Ways out").body).toContain("action output targets unknown field");
    expect(html.slice(0, html.indexOf("<section"))).not.toContain("action output targets unknown field");
  });

  it("gives the page a name input a landing can find", () => {
    expect(render()).toContain('id="step-page-name"');
  });

  it("opens the Developer view by itself while a key check stands, and leaves it a native toggle", () => {
    const keyCheck: EditorIssue = { entityType: "step", entityId: "step_a", message: "key is not a slug", source: "zod", loc: "workflow.steps[0].key" };
    const details = (html: string) => {
      const at = section(html, "More").body.lastIndexOf("<details");
      return section(html, "More").body.slice(at, section(html, "More").body.indexOf(">", at));
    };
    const source = readFileSync(SRC + "panels/StepPage.tsx", "utf8");

    expect(details(render({ issues: [keyCheck] }))).toContain("open");
    expect(details(render())).not.toContain("open");
    // The native summary closes it under the check, and an unchanged prop leaves
    // that close standing until the check clears.
    expect(source).toContain("open={developerOpen || keyChecked}");
    expect(source).toContain("onToggle={(e) => setDeveloperOpen(e.currentTarget.open)}");
  });

  it("leaves a path's own issue to the row that names it, and counts it on Ways out once", () => {
    // `PathsPanel` mounts an `IssueList` per path row, so the body's top
    // would otherwise say the same sentence twice.
    const issues: EditorIssue[] = [
      { entityType: "path", entityId: "path_1", message: "this path leads nowhere", source: "cel", loc: "" },
    ];
    const html = render({ issues });

    expect(html.match(/this path leads nowhere/g)).toHaveLength(1);
    expect(section(html, "Ways out").header).toMatch(/aria-label="1 open issue"[^>]*>1<\/span>/);
  });
});

describe("The step page's walk", () => {
  it("names the step each control opens", () => {
    const html = render({ previous: { id: "step_z", label: "Intake" }, next: { id: "step_b", label: "Credit check" } });

    expect(html).toContain("Previous: Intake");
    expect(html).toContain("Next: Credit check");
  });

  it("fills a $ pattern in a neighbour's label as written", () => {
    const html = render({ previous: { id: "step_z", label: "Pay $& now" }, next: { id: "step_b", label: "Owe $1" } });

    expect(html).toContain("Previous: Pay $&amp; now");
    expect(html).toContain("Next: Owe $1");
  });

  it("reads the placeholder for an unnamed neighbour", () => {
    const html = render({ next: { id: "step_b", label: "(unnamed step)" } });

    expect(html).toContain("Next: (unnamed step)");
  });

  it("refuses the press at each end of the walk", () => {
    const html = render();
    const walk = buttonTags(html).filter((b) => b.includes("disabled"));

    expect(html).toContain("Previous step");
    expect(html).toContain("Next step");
    expect(walk.length).toBeGreaterThanOrEqual(2);
  });

  it("leaves the control live where a neighbour stands", () => {
    const html = render({ next: { id: "step_b", label: "Credit check" } });

    expect(html).toContain("Next: Credit check");
    expect(html).not.toContain("Next step");
  });
});

describe("The step page's Developer view", () => {
  it("stands inside the last section's body", () => {
    const all = sections(render());

    // A way-out row keeps a Developer view of its own; the step's is the one
    // holding the read-only JSON.
    expect(all.at(-1)!.name).toBe("More");
    expect(all.at(-1)!.body).toContain(">Developer view</summary>");
    expect(all.at(-1)!.body).toContain("<pre");
    for (const { body } of all.slice(0, -1)) expect(body).not.toContain("<pre");
  });

  it("stands closed until an author opens it", () => {
    const html = render();

    expect(html).toContain("Developer view");
    expect(html).toMatch(/<details[^>]*>/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("carries the step's own JSON and its id", () => {
    const html = render();

    expect(html).toContain("&quot;step_a&quot;");
    expect(html).toContain("&quot;intake&quot;");
  });

  it("accepts no typing, so the draft cannot change from it", () => {
    // A `<pre>` is not a control. Were the JSON editable here, the disclosure
    // would carry a `<textarea>` the way the JSON surface does.
    const html = render();
    const disclosure = html.slice(html.lastIndexOf("<details"));

    expect(disclosure).toContain("Developer view");
    expect(disclosure).toContain("<pre");
    expect(disclosure).not.toContain("<textarea");
  });

  it("writes the key from the input inside it", () => {
    const source = readFileSync(SRC + "panels/StepPage.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const start = source.indexOf("<details");
    const block = source.slice(start, source.indexOf("</details>", start));

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("onChange={(e) => updateStep({ key: e.target.value })}");
    expect(source.slice(0, start)).not.toContain("updateStep({ key: e.target.value })");
  });
});

/**
 * The Form section (`studio-step-page`: "The Form section states the form's
 * size in words", "The Form section opens the step's form"). Its header
 * counts field entries as a Forms card counts them, and its body's one
 * control reads the card's own words.
 */
describe("The step page's Form section", () => {
  const field = (n: number) => ({ id: `field_${n}`, key: `f${n}`, label: { en: `F${n}` }, type: "string" }) as unknown as DraftField;
  const fields = [1, 2, 3, 4].map(field);
  const withView = (entries: unknown[]) => ({ ...TASK_STEP, view: { fields: entries } }) as unknown as DraftStep;
  /** The header's size sentence and the body's control. */
  const summary = (html: string) => {
    const form = section(html, "Form");
    const sentence = /<span[^>]*>([^<]*)<\/span>/g;
    sentence.exec(form.header);
    return [sentence.exec(form.header)![1], /<button type="button" class="btn btn-secondary">([^<]*)<\/button>/.exec(form.body)![1]];
  };

  it("states four fields, one required, and offers to open the form", () => {
    const step = withView([{ ref: "field_1", required: true }, { ref: "field_2" }, { ref: "field_3" }, { ref: "field_4" }]);

    expect(summary(render({ step, fields }))).toEqual(["4 fields, 1 required", "Open the form"]);
  });

  it("states one field beside three notes", () => {
    const note = { kind: "note", text: { en: "Read me" } };
    const step = withView([{ ref: "field_1" }, note, note, note]);

    expect(summary(render({ step, fields }))).toEqual(["1 field", "Open the form"]);
  });

  it("reads No fields yet and offers to start the form on a step with no view", () => {
    expect(summary(render({ fields }))).toEqual(["No fields yet", "Start the form"]);
  });

  it("reads No fields yet on a view of notes alone", () => {
    const step = withView([{ kind: "note", text: { en: "Read me" } }]);

    expect(summary(render({ step, fields }))).toEqual(["No fields yet", "Start the form"]);
  });

  it("prints no count of the whole catalog", () => {
    const html = render({ step: withView([{ ref: "field_1" }]), fields });

    expect(html).not.toContain("/ 4");
    expect(html).not.toContain("fields configured");
  });
});

/**
 * The Remove this step confirmation (`studio-step-page`: "Removing a step
 * confirms first", "The removal dialog counts what the removal reaches"). The
 * web package has no DOM harness, so the dialog renders unconditionally, as
 * `KindSwitchDialog`'s test does.
 */
describe("The removal dialog", () => {
  const renderDialog = (reach: StepRemovalReach, label = "Review") =>
    renderToStaticMarkup(<RemoveStepDialog label={label} reach={reach} triggerRef={{ current: null }} onCancel={() => {}} onConfirm={() => {}} />);
  const factRows = (html: string) => [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]);
  const none: StepRemovalReach = { incomingPaths: 0, formFields: 0, isInitial: false };

  it("names the step in its heading and its first fact row", () => {
    const html = renderDialog(none);

    expect(html).toContain("Remove “Review”?");
    expect(factRows(html)).toEqual([["Step", "Review"]]);
  });

  it("fills the heading as written where the label holds a $ pattern", () => {
    expect(renderDialog(none, "Pay $& now")).toContain("Remove “Pay $&amp; now”?");
  });

  it("counts two ways out leading here, and says they stay", () => {
    const html = renderDialog({ incomingPaths: 2, formFields: 3, isInitial: false });

    expect(factRows(html)).toEqual([
      ["Step", "Review"],
      ["Ways out leading here", "2"],
      ["Fields on its form", "3"],
    ]);
    expect(html).toContain("The ways out leading here stay, and the checks report them.");
  });

  it("shows no row for ways out leading here where none does", () => {
    const html = renderDialog(none);

    expect(html).not.toContain("Ways out leading here");
    expect(html).not.toContain("The ways out leading here stay");
  });

  it("says the first remaining step takes the first step's place", () => {
    expect(renderDialog({ ...none, isInitial: true })).toContain("The first remaining step takes its place.");
    expect(renderDialog(none)).not.toContain("The first remaining step takes its place.");
  });

  it("states that the studio has no undo, whatever the reach", () => {
    expect(renderDialog(none)).toContain("The studio has no undo.");
  });

  it("holds the initial focus on Cancel, and keeps the confirming control outlined", () => {
    const tags = buttonTags(renderDialog(none));

    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain("btn-secondary btn-destructive");
    expect(tags[0]).not.toContain("autofocus");
    expect(tags[1]).toContain("autofocus");
    expect(renderDialog(none)).toContain(">Remove the step</button>");
  });

  it("names the dialog by its heading and describes it by the facts and the notes", () => {
    const html = renderDialog(none);

    expect(html).toContain('aria-labelledby="remove-step-confirm-heading"');
    expect(html).toContain('id="remove-step-confirm-heading"');
    expect(html).toContain('aria-describedby="remove-step-confirm-facts remove-step-confirm-notes"');
  });
});
