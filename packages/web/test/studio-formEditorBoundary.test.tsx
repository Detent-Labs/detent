import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FormEditorBoundary } from "../src/areas/studio/screens/EditScreen.js";
import { t } from "../src/areas/studio/catalog.js";

/**
 * A failed form editor chunk stays inside the process surface. `lazy`
 * rethrows the rejected import during render; with no boundary of its own
 * the shell's boundary replaces the whole studio area and unmounts
 * `DraftProvider`, unsaved draft included.
 *
 * No harness in this package can fail a dynamic import, so the wiring is
 * guarded at the source, in the idiom of `studio-leave-guard.test.ts`. `scan`
 * returns one name per violation. The first test asserts the real file has
 * none; the rest apply one in-memory mutation each and assert the matching
 * violation appears. The fallback itself renders through the class's own
 * `render`, since `renderToStaticMarkup` runs no error boundary.
 */
const FILE = "src/areas/studio/screens/EditScreen.tsx";
const source = readFileSync(new URL(`../${FILE}`, import.meta.url).pathname, "utf8");

/** Block comments first, then line comments: a name in a comment is not wiring. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The `onBack={...}` expression of the first element opened at `at`. */
function onBackOf(code: string, at: number): string | undefined {
  return /^<\w+[^>]*?\bonBack=\{(\(\) => [^}]*\))\}/.exec(code.slice(at))?.[1];
}

function scan(text: string): string[] {
  const code = stripComments(text);
  const violations: string[] = [];
  const editors = [...code.matchAll(/<FormEditorScreen\b/g)].map((m) => m.index);
  if (editors.length === 0) violations.push("no-form-editor-element");
  for (const at of editors) {
    const open = code.lastIndexOf("<FormEditorBoundary", at);
    const close = code.indexOf("</FormEditorBoundary>", at);
    const closedBetween = open >= 0 && code.slice(open, at).includes("</FormEditorBoundary>");
    if (open < 0 || close < 0 || closedBetween) {
      violations.push("editor-outside-boundary");
      continue;
    }
    const suspense = code.lastIndexOf("<Suspense", at);
    if (suspense < open) violations.push("suspense-outside-boundary");
    const boundaryBack = onBackOf(code, open);
    if (boundaryBack === undefined || boundaryBack !== onBackOf(code, at)) violations.push("boundary-back-differs");
  }
  return violations;
}

describe("the form editor's chunk boundary", () => {
  it("wraps every lazy form editor element in EditScreen.tsx", () => {
    expect(scan(source)).toEqual([]);
  });

  it("flags a form editor element with no boundary around it", () => {
    // An opening tag here holds `=>` and nested JSX, so it is cut by its line.
    const mutated = source.replace(/<FormEditorBoundary\b[^\n]*/, "<>").replace("</FormEditorBoundary>", "</>");
    expect(mutated).not.toBe(source);
    expect(scan(mutated)).toContain("editor-outside-boundary");
  });

  it("flags a boundary that sits inside the Suspense instead of around it", () => {
    const open = /<FormEditorBoundary\b[^\n]*/.exec(source)!;
    const suspense = /<Suspense\b[^\n]*/.exec(source.slice(open.index))!;
    const suspenseAt = open.index + suspense.index;
    // Swap the two opening tags; the closing tags stay put, which no parser
    // would accept but which `scan` reads by position alone.
    const mutated =
      source.slice(0, open.index) + suspense[0] + source.slice(open.index + open[0].length, suspenseAt) + open[0] + source.slice(suspenseAt + suspense[0].length);
    expect(scan(mutated)).toContain("suspense-outside-boundary");
  });

  it("flags a boundary whose Back goes somewhere else than the form editor's", () => {
    const mutated = source.replace(/(<FormEditorBoundary onBack=\{\(\) => )[^}]*\)\}/, '$1go("/studio")}');
    expect(mutated).not.toBe(source);
    expect(scan(mutated)).toContain("boundary-back-differs");
  });
});

/** `renderToStaticMarkup` escapes text the way this does. */
const escaped = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("FormEditorBoundary", () => {
  const noop = () => {};

  it("renders its children while nothing failed", () => {
    const boundary = new FormEditorBoundary({ onBack: noop, children: <p>editor</p> });
    expect(renderToStaticMarkup(<>{boundary.render()}</>)).toBe("<p>editor</p>");
  });

  it("renders an alert banner with a Back control once the chunk failed", () => {
    const boundary = new FormEditorBoundary({ onBack: noop, children: <p>editor</p> });
    boundary.state = FormEditorBoundary.getDerivedStateFromError();
    const html = renderToStaticMarkup(<>{boundary.render()}</>);
    expect(html).toContain('role="alert"');
    expect(html).toContain(escaped(t("formEditor.loadFailed")));
    expect(html).toMatch(new RegExp(`<button type="button" class="btn btn-secondary[^"]*"[^>]*>${escaped(t("formEditor.back"))}</button>`));
    expect(html).not.toContain("editor</p>");
  });

  it("passes the Back control the boundary's own onBack", () => {
    const onBack = () => {};
    const boundary = new FormEditorBoundary({ onBack, children: null });
    boundary.state = FormEditorBoundary.getDerivedStateFromError();
    const tree = boundary.render() as unknown as { props: { children: Array<{ type: unknown; props: { onClick?: unknown } }> } };
    const button = tree.props.children.find((child) => child.type === "button");
    expect(button?.props.onClick).toBe(onBack);
  });
});
