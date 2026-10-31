import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider, useDraft } from "../src/areas/studio/draft/store.js";
import { HeldDraft, holdWhileHidden } from "../src/areas/studio/draft/held-while-hidden.js";
import { FieldMatrixPanel } from "../src/areas/studio/panels/FieldMatrixPanel.js";
import { FieldMatrixGrid } from "../src/areas/studio/panels/FieldMatrixGrid.js";
import { ChangeList } from "../src/areas/studio/panels/ChangeList.js";

/**
 * A hidden tab body that derives from the whole draft draws its last visible
 * draft (`studio-app`). `renderToStaticMarkup` cannot observe a second
 * render, so the rule is tested on `holdWhileHidden`, the function the hook
 * wraps. `fold` replays a sequence of renders the way the hook's ref does.
 */
function fold<T>(renders: Array<{ value: T; visible: boolean }>): T[] {
  let held = renders[0]!.value;
  return renders.map(({ value, visible }) => {
    held = holdWhileHidden(held, value, visible);
    return held;
  });
}

describe("holdWhileHidden", () => {
  it("returns the live value while visible", () => {
    expect(holdWhileHidden("old", "new", true)).toBe("new");
  });

  it("returns the held value while hidden", () => {
    expect(holdWhileHidden("old", "new", false)).toBe("old");
  });

  it("holds the last visible value across hidden renders, and the reveal returns the live one", () => {
    const a = { label: "a" };
    const b = { label: "b" };
    const c = { label: "c" };
    const d = { label: "d" };
    const shown = fold([
      { value: a, visible: true },
      { value: b, visible: false },
      { value: c, visible: false },
      { value: d, visible: true },
    ]);
    expect(shown[1]).toBe(a);
    expect(shown[2]).toBe(a);
    expect(shown[3]).toBe(d);
  });

  it("holds the first value for a body that mounts hidden", () => {
    const first = { label: "first" };
    const shown = fold([
      { value: first, visible: false },
      { value: { label: "typed" }, visible: false },
    ]);
    expect(shown[1]).toBe(first);
  });
});

describe("HeldDraft", () => {
  function Label() {
    const { draft } = useDraft();
    return <span>{draft.label?.en}</span>;
  }

  it("provides the live draft on its first render, hidden or not", () => {
    for (const visible of [true, false]) {
      const html = renderToStaticMarkup(
        <DraftProvider initial={{ label: { en: "Offboarding" } }} token="token">
          <HeldDraft visible={visible}>
            <Label />
          </HeldDraft>
        </DraftProvider>,
      );
      expect(html).toBe("<span>Offboarding</span>");
    }
  });
});

describe("the held bodies skip on an unchanged provider value", () => {
  const MEMO = Symbol.for("react.memo");

  it("FieldMatrixPanel, FieldMatrixGrid and ChangeList are memo components", () => {
    for (const component of [FieldMatrixPanel, FieldMatrixGrid, ChangeList]) {
      expect((component as unknown as { $$typeof: symbol }).$$typeof).toBe(MEMO);
    }
  });

  it("the Fields tab wraps the matrix view in HeldDraft, visible only while that view is open", () => {
    const src = readFileSync(new URL("../src/areas/studio/panels/FieldsTabViews.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/<HeldDraft visible=\{visible && view === "matrix"\}>\s*<FieldMatrixPanel \/>\s*<\/HeldDraft>/);
  });

  // React 19 propagates a context change lazily. A bail-out under HeldDraft
  // walks up past HeldDraft's unchanged provider to the changed outer one,
  // then forces a render on the first DraftContext reader below it. Only the
  // panel may read the context, so the grid below it stays skipped.
  it("FieldMatrixGrid reads no draft context; the panel hands it the draft", () => {
    const read = (f: string) => readFileSync(new URL(`../src/areas/studio/panels/${f}`, import.meta.url), "utf8");
    const grid = read("FieldMatrixGrid.tsx");
    expect(grid).not.toMatch(/\buseDraft\b|\buseContext\b|\buse\(/);
    expect(read("FieldMatrixPanel.tsx")).toMatch(/<FieldMatrixGrid draft=\{draft\} mutate=\{mutate\} contentLocale=\{contentLocale\}/);
  });
});
