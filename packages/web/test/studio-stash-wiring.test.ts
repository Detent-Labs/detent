import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { readRestorable, stashDraft, type DraftStash } from "../src/areas/studio/draft/draftStash.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { AUTOSAVE_DEBOUNCE_MS, autosaveWait } from "../src/areas/studio/screens/draftAutosaveLogic.js";
import { headerStateLine } from "../src/areas/studio/screens/draftToolbarState.js";

/**
 * `EditScreen.tsx` wires the unsaved-draft stash at several places, and no
 * other test sees any of them.
 *
 * `ProcessSurface` wraps the shell's `onUnauthorized` as `stashOnUnauthorized`.
 * A 401 from a request of either consumer then keeps unsaved work. The two
 * consumers are `useDraftToolbarActions` (save, discard, publish) and the
 * `SettingsTab`, which hands it to its `AccessPanel` unchanged. A raw callback
 * on either one lets that request end the
 * session and lose the draft, with every type check still green. Other
 * requests on the screen never reach `onUnauthorized`. The wrapper writes the
 * stash only while the draft is dirty, so a clean draft stores nothing.
 *
 * The copy goes when the author answers the notice or discards the draft, and the
 * discard does it before `navigate`, which unmounts the screen. A save leaves it
 * standing, since a flush can save under the notice, and `followStash` moves its
 * revision to the answer's. `RestoreNotice` renders while a stash exists, the form
 * editor's address included: the editor stands under the tab row, so either
 * button's focus move to the open tab finds one. A gate on `formStepId` would
 * hide the notice over the editor. Its two buttons call `askRestore` and
 * `discardStash`. `askRestore` asks first over a change made since the draft
 * opened, saved or not, and runs `runRestore`, whose focus move waits for the commit that unmounts the dialog.
 * Both buttons wait while a save or publish runs (`requestRunning`),
 * because a restore during a save would let the save's answer overwrite the
 * stored revision. The outer
 * `EditScreen` loads the draft before any draft exists, so it keeps the raw
 * callback.
 *
 * While a copy stands, a 401 keeps it: the store has one slot, and the copy holds
 * the larger work.
 *
 * A source test in the idiom `studio-leave-guard.test.ts` uses: no harness in
 * this package can click a control or trigger a 401, so the wiring is guarded
 * at the source. `scan` returns one name per violation. The first test asserts
 * the real file has none. The rest apply one in-memory mutation to the real
 * file and assert the matching violation appears, so each pin is proved to
 * fire. The working tree is never touched.
 */
const EDIT_SCREEN = "src/areas/studio/screens/EditScreen.tsx";

/** Block comments first, then line comments, as `studio-leave-guard.test.ts`
 * strips: a name in a comment is not wiring. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The text between the brace at `open` and its matching close brace. */
function braced(code: string, open: number): string | undefined {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(open + 1, i);
  }
  return undefined;
}

/**
 * The opening tag of the first `<name ...>` element. It ends at the first `>`
 * outside every `{}`, so the `=>` of an arrow function prop does not end it.
 * Whitespace and line breaks are free.
 */
function openingTag(code: string, name: string): { tag: string; start: number } | undefined {
  const start = code.search(new RegExp(`<${name}(?=[\\s>/])`));
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return { tag: code.slice(start, i + 1), start };
  }
  return undefined;
}

/** The text between the braces of the first `prop={...}` in `tag`, trimmed. */
function propValue(tag: string, prop: string): string | undefined {
  const m = new RegExp(`\\b${prop}\\s*=\\s*\\{`).exec(tag);
  return m ? braced(tag, m.index + m[0].length - 1)?.trim() : undefined;
}

/** The body of the arrow function bound to `prop:` in an object literal's text. */
function propArrowBody(object: string, prop: string): string | undefined {
  const m = new RegExp(`\\b${prop}\\s*:\\s*\\([^)]*\\)\\s*=>\\s*\\{`).exec(object);
  return m ? braced(object, m.index + m[0].length - 1) : undefined;
}

const CALL = /\bdropStash\s*\(\s*\)/;

