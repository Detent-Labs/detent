import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * `EditScreen.tsx` wires the unsaved-draft stash at six places, and no other
 * test sees any of them.
 *
 * `ProcessSurface` wraps the shell's `onUnauthorized` as `stashOnUnauthorized`.
 * A 401 from any request on the screen then keeps unsaved work. Two consumers
 * take the wrapper: `useDraftToolbarActions` (save, discard, publish) and the
 * `AccessPanel`. A raw callback on either one lets that request end the
 * session and lose the draft, with every type check still green.
 *
 * The stash goes stale in two places. A successful save and a discarded draft
 * each call `dropStash()`, and the discard does it before `navigate`, which
 * unmounts the screen. `RestoreNotice` renders only while a stash exists, and
 * its two buttons call the restore and discard handlers. The outer `EditScreen`
 * loads the draft before any draft exists, so it keeps the raw callback.
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
    if (saved === undefined || !CALL.test(saved)) violations.push("onSaved does not call dropStash");

    // The discard unmounts the screen through `navigate`, so the drop comes first.
    const discarded = propArrowBody(options, "onDiscarded") ?? "";
    const drop = discarded.search(CALL);
    const leave = discarded.search(/\bnavigate\s*\(/);
    if (drop < 0 || leave < 0 || drop > leave) violations.push("onDiscarded does not call dropStash before navigate");
  }

  const access = openingTag(code, "AccessPanel");
  if (access === undefined) violations.push("AccessPanel element not found");
  else if (propValue(access.tag, "onUnauthorized") !== "stashOnUnauthorized") {
    violations.push("AccessPanel onUnauthorized is not stashOnUnauthorized");
  }

  const notice = openingTag(code, "RestoreNotice");
  if (notice === undefined) violations.push("RestoreNotice is not rendered");
  else {
    if (!/\bstash\s*&&\s*$/.test(code.slice(0, notice.start))) violations.push("RestoreNotice is not gated on stash");
    if (propValue(notice.tag, "onRestore") !== "restoreStash") violations.push("RestoreNotice onRestore is not restoreStash");
    if (propValue(notice.tag, "onDiscard") !== "discardStash") violations.push("RestoreNotice onDiscard is not discardStash");
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

  it("a raw onUnauthorized on the AccessPanel is flagged", () => {
    const raw = mutate(real, /(<AccessPanel[^>]*?)onUnauthorized=\{stashOnUnauthorized\}/, "$1onUnauthorized={onUnauthorized}");
    expect(scan(raw)).toEqual(["AccessPanel onUnauthorized is not stashOnUnauthorized"]);
  });

  it("a successful save that keeps the stash is flagged", () => {
    const kept = mutate(real, /(\bonSaved\s*:\s*\(\)\s*=>\s*\{[^}]*?)dropStash\(\);/, "$1");
    expect(scan(kept)).toEqual(["onSaved does not call dropStash"]);
  });

  it("a discarded draft that keeps the stash is flagged", () => {
    const kept = mutate(real, /(\bonDiscarded\s*:\s*\(\)\s*=>\s*\{\s*)dropStash\(\);/, "$1");
    expect(scan(kept)).toEqual(["onDiscarded does not call dropStash before navigate"]);
  });

  it("a discarded draft that drops the stash after navigate is flagged", () => {
    const late = mutate(
      real,
      /(\bonDiscarded\s*:\s*\(\)\s*=>\s*\{\s*)dropStash\(\);(\s*onDirtyChange\?\.\(false\);\s*navigate\(\{ name: "processes" \}\);)/,
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

  it("a RestoreNotice whose buttons call the wrong handlers is flagged", () => {
    const restore = mutate(real, /onRestore=\{restoreStash\}/, "onRestore={discardStash}");
    expect(scan(restore)).toEqual(["RestoreNotice onRestore is not restoreStash"]);
    const discard = mutate(real, /onDiscard=\{discardStash\}/, "onDiscard={restoreStash}");
    expect(scan(discard)).toEqual(["RestoreNotice onDiscard is not discardStash"]);
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
      "{/* {stash && <RestoreNotice onRestore={restoreStash} onDiscard={discardStash} />} */}",
    );
    expect(scan(gone)).toEqual(["RestoreNotice is not rendered"]);
  });

  it("whitespace and line breaks inside a prop change no verdict", () => {
    const spreadWrapper = mutate(real, /<AccessPanel([^>]*?)onUnauthorized=\{stashOnUnauthorized\}/, "<AccessPanel$1onUnauthorized =\n  {\n    stashOnUnauthorized\n  }");
    expect(scan(spreadWrapper)).toEqual([]);
    const spreadRaw = mutate(real, /<AccessPanel([^>]*?)onUnauthorized=\{stashOnUnauthorized\}/, "<AccessPanel$1onUnauthorized =\n  {\n    onUnauthorized\n  }");
    expect(scan(spreadRaw)).toEqual(["AccessPanel onUnauthorized is not stashOnUnauthorized"]);
    const spreadKey = mutate(real, /\bonUnauthorized:\s*stashOnUnauthorized\b/, "onUnauthorized\n  :\n  stashOnUnauthorized");
    expect(scan(spreadKey)).toEqual([]);
  });

  it("an extra prop on the RestoreNotice is not a violation", () => {
    expect(scan(mutate(real, /<RestoreNotice/, "<RestoreNotice\n  extra={1}"))).toEqual([]);
  });
});
