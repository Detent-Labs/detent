import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { PublishResult } from "../src/areas/studio/api/types.js";
import type { DraftToolbarActions } from "../src/areas/studio/panels/DraftToolbar.js";
import { ProcessHeaderBar, PublishNavControl, PublishReasonLine } from "../src/areas/studio/panels/ProcessHeaderBar.js";

/**
 * studio-publish-gate-and-report: the header bar announces a failed mutation.
 *
 * One defect reached the running build before this: the refusal rendered as a
 * bare colored paragraph, as one more inline item in a wrapping row of ten
 * badges, with no alert role on it — it reached the DOM and reached nobody.
 *
 * The header bar holds the back control, the name, the state, Test, Publish and
 * the `⋮` menu, with the two confirmation dialogs and the Publish permission gate. This file covers all of
 * it. `studio-draftNavControls.test.tsx` keeps only the Checks control, which
 * stays in the studio's area nav.
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
  draft: { label: { en: "Expense approval" }, baseLocale: "en", key: "expense_approval_key" },
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
  discarding: false,
  error: null,
  errorDetail: null,
  pendingDialog: null,
  resolveDialog: () => {},
  saveFailed: null,
  retry: () => {},
  flush: () => Promise.resolve({ saved: false }),
  drop: () => {},
  createSavePoint: () => Promise.resolve({ kind: "unsaved" }),
  restoreSavePoint: () => Promise.resolve({ kind: "unsaved" }),
  removeSavePoint: () => Promise.resolve({ kind: "done", value: undefined }),
  discard: () => {},
  publish: () => undefined,
  reload: () => {},
  reportError: () => {},
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
  noticeStands?: boolean;
  issues?: EditorIssue[];
  zodValid?: boolean;
  isDirty?: boolean;
  canPublish?: boolean;
  baseVersion?: number | null;
  lastSavedAt?: Date;
  publishResult?: PublishResult;
  justPublished?: boolean;
  structureActive?: boolean;
  jsonUnapplied?: boolean;
  contentLocale?: string;
  draft?: DraftContextValue["draft"];
}): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={{ ...contextValue, draft: over.draft ?? contextValue.draft, contentLocale: over.contentLocale ?? "en" }}>
      <ProcessHeaderBar
        revision={7}
        isDirty={over.isDirty ?? false}
        lastSavedAt={over.lastSavedAt}
        publishResult={over.publishResult ?? null}
        conflict={over.conflict ?? false}
        noticeStands={over.noticeStands ?? false}
        jsonUnapplied={over.jsonUnapplied ?? false}
        actions={{ ...noActions, ...over.actions }}
        canPublish={over.canPublish ?? true}
        baseVersion={over.baseVersion === undefined ? 3 : over.baseVersion}
        validation={validationOf(over.issues ?? [], over.zodValid ?? true)}
        processLabel="Expense approval"
        structureActive={over.structureActive ?? true}
        processId="proc_a"
        token="token"
        justPublished={over.justPublished ?? false}
        onBack={() => {}}
        onOpenSettings={() => {}}
        onToggleJson={() => {}}
        onVersions={() => {}}
        onPlayer={() => {}}
        onSavePoints={() => {}}
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

  it("keeps the server's text outside the banner's alert, in a closed Developer view", () => {
    const html = renderHeader({ actions: { error: "Publishing stopped.", errorDetail: "kind\nloc: raw" } });

    const banner = html.slice(html.indexOf("errorBanner"), html.indexOf("</div>", html.indexOf("errorBanner")));
    expect(banner).toContain("Publishing stopped.");
    expect(banner).not.toContain("loc: raw");
    expect(html).toContain("loc: raw");
    expect(html).toContain("Developer view");
  });

  it("puts the banner outside the header element, so it is not one more flex item", () => {
    const html = renderHeader({ actions: { error: "refused" } });

    expect(html.indexOf("errorBanner")).toBeGreaterThan(html.indexOf("</header>"));
  });

  it("says what Reload costs over a dirty draft, and keeps the plain sentence over a clean one", () => {
    const dirty = renderHeader({ conflict: true, isDirty: true });
    const clean = renderHeader({ conflict: true });

    expect(dirty).toContain("This draft was changed elsewhere. Reload loads the stored draft and drops your unsaved changes.");
    expect(clean).toContain("This draft was changed elsewhere.");
    expect(clean).not.toContain("drops your unsaved changes");
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
 * The header bar stands no Structure/JSON pair. The JSON entry stands in the
 * `⋮` menu's "Views" group, out of this closed-menu render.
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

/** The publish dialog's Developer view `<details>`, and the dialog without it. */
function splitDialogDeveloperView(html: string): { inside: string; outside: string } {
  const summary = html.indexOf(">Developer view</summary>");
  expect(summary).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<details", summary);
  const end = html.indexOf("</details>", summary) + "</details>".length;
  return { inside: html.slice(start, end), outside: html.slice(0, start) + html.slice(end) };
}

