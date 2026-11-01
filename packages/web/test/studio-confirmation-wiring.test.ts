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

  it("passes the state to the dialog: busy, a refusal with no detail, the row's control and its last save", () => {
    const dialog = between(screen, "<DiscardDraftDialog", "/>");
    expect(dialog).toContain("busy={discarding}");
    expect(dialog).toContain("detail: null");
    expect(dialog).toContain("triggerRef={discardTrigger}");
    expect(dialog).toContain("lastSavedAt={pendingDiscard.saved ? new Date(pendingDiscard.saved.at) : undefined}");
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

describe("the process list's start picker", () => {
  const screen = code("screens/ProcessesScreen.tsx");

  it("opens after the template read only where no other dialog stands", () => {
    expect(screen).toContain("otherDialogOpen.current = pending !== undefined || pendingDiscard !== undefined;");
    const newProcess = between(screen, "const newProcess =", "const startProcess");
    expect(inOrder(newProcess, ["await listTemplates(token)", "if (!otherDialogOpen.current) setPicking(true);"])).toBe(true);
    expect(newProcess.match(/setPicking\(true\)/g)?.length).toBe(1);
  });
});

describe("the canvas bar's two remove controls", () => {
  const screen = code("screens/EditScreen.tsx");

  it("ask first: the bar's press reads the opener and removes nothing", () => {
    expect(between(code("canvas/CanvasBar.tsx"), "selectedStepIds.length === 1 && ( <button", "</button>")).toContain("onClick={onDeleteSelection}");
    expect(screen).toContain("onDeleteSelection={askRemoveSelection}");
    expect(between(screen, "const askRemoveSelection =", "};")).toBe(
      "const askRemoveSelection = () => { selectionRemovalTrigger.current = activeControl(); setSelectionRemovalAsked(true); ",
    );
  });

  it("a confirm clears the ref, removes, and lands on the open tab through the effect", () => {
    const confirm = between(screen, "const confirmRemoveSelection =", "};");
    expect(inOrder(confirm, ["selectionRemovalTrigger.current = null", "setSelectionRemovalAsked(false)", "deleteSelection()", "setPendingFocus({ tab: openTab })"])).toBe(true);
  });

  it("one selected step takes the step page's dialog, and several name each one", () => {
    const dialog = between(screen, "const selectionRemovalDialog =", "useEffect(");
    expect(inOrder(dialog, ["if (selected.length === 1)", "<RemoveStepDialog", "stepRemovalReach(draft", "<RemoveStepsDialog"])).toBe(true);
    expect(between(dialog, "<RemoveStepsDialog", "/>")).toContain("names={selected.map(");
  });

  it("nothing else calls the removal, and the dialog stands with a hide declining it", () => {
    expect(screen.match(/deleteSelection/g)?.length).toBe(2);
    expect(screen).toContain('if (!mapVisible && selectionRemovalAsked) setSelectionRemovalAsked(false);');
    expect(screen).toContain("{selectionRemovalAsked && selectionRemovalDialog()}");
  });
});

describe("the step page's two dialogs", () => {
  const page = code("panels/StepPage.tsx");

  it("a hide clears each waiting dialog during the render", () => {
    expect(page).toContain("visible = true,");
    expect(page).toContain("if (!visible && pendingKind !== null) setPendingKind(null);");
    expect(page).toContain("if (!visible && removing) setRemoving(false);");
    expect(page).toContain("{visible && removing && ( <RemoveStepDialog");
    expect(page).toContain("{visible && pendingKind && ( <KindSwitchDialog");
  });

  it("the Steps tab hands its visibility to the page, the form editor counting as a hide", () => {
    expect(between(code("screens/EditScreen.tsx"), "<StepPage ", "/>")).toContain('visible={!jsonOpen && openTab === "steps" && formEditor === null}');
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

  it("the kind dialog names the old and the new kind in the picker's own words", () => {
    const dialog = between(panel, "<KindDropDialog", "/>");
    expect(dialog).toContain("from={oldKind === undefined ? undefined : kindWord(oldKind)}");
    expect(dialog).toContain("to={kindWord(pendingKind.raw)}");
    expect(panel).toContain("const oldKind = custom ? CUSTOM_KIND : kind;");
  });

  it("each dialog returns the focus to its own control", () => {
    expect(between(panel, "<KindDropDialog", "/>")).toContain("triggerRef={kindSelect}");
    expect(between(panel, "<TechnicalClearDialog", "/>")).toContain("triggerRef={technicalBox}");
    expect(panel).toContain("<select ref={kindSelect}");
    expect(panel).toContain('<input ref={technicalBox} type="checkbox"');
  });
});
