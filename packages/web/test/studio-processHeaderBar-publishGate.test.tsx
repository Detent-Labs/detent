import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { DraftToolbarActions } from "../src/areas/studio/panels/DraftToolbar.js";
import { ProcessHeaderBar, PublishMenuItem } from "../src/areas/studio/panels/ProcessHeaderBar.js";

/**
 * studio-publish-gate-and-report: the header bar states the publish gate, and
 * announces a failed mutation.
 *
 * Two defects reached the running build before this. Publish rendered for
 * every actor who reached the screen, including one the engine answers 403 to.
 * And the refusal rendered as a bare colored paragraph, as one more inline
 * item in a wrapping row of ten badges, with no alert role on it — it reached
 * the DOM and reached nobody.
 *
 * `development-toolchain`'s split rule sends both to an assertion rather than
 * to `docs/browser-checks.md`: `aria-disabled`, the reason text, the
 * `aria-describedby` and the alert role are all properties of the rendered
 * string. What stays manual is what static markup cannot see — the dialog's
 * focus trap, its Escape key and its backdrop, all three from `showModal()`.
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

/** The `⋮` menu is closed until something opens it, and no static render fires
 * a click. `menuOpen` is component state, so the menu's own markup is out of
 * reach here; what this renders is the header and the failure region. */
function renderHeader(over: { canPublish?: boolean; actions?: Partial<DraftToolbarActions>; conflict?: boolean }): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue}>
      <ProcessHeaderBar
        revision={7}
        isDirty={false}
        lastSavedAt={undefined}
        publishResult={null}
        conflict={over.conflict ?? false}
        actions={{ ...noActions, ...over.actions }}
        structureActive={true}
        processId="proc_a"
        canPublish={over.canPublish ?? true}
        baseVersion={3}
        go={() => {}}
      />
    </DraftContext.Provider>,
  );
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
    // The dialog reports it instead, inside itself.
    expect(html).toContain("<dialog");
    expect(html).toContain("refused");
  });

  it("renders no failure region at all when nothing failed", () => {
    const html = renderHeader({});

    expect(html).not.toContain("errorBanner");
    expect(html).not.toContain('role="alert"');
  });
});

/**
 * `PublishMenuItem` rather than `ProcessHeaderBar`: `menuOpen` is the header
 * bar's own state and `renderToStaticMarkup` fires no click, so the menu
 * panel's markup is unreachable from a render of the header. The item and its
 * reason line are one component for exactly that reason — they have to stay
 * together for the reason to reach anybody.
 */
describe("The Publish menu item's permission gate", () => {
  it("marks the item unavailable and names the reason when the report reads false", () => {
    const html = renderToStaticMarkup(<PublishMenuItem canPublish={false} publishing={false} onPublish={() => {}} />);

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Needs the publish permission for this process");
    // The reason is text the item points at, not a tooltip: a `title` reaches
    // neither the keyboard nor a screen reader.
    expect(html).not.toContain("title=");
  });

  it("points aria-describedby at the reason it renders, by that element's own id", () => {
    const html = renderToStaticMarkup(<PublishMenuItem canPublish={false} publishing={false} onPublish={() => {}} />);

    const described = /aria-describedby="([^"]+)"/.exec(html);
    expect(described).not.toBeNull();
    expect(html).toContain(`id="${described![1]}"`);
  });

  it("keeps the item rendered and focusable, so a screen reader reaches that reference", () => {
    const html = renderToStaticMarkup(<PublishMenuItem canPublish={false} publishing={false} onPublish={() => {}} />);

    expect(html).toContain("Publish");
    // The violating input: the native `disabled` attribute, which takes the
    // item out of the tab order and so silences its own description.
    expect(html).not.toContain("disabled=\"\"");
    expect(html).toContain('role="group"');
  });

  it("sends no publish request when activated while unavailable", () => {
    let published = 0;
    const item = PublishMenuItem({ canPublish: false, publishing: false, onPublish: () => published++ });
    // The rendered click handler, called the way an activation calls it.
    const button = (item.props as { children: { props: { onClick: () => void } }[] }).children[0]!;
    button.props.onClick();

    expect(published).toBe(0);
  });

  it("offers the item unchanged when the report reads true", () => {
    const html = renderToStaticMarkup(<PublishMenuItem canPublish={true} publishing={false} onPublish={() => {}} />);

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

describe("ProcessHeaderBar's publish dialog", () => {
  it("names the process, the revision and the version the publish mints", () => {
    const html = renderHeader({ actions: { pendingDialog: "publish" } });

    expect(html).toContain("Publish this draft");
    expect(html).toContain("Expense approval");
    expect(html).toContain(">7<");
    expect(html).toContain(">v4<");
    expect(html).toContain("A published version can never change");
  });

  it("states the unsaved-changes sentence only when the draft is dirty", () => {
    const clean = renderHeader({ actions: { pendingDialog: "publish" } });
    expect(clean).not.toContain("Publishing saves them first");
  });

  it("names what a discard keeps", () => {
    const html = renderHeader({ actions: { pendingDialog: "discard" } });

    expect(html).toContain("Discard this draft");
    expect(html).toContain("The published versions stay");
    expect(html).toContain("btn-destructive");
  });
});

/**
 * The dialog exists to question an act the studio cannot undo. A dialog that
 * opens with that act's own button focused invites the reflexive Enter it was
 * built to catch, so Cancel takes the initial focus in both.
 *
 * `development-toolchain`'s split rule sends this half to an assertion:
 * `autoFocus` is a property of the rendered string. Focus RESTORATION on close
 * is not — it needs a real browser, and `docs/browser-checks.md` carries it.
 */
describe("Neither dialog primes the button it cannot undo", () => {
  it("primes Cancel in the publish dialog, and nothing else", () => {
    const primed = buttonTags(renderHeader({ actions: { pendingDialog: "publish" } })).filter((b) =>
      b.includes("autofocus"),
    );

    expect(primed).toHaveLength(1);
    expect(primed[0]).toContain("btn-ghost");
  });

  it("primes Cancel in the discard dialog, and nothing else", () => {
    const primed = buttonTags(renderHeader({ actions: { pendingDialog: "discard" } })).filter((b) =>
      b.includes("autofocus"),
    );

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

  it("leaves Publish unprimed too, since a published version can never change", () => {
    const confirming = buttonTags(renderHeader({ actions: { pendingDialog: "publish" } })).find((b) =>
      b.includes("btn-primary"),
    );

    expect(confirming).toBeDefined();
    expect(confirming).not.toContain("autofocus");
  });
});
