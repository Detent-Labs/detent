import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * The Save points view's wiring (`studio-app`: "The Save points view lists a
 * draft's save points", "Restoring a save point asks first and names what it
 * kept", "Removing a save point asks first"; `studio-process-tabs`: "The header
 * bar's menu holds what is not a tab").
 *
 * No harness in this package can click a control or move a focus, so the wiring is
 * guarded at the source, in the idiom of `studio-stash-wiring.test.ts`. `scan`
 * returns one name per violation. The first test asserts the real files have none.
 * Each later test applies one in-memory mutation to the real source and asserts the
 * matching violation appears, so every pin is proved to fire. The tree is never
 * touched.
 */
const FILES = {
  edit: "src/areas/studio/screens/EditScreen.tsx",
  bar: "src/areas/studio/panels/ProcessHeaderBar.tsx",
  tab: "src/areas/studio/panels/SettingsTab.tsx",
  panel: "src/areas/studio/panels/SavePointsPanel.tsx",
  dialogs: "src/areas/studio/panels/SavePointDialogs.tsx",
} as const;

type Sources = Record<keyof typeof FILES, string>;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function load(): Sources {
  const read = (path: string) => stripComments(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, read(path)])) as Sources;
}

/** From the first occurrence of `from`, up to the next `to` after it. */
function between(code: string, from: string, to: string): string {
  const start = code.indexOf(from);
  if (start < 0) return "";
  const end = code.indexOf(to, start + from.length);
  return code.slice(start, end < 0 ? undefined : end);
}

const inOrder = (code: string, parts: readonly string[]): boolean => {
  let at = -1;
  for (const part of parts) {
    const next = code.indexOf(part, at + 1);
    if (next < 0) return false;
    at = next;
  }
  return true;
};