function scan(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];

  // The hook that owns save, discard and publish.
  const call = /\buseDraftToolbarActions\s*\(\s*\{/.exec(code);
  const options = call ? braced(code, call.index + call[0].length - 1) : undefined;
  if (options === undefined) violations.push("useDraftToolbarActions call not found");
  else {
    const wired = /\bonUnauthorized\s*:\s*([\w.]+)/.exec(options)?.[1];
    if (wired !== "stashOnUnauthorized") violations.push("useDraftToolbarActions onUnauthorized is not stashOnUnauthorized");

    const saved = propArrowBody(options, "onSaved");
    if (saved === undefined || CALL.test(saved)) violations.push("onSaved deletes the copy");
    if (saved === undefined || !/\bfollowStash\(revision\)/.test(saved)) violations.push("onSaved does not move the copy's revision");

    if (!/\bfollowStash\(record\.revision\)/.test(propArrowBody(options, "onRestored") ?? "")) violations.push("onRestored does not move the copy's revision");

    if (!/\bnoticeStands:\s*stash !== undefined/.test(options)) violations.push("the notice does not hold the saves");

    // The discard unmounts the screen through `navigate`, so the drop comes first.
    const discarded = propArrowBody(options, "onDiscarded") ?? "";
    const drop = discarded.search(CALL);
    const leave = discarded.search(/\bnavigate\s*\(/);
    if (drop < 0 || leave < 0 || drop > leave) violations.push("onDiscarded does not call dropStash before navigate");
  }

  const settings = openingTag(code, "SettingsTab");
  if (settings === undefined) violations.push("SettingsTab element not found");
  else if (propValue(settings.tag, "onUnauthorized") !== "stashOnUnauthorized") {
    violations.push("SettingsTab onUnauthorized is not stashOnUnauthorized");
  }

  const notice = openingTag(code, "RestoreNotice");
  if (notice === undefined) violations.push("RestoreNotice is not rendered");
  else {
    // The expression the element sits in, from its opening brace.
    const gate = /\{([^{}]*)$/.exec(code.slice(0, notice.start))?.[1] ?? "";
    if (!/\bstash\s*&&\s*$/.test(gate)) violations.push("RestoreNotice is not gated on stash");
    if (/\bformStepId\b/.test(gate)) violations.push("RestoreNotice is gated on formStepId");
    if (propValue(notice.tag, "onRestore") !== "askRestore") violations.push("RestoreNotice onRestore is not askRestore");
    if (propValue(notice.tag, "onDiscard") !== "discardStash") violations.push("RestoreNotice onDiscard is not discardStash");
    if (propValue(notice.tag, "disabled") !== "requestRunning") violations.push("RestoreNotice disabled is not requestRunning");
  }

  // The flag the notice waits on, and the two handlers that honor it when a
  // click slips past the `disabled` attribute.
  if (!/\bconst\s+requestRunning\s*=\s*actions\.saving\s*\|\|\s*actions\.publishing\s*;/.test(code)) {
    violations.push("requestRunning is not actions.saving || actions.publishing");
  }
  for (const name of ["askRestore", "discardStash"]) {
    const handler = new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\(\\)\\s*=>\\s*\\{`).exec(code);
    const handlerBody = handler ? braced(code, handler.index + handler[0].length - 1) : undefined;
    if (handlerBody === undefined || !/\brequestRunning\b/.test(handlerBody)) {
      violations.push(`${name} does not return early while a request runs`);
    }
  }

  // A save under the notice moves the copy's revision, in storage and in state, and
  // the notice's restore then asks first. Nothing else moves it.
  const follow = /\bconst\s+followStash\s*=\s*\(revision: number\)\s*=>\s*\{/.exec(code);
  const followBody = follow ? braced(code, follow.index + follow[0].length - 1) : undefined;
  if (followBody === undefined) violations.push("followStash not found");
  else {
    if (!/\bif\s*\(stash === undefined\)\s*return;/.test(followBody)) violations.push("followStash writes a copy nothing kept");
    if (!/\bconst moved = \{ \.\.\.stash, revision \};/.test(followBody)) violations.push("followStash does not keep the copy's body and layout");
    if (!/\bstashDraft\(tabStorage\(\), actorId, processId, moved\)/.test(followBody)) violations.push("followStash does not reach storage");
    if (!/\bsetStash\(moved\)/.test(followBody)) violations.push("followStash does not reach state");
    if (!/\bsetSavedUnderNotice\(true\)/.test(followBody)) violations.push("followStash does not mark the saved change");
  }

  const discarded = /\bconst\s+discardStash\s*=\s*\(\)\s*=>\s*\{/.exec(code);
  if (!CALL.test((discarded && braced(code, discarded.index + discarded[0].length - 1)) ?? "")) violations.push("discardStash keeps the copy");

  // A restore asks over a change made since the draft opened, and otherwise restores at once.
  const ask = /\bconst\s+askRestore\s*=\s*\(\)\s*=>\s*\{/.exec(code);
  const askBody = ask ? braced(code, ask.index + ask[0].length - 1)?.replace(/\s+/g, " ") : undefined;
  if (askBody === undefined || !/\bif \(dirtyNow \|\| savedUnderNotice\) \{ restoreTrigger\.current = activeControl\(\); setRestoreAsked\(true\); \} else \{ runRestore\(\); \}/.test(askBody)) {
    violations.push("askRestore does not ask only over a change since the draft opened");
  }
  // The page behind an open dialog stands inert until the commit that unmounts
  // it, so the landing is a pending focus. A confirm clears the ref the frame
  // would otherwise focus.
  const run = /\bconst\s+runRestore\s*=\s*\(\)\s*=>\s*\{/.exec(code);
  const runBody = run ? braced(code, run.index + run[0].length - 1) : undefined;
  // A restore puts the copy in the editor at the copy's revision, and deletes it.
  if (runBody !== undefined) {
    if (!/\breplace\(stash\.body\)/.test(runBody)) violations.push("runRestore does not put the copy's body in the editor");
    if (!/\brevision: stash\.revision, layout: stash\.layout\b/.test(runBody)) violations.push("runRestore does not keep the copy's revision and layout");
    if (!CALL.test(runBody)) violations.push("runRestore keeps the copy");
  }
  if (runBody === undefined || !/\bsetPendingFocus\(\{ tab: openTab \}\)/.test(runBody)) violations.push("runRestore does not land through setPendingFocus");
  const dialog = openingTag(code, "RestoreOverChangesDialog");
  if (dialog === undefined) violations.push("RestoreOverChangesDialog is not rendered");
  else if (!/\brestoreTrigger\.current = null;[\s\S]*\brunRestore\(\)/.test(propValue(dialog.tag, "onConfirm") ?? "")) {
    violations.push("the restore confirm does not clear its trigger and run the restore");
  }

  // A clean draft has no work to keep, so the 401 stores nothing for it. A copy that
  // stands keeps its place.
  const wrapper = /\bconst\s+stashOnUnauthorized\s*=\s*\(\)\s*=>\s*\{/.exec(code);
  const wrapperBody = wrapper ? braced(code, wrapper.index + wrapper[0].length - 1) : undefined;
  if (wrapperBody === undefined) violations.push("stashOnUnauthorized not found");
  else {
    const write = wrapperBody.search(/\bstashDraft\s*\(/);
    if (write < 0 || !/\bif\s*\(\s*dirtyNow && stash === undefined\s*\)\s*\{?\s*$/.test(wrapperBody.slice(0, write))) {
      violations.push("stashOnUnauthorized does not write the stash only while dirty with no copy");
    }
  }

  // The outer component loads the draft, so no unsaved work exists to stash.
  const outer = /export\s+function\s+EditScreen\s*\([^)]*\)\s*\{/.exec(code);
  const outerBody = outer ? braced(code, outer.index + outer[0].length - 1) : undefined;
  if (outerBody === undefined) violations.push("EditScreen function not found");
  else if (!/\buseFail\s*\(\s*onUnauthorized\s*,/.test(outerBody)) {
    violations.push("EditScreen load does not use the raw onUnauthorized via useFail");
  }

  return violations;
}

/** Replaces the first match in `code`. It fails when nothing matches, so a
 * mutation that drifted from the source cannot pass as a clean scan. */
function mutate(code: string, from: RegExp, to: string): string {
  const out = code.replace(from, to);
  expect(out, `the mutation ${String(from)} matched nothing in EditScreen.tsx`).not.toBe(code);
  return out;
}

const real = stripComments(readFileSync(new URL(`../${EDIT_SCREEN}`, import.meta.url).pathname, "utf8"));

describe("EditScreen.tsx wires the unsaved-draft stash", () => {
  it("the real EditScreen.tsx has no violation", () => {
    expect(scan(real)).toEqual([]);
  });

  it("a raw onUnauthorized on the draft actions is flagged", () => {
    const raw = mutate(real, /\bonUnauthorized:\s*stashOnUnauthorized\b/, "onUnauthorized: onUnauthorized");
    expect(scan(raw)).toEqual(["useDraftToolbarActions onUnauthorized is not stashOnUnauthorized"]);
  });

  it("a raw onUnauthorized on the SettingsTab is flagged", () => {
    const raw = mutate(real, /(<SettingsTab[\s\S]*?)onUnauthorized=\{stashOnUnauthorized\}/, "$1onUnauthorized={onUnauthorized}");
    expect(scan(raw)).toEqual(["SettingsTab onUnauthorized is not stashOnUnauthorized"]);
  });

  it("the SettingsTab hands its onUnauthorized to the AccessPanel unchanged", () => {
    const settings = stripComments(readFileSync(new URL("../src/areas/studio/panels/SettingsTab.tsx", import.meta.url).pathname, "utf8"));
    const access = openingTag(settings, "AccessPanel");
    expect(access).toBeDefined();
    expect(propValue(access!.tag, "onUnauthorized")).toBe("onUnauthorized");
  });

  it("a successful save that deletes the copy is flagged, since an automatic save would delete it behind the author's back", () => {
    const deleted = mutate(real, /(\bonSaved\s*:\s*\(revision\)\s*=>\s*\{)/, "$1 dropStash();");
    expect(scan(deleted)).toEqual(["onSaved deletes the copy"]);
  });

  it("a discarded draft that keeps the stash is flagged", () => {
    const kept = mutate(real, /(\bonDiscarded\s*:\s*\(\)\s*=>\s*\{\s*)dropStash\(\);/, "$1");
    expect(scan(kept)).toEqual(["onDiscarded does not call dropStash before navigate"]);
  });

  it("a discarded draft that drops the stash after navigate is flagged", () => {
    const late = mutate(
      real,
      /(\bonDiscarded\s*:\s*\(\)\s*=>\s*\{\s*)dropStash\(\);(\s*onDirtyChange\?\.\(false\);\s*onUnappliedJsonChange\?\.\(false\);\s*navigate\(\{ name: "processes" \}\);)/,
      "$1$2\ndropStash();",
    );
    expect(scan(late)).toEqual(["onDiscarded does not call dropStash before navigate"]);
  });

  it("a missing RestoreNotice is flagged", () => {
    const gone = mutate(real, /\{stash && <RestoreNotice[^>]*\/>\}/, "");
    expect(scan(gone)).toEqual(["RestoreNotice is not rendered"]);
  });

  it("a RestoreNotice shown with no stash is flagged", () => {
    const always = mutate(real, /\{stash && (<RestoreNotice)/, "{$1");
    expect(scan(always)).toEqual(["RestoreNotice is not gated on stash"]);
  });

  it("a RestoreNotice hidden while a form editor is open is flagged", () => {
    const hidden = mutate(real, /\{(stash && <RestoreNotice)/, "{formStepId === undefined && $1");
    expect(scan(hidden)).toEqual(["RestoreNotice is gated on formStepId"]);
  });

  it("a RestoreNotice whose buttons call the wrong handlers is flagged", () => {
    const restore = mutate(real, /onRestore=\{askRestore\}/, "onRestore={discardStash}");
    expect(scan(restore)).toEqual(["RestoreNotice onRestore is not askRestore"]);
    const discard = mutate(real, /onDiscard=\{discardStash\}/, "onDiscard={askRestore}");
    expect(scan(discard)).toEqual(["RestoreNotice onDiscard is not discardStash"]);
  });

  it("a RestoreNotice that ignores a running save is flagged", () => {
    const ignored = mutate(real, /\s+disabled=\{requestRunning\}/, "");
    expect(scan(ignored)).toEqual(["RestoreNotice disabled is not requestRunning"]);
    const wrong = mutate(real, /disabled=\{requestRunning\}/, "disabled={actions.saving}");
    expect(scan(wrong)).toEqual(["RestoreNotice disabled is not requestRunning"]);
  });

  it("a requestRunning that leaves out the publish is flagged", () => {
    const saving = mutate(real, /(\bconst requestRunning = actions\.saving) \|\| actions\.publishing;/, "$1;");
    expect(scan(saving)).toEqual(["requestRunning is not actions.saving || actions.publishing"]);
  });

  it("a restore or discard that runs during a save is flagged", () => {
    const restore = mutate(real, /stash === undefined \|\| requestRunning/, "stash === undefined");
    expect(scan(restore)).toEqual(["askRestore does not return early while a request runs"]);
    const discard = mutate(real, /(\bconst discardStash = \(\) => \{\s*)if \(requestRunning\) return;\s*/, "$1");
    expect(scan(discard)).toEqual(["discardStash does not return early while a request runs"]);
  });

  it("a restore that asks with no unsaved work, or never asks, is flagged", () => {
    const inverted = mutate(real, /\bif \(dirtyNow \|\| savedUnderNotice\) (\{\s*restoreTrigger)/, "if (!dirtyNow) $1");
    expect(scan(inverted)).toEqual(["askRestore does not ask only over a change since the draft opened"]);
    const never = mutate(real, /setRestoreAsked\(true\);/, "runRestore();");
    expect(scan(never)).toEqual(["askRestore does not ask only over a change since the draft opened"]);
  });

  it("a restore that moves the focus behind the open dialog is flagged", () => {
    const direct = mutate(real, /setPendingFocus\(\{ tab: openTab \}\);/, "focusTabButton(openTab);");
    expect(scan(direct)).toEqual(["runRestore does not land through setPendingFocus"]);
  });

  it("a restore confirm that keeps its trigger ref is flagged", () => {
    const kept = mutate(real, /\s*restoreTrigger\.current = null;/, "");
    expect(scan(kept)).toEqual(["the restore confirm does not clear its trigger and run the restore"]);
  });

  it("a 401 that stashes a clean draft is flagged", () => {
    const always = mutate(real, /\bif \(dirtyNow && stash === undefined\) (stashDraft\()/, "$1");
    expect(scan(always)).toEqual(["stashOnUnauthorized does not write the stash only while dirty with no copy"]);
    const inverted = mutate(real, /\bif \(dirtyNow && stash === undefined\) (stashDraft\()/, "if (!dirtyNow && stash === undefined) $1");
    expect(scan(inverted)).toEqual(["stashOnUnauthorized does not write the stash only while dirty with no copy"]);
  });

  it("a stash call in a comment is not the dirty gate", () => {
    const always = mutate(real, /\bif \(dirtyNow && stash === undefined\) (stashDraft\()/, "$1");
    const commented = mutate(always, /(\bconst stashOnUnauthorized = \(\) => \{)/, "$1\n// if (dirtyNow && stash === undefined) stashDraft(\n");
    expect(scan(commented)).toEqual(["stashOnUnauthorized does not write the stash only while dirty with no copy"]);
  });

  it("an outer EditScreen load that wraps onUnauthorized is flagged", () => {
    const wrapped = mutate(real, /(\bfunction EditScreen[\s\S]*?\buseFail\()onUnauthorized,/, "$1() => onUnauthorized(),");
    expect(scan(wrapped)).toEqual(["EditScreen load does not use the raw onUnauthorized via useFail"]);
  });

  // Every pin reads the first match, so a comment only counts when it sits
  // ahead of the real wiring. Each case puts the commented copy first.
  it("a wrapper name in a comment ahead of the raw callback is not wiring", () => {
    const raw = mutate(real, /\bonUnauthorized:\s*stashOnUnauthorized\b/, "onUnauthorized: onUnauthorized");
    const commented = mutate(raw, /(\buseDraftToolbarActions\s*\(\s*\{)/, "$1\n// onUnauthorized: stashOnUnauthorized,\n");
    expect(scan(commented)).toEqual(["useDraftToolbarActions onUnauthorized is not stashOnUnauthorized"]);
  });

  it("a RestoreNotice in a comment is not rendered", () => {
    const gone = mutate(
      real,
      /\{stash && <RestoreNotice[^>]*\/>\}/,
      "{/* {stash && <RestoreNotice onRestore={askRestore} onDiscard={discardStash} />} */}",
    );
    expect(scan(gone)).toEqual(["RestoreNotice is not rendered"]);
  });

  it("whitespace and line breaks inside a prop change no verdict", () => {
    const spreadWrapper = mutate(real, /<SettingsTab([\s\S]*?)onUnauthorized=\{stashOnUnauthorized\}/, "<SettingsTab$1onUnauthorized =\n  {\n    stashOnUnauthorized\n  }");
    expect(scan(spreadWrapper)).toEqual([]);
    const spreadRaw = mutate(real, /<SettingsTab([\s\S]*?)onUnauthorized=\{stashOnUnauthorized\}/, "<SettingsTab$1onUnauthorized =\n  {\n    onUnauthorized\n  }");
    expect(scan(spreadRaw)).toEqual(["SettingsTab onUnauthorized is not stashOnUnauthorized"]);
    const spreadKey = mutate(real, /\bonUnauthorized:\s*stashOnUnauthorized\b/, "onUnauthorized\n  :\n  stashOnUnauthorized");
    expect(scan(spreadKey)).toEqual([]);
  });

  it("an extra prop on the RestoreNotice is not a violation", () => {
    expect(scan(mutate(real, /<RestoreNotice/, "<RestoreNotice\n  extra={1}"))).toEqual([]);
  });
});

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const COPY: DraftStash = { body: { label: { en: "Kept" } } as unknown as Draft, layout: { a: 1 }, revision: 3 };
const LOADED = { body: { label: { en: "Stored" } }, layout: {} };
const FOR_WAIT = { dirty: true, saving: false, conflict: false, failure: undefined, changedSinceFailure: false, dirtyFor: 0 };

/** Each scenario of `studio-app`'s "A kept copy waits for the author's answer". */
describe("A kept copy waits for the author's answer", () => {
  it("The same actor can restore after logging in again", () => {
    const storage = memoryStorage();
    stashDraft(storage, "actor", "proc", COPY);
    expect(readRestorable(storage, "actor", "proc", LOADED)).toEqual(COPY);
    expect(scan(mutate(real, /replace\(stash\.body\);/, ""))).toEqual(["runRestore does not put the copy's body in the editor"]);
  });

  it("A copy equal to the loaded draft shows no notice", () => {
    const storage = memoryStorage();
    stashDraft(storage, "actor", "proc", COPY);
    expect(readRestorable(storage, "actor", "proc", { body: COPY.body, layout: COPY.layout })).toBeUndefined();
  });

  it("Restoring over newer changes asks first", () => {
    expect(scan(mutate(real, /\bif \(dirtyNow \|\| savedUnderNotice\) \{/, "if (savedUnderNotice) {"))).toEqual(["askRestore does not ask only over a change since the draft opened"]);
  });

  it("Restoring after this tab saved asks first", () => {
    expect(scan(mutate(real, /\bif \(dirtyNow \|\| savedUnderNotice\) \{/, "if (dirtyNow) {"))).toEqual(["askRestore does not ask only over a change since the draft opened"]);
    expect(scan(mutate(real, /setSavedUnderNotice\(true\);/, ""))).toEqual(["followStash does not mark the saved change"]);
  });

  it("A restored draft saved against a moved revision conflicts", () => {
    const moved = mutate(real, /revision: stash\.revision, layout: stash\.layout\b/, "layout: stash.layout");
    expect(scan(moved)).toEqual(["runRestore does not keep the copy's revision and layout"]);
  });

  it("Another actor sees no notice", () => {
    const storage = memoryStorage();
    stashDraft(storage, "actor", "proc", COPY);
    expect(readRestorable(storage, "other", "proc", LOADED)).toBeUndefined();
  });

  it("Restoring deletes the copy", () => {
    expect(scan(mutate(real, /(layout: stash\.layout \}\)\);\s*)dropStash\(\);/, "$1"))).toEqual(["runRestore keeps the copy"]);
  });

  it("Choosing \"Discard them\" deletes the copy", () => {
    expect(scan(mutate(real, /(const discardStash = \(\) => \{\s*if \(requestRunning\) return;\s*)dropStash\(\);/, "$1"))).toEqual(["discardStash keeps the copy"]);
  });

  it("Discarding the draft deletes the copy", () => {
    expect(scan(mutate(real, /(onDiscarded\s*:\s*\(\)\s*=>\s*\{\s*)dropStash\(\);/, "$1"))).toEqual(["onDiscarded does not call dropStash before navigate"]);
  });

  it("The notice waits for a running save", () => {
    expect(scan(mutate(real, /\s+disabled=\{requestRunning\}/, ""))).toEqual(["RestoreNotice disabled is not requestRunning"]);
  });
});

/** Each scenario of `studio-app`'s "A standing notice holds the automatic saves". */
describe("The process list's discard deletes the kept copy", () => {
  const list = stripComments(readFileSync(new URL("../src/areas/studio/screens/ProcessesScreen.tsx", import.meta.url).pathname, "utf8"));
  const rootFile = stripComments(readFileSync(new URL("../src/areas/studio/root.tsx", import.meta.url).pathname, "utf8"));
  const clears = (code: string) => /await deleteDraft\(processId, token\);\s*clearStash\(tabStorage\(\), actorId, processId\);/.test(code);
  const passes = (code: string) => /<ProcessesScreen\b[^>]*\bactorId=\{session\.actorId\}/.test(code);

  it("clears the copy right after the delete answers, under the session's actor", () => {
    expect(clears(list)).toBe(true);
    expect(passes(rootFile)).toBe(true);
  });

  it("a discard that leaves the copy is flagged", () => {
    expect(clears(list.replace("clearStash(tabStorage(), actorId, processId);", ""))).toBe(false);
  });

  it("a clear ahead of the delete is flagged, since a refused delete keeps the draft", () => {
    expect(clears(list.replace(/await deleteDraft\(processId, token\);\s*clearStash\(tabStorage\(\), actorId, processId\);/, "clearStash(tabStorage(), actorId, processId);\nawait deleteDraft(processId, token);"))).toBe(false);
  });

  it("a process list with no actor is flagged", () => {
    expect(passes(rootFile.replace("actorId={session.actorId} roles", "roles"))).toBe(false);
  });
});

describe("A standing notice holds the automatic saves", () => {
  it("A change under the notice sends nothing", () => {
    expect(autosaveWait({ ...FOR_WAIT, held: true, flushAsked: false })).toBeUndefined();
    expect(scan(mutate(real, /noticeStands: stash !== undefined/, "noticeStands: false"))).toEqual(["the notice does not hold the saves"]);
    const line = headerStateLine({ dirty: true, failed: false, conflict: false, noticeStands: true, jsonUnapplied: false, lastSavedAt: undefined, now: 0, baseVersion: null });
    expect(line.state).toBe("unsaved");
  });

  it("Answering the notice lets the saves run", () => {
    expect(autosaveWait({ ...FOR_WAIT, held: false, flushAsked: false })).toBe(AUTOSAVE_DEBOUNCE_MS);
  });

  it("An exit under the notice keeps the copy", () => {
    expect(autosaveWait({ ...FOR_WAIT, held: true, flushAsked: true })).toBe(0);
    expect(scan(mutate(real, /(\bonSaved\s*:\s*\(revision\)\s*=>\s*\{)/, "$1 dropStash();"))).toEqual(["onSaved deletes the copy"]);
  });

  it("A copy restores after an exit under the notice", () => {
    expect(scan(mutate(real, /followStash\(revision\);/, ""))).toEqual(["onSaved does not move the copy's revision"]);
    expect(scan(mutate(real, /followStash\(record\.revision\);/, ""))).toEqual(["onRestored does not move the copy's revision"]);
    expect(scan(mutate(real, /stashDraft\(tabStorage\(\), actorId, processId, moved\);/, ""))).toEqual(["followStash does not reach storage"]);
    expect(scan(mutate(real, /setStash\(moved\);/, ""))).toEqual(["followStash does not reach state"]);
    expect(scan(mutate(real, /const moved = \{ \.\.\.stash, revision \};/, "const moved = { body: draft, layout: saveState.layout, revision };"))).toEqual(["followStash does not keep the copy's body and layout"]);
    expect(scan(mutate(real, /if \(stash === undefined\) return;\s*(const moved)/, "$1"))).toEqual(["followStash writes a copy nothing kept"]);
  });

  it("A 401 under the notice keeps the copy", () => {
    const over = mutate(real, /\bif \(dirtyNow && stash === undefined\) (stashDraft\()/, "if (dirtyNow) $1");
    expect(scan(over)).toEqual(["stashOnUnauthorized does not write the stash only while dirty with no copy"]);
  });
});
