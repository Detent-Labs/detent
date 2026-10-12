import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KindSwitchDialog } from "../src/areas/studio/panels/KindSwitchDialog.js";
import type { PerformedBy, PerformedByReach } from "../src/areas/studio/draft/performedBy.js";

/**
 * Static-markup coverage for `KindSwitchDialog.tsx` (fix-subprocess-step-editor,
 * "A kind switch confirms before it removes keys"). The web package has no DOM
 * harness, so the dialog renders unconditionally, as `RemoveFieldDialog`'s test
 * does.
 */

function renderDialog(kind: PerformedBy, reach: PerformedByReach): string {
  return renderToStaticMarkup(
    <KindSwitchDialog kind={kind} reach={reach} triggerRef={{ current: null }} onCancel={() => {}} onConfirm={() => {}} />,
  );
}

/** The `<dt>`/`<dd>` pairs in DOM order, as [term, value]. */
function factRows(html: string): [string, string][] {
  return [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1]!, m[2]!]);
}

function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("KindSwitchDialog's heading", () => {
  it("names the target kind in curly quotes", () => {
    expect(renderDialog("terminal", { paths: 1 })).toContain("Switch to “An end”?");
    expect(renderDialog("participant", { subprocess: 1 })).toContain("Switch to “A step someone works”?");
  });
});

describe("KindSwitchDialog's fact rows", () => {
  it("prints one row per non-zero count, with its number", () => {
    const html = renderDialog("terminal", { subprocess: 1, paths: 3, timers: 1, onExit: 1, onCancel: 2, cancellable: 1 });
    expect(factRows(html)).toEqual([
      ["Subprocess call", "1"],
      ["Outgoing paths", "3"],
      ["Time limits", "1"],
      ["Exit actions", "1"],
      ["Cancel actions", "2"],
      ["Cancellable setting", "1"],
    ]);
  });

  it("prints the outcome row", () => {
    expect(factRows(renderDialog("participant", { outcome: 1 }))).toEqual([["Outcome", "1"]]);
  });

  it("prints no row for a zero or absent count", () => {
    const html = renderDialog("terminal", { paths: 3, timers: 0 });
    expect(factRows(html)).toEqual([["Outgoing paths", "3"]]);
    expect(html).not.toContain("Time limits");
    expect(html).not.toContain("Exit actions");
  });
});

describe("KindSwitchDialog's notes and controls", () => {
  it("states that the studio has no undo", () => {
    expect(renderDialog("terminal", { paths: 1 })).toContain("The studio has no undo.");
  });

  it("holds the initial focus on Cancel, never on the confirming control", () => {
    const tags = buttonTags(renderDialog("terminal", { paths: 1 }));
    expect(tags).toHaveLength(2);
    expect(tags.filter((tag) => tag.includes("autofocus"))).toHaveLength(1);
    expect(tags[0]).not.toContain("autofocus");
    expect(tags[1]).toContain("autofocus");
  });

  it("labels the confirming control and keeps it outlined", () => {
    const html = renderDialog("terminal", { paths: 1 });
    expect(html).toContain("Switch and remove");
    expect(buttonTags(html)[0]).toContain("btn-secondary btn-destructive");
  });

  it("names the dialog by its heading and describes it by the facts and the note", () => {
    const html = renderDialog("terminal", { paths: 1 });
    expect(html).toContain('aria-labelledby="kind-switch-confirm-heading"');
    expect(html).toContain('id="kind-switch-confirm-heading"');
    expect(html).toContain('aria-describedby="kind-switch-confirm-facts kind-switch-confirm-notes"');
  });
});
