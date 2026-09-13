import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FieldId } from "workflow-engine/schema";
import { RemoveFieldDialog } from "../src/areas/studio/panels/RemoveFieldDialog.js";
import type { FieldRemovalReach } from "../src/areas/studio/draft/field-removal.js";

/**
 * Static-markup coverage for `RemoveFieldDialog.tsx` (design.md, "Shape
 * brief"; studio-app's "Removing a field that reaches past the field
 * catalog confirms first" and "The removal dialog counts each kind of
 * reach"). The web package has no DOM harness, so this renders the dialog
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
  };
}

function renderDialog(over: { label?: string; reach?: FieldRemovalReach } = {}): string {
  return renderToStaticMarkup(
    <RemoveFieldDialog
      label={over.label ?? "Booking status"}
      reach={over.reach ?? reach({})}
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
  it("names the field and its key in a mono element", () => {
    const html = renderDialog({ label: "Booking status", reach: reach({ key: "booking_status" }) });

    expect(html).toContain("Booking status");
    expect(html).toMatch(/<code[^>]*>booking_status<\/code>/);
  });

  it("omits the key element for a field with an empty key, and states the label alone", () => {
    const html = renderDialog({ label: "Booking status", reach: reach({ key: "" }) });

    expect(html).not.toMatch(/<code[^>]*>/);
    expect(html).toMatch(/<dd[^>]*>Booking status<\/dd>/);
  });

  it("states a row only for a count above zero, one per kind", () => {
    const html = renderDialog({ reach: reach({ steps: 2, writers: 1, contractEntries: 1, celReads: 2 }) });

    expect(html).toContain("Steps showing it");
    expect(html).toContain("Actions and mappings writing it");
    expect(html).toContain("Contract entries");
    expect(html).toContain("CEL expressions reading it");
    expect(html).not.toContain("Fields inside it");
    expect(html).not.toContain("Column mappings targeting it");
    expect(html).not.toContain("Plugin settings naming it");
  });

  it("states each row's own bare count", () => {
    const html = renderDialog({ reach: reach({ steps: 2, contractEntries: 1 }) });

    expect(html).toContain(">2<");
    expect(html).toContain(">1<");
  });

  it("states the fields-inside and steps counts for a group", () => {
    const html = renderDialog({ reach: reach({ type: "group", fieldsInside: 18, steps: 10 }) });

    expect(html).toContain("Fields inside it");
    expect(html).toContain(">18<");
    expect(html).toContain("Steps showing it");
    expect(html).toContain(">10<");
  });
});

describe("RemoveFieldDialog's notes", () => {
  it("always states that the removal clears every reference", () => {
    expect(renderDialog()).toContain("Removing it also clears every step entry and reference that names it.");
  });

  it("adds the group note only for a group", () => {
    expect(renderDialog({ reach: reach({ type: "group" }) })).toContain("Every field inside the group leaves with it.");
    expect(renderDialog()).not.toContain("Every field inside the group leaves with it.");
  });

  it("adds both CEL/settings notes when celReads is above zero", () => {
    const html = renderDialog({ reach: reach({ celReads: 1 }) });

    expect(html).toContain("CEL expressions and plugin settings keep their text.");
    expect(html).toContain("Check each one before you publish.");
  });

  it("adds both CEL/settings notes when pluginSettings is above zero", () => {
    const html = renderDialog({ reach: reach({ pluginSettings: 1 }) });

    expect(html).toContain("CEL expressions and plugin settings keep their text.");
    expect(html).toContain("Check each one before you publish.");
  });

  it("omits the CEL/settings notes when both counts are zero", () => {
    const html = renderDialog();

    expect(html).not.toContain("CEL expressions and plugin settings keep their text.");
    expect(html).not.toContain("Check each one before you publish.");
  });
});

describe("RemoveFieldDialog's accessible name and focus", () => {
  it("points aria-labelledby at the heading's own id", () => {
    const html = renderDialog();
    const described = /aria-labelledby="([^"]+)"/.exec(html);

    expect(described).not.toBeNull();
    expect(html).toContain(`<h2 id="${described![1]}"`);
  });

  it("points aria-describedby at the facts list and the notes", () => {
    const html = renderDialog();
    const described = /aria-describedby="([^"]+)"/.exec(html);

    expect(described).not.toBeNull();
    const [factsId, notesId] = described![1].split(" ");

    expect(html).toContain(`<dl id="${factsId}"`);
    expect(html).toContain(`<div id="${notesId}"`);
  });

  it("primes Cancel, and nothing else", () => {
    const primed = buttonTags(renderDialog()).filter((b) => b.includes("autofocus"));

    expect(primed).toHaveLength(1);
    expect(primed[0]).toContain("btn-ghost");
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