describe("Unapplied JSON in the header bar", () => {
  it("reads as unsaved changes while the draft itself stands clean", () => {
    expect(renderHeader({ jsonUnapplied: true })).toContain("Unsaved changes");
    expect(renderHeader({})).not.toContain("Unsaved changes");
  });

  it("adds a note to the Publish dialog", () => {
    const note = "The JSON you have not applied is not part of this publish.";

    expect(renderHeader({ jsonUnapplied: true, actions: { pendingDialog: "publish" } })).toContain(note);
    expect(renderHeader({ actions: { pendingDialog: "publish" } })).not.toContain(note);
  });
});

describe("The publish dialog", () => {
  it("names the process and the version the publish mints", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish" } });

    expect(html).toContain("Publish this draft");
    expect(html).toContain("Expense approval");
    expect(html).toContain(">v4<");
    expect(html).toContain("A published version can never change");
  });

  it("holds the key, the process id and the revision in a closed Developer view", () => {
    const { inside, outside } = splitDialogDeveloperView(renderHeader({ actions: { pendingDialog: "publish" } }));

    expect(inside.match(/^<details[^>]*>/)![0]).not.toContain("open");
    expect(inside).toContain(">Key</dt>");
    expect(inside).toContain(">expense_approval_key</dd>");
    expect(inside).toContain(">Process id</dt>");
    expect(inside).toContain(">proc_a</dd>");
    expect(inside).toContain(">Revision</dt>");
    expect(inside).toContain(">7</dd>");
    for (const value of ["expense_approval_key", "proc_a", ">Revision<", ">Process id<", ">Key<"]) {
      expect(outside).not.toContain(value);
    }
  });

  it("asks its heading as a question", () => {
    expect(renderHeader({ actions: { pendingDialog: "publish" } })).toContain("Publish this draft?</h2>");
  });

  it("prints the next version and the open issue count in mono, a zero included", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish" } });

    expect(html).toMatch(/<dt[^>]*>Next version<\/dt><dd class="value mono">v4<\/dd>/);
    expect(html).toMatch(/<dt[^>]*>Open issues<\/dt><dd class="value mono">0<\/dd>/);
  });

  it("prints the process in the written face", () => {
    expect(renderHeader({ actions: { pendingDialog: "publish" } })).toMatch(/<dt[^>]*>Process<\/dt><dd class="value">Expense approval<\/dd>/);
  });

  it("disables both controls while a publish runs", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish", publishing: true } });
    const dialogTags = buttonTags(html.slice(html.indexOf("<dialog")));

    expect(dialogTags.filter((b) => b.includes("disabled"))).toHaveLength(2);
    expect(html.slice(html.indexOf("<dialog"))).toContain("Publishing…");
  });

  it("waits on the confirm alone while a change has not landed, and Cancel stays live", () => {
    for (const [isDirty, saving] of [[true, false], [false, true], [true, true]] as const) {
      const html = renderHeader({ isDirty, actions: { pendingDialog: "publish", saving } });
      const dialog = html.slice(html.indexOf("<dialog"));
      const confirm = /<button[^>]*>Saving…<\/button>/.exec(dialog)?.[0];

      expect(confirm).toContain('aria-disabled="true"');
      expect(confirm).not.toContain('disabled=""');
      expect(buttonTags(dialog).filter((b) => /\sdisabled=/.test(b))).toHaveLength(0);
      expect(dialog).toContain(">Cancel</button>");
    }
  });

  it("carries no wait on a clean draft with no request running", () => {
    const dialog = renderHeader({ actions: { pendingDialog: "publish" } });
    const confirm = /<button[^>]*>Publish<\/button>/.exec(dialog.slice(dialog.indexOf("<dialog")))?.[0];

    expect(confirm).not.toContain("aria-disabled");
  });

  it("omits the key row when the draft has no key", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish" }, draft: { label: { en: "Expense approval" }, baseLocale: "en" } });
    const { inside } = splitDialogDeveloperView(html);

    expect(inside).not.toContain(">Key</dt>");
    expect(inside).toContain(">Process id</dt>");
  });

  it("names no language for a draft in one language", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish" } });

    expect(html).not.toContain(">Languages</dt>");
  });

  it("names each language with its gap count for a draft in two", () => {
    const draft = { label: { en: "Expense approval", de: "Spesen" }, description: { en: "a" }, baseLocale: "en", key: "expense_approval_key" };
    const html = renderHeader({ actions: { pendingDialog: "publish" }, draft });
    const facts = html.slice(html.indexOf(">Languages</dt>"));
    const list = facts.slice(0, facts.indexOf("</ul>"));

    expect(html).toContain(">Languages</dt>");
    expect(list).toContain("<li>German (de) \u2014 1 missing</li>");
    expect(list).toContain("<li>English (en)</li>");
  });

  // Mono marks a value the engine matches exactly. "de \u2014 1 missing" is
  // prose around a code, so the list takes the body face. Compiled classes are
  // atomic, so the class the machine-value rows add over a plain row is the
  // mono face (plus nothing else), and the list must not carry it.
  it("prints the Languages fact in the body face, not mono", () => {
    const draft = { label: { en: "Expense approval", de: "Spesen" }, description: { en: "a" }, baseLocale: "en", key: "expense_approval_key" };
    const html = renderHeader({ actions: { pendingDialog: "publish" }, draft });
    const classesOf = (tag: string) => new Set(/class="([^"]*)"/.exec(tag)?.[1]?.split(" ") ?? []);
    const monoRow = classesOf(html.slice(html.indexOf("</dt>", html.indexOf(">Process id</dt>")) + 5));
    const plainRow = classesOf(html.slice(html.indexOf("</dt>", html.indexOf(">Process</dt>")) + 5));
    const monoOnly = [...monoRow].filter((c) => !plainRow.has(c));
    const list = classesOf(html.slice(html.indexOf("<ul", html.indexOf(">Languages</dt>"))));

    expect(monoOnly.length).toBeGreaterThan(0);
    for (const c of monoOnly) expect(list.has(c)).toBe(false);
  });

  it("names no open issue and no refusal on a clean draft", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish" } });

    expect(html).toContain("Open issues");
    expect(html).toContain(">0<");
    expect(html).not.toContain("This draft cannot go out yet");
  });

  it("names the open issue count and the refusal on a draft carrying a blocker", () => {
    const html = renderHeader({ issues: [issue("structural")], actions: { pendingDialog: "publish" } });

    expect(html).toContain("Open issues");
    expect(html).toContain(">1<");
    expect(html).toContain("This draft cannot go out yet. Open Checks and fix what it marks Must fix.");
  });

  it("counts an advisory issue without naming a refusal", () => {
    const html = renderHeader({ issues: [issue("view")], actions: { pendingDialog: "publish" } });

    expect(html).toContain(">1<");
    expect(html).not.toContain("This draft cannot go out yet");
  });

  it("states no unsaved-changes sentence, since a publish no longer saves first", () => {
    expect(renderHeader({ actions: { pendingDialog: "publish" } })).not.toContain("Publishing saves them first");
    expect(renderHeader({ isDirty: true, actions: { pendingDialog: "publish" } })).not.toContain("Publishing saves them first");
  });

  it("disables both of the discard dialog's controls while a save runs, so its confirm cannot pass that save", () => {
    const tags = (actions: Partial<DraftToolbarActions>) => {
      const html = renderHeader({ actions: { pendingDialog: "discard", ...actions } });
      return buttonTags(html.slice(html.indexOf("<dialog"))).filter((b) => /\sdisabled=/.test(b));
    };

    expect(tags({ saving: true })).toHaveLength(2);
    expect(tags({ discarding: true })).toHaveLength(2);
    expect(tags({})).toHaveLength(0);
  });

  // A static render fires no effect, so the base body's read never starts and
  // the row stands in its reading state. The one `<details>` is the Developer view.
  it("carries the Changes row: reading the base version, or a first version", () => {
    const reading = renderHeader({ actions: { pendingDialog: "publish" } });
    expect(reading).toContain(">Changes<");
    expect(reading).toContain("Reading version 3…");
    expect(reading.match(/<details/g)).toHaveLength(1);

    const first = renderHeader({ baseVersion: null, actions: { pendingDialog: "publish" } });
    expect(first).toContain("This publish mints the first version.");
    expect(first.match(/<details/g)).toHaveLength(1);
  });

  it("renders a refusal inside the open dialog, never behind it", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish", error: "refused" } });

    expect(html).toContain("<dialog");
    expect(html).toContain("refused");
  });

  it("keeps the server's text in a closed Developer view beside the alert", () => {
    const detail = "schema-validation\nworkflow.steps[0]: bad";
    const html = renderHeader({ actions: { pendingDialog: "publish", error: "Publishing stopped.", errorDetail: detail } });

    const alert = html.slice(html.indexOf('role="alert"'), html.indexOf("</p>", html.indexOf('role="alert"')));
    expect(alert).toContain("Publishing stopped.");
    expect(alert).not.toContain("workflow.steps[0]: bad");
    expect(html).toContain("workflow.steps[0]: bad");
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("prints no Developer view for a refusal with no detail", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish", error: "refused" } });

    expect(html.match(/<details/g)).toHaveLength(1);
  });
});

