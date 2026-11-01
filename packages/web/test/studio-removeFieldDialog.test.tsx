import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FieldId } from "workflow-engine/schema";
import { RemoveFieldDialog, type RemovalNameRow } from "../src/areas/studio/panels/RemoveFieldDialog.js";
import type { FieldRemovalReach } from "../src/areas/studio/draft/field-removal.js";

/**
 * Static-markup coverage for `RemoveFieldDialog.tsx` (design.md D8;
 * studio-app's "Removing a field that reaches past the field catalog
 * confirms first" and "The removal dialog names each kind of reach"). The
 * web package has no DOM harness, so this renders the dialog
 * unconditionally — a caller only mounts it once `hasReach` holds, but the
 * component itself does not gate on that.
 */

/** The branded id cast `studio-fieldRemoval.test.ts` also uses to build a
 * `DraftField` fixture. */
const id = (s: string) => s as FieldId;

function reach(over: {
  type?: FieldRemovalReach["field"]["type"];
  key?: string;
  fieldsInside?: number;
  steps?: number;
  writers?: number;
  contractEntries?: number;
  columnMappings?: number;
  celReads?: number;
  pluginSettings?: number;
}): FieldRemovalReach {
  return {
    field: { id: id("field_1"), key: over.key ?? "booking_status", type: over.type ?? "string" },
    fieldsInside: over.fieldsInside ?? 0,
    steps: over.steps ?? 0,
    writers: over.writers ?? 0,
    contractEntries: over.contractEntries ?? 0,
    columnMappings: over.columnMappings ?? 0,
    celReads: over.celReads ?? 0,
    pluginSettings: over.pluginSettings ?? 0,
    sites: { fieldsInside: [], steps: [], writers: [], contract: [], columnMappings: [], celReads: [], pluginSettings: [] },
  };
}

function renderDialog(over: { label?: string; reach?: FieldRemovalReach; names?: RemovalNameRow[] } = {}): string {
  return renderToStaticMarkup(
    <RemoveFieldDialog
      label={over.label ?? "Booking status"}
      reach={over.reach ?? reach({})}
      names={over.names ?? []}
      triggerRef={{ current: null }}
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );
}

/** Every `<button ...>` open tag, in DOM order — the idiom
 * `studio-processHeaderBar-publishGate.test.tsx` established for the same
 * question: which single control carries `autofocus`. */
function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("RemoveFieldDialog's heading", () => {
  it("names a field by its label, in curly quotes", () => {
    const html = renderDialog({ label: "Booking status" });

    expect(html).toContain("Remove “Booking status”?");
  });

  it("says the removal takes a group", () => {
    const html = renderDialog({ label: "Processing (Fabrikam)", reach: reach({ type: "group" }) });

    expect(html).toContain("Remove the group “Processing (Fabrikam)”?");
    expect(html).not.toContain("Remove “Processing (Fabrikam)”?");
  });

  // A string replacement would expand `$&` into the matched `{field}`. The
  // markup escapes the label's `&` as `&amp;`.
  it("keeps a label holding a $ pattern as the author typed it", () => {
    const html = renderDialog({ label: "Cost $&" });

    expect(html).toContain("Remove “Cost $&amp;”?");
    expect(html).not.toContain("{field}");
  });
});

