import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { DraftToolbarActions } from "../src/areas/studio/panels/DraftToolbar.js";
import { DraftNavControls, PublishNavControl } from "../src/areas/studio/panels/DraftNavControls.js";

/**
 * The studio's area nav carries four controls while a draft stands open:
 * Checks, Save, Discard draft and Publish (`studio-process-tabs`). The publish
 * gate and both confirmation dialogs travelled here with them, so focus can
 * return to the control that opened a dialog.
 *
 * `development-toolchain`'s split rule sends these to assertions: the state
 * dot, the counts, the reason text, `aria-disabled`, `aria-describedby` and
 * `autoFocus` are all properties of the rendered string. What stays manual is
 * what static markup cannot see — the dialog's focus trap, its Escape key and
 * its backdrop, all three from `showModal()`, plus the focus return on close.
 */
const RAN = {
  zod: "ran",
  duration: "ran",
  structural: "ran",
  actionType: "ran",
  assignmentType: "ran",
  dataSourceType: "ran",
  registryConfig: "not-run",
  cel: "ran",
} as const;

function validationOf(issues: EditorIssue[], zodValid = true): ValidationResult {
  return {
    zodValid,
    issues,
    dimensions: zodValid ? { ...RAN } : { ...RAN, structural: "not-run" },
    subprocessStepStatus: {},
    chainingSiteStatus: {},
  };
}

function issue(source: EditorIssue["source"]): EditorIssue {
  return { entityType: "step", entityId: "step_1", message: "bad", source, loc: "workflow.steps[0]" };
}

const noActions: DraftToolbarActions = {
  saving: false,
  publishing: false,
  error: null,
  pendingDialog: null,
  resolveDialog: () => {},
  save: () => {},
  discard: () => {},
  publish: () => {},
  reload: () => {},
};

function render(over: {
  issues?: EditorIssue[];
  zodValid?: boolean;
  canPublish?: boolean;
  isDirty?: boolean;
  actions?: Partial<DraftToolbarActions>;
}): string {
  return renderToStaticMarkup(
    <DraftNavControls
      processId="proc_a"
      processLabel="Expense approval"
      revision={7}
      isDirty={over.isDirty ?? false}
      lastSavedAt={undefined}
      validation={validationOf(over.issues ?? [], over.zodValid ?? true)}
      canPublish={over.canPublish ?? true}
      baseVersion={3}
      actions={{ ...noActions, ...over.actions }}
      onOpenChecks={() => {}}
    />,
  );
}

describe("The four controls the area nav carries", () => {
  it("stands Checks, Save, Discard draft and Publish together", () => {
    const html = render({});

    expect(html).toContain("Checks");
    expect(html).toContain(">Save<");
    expect(html).toContain("Discard draft");
    expect(html).toContain(">Publish<");
  });
});

describe("The Checks control's state dot", () => {
  it("takes the blocker color when an engine validator holds an open issue", () => {
    const html = render({ issues: [issue("structural")] });

    expect(html).toContain("checksRailDotBlocker");
    expect(html).not.toContain("checksRailDotAdvisory");
    expect(html).not.toContain("checksRailDotClear");
  });

  it("takes the advisory color when the studio's own view findings stand alone", () => {
    // A `view`-source entry never refuses a publish, so it is advisory.
    const html = render({ issues: [issue("view")] });

    expect(html).toContain("checksRailDotAdvisory");
    expect(html).not.toContain("checksRailDotBlocker");
  });

  it("takes the clear color on a draft with no open issue", () => {
    const html = render({});

    expect(html).toContain("checksRailDotClear");
    expect(html).not.toContain("checksRailDotBlocker");
    expect(html).not.toContain("checksRailDotAdvisory");
  });

  it("refuses the clear color while a group holds back", () => {
    const html = render({ zodValid: false });

    expect(html).not.toContain("checksRailDotClear");
    expect(html).toContain("checksRailDotBlocker");
  });

  it("names the count and the dot's own reading in one accessible name", () => {
    // Two `zod` entries: the zod group never holds back, and its own entries
    // leave the later groups running, so the summary reads a plain count.
    const html = render({ issues: [issue("zod"), issue("zod")] });

    expect(html).toContain("Checks: 2 open issues, one of which refuses a publish.");
    // The dot itself says nothing: the name above already carries it.
    expect(html).toContain('aria-hidden="true"');
  });

  it("prints the open issue count beside the name", () => {
    expect(render({ issues: [issue("zod"), issue("zod")] })).toContain(">2<");
  });

  it("names one issue in the singular", () => {
    const html = render({ issues: [issue("zod")] });

    expect(html).toContain("Checks: one open issue, and it refuses a publish.");
    expect(html).not.toContain("1 open issues");
  });

  it("names one advisory issue in the singular", () => {
    const html = render({ issues: [issue("view")] });

    expect(html).toContain("Checks: one open issue, and it refuses no publish.");
    expect(html).not.toContain("1 open issues");
  });
});

