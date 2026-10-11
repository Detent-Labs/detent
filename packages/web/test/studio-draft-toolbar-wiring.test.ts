import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * `useDraftToolbarActions` in `DraftToolbar.tsx` carries four lines of the
 * layout half of the dirty state, and `studio-draftToolbarState.test.ts` calls
 * none of them: it restates the sequences by hand. Each line passes that test
 * when deleted.
 *
 * 1. `doSave` advances the saved layout on the success branch. Without it, a
 *    layout-only save reads "Unsaved changes" for the rest of the session.
 * 2. The save-state update receives an updater that passes `sentLayout`, the
 *    layout the request sent, to `applySaveResult`. A plain value, or the
 *    state read when the answer arrives, drops a drag made during the request.
 *    `onSaveState` is a `Dispatch<SetStateAction<...>>`, so a plain value
 *    still type-checks.
 * 3. `runPublish` gates on `isDraftDirty`. The body-only `isDirty` lets a
 *    layout-only difference publish without saving first.
 * 4. `reload` hands `onSavedLayoutChange` the layout it hands `applyReload`, so
 *    a reloaded draft reads clean.
 *
 * A source test in the idiom `studio-stash-wiring.test.ts` uses: no harness in
 * this package can click a control or run a request. `scan` returns one name
 * per violation. The first test asserts the real file has none. The rest apply
 * one in-memory mutation to the real file and assert the matching violation
 * appears, so each pin is proved to fire. The working tree is never touched.
 */
const DRAFT_TOOLBAR = "src/areas/studio/panels/DraftToolbar.tsx";

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

/** The body of the first brace pair after `const name =`. For `doSave` that is
 * its own arrow function. For `runPublish` and `reload` it is the callback
 * handed to `withUnauthorized`. */
function bodyAfter(code: string, name: string): string | undefined {
  const m = new RegExp(`\\bconst\\s+${name}\\s*=`).exec(code);
  if (!m) return undefined;
  const open = code.indexOf("{", m.index);
  return open < 0 ? undefined : braced(code, open);
}

