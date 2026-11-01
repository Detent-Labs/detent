import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * The studio raises no native browser prompt, and one component owns the
 * `dialog` element (`studio-app`: "One dialog form serves every studio
 * confirmation").
 *
 * A source test in the idiom `boundaries.test.ts` already uses: it reads each
 * file, matches a pattern, and asserts nothing hits. No harness in this package
 * can click a control and observe which dialog opened, so the regression is
 * guarded at the source instead.
 *
 * The walk reads every `.ts` and `.tsx` under `src/areas/studio`, so a new file
 * needs no entry here. A floor on the number of files read keeps an empty walk,
 * such as a moved directory, from passing.
 *
 * Each pattern matches the CALL or the element, never the word: comments discuss
 * confirmation on purpose. Comments are stripped before the match runs, so prose
 * can never fail it.
 */
const ROOT = new URL("../src/areas/studio/", import.meta.url).pathname;

/** The one file that writes `<dialog` and calls `showModal(`. */
const DIALOG_FRAME = "panels/shared/StudioDialog.tsx";

/** Below the 174 files the area holds today, and far above an emptied walk. */
const FILE_FLOOR = 150;

/** Block comments first, then line comments — the order matters for a `//`
 * inside a block comment. `boundaries.test.ts` strips the same way, for the
 * same reason: a name in a comment is not a call. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** `\b` before a lowercase `confirm` leaves `onConfirm(` alone and still
 * catches the qualified `window.confirm(` form. */
const NATIVE_PROMPT = /\bconfirm\s*\(/;

/** The element, not `<dialogFoo`, and the method call under any receiver. */
const DIALOG_SITE = /<dialog(?=[\s>/])|\bshowModal\s*\(/;

/** Any identifier that names a dialog: `StudioDialog`, `RemoveStepDialog`, a
 * `dialog` ref. `studio-app`: "Removing a way out asks nothing". */
const DIALOG_NAME = /\w*[Dd]ialog\w*/;

/** The file that removes a way out, which must mount no dialog. */
const PATHS_PANEL = "panels/PathsPanel.tsx";

interface SourceFile {
  /** Relative to `src/areas/studio`. */
  path: string;
  source: string;
}

function studioSources(): SourceFile[] {
  return readdirSync(ROOT, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.tsx?$/.test(path))
    .map((path) => ({ path, source: readFileSync(`${ROOT}${path}`, "utf8") }));
}

/** One line per violation, naming the file. */
function scan(files: readonly SourceFile[]): string[] {
  const violations: string[] = [];
  for (const { path, source } of files) {
    const code = stripComments(source);
    if (NATIVE_PROMPT.test(code)) violations.push(`${path} calls the browser's own confirm()`);
    if (path !== DIALOG_FRAME && DIALOG_SITE.test(code)) violations.push(`${path} opens a dialog outside ${DIALOG_FRAME}`);
  }
  return violations;
}

describe("the studio raises no native prompt and opens one dialog form", () => {
  const files = studioSources();

  it("the walk reads the whole area", () => {
    expect(files.length).toBeGreaterThanOrEqual(FILE_FLOOR);
    expect(files.map((f) => f.path)).toContain(DIALOG_FRAME);
    expect(files.map((f) => f.path)).toContain("root.tsx");
  });

  it("no file calls confirm(), and only the frame writes a dialog", () => {
    expect(scan(files)).toEqual([]);
  });

  it("the frame itself writes the element and calls showModal", () => {
    const frame = stripComments(files.find((f) => f.path === DIALOG_FRAME)!.source);
    expect(frame).toMatch(/<dialog(?=[\s>/])/);
    expect(frame).toMatch(/\.showModal\(\)/);
  });

  it("a planted confirm( fails, in any file, the frame included", () => {
    const planted = "const ok = confirm('really?');";
    expect(scan([{ path: "screens/Planted.tsx", source: planted }])).toEqual(["screens/Planted.tsx calls the browser's own confirm()"]);
    expect(scan([{ path: DIALOG_FRAME, source: planted }])).toEqual([`${DIALOG_FRAME} calls the browser's own confirm()`]);
  });

  it("a second dialog site fails", () => {
    const opened = `screens/Planted.tsx opens a dialog outside ${DIALOG_FRAME}`;
    expect(scan([{ path: "screens/Planted.tsx", source: "return <dialog ref={ref}>x</dialog>;" }])).toEqual([opened]);
    expect(scan([{ path: "screens/Planted.tsx", source: "return <dialog>x</dialog>;" }])).toEqual([opened]);
    expect(scan([{ path: "screens/Planted.tsx", source: "return <dialog\n  open\n/>;" }])).toEqual([opened]);
    expect(scan([{ path: "screens/Planted.tsx", source: "ref.current?.showModal();" }])).toEqual([opened]);
    expect(scan([{ path: DIALOG_FRAME, source: "return <dialog>x</dialog>; ref.current?.showModal();" }])).toEqual([]);
  });

  it("the patterns match a call and not the word, so a comment cannot fail them", () => {
    expect(NATIVE_PROMPT.test(stripComments("// this used to call confirm(t('key'))\nconst a = 1;"))).toBe(false);
    expect(NATIVE_PROMPT.test(stripComments("/** the discard confirm() this replaced */\nconst a = 1;"))).toBe(false);
    expect(NATIVE_PROMPT.test(stripComments("const ok = confirm('really?');"))).toBe(true);
    expect(NATIVE_PROMPT.test(stripComments("const ok = window.confirm('really?');"))).toBe(true);
    expect(NATIVE_PROMPT.test(stripComments("<Dialog onConfirm={run} />"))).toBe(false);
    expect(DIALOG_SITE.test(stripComments("// renders a <dialog> and calls showModal()\nconst a = 1;"))).toBe(false);
    expect(DIALOG_SITE.test(stripComments("return <StudioDialog heading={h} />;"))).toBe(false);
    expect(DIALOG_SITE.test(stripComments("return <dialogFrame />;"))).toBe(false);
  });

  it("the paths panel removes a way out at once, with no dialog of any kind", () => {
    const panel = files.find((f) => f.path === PATHS_PANEL);
    expect(panel, `${PATHS_PANEL} not found`).toBeDefined();
    expect(stripComments(panel!.source).match(DIALOG_NAME)).toBeNull();
  });

  it("a planted dialog name fails the paths-panel pin, a comment about one does not", () => {
    expect(stripComments("import { StudioDialog } from './shared/StudioDialog.js';").match(DIALOG_NAME)).not.toBeNull();
    expect(stripComments("return <RemovePathDialog onCancel={noop} />;").match(DIALOG_NAME)).not.toBeNull();
    expect(stripComments("// removing a way out opens no dialog\nconst a = 1;").match(DIALOG_NAME)).toBeNull();
  });
});