describe("The discard dialog", () => {
  it("names what a discard keeps", () => {
    const html = renderHeader({ actions: { pendingDialog: "discard" } });

    expect(html).toContain("Discard this draft?</h2>");
    expect(html).toContain("The published versions stay. Only the unpublished draft goes.");
    expect(html).toContain("btn-destructive");
  });

  it("states the process and prints no revision", () => {
    const html = renderHeader({ actions: { pendingDialog: "discard" } });

    expect(html).toMatch(/<dt[^>]*>Process<\/dt><dd class="value">Expense approval<\/dd>/);
    expect(html).not.toContain("Revision");
  });

  it("states the last save as a date and a time where one is known", () => {
    const html = renderHeader({ actions: { pendingDialog: "discard" }, lastSavedAt: new Date(2026, 9, 31, 14, 5) });
    const row = /<dt[^>]*>Last saved<\/dt><dd[^>]*>([^<]*)<\/dd>/.exec(html);

    expect(row).not.toBeNull();
    expect(row![1]).toContain("2026");
    expect(row![1]).toMatch(/\d{1,2}:05/);
  });

  it("prints no Last saved row where the save time is unknown", () => {
    expect(renderHeader({ actions: { pendingDialog: "discard" } })).not.toContain("Last saved");
  });

  it("disables both controls while the request runs", () => {
    const html = renderHeader({ actions: { pendingDialog: "discard", discarding: true } });
    const dialogTags = buttonTags(html.slice(html.indexOf("<dialog")));

    expect(dialogTags.filter((b) => b.includes("disabled"))).toHaveLength(2);
  });

  it("keeps both controls enabled while no request runs", () => {
    const html = renderHeader({ actions: { pendingDialog: "discard" } });
    const dialogTags = buttonTags(html.slice(html.indexOf("<dialog")));

    expect(dialogTags.filter((b) => b.includes("disabled"))).toHaveLength(0);
  });

  it("renders a refusal inside the open dialog, with the server's text in a closed Developer view", () => {
    const html = renderHeader({ actions: { pendingDialog: "discard", error: "Discard stopped.", errorDetail: "raw\ntext" } });

    expect(html).toContain('role="alert"');
    expect(html).toContain("Discard stopped.");
    expect(html).toContain("raw\ntext");
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).not.toContain("errorBanner");
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
    expect(primed[0]).toContain('class="btn btn-secondary"');
  });

  it("primes Cancel in the discard dialog, and nothing else", () => {
    const primed = buttonTags(renderHeader({ actions: { pendingDialog: "discard" } })).filter((b) => b.includes("autofocus"));

    expect(primed).toHaveLength(1);
    expect(primed[0]).toContain('class="btn btn-secondary"');
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
  // Test. One `<div>` opens between them, the `draftActions` wrapper that
  // holds Test and Publish. A reason placed ahead of the cluster would put
  // the cluster's own wrapper there too, and the count would read two.
  it("renders the reason as the action cluster's leading item, ahead of Test", () => {
    const html = renderHeader({ canPublish: false });
    const reasonAt = html.indexOf('id="studio-publish-reason"');
    const testAt = html.indexOf(">Test<");

    expect(reasonAt).toBeGreaterThan(-1);
    expect(testAt).toBeGreaterThan(reasonAt);
    expect(html.slice(reasonAt, testAt).match(/<div/g) ?? []).toHaveLength(1);
  });

  it("keeps the blocked reason in that same place", () => {
    const html = renderHeader({ issues: [issue("cel")] });
    const reasonAt = html.indexOf('id="studio-publish-reason"');
    const testAt = html.indexOf(">Test<");

    expect(html).toContain("Blocked by an open issue");
    expect(testAt).toBeGreaterThan(reasonAt);
    expect(html.slice(reasonAt, testAt).match(/<div/g) ?? []).toHaveLength(1);
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

describe("The Publish control on a draft with no step yet", () => {
  const cls = (html: string) => /class="([^"]*)"/.exec(html)?.[1];

  it("renders unavailable, with the reason on the muted line the control points at", () => {
    const control = renderToStaticMarkup(
      <PublishNavControl canPublish={true} blocked={false} noStepYet={true} publishing={false} onPublish={() => {}} />,
    );
    const reason = renderToStaticMarkup(<PublishReasonLine canPublish={true} blocked={false} noStepYet={true} />);

    expect(control).toContain('aria-disabled="true"');
    expect(control).not.toContain('disabled=""');
    expect(reason).toContain("Publish needs a first step");
    const described = /aria-describedby="([^"]+)"/.exec(control);
    expect(described).not.toBeNull();
    expect(reason).toContain(`id="${described![1]}"`);
  });

  it("takes the muted style of the permission reason, not the blocked one", () => {
    const needsStep = cls(renderToStaticMarkup(<PublishReasonLine canPublish={true} blocked={false} noStepYet={true} />));
    const denied = cls(renderToStaticMarkup(<PublishReasonLine canPublish={false} blocked={false} />));
    const blocked = cls(renderToStaticMarkup(<PublishReasonLine canPublish={true} blocked={true} />));

    expect(needsStep).toBe(denied);
    expect(needsStep).not.toBe(blocked);
  });

  it("names only the permission reason when the actor also lacks the permission", () => {
    const reason = renderToStaticMarkup(<PublishReasonLine canPublish={false} blocked={false} noStepYet={true} />);

    expect(reason).toContain("Needs the publish permission for this process");
    expect(reason).not.toContain("Publish needs a first step");
  });

  it("sends no request and opens no dialog when activated", () => {
    let published = 0;
    const button = PublishNavControl({
      canPublish: true,
      blocked: false,
      noStepYet: true,
      publishing: false,
      onPublish: () => published++,
    });
    (button.props as { onClick: () => void }).onClick();

    expect(published).toBe(0);
  });

  it("offers the control again once a step exists", () => {
    const html = renderToStaticMarkup(
      <PublishNavControl canPublish={true} blocked={false} noStepYet={false} publishing={false} onPublish={() => {}} />,
    );

    expect(html).not.toContain("aria-disabled");
  });
});

/**
 * The `⋮` menu carries the JSON surface, Versions, Player and Discard draft.
 * `studio-processSurface.test.ts` reads its open contents at the source.
 */
describe("The header bar's ⋮ menu", () => {
  it("stays closed until something opens it", () => {
    const html = renderHeader({});

    expect(html).toContain('aria-haspopup="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
});

/** The `<header>` element's own markup, without the dialogs or the banners. */
function barOf(html: string): string {
  return html.slice(html.indexOf("<header"), html.indexOf("</header>"));
}

/** The state line's own markup. Its span closes where the open tags balance. */
function stateLineOf(html: string): string {
  const start = html.indexOf('tabindex="-1"');
  let depth = 0;
  for (const tag of html.slice(start - "<span ".length).matchAll(/<span\b|<\/span>/g)) {
    depth += tag[0] === "</span>" ? -1 : 1;
    if (depth === 0) return html.slice(start, start - "<span ".length + tag.index + tag[0].length);
  }
  throw new Error("the state line never closes");
}

const buttonLabels = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

const PUBLISHED: PublishResult = {
  processId: "proc_a",
  version: 2,
  definitionHash: "abcdef0123456789abcdef",
  status: "published",
  findings: [],
};

describe("A clean header bar", () => {
  it("holds the back control, the name, the state, Test, Publish and the menu, in that order", () => {
    const bar = barOf(renderHeader({}));
    const order = ["Back to processes", "<h1", 'role="status"', ">Test<", ">Publish<", "More actions"].map((part) => bar.indexOf(part));

    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(bar.match(/<button/g)).toHaveLength(4);
  });

  it("prints no key, revision, hash or locale select", () => {
    const bar = barOf(renderHeader({ publishResult: PUBLISHED, justPublished: true, baseVersion: 2 }));

    expect(bar).not.toContain("expense_approval_key");
    expect(bar).not.toContain("proc_a");
    expect(bar).not.toContain("rev.");
    expect(bar).not.toContain("abcdef");
    expect(bar).not.toContain("<select");
    expect(bar).not.toContain(">en<");
  });

  it("offers no Save and no Discard draft, and Test stands ahead of Publish", () => {
    const labels = buttonLabels(barOf(renderHeader({})));

    expect(labels).not.toContain("Save");
    expect(labels).not.toContain("Discard draft");
    expect(labels.indexOf("Test")).toBeLessThan(labels.indexOf("Publish"));
    expect(labels.indexOf("Test")).toBeGreaterThan(-1);
  });

  it("names the back control in words that hold the visible word", () => {
    const back = buttonTags(barOf(renderHeader({})))[0]!;

    expect(back).toContain('aria-label="Back to processes"');
    expect(buttonLabels(barOf(renderHeader({})))[0]).toBe("← Processes");
  });
});

describe("The bar has no Save", () => {
  const STATES: Parameters<typeof renderHeader>[0][] = [
    {},
    { isDirty: true },
    { isDirty: true, actions: { saving: true } },
    { isDirty: true, structureActive: false },
    { isDirty: true, conflict: true },
    { isDirty: true, actions: { saveFailed: { retryable: true, detail: "boom" } } },
  ];

  it("in any state, over either surface", () => {
    for (const state of STATES) expect(buttonLabels(renderHeader(state))).not.toContain("Save");
  });

  it("while a change saves, Publish keeps its place as the bar's primary control", () => {
    const trailing = (html: string) => {
      const labels = buttonLabels(barOf(html));
      return labels.slice(labels.indexOf("Test"));
    };
    expect(trailing(renderHeader({ isDirty: true }))).toEqual(trailing(renderHeader({})));
  });
});

describe("The state line", () => {
  const FAILED = { retryable: true, detail: "boom" };
  const words = (html: string) => /tabindex="-1"[^>]*><span[^>]*>([^<]*)</.exec(html)?.[1];
  const toneOf = (html: string) => /tabindex="-1"[^>]*><span([^>]*)>/.exec(html)?.[1];

  it("is no live region, the focus can land on it and Tab skips it", () => {
    const html = renderHeader({});
    const line = /<span[^>]*tabindex="-1"[^>]*>/.exec(html)?.[0];

    expect(line).toBeDefined();
    expect(line).not.toContain("role=");
    expect(line).not.toContain("aria-live");
  });

  it("stands beside one hidden status that starts empty", () => {
    const html = renderHeader({ isDirty: true, actions: { saveFailed: FAILED } });

    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(/<span[^>]*role="status"[^>]*><\/span>/.test(html)).toBe(true);
    expect(stateLineOf(html)).not.toContain('role="status"');
  });

  it("reads Saving… on a dirty draft", () => {
    expect(words(renderHeader({ isDirty: true }))).toBe("Saving…");
  });

  it("reads Unsaved changes on a failed save, a conflict over a change, and a change under the notice", () => {
    expect(words(renderHeader({ isDirty: true, actions: { saveFailed: FAILED } }))).toBe("Unsaved changes");
    expect(words(renderHeader({ isDirty: true, conflict: true }))).toBe("Unsaved changes");
    expect(words(renderHeader({ isDirty: true, noticeStands: true }))).toBe("Unsaved changes");
  });

  it("reads Saved just now after a save this minute", () => {
    expect(words(renderHeader({ lastSavedAt: new Date() }))).toBe("Saved just now");
  });

  it("reads Saved and the version on a clean published draft", () => {
    const line = stateLineOf(renderHeader({ baseVersion: 1 }));

    expect(line).toContain(">Saved<");
    expect(line).toMatch(/translate="no"[^>]*>v1<\/span> published/);
  });

  it("reads the save's time after a save past the minute", () => {
    const line = stateLineOf(renderHeader({ lastSavedAt: new Date(2026, 0, 2, 10, 32) }));

    expect(line).toContain("Saved at ");
    expect(line).toContain("32");
    expect(line).not.toContain("{time}");
  });

  it("prints no version on a draft nobody published", () => {
    const line = stateLineOf(renderHeader({ baseVersion: null }));

    expect(line).not.toContain("published");
    expect(line).not.toContain("·");
  });

  it("prints only Unsaved changes in the refusal tone, and the other four alike", () => {
    const classes = (html: string) => (/class="([^"]*)"/.exec(toneOf(html) ?? "")?.[1] ?? "").split(" ");
    // What the failed save's words carry and a saving line's do not: the refusal tone.
    const saving = classes(renderHeader({ isDirty: true }));
    const refusal = classes(renderHeader({ isDirty: true, actions: { saveFailed: FAILED } })).filter((name) => !saving.includes(name));
    const muted = [
      renderHeader({ isDirty: true }),
      renderHeader({ lastSavedAt: new Date() }),
      renderHeader({ lastSavedAt: new Date(2026, 0, 2, 10, 32) }),
      renderHeader({}),
    ].map(classes);

    expect(refusal).toHaveLength(1);
    expect(muted.filter((names) => names.includes(refusal[0] ?? ""))).toEqual([]);
    expect(classes(renderHeader({ isDirty: true, conflict: true }))).toContain(refusal[0]);
    expect(classes(renderHeader({ isDirty: true, noticeStands: true }))).toContain(refusal[0]);
    expect(classes(renderHeader({ jsonUnapplied: true }))).toContain(refusal[0]);
  });

  it("takes no minimum width at rest, and the width of Saved just now from the first change on", () => {
    expect(toneOf(renderHeader({}))).not.toContain("data-held-width");
    for (const html of [renderHeader({ isDirty: true }), renderHeader({ lastSavedAt: new Date() }), renderHeader({ jsonUnapplied: true })]) {
      expect(toneOf(html)).toContain('data-held-width="Saved just now"');
    }
  });
});

describe("The failed save's banner", () => {
  const RETRYING = "Your latest changes stay in this tab, unsaved. Detent keeps trying.";
  const REFUSED = "Your latest changes stay in this tab, unsaved. The server refused them.";
  const retrying = { retryable: true, detail: "HTTP 500 from the server" };
  const refused = { retryable: false, detail: "HTTP 400 from the server" };

  it("stands outside the header, with no banner while nothing failed", () => {
    const html = renderHeader({ isDirty: true, actions: { saveFailed: retrying } });

    expect(html.indexOf(RETRYING)).toBeGreaterThan(html.indexOf("</header>"));
    expect(renderHeader({ isDirty: true })).not.toContain("Try again");
  });

  it("says the backoff runs where an answer may heal, and waits where it cannot", () => {
    expect(renderHeader({ isDirty: true, actions: { saveFailed: retrying } })).toContain(RETRYING);
    const html = renderHeader({ isDirty: true, actions: { saveFailed: refused } });
    expect(html).toContain(REFUSED);
    expect(html).not.toContain(RETRYING);
  });

  it("alerts with the sentence alone, so a timed retry's flipped words read nothing out", () => {
    const alert = /role="alert"[^>]*>([^<]*)</.exec(renderHeader({ isDirty: true, actions: { saveFailed: retrying } }))?.[1];

    expect(alert).toBe(RETRYING);
  });

  it("offers Try again, live and with no aria-disabled while idle", () => {
    const tag = /<button[^>]*>Try again/.exec(renderHeader({ isDirty: true, actions: { saveFailed: retrying } }))?.[0];

    expect(tag).toBeDefined();
    expect(tag).not.toContain("aria-disabled");
  });

  it("reads Saving… and carries aria-disabled and no native disabled while a save runs", () => {
    const html = renderHeader({ isDirty: true, actions: { saving: true, saveFailed: retrying } });
    const tag = /<button[^>]*>Saving…/.exec(html)?.[0];

    expect(tag).toContain('aria-disabled="true"');
    expect(tag).not.toContain('disabled=""');
    expect(html).not.toContain("Try again");
  });

  it("holds the caught text in a closed Developer view", () => {
    const html = renderHeader({ isDirty: true, actions: { saveFailed: retrying } });

    expect(html).toContain(retrying.detail);
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    expect(/role="alert"[^>]*>[^<]*</.exec(html)?.[0]).not.toContain(retrying.detail);
  });

  it("hides while a dialog stands open, as the other banners do", () => {
    const html = renderHeader({ isDirty: true, actions: { pendingDialog: "publish", saveFailed: retrying } });

    expect(html).not.toContain(RETRYING);
    expect(html).not.toContain("Try again");
  });

  it("stands apart from the action error, which keeps its own banner", () => {
    const html = renderHeader({ isDirty: true, actions: { error: "Arrange failed", saveFailed: retrying } });

    expect(html).toContain("Arrange failed");
    expect(html).toContain(RETRYING);
  });
});

describe("After a publish", () => {
  const justPublished = () => renderHeader({ baseVersion: 2, publishResult: PUBLISHED, justPublished: true });

  it("reads the version sentence in one span, with the version in mono", () => {
    expect(stateLineOf(justPublished())).toMatch(/translate="no"[^>]*>v2<\/span> published/);
  });

  it("offers Versions after the state, and prints no hash", () => {
    const html = justPublished();
    const line = stateLineOf(html);

    expect(line).not.toContain("<button");
    expect(buttonLabels(barOf(html))).toContain("Versions");
    expect(html.indexOf(">Versions<")).toBeGreaterThan(html.indexOf(line));
    expect(html.indexOf(">Versions<")).toBeLessThan(html.indexOf(">Test<"));
    expect(barOf(html)).not.toContain(PUBLISHED.definitionHash.slice(0, 6));
  });

  it("takes the version out of the ink tone and drops the offer once it no longer stands", () => {
    const later = renderHeader({ baseVersion: 2, publishResult: PUBLISHED, justPublished: false });
    const tone = (html: string) => /· <span([^>]*)>/.exec(stateLineOf(html))?.[1];

    expect(buttonLabels(barOf(later))).not.toContain("Versions");
    expect(stateLineOf(later)).toMatch(/>v2<\/span> published/);
    expect(tone(later)).not.toBe(tone(justPublished()));
  });
});

describe("The Editing note", () => {
  it("names the language in words while the content locale differs from the base", () => {
    const html = renderHeader({ contentLocale: "de" });

    expect(buttonLabels(barOf(html))).toContain("Editing German");
    expect(stateLineOf(html)).not.toContain("Editing");
  });

  it("stays away on the base language", () => {
    expect(renderHeader({ contentLocale: "en" })).not.toContain("Editing");
  });

  it("stays away over the JSON surface", () => {
    expect(renderHeader({ contentLocale: "de", structureActive: false })).not.toContain("Editing");
  });
});

describe("The commands over the JSON surface", () => {
  it("keeps Test, Publish and the menu", () => {
    const html = renderHeader({ structureActive: false, isDirty: true });

    expect(html).toContain(">Test<");
    expect(html).toContain(">Publish<");
    expect(html).toContain("More actions");
  });
});

/**
 * The name's accessible name, its placeholder and its missing translation
 * warning (`studio-canvas`: "The header bar holds back, name, state, Test,
 * Publish and the menu").
 */
describe("The process name", () => {
  const translating = {
    label: { en: "Expense approval" },
    baseLocale: "en",
    key: "expense_approval_key",
  };

  it("carries the accessible name Process name, inside the h1", () => {
    const html = renderHeader({});
    const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));

    expect(h1).toMatch(/<input[^>]*aria-label="Process name"/);
  });

  it("stands the missing translation warning after the header, not inside it", () => {
    const html = renderHeader({ draft: translating, contentLocale: "de" });
    const warning = html.indexOf("No de translation yet");

    expect(warning).toBeGreaterThan(html.indexOf("</header>"));
    expect(html.slice(html.indexOf("</header>"))).toMatch(/^<\/header><p[^>]*>No de translation yet/);
  });

  it("stands the warning through an open dialog, which repeats nothing of it", () => {
    const html = renderHeader({ draft: translating, contentLocale: "de", actions: { pendingDialog: "publish" } });

    expect(html.indexOf("No de translation yet")).toBeGreaterThan(html.indexOf("</header>"));
  });

  it("renders no warning in the base language", () => {
    expect(renderHeader({ draft: translating })).not.toContain("translation yet");
  });

  it("reads the base-language name as the placeholder while the edited language has none", () => {
    const html = renderHeader({ draft: translating, contentLocale: "de" });

    expect(html).toContain('placeholder="Expense approval"');
    expect(html).not.toContain("(untitled process)");
  });

  it("reads the untitled words with no base-language name", () => {
    const html = renderHeader({ draft: { baseLocale: "en", key: "k" }, contentLocale: "de" });

    expect(html).toContain('placeholder="(untitled process)"');
  });
});
