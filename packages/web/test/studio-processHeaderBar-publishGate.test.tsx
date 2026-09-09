import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { DraftToolbarActions } from "../src/areas/studio/panels/DraftToolbar.js";
import { ProcessHeaderBar, PublishNavControl, PublishReasonLine } from "../src/areas/studio/panels/ProcessHeaderBar.js";

/**
 * studio-publish-gate-and-report: the header bar announces a failed mutation.
 *
 * One defect reached the running build before this: the refusal rendered as a
 * bare colored paragraph, as one more inline item in a wrapping row of ten
 * badges, with no alert role on it — it reached the DOM and reached nobody.
 *
 * `studio-draft-actions-to-header-bar` moved Save, Discard draft and Publish
 * (and their two confirmation dialogs, and the Publish permission gate) back
 * into this header bar, right-aligned ahead of the `⋮` menu trigger — this
 * file covers all of it now. `studio-draftNavControls.test.tsx` keeps only
 * the Checks control, which stays in the studio's area nav.
 *
 * Renders `<DraftContext.Provider>` with a hand-built value, the idiom
 * `studio-processHeaderBar-findingFallback.test.tsx` established for this same
 * component — never a live `DraftProvider`, whose fetch effects never resolve
 * under static rendering.
 */
const validation: ValidationResult = {
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

const contextValue: DraftContextValue = {
  draft: { label: { en: "Expense approval" }, baseLocale: "en" },
  mutate: () => {},
  replace: () => {},
  validation,
  loadedChildren: {},
  setChildForStep: () => {},
  registry: undefined,
  loadedChainingTargets: {},
  contentLocale: "en",
  setContentLocale: () => {},
  usedLocales: ["en"],
  loadGeneration: 0,
};

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

/** The `⋮` menu is closed until something opens it, and no static render fires
 * a click. `menuOpen` is component state, so the menu's own markup is out of
 * reach here; what this renders is the header row, the button group, either
 * confirmation dialog and the failure region. */
function renderHeader(over: {
  actions?: Partial<DraftToolbarActions>;
  conflict?: boolean;
  issues?: EditorIssue[];
  zodValid?: boolean;
  isDirty?: boolean;
  canPublish?: boolean;
  baseVersion?: number | null;
}): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue}>
      <ProcessHeaderBar
        revision={7}
        isDirty={over.isDirty ?? false}
        lastSavedAt={undefined}
        publishResult={null}
        conflict={over.conflict ?? false}
        actions={{ ...noActions, ...over.actions }}
        canPublish={over.canPublish ?? true}
        baseVersion={over.baseVersion ?? 3}
        validation={validationOf(over.issues ?? [], over.zodValid ?? true)}
        processLabel="Expense approval"
        structureActive={true}
        processId="proc_a"
        go={() => {}}
        onToggleJson={() => {}}
        onVersions={() => {}}
        onPlayer={() => {}}
      />
    </DraftContext.Provider>,
  );
}

/** Every `<button ...>` open tag in a rendered string, in DOM order. The
 * focus question is which single one of them carries `autofocus`, so the
 * attributes have to stay attached to their own tag. */
function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("ProcessHeaderBar's failure region", () => {
  it("announces a failed mutation as an alert banner, not as a bare paragraph", () => {
    const html = renderHeader({ actions: { error: "You don't have permission to do that." } });

    expect(html).toContain('role="alert"');
    expect(html).toContain("errorBanner");
    expect(html).toContain("You don&#x27;t have permission to do that.");
    // The violating input: the shape this change replaced.
    expect(html).not.toContain('<p class="studio-error">');
  });

  it("puts the banner outside the header element, so it is not one more flex item", () => {
    const html = renderHeader({ actions: { error: "refused" } });

    expect(html.indexOf("errorBanner")).toBeGreaterThan(html.indexOf("</header>"));
  });

  it("gives the save conflict the same banner shape, keeping its Reload button", () => {
    const html = renderHeader({ conflict: true });

    expect(html).toContain("errorBanner");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Reload");
    expect(html).not.toContain("studio-conflict");
  });

  it("suppresses the banner while a dialog is open, so one failure announces once", () => {
    const html = renderHeader({ actions: { error: "refused", pendingDialog: "publish" } });

    expect(html).not.toContain("errorBanner");
  });

  it("renders no failure region at all when nothing failed", () => {
    const html = renderHeader({});

    expect(html).not.toContain("errorBanner");
    expect(html).not.toContain('role="alert"');
  });
});

/**
 * Task 2.9 and task 2.15 of `studio-guided-surface`. The header bar stands no
 * Structure/JSON pair, and its `⋮` menu carries none of the area nav's one
 * control (Checks) or of Save, Discard draft and Publish, which stand in this
 * row instead (`studio-draft-actions-to-header-bar`). `studio-header-menu-merge`
 * later gave the JSON toggle a home in this same `⋮` menu's own "Views"
 * group, so this still holds: it names the area nav's one control and the
 * three header-row actions, not the JSON toggle itself.
 */
