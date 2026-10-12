import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RemoveDataSourceDialog } from "../src/areas/studio/panels/RemoveDataSourceDialog.js";
import type { DataSourceRemovalReach } from "../src/areas/studio/draft/data-source-removal.js";

/**
 * Static-markup coverage for `RemoveDataSourceDialog.tsx` (studio-app:
 * "Removing a data source that fields use confirms first" and "The data source
 * removal dialog counts what it clears"). The web package has no DOM harness,
 * so this renders the dialog unconditionally.
 */

function renderDialog(over: { label?: string; reach?: Partial<DataSourceRemovalReach> } = {}): string {
  return renderToStaticMarkup(
    <RemoveDataSourceDialog
      label={over.label ?? "countries"}
      reach={{ fields: 3, columnMappings: 0, ...over.reach }}
      triggerRef={{ current: null }}
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );
}

const buttonTags = (html: string): string[] => html.match(/<button[^>]*>/g) ?? [];

describe("RemoveDataSourceDialog's heading", () => {
  it("names the source by its key, in curly quotes", () => {
    expect(renderDialog({ label: "countries" })).toContain("Remove the data source “countries”?");
  });

  it("names an unnamed source by the rail's fallback word", () => {
    expect(renderDialog({ label: "(unnamed data source)" })).toContain("Remove the data source “(unnamed data source)”?");
  });

  // A string replacement would expand `$&` into the matched `{source}`.
  it("keeps a key holding a $ pattern as the author typed it", () => {
    const html = renderDialog({ label: "cost$&" });

    expect(html).toContain("Remove the data source “cost$&amp;”?");
    expect(html).not.toContain("{source}");
  });
});

describe("RemoveDataSourceDialog's facts", () => {
  it("states the field count and the column mapping count", () => {
    const html = renderDialog({ reach: { fields: 3, columnMappings: 1 } });

    expect(html).toContain("Fields using it");
    expect(html).toContain(">3<");
    expect(html).toContain("Column mappings on them");
    expect(html).toContain(">1<");
  });

  it("prints no column mapping row for a count of zero", () => {
    const html = renderDialog({ reach: { fields: 2, columnMappings: 0 } });

    expect(html).toContain("Fields using it");
    expect(html).toContain(">2<");
    expect(html).not.toContain("Column mappings on them");
  });

  it("prints no field row for a count of zero", () => {
    expect(renderDialog({ reach: { fields: 0, columnMappings: 0 } })).not.toContain("Fields using it");
  });

  it("names no field", () => {
    expect(renderDialog()).not.toMatch(/<code/);
  });
});

describe("RemoveDataSourceDialog's notes", () => {
  it("states what the removal clears and that the studio has no undo", () => {
    const html = renderDialog();

    expect(html).toContain("Removing it also clears the data source and the column mappings from those fields.");
    expect(html).toContain("The studio has no undo.");
  });
});

describe("RemoveDataSourceDialog's accessible name and focus", () => {
  it("points aria-labelledby at the heading's own id", () => {
    const html = renderDialog();
    const labelled = /aria-labelledby="([^"]+)"/.exec(html);

    expect(labelled).not.toBeNull();
    expect(html).toContain(`<h2 id="${labelled![1]}"`);
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

describe("RemoveDataSourceDialog's confirming control", () => {
  it("carries the destructive classes and the Remove data source label", () => {
    const html = renderDialog();
    const destructive = buttonTags(html).find((b) => b.includes("btn-destructive"));

    expect(destructive).toBeDefined();
    expect(destructive).toContain("btn-secondary");
    expect(destructive).not.toContain("autofocus");
    expect(html).toContain(">Remove data source<");
  });
});