describe("RemoveFieldDialog's facts", () => {
  it("prints neither the field's label nor its key in a fact", () => {
    const html = renderDialog({
      label: "Booking status",
      reach: reach({ key: "booking_status", steps: 1 }),
      names: [{ term: "Asked on", names: ["Review"] }],
    });

    expect(html).not.toContain("booking_status");
    expect(html).not.toMatch(/<code[^>]*>/);
    expect(html).not.toContain(">Field</dt>");
    expect(html).not.toContain(">Group</dt>");
    expect(html.split("Booking status")).toHaveLength(2);
  });

  it("prints no facts list where no row carries a name", () => {
    expect(renderDialog()).not.toContain("<dl");
    expect(renderDialog({ names: [{ term: "Asked on", names: [] }] })).not.toContain("<dl");
  });

  it("prints a row of names per kind, each name in its own item", () => {
    const html = renderDialog({
      reach: reach({ steps: 2, celReads: 1 }),
      names: [
        { term: "Asked on", names: ["Review", "Book"] },
        { term: "Read by", names: ["On Review: way out Approve → Book"] },
      ],
    });

    expect(html).toMatch(/<dt[^>]*>Asked on<\/dt><dd[^>]*><ul[^>]*><li>Review<\/li><li>Book<\/li><\/ul><\/dd>/);
    expect(html).toContain("<li>On Review: way out Approve → Book</li>");
  });

  it("prints no row for a kind with no name, and no count", () => {
    const html = renderDialog({ reach: reach({ steps: 2 }), names: [{ term: "Asked on", names: ["Review", "Book"] }] });

    expect(html).not.toContain("Written by");
    expect(html).not.toContain("Filled in from");
    expect(html).not.toContain("Named in a setting on");
    expect(html).not.toMatch(/class="value mono tabular"/);
    expect(html).not.toContain("CEL");
  });
});

describe("RemoveFieldDialog's notes", () => {
  const noteTexts = (html: string) => [...html.matchAll(/<p[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);

  it("always states that the removal takes the field off every form and clears what writes to it", () => {
    expect(renderDialog()).toContain("Removing it takes it off every form and clears what writes to it.");
  });

  it("adds the group note only for a group", () => {
    expect(renderDialog({ reach: reach({ type: "group" }) })).toContain("Every field inside the group leaves with it.");
    expect(renderDialog()).not.toContain("Every field inside the group leaves with it.");
  });

  it("adds the kept note when a read stays", () => {
    expect(renderDialog({ reach: reach({ celReads: 1 }) })).toContain(
      "What reads it or names it in a setting stays as written. Check each one before you publish.",
    );
  });

  it("adds the kept note when a setting stays", () => {
    expect(renderDialog({ reach: reach({ pluginSettings: 1 }) })).toContain("stays as written");
  });

  it("omits the kept note when nothing stays", () => {
    expect(renderDialog()).not.toContain("stays as written");
  });

  it("prints the no-undo note last, after every other note", () => {
    const notes = noteTexts(renderDialog({ reach: reach({ type: "group", celReads: 1 }) }));

    expect(notes).toHaveLength(4);
    expect(notes[3]).toBe("The studio has no undo.");
  });
});

describe("RemoveFieldDialog's accessible name and focus", () => {
  it("points aria-labelledby at the heading's own id", () => {
    const html = renderDialog();
    const labelled = /aria-labelledby="([^"]+)"/.exec(html);

    expect(labelled).not.toBeNull();
    expect(html).toContain(`<h2 id="${labelled![1]}"`);
  });

  it("points aria-describedby at the body holding the facts and the notes", () => {
    const html = renderDialog({ reach: reach({ steps: 1 }), names: [{ term: "Asked on", names: ["Review"] }] });
    const described = /aria-describedby="([^"]+)"/.exec(html);

    expect(described).not.toBeNull();
    const body = html.slice(html.indexOf(`id="${described![1]}"`));
    const inside = body.slice(0, body.indexOf("</div>"));

    expect(inside).toContain("<dl");
    expect(inside).toContain("Removing it takes it off every form");
  });

  it("primes Cancel, and nothing else", () => {
    const primed = buttonTags(renderDialog()).filter((b) => b.includes("autofocus"));

    expect(primed).toHaveLength(1);
    expect(primed[0]).toContain('class="btn btn-secondary"');
  });
});

describe("RemoveFieldDialog's confirming control", () => {
  it("carries the destructive classes and the field label", () => {
    const html = renderDialog();
    const destructive = buttonTags(html).find((b) => b.includes("btn-destructive"));

    expect(destructive).toBeDefined();
    expect(destructive).toContain("btn-secondary");
    expect(destructive).not.toContain("autofocus");
    expect(html).toContain(">Remove field<");
  });

  it("names the group kind on a group removal", () => {
    const html = renderDialog({ reach: reach({ type: "group" }) });

    expect(html).toContain(">Remove group<");
    expect(html).not.toContain(">Remove field<");
  });
});