describe("What the header bar no longer carries", () => {
  it("stands no Structure control and no JSON control", () => {
    const html = renderHeader({});

    expect(html).not.toContain("Structure");
    expect(html).not.toContain(">JSON<");
    expect(html).not.toContain('role="tablist"');
  });

  it("mounts the confirmation dialog its pending state names", () => {
    expect(renderHeader({ actions: { pendingDialog: "publish" } })).toContain("<dialog");
    expect(renderHeader({ actions: { pendingDialog: "discard" } })).toContain("<dialog");
    expect(renderHeader({})).not.toContain("<dialog");
  });
});

describe("The publish dialog", () => {
  it("names the process, the revision and the version the publish mints", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish" } });

    expect(html).toContain("Publish this draft");
    expect(html).toContain("Expense approval");
    expect(html).toContain(">7<");
    expect(html).toContain(">v4<");
    expect(html).toContain("A published version can never change");
  });

  it("names no open issue and no refusal on a clean draft", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish" } });

    expect(html).toContain("Open issues");
    expect(html).toContain(">0<");
    expect(html).not.toContain("The engine refuses this publish");
  });

  it("names the open issue count and the refusal on a draft carrying a blocker", () => {
    const html = renderHeader({ issues: [issue("structural")], actions: { pendingDialog: "publish" } });

    expect(html).toContain("Open issues");
    expect(html).toContain(">1<");
    expect(html).toContain("The engine refuses this publish until somebody fixes a blocking issue.");
  });

  it("counts an advisory issue without naming a refusal", () => {
    const html = renderHeader({ issues: [issue("view")], actions: { pendingDialog: "publish" } });

    expect(html).toContain(">1<");
    expect(html).not.toContain("The engine refuses this publish");
  });

  it("states the unsaved-changes sentence only when the draft is dirty", () => {
    expect(renderHeader({ actions: { pendingDialog: "publish" } })).not.toContain("Publishing saves them first");
    expect(renderHeader({ isDirty: true, actions: { pendingDialog: "publish" } })).toContain("Publishing saves them first");
  });

  it("renders a refusal inside the open dialog, never behind it", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish", error: "refused" } });

    expect(html).toContain("<dialog");
    expect(html).toContain("refused");
  });
});

describe("The discard dialog", () => {
  it("names what a discard keeps", () => {
    const html = renderHeader({ actions: { pendingDialog: "discard" } });

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
    const primed = buttonTags(renderHeader({ actions: { pendingDialog: "publish" } })).filter((b) => b.includes("autofocus"));

    expect(primed).toHaveLength(1);
    expect(primed[0]).toContain("btn-ghost");
  });

  it("primes Cancel in the discard dialog, and nothing else", () => {
    const primed = buttonTags(renderHeader({ actions: { pendingDialog: "discard" } })).filter((b) => b.includes("autofocus"));

    expect(primed).toHaveLength(1);
    expect(primed[0]).toContain("btn-ghost");
  });

  it("leaves Discard draft unprimed, the violating input this rejects", () => {
    const destructive = buttonTags(renderHeader({ actions: { pendingDialog: "discard" } })).find((b) =>
      b.includes("btn-destructive"),
    );

    expect(destructive).toBeDefined();
    expect(destructive).not.toContain("autofocus");
  });
});

