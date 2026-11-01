import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldMatrixGrid } from "../src/areas/studio/panels/FieldMatrixGrid.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * Guards the delta spec's "A column header with only one eligible badge
 * still aligns with its column's checkboxes" scenario
 * (`field-matrix-badge-alignment`, `specs/studio-app/spec.md`): a column
 * where only `visible` is eligible still renders three grid slots, not
 * one, so the eligible badge never shifts out of its fixed column.
 *
 * `result` is the column's only live cell and is `technical: true`, so
 * `gatedKeys` (`draft/view-flags.ts`) unconditionally gates `required` and
 * `readonly`, leaving `visible` as the sole eligible key.
 */
const DRAFT: Draft = {
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

describe("FieldMatrixGrid's BulkBadges", () => {
  it("renders three grid slots for a column with only one eligible flag", () => {
    const html = renderToStaticMarkup(
      <FieldMatrixGrid draft={DRAFT} mutate={() => {}} contentLocale="en" showBulkBadges={true} />,
    );

    // The fixture's single live cell drives both the submit column's
    // header and the result row's header, so each renders its own
    // BulkBadges — one eligible badge and two empty slots apiece.
    const badgeCount = (html.match(/\bmatrixFlagBadge\b/g) ?? []).length;
    const emptyCount = (html.match(/\bmatrixFlagEmpty\b/g) ?? []).length;
    expect(badgeCount).toBe(2);
    expect(emptyCount).toBe(4);
  });
});

describe("FieldMatrixGrid's headers and badges print words", () => {
  const WORDS: Draft = {
    fields: [
      { id: "field_vendor" as never, key: "vendor", type: "string", label: { en: "Vendor" } },
      { id: "field_blank" as never, key: "blank", type: "string" },
      { id: "field_odd" as never, key: "odd", type: "string", control: "slider" as never, label: { en: "Odd" } },
    ],
    workflow: {
      steps: [
        {
          id: "step_capture" as never,
          key: "capture_key",
          type: "task",
          label: { en: "Capture" },
          view: {
            fields: [
              { ref: "field_vendor" as never, required: { lang: "cel", src: "data.x == 1" } as never },
              { ref: "field_blank" as never },
            ],
          },
        },
        { id: "step_plain" as never, key: "plain_key", type: "task" },
      ],
    },
  };
  const html = renderToStaticMarkup(
    <FieldMatrixGrid draft={WORDS} mutate={() => {}} contentLocale="en" showBulkBadges={true} />,
  );
  const badgeTexts = [...html.matchAll(/<button[^>]*aria-pressed[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);

  it("prints the labels and keeps every key out of the headers", () => {
    expect(html).toContain(">Capture<");
    expect(html).toContain(">Vendor<");
    expect(html).toContain(">(unnamed field)<");
    expect(html).toContain(">(unnamed step)<");
    expect(html).not.toContain("capture_key");
    expect(html).not.toContain(">vendor<");
    expect(html).not.toContain("plain_key");
  });

  it("prints the kind word, in mono only for an unmatched kind", () => {
    expect(html).toContain('aria-label="Kind: ');
    expect(html).not.toContain('aria-label="Type: ');
    const kinds = [...html.matchAll(/<span class="([^"]*)" aria-label="Kind: ([^"]*)">/g)];
    expect(kinds).toHaveLength(3);
    const odd = kinds.find((m) => m[2]!.includes("slider"));
    expect(odd?.[1]).toContain("matrixFieldKindRaw");
    for (const m of kinds.filter((k) => k !== odd)) expect(m[1]).not.toContain("matrixFieldKindRaw");
  });

  it("prints a word on every badge and no letter code", () => {
    expect(badgeTexts.length).toBeGreaterThan(0);
    expect(new Set(badgeTexts)).toEqual(new Set(["Asked", "Required", "Read-only"]));
    for (const code of ["VIS", "REQ", "RO"]) expect(html).not.toContain(`>${code}<`);
  });

  it("stamps a CEL-carrying cell Condition and keeps the source in the title", () => {
    expect(html).toContain(">Condition<");
    expect(html).not.toContain(">CEL<");
    expect(html).toContain("data.x == 1");
    expect(html).toMatch(/title="Required: data\.x == 1"/);
  });
});
