import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeList } from "../src/areas/studio/panels/ChangeList.js";
import type { ChangeProperty, ChangeRow } from "../src/areas/studio/draft/changeSet.js";

/**
 * The folded register `panels/ChangeList.tsx` draws (`studio-app`'s
 * change-list requirements, `studio-six-tabs` design D7).
 *
 * A folded `<details>` still carries its content in markup, so a static render
 * reads every row's body. Each negative case also asserts its row drew, so
 * empty markup passes none of them.
 */

function changed(name: string): ChangeProperty {
  return { name, kind: "changed", before: { text: "no", mono: false }, after: { text: "yes", mono: false } };
}

const fieldRow: ChangeRow = {
  key: "fields:field_forwarding",
  group: "fields",
  kind: "changed",
  label: "Forwarding address",
  entityKey: "forwarding_address",
  properties: [changed("Label"), changed("Group")],
  raw: [{ path: "fields[field_forwarding].label.en", kind: "changed", from: "Forward to", to: "Forwarding address" }],
};

const formRow: ChangeRow = {
  key: "forms:step_exit",
  group: "forms",
  kind: "changed",
  label: "Submit the exit notification",
  entityKey: "exit_notification",
  properties: ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"].map(changed),
  raw: [],
};

const processRow: ChangeRow = {
  key: "process:process",
  group: "process",
  kind: "changed",
  label: "Employee exit",
  entityKey: "employee_exit",
  properties: [changed("Initial step")],
  raw: [{ path: "workflow.initialStep", kind: "changed", from: "step_a", to: "step_b" }],
};

const HEADING = "Compared with version 2";
const buttons = (html: string) => html.match(/<button\b/g)?.length ?? 0;

describe("The change list", () => {
  it("stands every row folded when it first appears", () => {
    const html = renderToStaticMarkup(<ChangeList rows={[fieldRow, formRow]} heading={HEADING} />);

    expect(html.match(/<details\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/<details\b[^>]*\sopen/);
  });

  it("names four properties in a folded row, then how many more differ", () => {
    const html = renderToStaticMarkup(<ChangeList rows={[formRow]} heading={HEADING} />);
    const summary = html.match(/<summary\b[^>]*>(.*?)<\/summary>/s)?.[1] ?? "";

    for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) expect(summary).toContain(name);
    expect(summary).not.toContain("Echo");
    expect(summary).not.toContain("Foxtrot");
    expect(summary).toContain("+2 more");
  });

  it("separates a row's label from its key, so the summary's text reads them as two words", () => {
    const html = renderToStaticMarkup(<ChangeList rows={[fieldRow]} heading={HEADING} />);
    const summary = html.match(/<summary\b[^>]*>(.*?)<\/summary>/s)?.[1] ?? "";
    const text = summary.replace(/<[^>]+>/g, "");

    expect(text).toContain("Forwarding address forwarding_address");
  });

  it("offers no open command in any row: the one button is Expand all", () => {
    const rows = [processRow, fieldRow, formRow];
    const html = renderToStaticMarkup(<ChangeList rows={rows} heading={HEADING} />);

    for (const row of rows) expect(html).toContain(row.label);
    expect(html).not.toContain("Open ");
    expect(html).not.toContain(" tab<");
    expect(buttons(html)).toBe(1);
    expect(html).toMatch(/<button\b[^>]*>Expand all<\/button>/);
  });

  it("heads the data source, path and contract groups with the change list's own words", () => {
    const row = (group: ChangeRow["group"], label: string): ChangeRow => ({
      key: `${group}:${label}`,
      group,
      kind: "added",
      label,
      properties: [],
      raw: [],
    });
    const html = renderToStaticMarkup(
      <ChangeList rows={[row("dataSources", "people"), row("paths", "Send"), row("contract", "Contract")]} heading={HEADING} />,
    );
    const headings = [...html.matchAll(/<h3\b[^>]*>(.*?)<span/g)].map((m) => m[1]);

    expect(headings).toEqual(["Where values come from", "Ways out", "What it takes in and gives back"]);
  });

  it("prints a label and a step name holding a `$` pattern as written", () => {
    const priced: ChangeRow = { ...fieldRow, label: "Price in $'s" };
    const sent: ChangeRow = {
      key: "paths:path_send",
      group: "paths",
      kind: "changed",
      label: "Send",
      context: "Step $&",
      properties: [changed("Target")],
      raw: [],
    };
    const html = renderToStaticMarkup(<ChangeList rows={[priced, sent]} heading={HEADING} />);

    expect(html).toContain("Price in $&#x27;s");
    expect(html).toContain("From Step $&amp;");
  });

  it("gives the Expand all command aria-expanded false and aria-controls naming the list, while folded", () => {
    const html = renderToStaticMarkup(<ChangeList rows={[fieldRow, processRow]} heading={HEADING} />);
    const command = html.match(/<button\b[^>]*>Expand all<\/button>/)?.[0] ?? "";
    const controls = command.match(/aria-controls="([^"]+)"/)?.[1];

    expect(command).toContain('aria-expanded="false"');
    expect(controls).toBeDefined();
    expect(html).toContain(`id="${controls}"`);
  });

  it("renders its heading as an h2 when a caller passes one", () => {
    const html = renderToStaticMarkup(<ChangeList rows={[fieldRow]} heading={HEADING} />);

    expect(html).toContain(`<h2`);
    expect(html).toContain(HEADING);
  });

  it("renders no h2 when the caller passes no heading, as the publish dialog does", () => {
    const html = renderToStaticMarkup(<ChangeList rows={[fieldRow]} />);

    // The row drew, so empty markup cannot pass.
    expect(html).toContain("Forwarding");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain(HEADING);
  });
});