function scan(src: Sources): string[] {
  const out: string[] = [];
  const openEntry = between(src.edit, "const openSavePoints = () =>", "const leaveFormEditor =");
  if (!/const openSavePoints = \(\) =>\s*leaveJsonSurface\(\(\) => \{/.test(openEntry)) out.push("openSavePoints drops unapplied JSON with no question");
  if (!inOrder(openEntry, ["setJsonOpen(false)", "setJsonNote(undefined)", 'goToTab("settings", "points")', "setSavePointsFocus("]))
    out.push("openSavePoints does not close the JSON surface, navigate to the view and ask for the focus, in that order");
  if (/leaveFormEditorFor|openSettings\(/.test(openEntry)) out.push("openSavePoints takes openSettings' or the form editor's route");
  if (!src.edit.includes("onSavePoints={openSavePoints}")) out.push("the header bar gets no onSavePoints");
  const settings = between(src.edit, "<SettingsTab", "/>,");
  for (const prop of ['visible={!jsonOpen && openTab === "settings"}', "savePointActions={actions}", "savePointsFocus={savePointsFocus}"])
    if (!settings.includes(prop)) out.push(`the Settings tab gets no ${prop}`);

  const menu = between(src.bar, "styles.headerBarMenu)} ref={menuRef}", 'actions.pendingDialog === "publish"');
  if (!inOrder(menu, ["runMenuAction(onSavePoints)", "runMenuAction(actions.discard)"]))
    out.push("the Draft group lacks Save points ahead of Discard draft");
  if (menu.indexOf("menuGroupDraft") < 0 || menu.indexOf("runMenuAction(onSavePoints)") < menu.indexOf("menuGroupDraft"))
    out.push("Save points stands outside the Draft group");

  if (!src.tab.includes('{ id: "points", label: t("settings.points") }')) out.push("the sub-row lacks Save points");
  if (!src.tab.includes('visible={visible && view === "points"}')) out.push("the panel's visibility ignores the open view");

  const p = src.panel;
  if (!/useEffect\(\(\) => \{\s*if \(visible\) load\(\);\s*\}, \[visible, load\]\);/.test(p)) out.push("the panel does not fetch each time it turns visible, and only then");
  if (!/if \(mine !== latest\.current\) return;[\s\S]*?if \(mine !== latest\.current\) return;/.test(between(p, "const load =", "useEffect(")))
    out.push("a stale fetch answer is not dropped, on success or on failure");
  const loadBody = between(p, "const load =", "useEffect(");
  if (loadBody.split("setList(undefined)").length !== 2 || loadBody.indexOf("setList(undefined)") < loadBody.indexOf("(err: unknown)"))
    out.push("a refetch drops the old rows before its answer");
  const answer = between(p, "(answer) => {", "(err: unknown)");
  if (!inOrder(answer, ["document.activeElement === inputRef.current", "setBoundMoves(", "setList(answer)"]))
    out.push("the bound check reads the focus after the list commit, when the input is gone");
  if (!answer.includes("atBound: atBound(listRef.current)")) out.push("the bound check compares with the answer's own list");
  if (!answer.includes("setNow(Date.now())")) out.push("a refetch leaves the rows' ages at the earlier read");
  if (!p.includes("restoreLanding(await actions.restoreSavePoint(point), point.name)")) out.push("restore does not go through the hook's act");
  if (!p.includes("actions.removeSavePoint(point.savePointId)")) out.push("remove does not go through the hook's act");
  if (/\b(createSavePoint|restoreSavePoint|removeSavePoint)\(/.test(p.replace(/actions\.\w+\(/g, ""))) out.push("the panel calls the client itself");
  if (!/aria-disabled=\{bound \|\| acting \|\| undefined\}/.test(p) || !p.includes("if (!bound && !acting) onRestore(")) out.push("Restore at the bound or during a request is not aria-disabled with a dead press");
  if (!p.includes("if (!acting) onRemove(")) out.push("Remove during a request has a live press");
  const confirmed = between(p, "const confirmAct = async", "return (");
  if (!inOrder(confirmed, ["if (landing.refetch) load();", 'if (landing.dialog === "stay")'])) out.push("a dialog that stays does not refetch");
  if (/\bdisabled=\{/.test(p.replace(/aria-disabled=\{/g, ""))) out.push("a control uses native disabled and drops the focus");
  if ((p.match(/aria-disabled=\{acting \|\| undefined\}/g) ?? []).length !== 2 || !p.includes("if (!acting) onCreate()")) out.push("the create control or Remove is not aria-disabled with a dead press");
  if (!p.includes("opener.current = trigger ?? activeControl()")) out.push("the dialog's opener is not the row's control");
  if (!/useEffect\(\(\) => \{\s*if \(saveFailed\) return;\s*setNameError\([^\n]*createUnsavedLine\(\)[^\n]*\s*setDialog\([^\n]*restoreUnsavedLine\(\)[^\n]*\s*\}, \[saveFailed\]\);/.test(p)) out.push("a failed save's sentence outlives a healed save");
  if ((p.match(/triggerRef=\{opener\}/g) ?? []).length !== 2) out.push("a dialog does not return the focus to the row's control");
  if (/<dialog|showModal/.test(p)) out.push("the panel opens a dialog outside StudioDialog");
  const dialogs = src.dialogs;
  if (!/RestoreSavePointDialog[\s\S]*PrimaryConfirm/.test(dialogs) || !/DestructiveConfirm/.test(dialogs)) out.push("the dialogs lack their confirms");
  if ((dialogs.match(/<StudioDialog/g) ?? []).length !== 2) out.push("the two dialogs do not both stand on StudioDialog");
  const create = between(p, "const create = async", "const openDialog");
  if (!create.includes("if (outcome.kind === \"done\") inputRef.current?.focus()")) out.push("a create leaves the focus on the control");
  if (create.indexOf("nameDecision(name)") < 0 || create.indexOf("nameDecision(name)") > create.indexOf("actions.createSavePoint")) out.push("a create sends before it reads the name");
  if (!/if \(!inputAfterFetch \|\| fetching\) return;/.test(p.slice(p.indexOf("useEffect(() => {\n    if (!inputAfterFetch"))))
    out.push("the focus after a remove does not wait for the refetch");
  const entry = p.slice(p.indexOf("if (!visible || focusRequest === handledFocus.current) return;"));
  if (!entry.includes("handledFocus.current = focusRequest;")) out.push("a menu focus request is not consumed once");
  if (!entry.includes('entryFocus(atBound(list)) === "bound" ? boundRef.current : inputRef.current')) out.push("the menu focus ignores the bound's sentence");
  if (!/\bref=\{boundRef\} tabIndex=\{-1\}/.test(p)) out.push("the bound's sentence cannot take the focus");
  return out;
}

function mutate(src: Sources, key: keyof Sources, from: string, to: string): Sources {
  if (!src[key].includes(from)) throw new Error(`the mutation target is gone from ${key}: ${from}`);
  return { ...src, [key]: src[key].replace(from, to) };
}

describe("the Save points view's wiring", () => {
  const src = load();

  it("holds every pin in the real files", () => {
    expect(scan(src)).toEqual([]);
  });

  const cases: [string, keyof Sources, string, string, string][] = [
    ["a sentence that outlives a healed save", "panel", "if (saveFailed) return;\n    setNameError", "setNameError", "outlives a healed save"],
    ["an entry that keeps the JSON surface open", "edit", "      setJsonOpen(false);\n      setJsonNote(undefined);\n      goToTab(\"settings\", \"points\")", "      goToTab(\"settings\", \"points\")", "openSavePoints does not close"],
    ["an entry that drops unapplied JSON with no question", "edit", "const openSavePoints = () =>\n    leaveJsonSurface(() => {", "const openSavePoints = () =>\n    ((run: () => void) => run())(() => {", "with no question"],
    ["an entry that never asks for the focus", "edit", "setSavePointsFocus((count) => count + 1);\n    });", "});", "openSavePoints does not close"],
    ["an entry that lands on the first view", "edit", 'goToTab("settings", "points")', 'goToTab("settings", "process")', "openSavePoints does not close"],
    ["an entry through openSettings", "edit", "setSavePointsFocus((count) => count + 1);\n    });", "setSavePointsFocus((count) => count + 1);\n      openSettings();\n    });", "takes openSettings"],
    ["a header bar with no entry wired", "edit", "onSavePoints={openSavePoints}", "", "no onSavePoints"],
    ["a Settings tab that never sees it is visible", "edit", 'visible={!jsonOpen && openTab === "settings"}', "visible", "no visible"],
    ["a Settings tab with no acts", "edit", "savePointActions={actions}", "", "no savePointActions"],
    ["a Settings tab with no focus request", "edit", "savePointsFocus={savePointsFocus}", "", "no savePointsFocus"],
    ["a menu with no Save points", "bar", "runMenuAction(onSavePoints)", "runMenuAction(onVersions)", "lacks Save points"],
    ["a sub-row with no Save points", "tab", '{ id: "points", label: t("settings.points") }', '{ id: "access", label: t("settings.points") }', "sub-row lacks"],
    ["a panel that ignores the open view", "tab", 'visible={visible && view === "points"}', "visible={visible}", "visibility ignores"],
    ["a panel that fetches while hidden", "panel", "if (visible) load();", "load();", "each time it turns visible"],
    ["a panel that fetches once a mount", "panel", "}, [visible, load]);", "}, [load]);", "each time it turns visible"],
    ["a dialog that stays with no refetch", "panel", "if (landing.refetch) load();\n      if (landing.dialog === \"stay\") {\n        setDialog({ act, point, refusal: landing.refusal });\n        return;\n      }", "if (landing.dialog === \"stay\") {\n        setDialog({ act, point, refusal: landing.refusal });\n        return;\n      }\n      if (landing.refetch) load();", "does not refetch"],
    ["a fetch whose stale answer lands", "panel", "if (mine !== latest.current) return;\n        setFetching(false);", "setFetching(false);", "stale fetch answer"],
    ["a refetch that clears the rows first", "panel", "setFetching(true);\n    listSavePoints", "setFetching(true);\n    setList(undefined);\n    listSavePoints", "drops the old rows"],
    ["a bound check that reads the focus after the commit", "panel", "document.activeElement === inputRef.current", "false", "reads the focus after"],
    ["a refetch that keeps the ages", "panel", "        setNow(Date.now());\n        setFetching(false);", "        setFetching(false);", "rows' ages"],
    ["a bound check against the wrong list", "panel", "atBound: atBound(listRef.current)", "atBound: false", "own list"],
    ["a restore that skips the hook", "panel", "restoreLanding(await actions.restoreSavePoint(point), point.name)", "restoreLanding({ kind: \"gone\" }, point.name)", "restore does not go through"],
    ["a remove that skips the hook", "panel", "actions.removeSavePoint(point.savePointId)", "Promise.resolve({ kind: \"gone\" } as const)", "remove does not go through"],
    ["a Restore that stays live at the bound", "panel", "if (!bound && !acting) onRestore(point, event.currentTarget);", "onRestore(point, event.currentTarget);", "Restore at the bound"],
    ["a Restore that stays live during a request", "panel", "if (!bound && !acting) onRestore(point, event.currentTarget);", "if (!bound) onRestore(point, event.currentTarget);", "Restore at the bound"],
    ["a Restore that drops the focus at the bound", "panel", "aria-disabled={bound || acting || undefined}", "disabled={bound}", "Restore at the bound"],
    ["a Remove that stays live during a request", "panel", "if (!acting) onRemove(point, event.currentTarget);", "onRemove(point, event.currentTarget);", "Remove during a request"],
    ["a create control that goes native disabled", "panel", "aria-disabled={acting || undefined}", "disabled={acting}", "create control"],
    ["a dialog opener that is not the row's control", "panel", "opener.current = trigger ?? activeControl()", "opener.current = null", "opener"],
    ["a dialog with no focus return", "panel", "triggerRef={opener}\n          onCancel={() => setDialog(null)}\n          onConfirm={() => void confirmAct()}\n        />\n      )}\n      {dialog?.act === \"remove\"", "triggerRef={{ current: null }}\n          onCancel={() => setDialog(null)}\n          onConfirm={() => void confirmAct()}\n        />\n      )}\n      {dialog?.act === \"remove\"", "return the focus"],
    ["a panel that opens its own dialog", "panel", "<RestoreSavePointDialog", "<dialog></dialog><RestoreSavePointDialog", "outside StudioDialog"],
    ["a dialog that leaves the one form", "dialogs", "<StudioDialog\n      heading={removeHeading", "<div\n      heading={removeHeading", "both stand on StudioDialog"],
    ["a create that leaves the focus on the control", "panel", 'if (outcome.kind === "done") inputRef.current?.focus();', "", "leaves the focus"],
    ["a remove focus that does not wait", "panel", "if (!inputAfterFetch || fetching) return;", "if (!inputAfterFetch) return;", "does not wait for the refetch"],
    ["a menu focus request consumed twice", "panel", "handledFocus.current = focusRequest;", "", "consumed once"],
    ["a menu focus that ignores the bound", "panel", 'entryFocus(atBound(list)) === "bound" ? boundRef.current : inputRef.current)?.focus();\n  }, [visible', "inputRef.current)?.focus();\n  }, [visible", "ignores the bound"],
    ["a bound sentence that cannot take focus", "panel", "ref={boundRef} tabIndex={-1}", "ref={boundRef}", "cannot take the focus"],
  ];

  for (const [name, key, from, to, expected] of cases) {
    it(`flags ${name}`, () => {
      const violations = scan(mutate(src, key, from, to));

      expect(violations.some((v) => v.includes(expected)), violations.join("\n") || "no violation").toBe(true);
    });
  }
});
