import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { FieldMatrixGrid } from "../src/areas/studio/panels/FieldMatrixGrid.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * Three faults an audit measured, guarded at the source.
 *
 * The matrix drew a header row above no row at all, which
 * `design-language.md` forbids in words: "An empty state says so in words. It
 * never shows as an empty table."
 *
 * A gated checkbox carried `aria-disabled`, swallowed the click, and said
 * nothing about why.
 *
 * The Hide-inert toggle announced `aria-pressed` that no style painted, so
 * the state reached assistive technology and never reached the eye.
 */
const ROOT = new URL("../", import.meta.url).pathname;
const read = (f: string) => readFileSync(`${ROOT}${f}`, "utf8");

const NO_FIELDS: Draft = { fields: [], workflow: { steps: [{ id: "step_a" as never, key: "a", type: "task" }] } };

/** A field, and one step that declares no view. The step is inert, so
 * Hide-inert leaves no column while the row stays. That is the filter's own
 * empty state, and it is a filter to clear rather than a process to fix. */
const ALL_INERT: Draft = {
  fields: [{ id: "field_vendor" as never, key: "vendor", type: "string" }],
  workflow: { steps: [{ id: "step_a" as never, key: "a", type: "task" }] },
};

const TECHNICAL: Draft = {
  fields: [{ id: "field_result" as never, key: "result", type: "string", technical: true }],
  workflow: {
    steps: [
      {
        id: "step_submit" as never,
        key: "submit",
        type: "task",
        view: { fields: [{ ref: "field_result" as never }] },
      },
    ],
  },
};

const render = (draft: Draft, hideInert = false) =>
  renderToStaticMarkup(
    <DraftProvider initial={draft} token="token">
      <FieldMatrixGrid hideInert={hideInert} showBulkBadges={true} />
    </DraftProvider>,
  );

describe("the field matrix's empty state", () => {
  it("says so in words when the process declares no field", () => {
    const html = render(NO_FIELDS);
    expect(html).toContain("declares no field");
    expect(html).not.toContain("<table");
  });

  it("names the filter when the filter is what empties it", () => {
    // A field exists, so this is not the no-field case. The only step is
    // inert, so Hide-inert takes the last column away.
    const html = render(ALL_INERT, true);
    expect(html).not.toContain("<table");
    expect(html).toContain("Hide inert columns is on");
    expect(html).not.toContain("declares no field");
  });

  it("draws the grid for that same process with the filter off", () => {
    // Mutation cover for the test above: without the filter there is a
    // column, so the empty state must not fire.
    const html = render(ALL_INERT, false);
    expect(html).toContain("<table");
  });

  it("carries a live region, so the change is announced", () => {
    expect(render(NO_FIELDS)).toContain('role="status"');
  });
});

describe("a gated cell's reason", () => {
  it("says the definition contract rejects the flag on a technical field", () => {
    const html = render(TECHNICAL);
    expect(html).toContain("definition contract rejects this flag");
  });

  it("puts the reason in the title a pointer user reads", () => {
    const html = render(TECHNICAL);
    const gated = [...html.matchAll(/<input\b[^>]*aria-disabled="true"[^>]*>/g)].map((m) => m[0]);
    expect(gated.length).toBeGreaterThan(0);
    for (const tag of gated) expect(tag).toContain("title=");
  });

  it("keeps the flag's own word ahead of the reason", () => {
    const html = render(TECHNICAL);
    const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]!);
    const gated = labels.filter((l) => l.includes("definition contract"));
    expect(gated.length).toBeGreaterThan(0);
    for (const l of gated) expect(l).toMatch(/^(required|readonly)\. /);
  });
});

describe("the Hide-inert toggle", () => {
  const panel = read("src/areas/studio/panels/FieldMatrixPanel.tsx");

  it("declares a pressed style", () => {
    expect(panel).toContain("hideInertPressed: {");
  });

  it("picks that style in code, from the value driving aria-pressed", () => {
    // A DOM state never drives a hand-written selector
    // (`design-language.md`). The same boolean feeds both.
    expect(panel).toContain("hideInert && styles.hideInertPressed");
    expect(panel).toContain("aria-pressed={hideInert}");
  });

  it("uses the treatment the canvas toolbar toggle already uses", () => {
    const canvas = read("src/areas/studio/canvas/CanvasView.tsx");
    for (const decl of ["borderColor: colors.accent,", "color: colors.accent,"]) {
      expect(panel).toContain(decl);
      expect(canvas).toContain(decl);
    }
  });
});