function scan(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];

  const save = bodyAfter(code, "doSave");
  if (save === undefined) violations.push("doSave not found");
  else {
    const success = /\bif\s*\(\s*result\s*\)\s*\{/.exec(save);
    const successBlock = success ? braced(save, success.index + success[0].length - 1) : undefined;
    if (successBlock === undefined || !/\bonSavedLayoutChange\s*\(\s*result\.layout\s*\)/.test(successBlock)) {
      violations.push("doSave success branch does not call onSavedLayoutChange(result.layout)");
    }
    if (!/\bsaveDraft\s*\([^;]*\blayout:\s*sentLayout\b/.test(save)) violations.push("doSave does not send sentLayout");
    if (!/\bonSaveState\s*\(\s*\(\s*(\w+)\s*\)\s*=>\s*applySaveResult\s*\(\s*\1\s*,\s*result\s*,\s*sentLayout\s*\)\s*\)/.test(save)) {
      violations.push("doSave does not hand onSaveState an updater that passes sentLayout to applySaveResult");
    }
  }

  const publish = bodyAfter(code, "runPublish");
  if (publish === undefined) violations.push("runPublish not found");
  else {
    if (!/\bisDraftDirty\s*\(\s*draft\s*,\s*savedBody\s*,\s*saveState\.layout\s*,\s*savedLayout\s*\)/.test(publish)) {
      violations.push("runPublish does not read isDraftDirty(draft, savedBody, saveState.layout, savedLayout)");
    }
    if (/\bisDirty\s*\(/.test(publish)) violations.push("runPublish reads the body-only isDirty");
  }

  const reload = bodyAfter(code, "reload");
  if (reload === undefined) violations.push("reload not found");
  else {
    const handed = /\bapplyReload\s*\(\s*\{[^}]*\blayout:\s*([\w.]+)/.exec(reload)?.[1];
    const saved = /\bonSavedLayoutChange\s*\(\s*([\w.]+)\s*\)/.exec(reload)?.[1];
    if (handed !== "record.layout" || saved !== handed) {
      violations.push("reload does not hand onSavedLayoutChange the record.layout it hands applyReload");
    }
  }

  return violations;
}

/** Replaces the first match in `code`. It fails when nothing matches, so a
 * mutation that drifted from the source cannot pass as a clean scan. */
function mutate(code: string, from: RegExp, to: string): string {
  const out = code.replace(from, to);
  expect(out, `the mutation ${String(from)} matched nothing in DraftToolbar.tsx`).not.toBe(code);
  return out;
}

const real = stripComments(readFileSync(new URL(`../${DRAFT_TOOLBAR}`, import.meta.url).pathname, "utf8"));

describe("DraftToolbar.tsx wires the saved layout", () => {
  it("the real DraftToolbar.tsx has no violation", () => {
    expect(scan(real)).toEqual([]);
  });

  it("a save that leaves the saved layout behind is flagged", () => {
    const dropped = mutate(real, /\s*onSavedLayoutChange\(result\.layout\);/, "");
    expect(scan(dropped)).toEqual(["doSave success branch does not call onSavedLayoutChange(result.layout)"]);
  });

  it("a saved layout advanced outside the success branch is flagged", () => {
    const dropped = mutate(real, /\s*onSavedLayoutChange\(result\.layout\);/, "");
    const outside = mutate(dropped, /(\n\s*return result !== undefined;)/, "\nonSavedLayoutChange(saveState.layout);$1");
    expect(scan(outside)).toEqual(["doSave success branch does not call onSavedLayoutChange(result.layout)"]);
  });

  it("a layout advance in a comment is not wiring", () => {
    const commented = mutate(real, /onSavedLayoutChange\(result\.layout\);/, "// onSavedLayoutChange(result.layout);");
    expect(scan(commented)).toEqual(["doSave success branch does not call onSavedLayoutChange(result.layout)"]);
  });

  it("a save state that takes a plain value is flagged", () => {
    const plain = mutate(real, /onSaveState\(\(current\) => applySaveResult\(current, result, sentLayout\)\)/, "onSaveState(applySaveResult(saveState, result, sentLayout))");
    expect(scan(plain)).toEqual(["doSave does not hand onSaveState an updater that passes sentLayout to applySaveResult"]);
  });

  it("an updater that drops sentLayout is flagged", () => {
    const dropped = mutate(real, /applySaveResult\(current, result, sentLayout\)/, "applySaveResult(current, result)");
    expect(scan(dropped)).toEqual(["doSave does not hand onSaveState an updater that passes sentLayout to applySaveResult"]);
  });

  it("an updater that reads another state than its own parameter is flagged", () => {
    const other = mutate(real, /applySaveResult\(current, result, sentLayout\)/, "applySaveResult(saveState, result, sentLayout)");
    expect(scan(other)).toEqual(["doSave does not hand onSaveState an updater that passes sentLayout to applySaveResult"]);
  });

  it("a save request that sends another layout than sentLayout is flagged", () => {
    const other = mutate(real, /layout: sentLayout,/, "layout: saveState.layout,");
    expect(scan(other)).toEqual(["doSave does not send sentLayout"]);
  });

  it("a publish that gates on the body-only isDirty is flagged", () => {
    const bodyOnly = mutate(real, /isDraftDirty\(draft, savedBody, saveState\.layout, savedLayout\) && /, "isDirty(draft, savedBody) && ");
    expect(scan(bodyOnly)).toEqual([
      "runPublish does not read isDraftDirty(draft, savedBody, saveState.layout, savedLayout)",
      "runPublish reads the body-only isDirty",
    ]);
  });

  it("a publish that compares against the wrong saved layout is flagged", () => {
    const wrong = mutate(real, /isDraftDirty\(draft, savedBody, saveState\.layout, savedLayout\)/, "isDraftDirty(draft, savedBody, saveState.layout, saveState.layout)");
    expect(scan(wrong)).toEqual(["runPublish does not read isDraftDirty(draft, savedBody, saveState.layout, savedLayout)"]);
  });

  it("a reload that leaves the saved layout behind is flagged", () => {
    const dropped = mutate(real, /\s*onSavedLayoutChange\(record\.layout\);/, "");
    expect(scan(dropped)).toEqual(["reload does not hand onSavedLayoutChange the record.layout it hands applyReload"]);
  });

  it("a reload that saves another layout than it applies is flagged", () => {
    const other = mutate(real, /onSavedLayoutChange\(record\.layout\);/, "onSavedLayoutChange(saveState.layout);");
    expect(scan(other)).toEqual(["reload does not hand onSavedLayoutChange the record.layout it hands applyReload"]);
    const copy = mutate(real, /onSavedLayoutChange\(record\.layout\);/, "onSavedLayoutChange({ ...record.layout });");
    expect(scan(copy)).toEqual(["reload does not hand onSavedLayoutChange the record.layout it hands applyReload"]);
  });

  it("whitespace and line breaks inside a call change no verdict", () => {
    const spread = mutate(real, /onSavedLayoutChange\(result\.layout\);/, "onSavedLayoutChange(\n  result.layout\n);");
    expect(scan(spread)).toEqual([]);
  });
});
