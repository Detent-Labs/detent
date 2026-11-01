import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * How the screens mount `panels/confirmations.tsx` and the list's discard
 * dialog. A source test in the idiom `studio-leave-guard.test.ts` uses: no
 * harness in this package can press a control, so the order of each act is
 * guarded at the source. `e2e/` and `docs/browser-checks.md` check the rest.
 *
 * The recurring trap: a `focus()` inside a confirm handler does nothing, since
 * the page stands inert until the commit that unmounts the dialog. So a landing
 * is a state an effect reads, never a call in the handler.
 */
function code(file: string): string {
  const source = readFileSync(new URL(`../src/areas/studio/${file}`, import.meta.url).pathname, "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ");
}

/** The positions of `steps` in `text`, each searched after the last. */
function inOrder(text: string, steps: readonly string[]): boolean {
  let at = 0;
  for (const step of steps) {
    at = text.indexOf(step, at);
    if (at < 0) return false;
    at += step.length;
  }
  return true;
}

/** The text from `start` up to the next occurrence of `end`. */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  expect(from, `${start} not found`).toBeGreaterThanOrEqual(0);
  const to = text.indexOf(end, from + start.length);
  expect(to, `${end} not found after ${start}`).toBeGreaterThanOrEqual(0);
  return text.slice(from, to);
}

it("the order helper refuses steps out of order", () => {
  expect(inOrder("first second", ["first", "second"])).toBe(true);
  expect(inOrder("first second", ["second", "first"])).toBe(false);
});

describe("the process list's discard", () => {
  const screen = code("screens/ProcessesScreen.tsx");
  const confirmDiscard = between(screen, "const confirmDiscard =", "useEffect(");

  it("closes after the DELETE answers, and lands after the list reloads", () => {
    const order = [
      "setDiscarding(true)",
      "await deleteDraft(",
      "discardTrigger.current = null",
      "setPendingDiscard(undefined)",
      "await load()",
      "setDiscardLanding(processId)",
    ];
    expect(inOrder(confirmDiscard, order), confirmDiscard).toBe(true);
  });

  it("frees the controls in a finally, and a 401 reaches onUnauthorized through useFail", () => {
    expect(confirmDiscard).toMatch(/catch \(err\) \{ failDiscard\(err\); \} finally \{ setDiscarding\(false\); \}/);
    expect(screen).toContain("const failDiscard = useFail(onUnauthorized, (err) => setDiscardError(describeCaughtError(err)));");
  });

  it("passes the state to the dialog: busy, a refusal with no detail, and the row's control", () => {
    const dialog = between(screen, "<DiscardDraftDialog", "/>");
    expect(dialog).toContain("busy={discarding}");
    expect(dialog).toContain("detail: null");
    expect(dialog).toContain("triggerRef={discardTrigger}");
    expect(dialog).not.toContain("lastSavedAt");
  });

  it("lands on the row's name link, else on Import, from an effect", () => {
    expect(screen).toContain("(document.getElementById(nameLinkId(discardLanding)) ?? importButton.current)?.focus();");
    expect(confirmDiscard).not.toContain(".focus(");
  });
});

describe("the templates screen's two dialogs", () => {
  const screen = code("screens/TemplatesScreen.tsx");

  it("sends no request until a confirm", () => {
    const askDelete = between(screen, "const askDelete =", "const runDelete");
    expect(askDelete).not.toContain("deleteTemplate(");
    const askCreate = between(screen, "const askCreate =", "const runCreate");
    expect(inOrder(askCreate, ["if (existing === undefined)", "void runCreate()", "return;", "setPendingReplace("])).toBe(true);
  });

  it("names a template by its display name", () => {
    expect(screen).toContain("setPendingReplace(templateDisplayName(existing.label, locale, existing.templateKey))");
    expect(screen).toContain("name: templateDisplayName(template.label, locale, template.templateKey)");
  });

  for (const [name, run] of [
    ["DeleteTemplateDialog", "void runDelete("],
    ["ReplaceTemplateDialog", "void runCreate()"],
  ] as const) {
    it(`${name}'s confirm clears the ref and lands on the key input through the effect`, () => {
      const confirm = between(screen, `<${name}`, "/>");
      expect(inOrder(confirm, ["dialogTrigger.current = null", "setLandOnKey(true)", run]), confirm).toBe(true);
      expect(confirm).not.toContain(".focus(");
    });
  }

  it("the effect moves the focus to the key input", () => {
    expect(screen).toMatch(/if \(!landOnKey\) return; keyInput\.current\?\.focus\(\);/);
  });

  it("a decline clears the question and touches neither the key nor the source", () => {
    expect(screen).toContain("onCancel={() => setPendingDelete(undefined)}");
    expect(screen).toContain("onCancel={() => setPendingReplace(undefined)}");
  });
});

describe("the edit screen's Arrange", () => {
  const screen = code("screens/EditScreen.tsx");

  it("asks on a hand-placed draft, and only a confirm runs it", () => {
    const onArrange = between(screen, "const onArrange =", "const runArrange");
    expect(onArrange).toMatch(/if \(hasHandPlacedStep\(.*\)\) \{ arrangeTrigger\.current = activeControl\(\); setArrangeAsked\(true\); \} else \{ void runArrange\(\); \}/);
    expect(onArrange).not.toContain("arrangeSteps(");
    expect(between(screen, "<ArrangeDialog", "/>")).toContain("void runArrange()");
  });

  it("loads the layout library only in the run", () => {
    expect(between(screen, "const runArrange =", "setSaveState")).toContain("await arrangeSteps(");
  });
});

describe("the field card's two dialogs", () => {
  const panel = code("panels/FieldCatalogPanel.tsx");

  it("a hide clears each waiting dialog during the render", () => {
    expect(panel).toContain("if (!visible && pendingKind !== undefined) setPendingKind(undefined);");
    expect(panel).toContain("if (!visible && pendingTechnical !== undefined) setPendingTechnical(undefined);");
  });

  it("the Fields tab hands its visibility to the panel, which defaults to shown", () => {
    expect(code("panels/EntityTabs.tsx")).toMatch(/<FieldCatalogPanel [^>]*visible=\{visible\}/);
    expect(panel).toContain("visible = true,");
    expect(between(panel, "<FieldEditor ", "/>")).toContain("visible={visible}");
  });

  it("a kind pick that drops something waits, and one that drops nothing writes", () => {
    const askKind = between(panel, "const askKind =", "const custom");
    expect(askKind).toContain("if (dropped.length === 0) changeKind(raw, onChange); else setPendingKind({ raw, dropped });");
  });

  it("each dialog returns the focus to its own control", () => {
    expect(between(panel, "<KindDropDialog", "/>")).toContain("triggerRef={kindSelect}");
    expect(between(panel, "<TechnicalClearDialog", "/>")).toContain("triggerRef={technicalBox}");
    expect(panel).toContain("<select ref={kindSelect}");
    expect(panel).toContain('<input ref={technicalBox} type="checkbox"');
  });
});