describe("The Publish control's permission gate", () => {
  it("marks the control unavailable when the report reads false", () => {
    const html = renderToStaticMarkup(<PublishNavControl canPublish={false} blocked={false} publishing={false} onPublish={() => {}} />);

    expect(html).toContain('aria-disabled="true"');
    // The reason is text the control points at, not a tooltip: a `title`
    // reaches neither the keyboard nor a screen reader.
    expect(html).not.toContain("title=");
  });

  it("names the permission reason on the line, in the muted register", () => {
    const html = renderToStaticMarkup(<PublishReasonLine canPublish={false} blocked={false} />);

    expect(html).toContain("Needs the publish permission for this process");
  });

  // The control and its reason render in two places in the row now, so the
  // id reference is the whole binding. It has to survive that separation.
  it("points aria-describedby at the id the reason line renders", () => {
    const control = renderToStaticMarkup(<PublishNavControl canPublish={false} blocked={false} publishing={false} onPublish={() => {}} />);
    const reason = renderToStaticMarkup(<PublishReasonLine canPublish={false} blocked={false} />);

    const described = /aria-describedby="([^"]+)"/.exec(control);
    expect(described).not.toBeNull();
    expect(reason).toContain(`id="${described![1]}"`);
  });

  it("keeps the control rendered and focusable, so a screen reader reaches that reference", () => {
    const html = renderToStaticMarkup(<PublishNavControl canPublish={false} blocked={false} publishing={false} onPublish={() => {}} />);

    expect(html).toContain("Publish");
    // The violating input: the native `disabled` attribute, which takes the
    // control out of the tab order and so silences its own description.
    expect(html).not.toContain('disabled=""');
    expect(html).toContain("aria-describedby");
  });

  it("sends no publish request when activated while unavailable", () => {
    let published = 0;
    // The rendered click handler, called the way an activation calls it.
    const button = PublishNavControl({ canPublish: false, blocked: false, publishing: false, onPublish: () => published++ });
    (button.props as { onClick: () => void }).onClick();

    expect(published).toBe(0);
  });

  it("offers the control unchanged when the report reads true", () => {
    const html = renderToStaticMarkup(<PublishNavControl canPublish={true} blocked={false} publishing={false} onPublish={() => {}} />);

    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("aria-describedby");
  });

  it("renders no reason line at all for a clear, permitted draft", () => {
    expect(renderToStaticMarkup(<PublishReasonLine canPublish={true} blocked={false} />)).toBe("");
  });

  // The reason is the action cluster's own leading item, which is what holds
  // every control still: the cluster's `marginLeft: auto` pins its trailing
  // edge, so it grows leftward instead of moving Publish. A line placed
  // BESIDE the cluster takes that margin with it, and the whole cluster then
  // strands at the row's leading edge wherever the row wraps.
  //
  // What a static render sees is the nesting depth between the reason and
  // Save. One `<div>` opens between them, the `draftActions` wrapper that
  // holds the three buttons. A reason placed ahead of the cluster would put
  // the cluster's own wrapper there too, and the count would read two.
  it("renders the reason as the action cluster's leading item, ahead of Save", () => {
    const html = renderHeader({ canPublish: false });
    const reasonAt = html.indexOf('id="studio-publish-reason"');
    const saveAt = html.indexOf(">Save<");

    expect(reasonAt).toBeGreaterThan(-1);
    expect(saveAt).toBeGreaterThan(reasonAt);
    expect(html.slice(reasonAt, saveAt).match(/<div/g) ?? []).toHaveLength(1);
  });

  it("keeps the blocked reason in that same place", () => {
    const html = renderHeader({ issues: [issue("cel")] });
    const reasonAt = html.indexOf('id="studio-publish-reason"');
    const saveAt = html.indexOf(">Save<");

    expect(html).toContain("Blocked by an open issue");
    expect(saveAt).toBeGreaterThan(reasonAt);
    expect(html.slice(reasonAt, saveAt).match(/<div/g) ?? []).toHaveLength(1);
  });

  // A blocking issue names itself before the click, rather than only inside
  // the dialog the click opens (`studio-publish`). The control stays operable
  // either way: a blocked draft is still publishable.
  it("names the blocking reason on the line, and leaves the control operable", () => {
    const control = renderToStaticMarkup(<PublishNavControl canPublish={true} blocked={true} publishing={false} onPublish={() => {}} />);
    const reason = renderToStaticMarkup(<PublishReasonLine canPublish={true} blocked={true} />);

    expect(reason).toContain("Blocked by an open issue");
    expect(control).not.toContain("aria-disabled");
    expect(control).not.toContain('disabled=""');
  });

  it("points aria-describedby at the blocking reason too, by that element's own id", () => {
    const control = renderToStaticMarkup(<PublishNavControl canPublish={true} blocked={true} publishing={false} onPublish={() => {}} />);
    const reason = renderToStaticMarkup(<PublishReasonLine canPublish={true} blocked={true} />);

    const described = /aria-describedby="([^"]+)"/.exec(control);
    expect(described).not.toBeNull();
    expect(reason).toContain(`id="${described![1]}"`);
  });

  // The two reasons share one slot and one register, and part on tone alone:
  // the blocked one names an issue the draft carries, so it takes the refusal
  // color. What a static render sees is the class list, which must differ.
  it("parts the blocked reason from the permission reason by class", () => {
    const cls = (html: string) => /class="([^"]*)"/.exec(html)?.[1];
    const blocked = cls(renderToStaticMarkup(<PublishReasonLine canPublish={true} blocked={true} />));
    const denied = cls(renderToStaticMarkup(<PublishReasonLine canPublish={false} blocked={false} />));

    expect(blocked).toBeDefined();
    expect(denied).toBeDefined();
    expect(blocked).not.toBe(denied);
  });

  it("still publishes when activated while blocked but permitted", () => {
    let published = 0;
    const button = PublishNavControl({ canPublish: true, blocked: true, publishing: false, onPublish: () => published++ });
    (button.props as { onClick: () => void }).onClick();

    expect(published).toBe(1);
  });
});

/**
 * `studio-header-menu-merge`: the `⋮` menu now carries what the tab row's
 * own overflow menu used to (JSON surface, Versions, Player), so this
 * trigger's closed-state markup gets the same coverage that menu's trigger
 * had before it was deleted.
 */
describe("The header bar's ⋮ menu", () => {
  it("stays closed until something opens it", () => {
    const html = renderHeader({});

    expect(html).toContain('aria-haspopup="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
});