describe("The Publish control's permission gate", () => {
  it("marks the control unavailable and names the reason when the report reads false", () => {
    const html = renderToStaticMarkup(<PublishNavControl canPublish={false} publishing={false} onPublish={() => {}} />);

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Needs the publish permission for this process");
    // The reason is text the control points at, not a tooltip: a `title`
    // reaches neither the keyboard nor a screen reader.
    expect(html).not.toContain("title=");
  });

  it("points aria-describedby at the reason it renders, by that element's own id", () => {
    const html = renderToStaticMarkup(<PublishNavControl canPublish={false} publishing={false} onPublish={() => {}} />);

    const described = /aria-describedby="([^"]+)"/.exec(html);
    expect(described).not.toBeNull();
    expect(html).toContain(`id="${described![1]}"`);
  });

  it("keeps the control rendered and focusable, so a screen reader reaches that reference", () => {
    const html = renderToStaticMarkup(<PublishNavControl canPublish={false} publishing={false} onPublish={() => {}} />);

    expect(html).toContain("Publish");
    // The violating input: the native `disabled` attribute, which takes the
    // control out of the tab order and so silences its own description.
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('role="group"');
  });

  it("sends no publish request when activated while unavailable", () => {
    let published = 0;
    const item = PublishNavControl({ canPublish: false, publishing: false, onPublish: () => published++ });
    // The rendered click handler, called the way an activation calls it.
    const button = (item.props as { children: { props: { onClick: () => void } }[] }).children[0]!;
    button.props.onClick();

    expect(published).toBe(0);
  });

  it("offers the control unchanged when the report reads true", () => {
    const html = renderToStaticMarkup(<PublishNavControl canPublish={true} publishing={false} onPublish={() => {}} />);

    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("Needs the publish permission");
  });
});

/** Every `<button ...>` open tag in a rendered string, in DOM order. The
 * focus question is which single one of them carries `autofocus`, so the
 * attributes have to stay attached to their own tag. */
function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("The publish dialog", () => {
  it("names the process, the revision and the version the publish mints", () => {
    const html = render({ actions: { pendingDialog: "publish" } });

    expect(html).toContain("Publish this draft");
    expect(html).toContain("Expense approval");
    expect(html).toContain(">7<");
    expect(html).toContain(">v4<");
    expect(html).toContain("A published version can never change");
  });

  it("names no open issue and no refusal on a clean draft", () => {
    const html = render({ actions: { pendingDialog: "publish" } });

    expect(html).toContain("Open issues");
    expect(html).toContain(">0<");
    expect(html).not.toContain("The engine refuses this publish");
  });

  it("names the open issue count and the refusal on a draft carrying a blocker", () => {
    const html = render({ issues: [issue("structural")], actions: { pendingDialog: "publish" } });

    expect(html).toContain("Open issues");
    expect(html).toContain(">1<");
    expect(html).toContain("The engine refuses this publish until somebody fixes a blocking issue.");
  });

  it("counts an advisory issue without naming a refusal", () => {
    const html = render({ issues: [issue("view")], actions: { pendingDialog: "publish" } });

    expect(html).toContain(">1<");
    expect(html).not.toContain("The engine refuses this publish");
  });

  it("states the unsaved-changes sentence only when the draft is dirty", () => {
    expect(render({ actions: { pendingDialog: "publish" } })).not.toContain("Publishing saves them first");
    expect(render({ isDirty: true, actions: { pendingDialog: "publish" } })).toContain("Publishing saves them first");
  });

  it("renders a refusal inside the open dialog, never behind it", () => {
    const html = render({ actions: { pendingDialog: "publish", error: "refused" } });

    expect(html).toContain("<dialog");
    expect(html).toContain("refused");
  });
});

describe("The discard dialog", () => {
  it("names what a discard keeps", () => {
    const html = render({ actions: { pendingDialog: "discard" } });

    expect(html).toContain("Discard this draft");
    expect(html).toContain("The published versions stay");
    expect(html).toContain("btn-destructive");
  });
});

/**
 * Each dialog exists to question an act the studio cannot undo. A dialog that
 * opens with that act's own button focused invites the reflexive Enter it was
 * built to catch, so Cancel takes the initial focus in both.
 */
describe("Neither dialog primes the button it cannot undo", () => {
  it("primes Cancel in the publish dialog, and nothing else", () => {
    const primed = buttonTags(render({ actions: { pendingDialog: "publish" } })).filter((b) => b.includes("autofocus"));

    expect(primed).toHaveLength(1);
    expect(primed[0]).toContain("btn-ghost");
  });

  it("primes Cancel in the discard dialog, and nothing else", () => {
    const primed = buttonTags(render({ actions: { pendingDialog: "discard" } })).filter((b) => b.includes("autofocus"));

    expect(primed).toHaveLength(1);
    expect(primed[0]).toContain("btn-ghost");
  });

  it("leaves Discard draft unprimed, the violating input this rejects", () => {
    const destructive = buttonTags(render({ actions: { pendingDialog: "discard" } })).find((b) =>
      b.includes("btn-destructive"),
    );

    expect(destructive).toBeDefined();
    expect(destructive).not.toContain("autofocus");
  });
});
