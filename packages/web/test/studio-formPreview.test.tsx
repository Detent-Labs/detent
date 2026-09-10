import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { FormPreview } from "../src/areas/studio/panels/FormPreview.js";

/**
 * The form editor's trailing pane (`studio-form-editor`: "A live participant
 * preview stands beside the form canvas").
 *
 * `development-toolchain`'s split rule sends these to assertions: the order,
 * the column count, the path controls, the required mark and the `inert`
 * attribute are all properties of the rendered string. What stays manual is
 * the browser check that a change in the canvas repaints the pane, which the
 * shared `step` prop already guarantees at the React level.
 *
 * `FormPreview` takes every input as a prop, so it needs no draft context.
 */

const AMOUNT = "field_00000000-0000-4000-8000-0000000000a1";
const PURPOSE = "field_00000000-0000-4000-8000-0000000000a2";

const FIELDS: DraftField[] = [
  { id: AMOUNT, key: "amount", type: "number", label: { en: "Amount" } },
  { id: PURPOSE, key: "purpose", type: "string", label: { en: "Purpose" } },
] as unknown as DraftField[];

/** One step, with whatever the case overrides. `over` is untyped on purpose:
 * every id in the contract is branded, and a fixture states plain strings. */
function step(over: Record<string, unknown> = {}): DraftOf<Step> {
  return {
    id: "step_a",
    key: "intake",
    label: { en: "Intake" },
    type: "task",
    view: { fields: [{ ref: AMOUNT, required: true }, { ref: PURPOSE }] },
    ...over,
  } as unknown as DraftOf<Step>;
}

function render(s: DraftOf<Step> = step(), activeTab?: string): string {
  return renderToStaticMarkup(
    <FormPreview
      step={s}
      fields={FIELDS}
      processLabel="Expense approval"
      contentLocale="en"
      baseLocale="en"
      activeTab={activeTab}
      onTabChange={() => {}}
    />,
  );
}

/** The same step with a two-tab view, its two fields one per tab. */
const TABBED = step({
  view: {
    tabs: [
      { key: "tab_1", label: { en: "Details" } },
      { key: "tab_2", label: { en: "Approval" } },
    ],
    fields: [
      { ref: AMOUNT, required: true, tab: "tab_1" },
      { ref: PURPOSE, tab: "tab_2" },
    ],
  },
});

describe("The participant preview", () => {
  it("names the process and the step above the fields", () => {
    const html = render();

    expect(html).toContain("Expense approval");
    expect(html.indexOf("Intake")).toBeLessThan(html.indexOf("Amount"));
  });

  it("prints the fields in the view's own order", () => {
    expect(render().indexOf("Amount")).toBeLessThan(render().indexOf("Purpose"));
  });

  it("prints them in the new order once the view moves one above the other", () => {
    const moved = render(step({ view: { fields: [{ ref: PURPOSE }, { ref: AMOUNT, required: true }] } }));

    expect(moved.indexOf("Purpose")).toBeLessThan(moved.indexOf("Amount"));
  });

  it("marks a required entry", () => {
    // `FieldForm`'s own required marker, the one a participant meets — the
    // preview declares no mark of its own.
    expect(render()).toContain('title="required"');
    expect(render()).toContain('aria-required="true"');
  });

  it("takes no keyboard focus and no pointer interaction", () => {
    // `inert` on the container carries both, and takes the whole subtree out
    // of the accessibility tree with them, so a screen reader passes over it.
    expect(render()).toMatch(/<div [^>]*inert=""/);
  });
});

describe("The preview's column count", () => {
  it("lays one column where the view declares one", () => {
    expect(render()).toContain('data-columns="1"');
  });

  it("lays two columns where the view declares two", () => {
    const two = render(step({ view: { fields: [{ ref: AMOUNT }, { ref: PURPOSE }], columns: 2 } }));

    expect(two).toContain('data-columns="2"');
  });
});

describe("The preview's own controls", () => {
  it("carries one control per manual path, taking each path's own label", () => {
    const two = render(
      step({
        paths: [
          { id: "path_1", key: "approve", label: "Approve", to: "step_b", trigger: "manual" },
          { id: "path_2", key: "reject", label: "Reject", to: "step_c", trigger: "manual" },
        ],
      }),
    );

    expect(two).toContain("Approve");
    expect(two).toContain("Reject");
  });

  it("carries one submit control where the step declares only automatic paths", () => {
    const automatic = render(
      step({ paths: [{ id: "path_1", key: "onward", label: "Onward", to: "step_b", trigger: "automatic" }] }),
    );

    expect(automatic).toContain("Submit");
    expect(automatic).not.toContain("Onward");
  });

  it("carries one submit control where the step declares no path at all", () => {
    expect(render(step({ paths: [] }))).toContain("Submit");
  });
});

describe("The preview's tab strip", () => {
  it("draws the draft's tabs, with their authored labels", () => {
    const html = render(TABBED);

    expect(html).toContain('role="tablist"');
    expect(html).toContain("Details");
    expect(html).toContain("Approval");
  });

  it("opens the tab the canvas is showing, and draws that tab's entries alone", () => {
    const second = render(TABBED, "tab_2");

    expect(second).toContain("Purpose");
    // The closed tab's entries are absent from the DOM, not hidden.
    expect(second).not.toContain("Amount");
  });

  it("opens the first tab where the canvas shows none yet", () => {
    const first = render(TABBED);

    expect(first).toContain("Amount");
    expect(first).not.toContain("Purpose");
  });

  it("draws no strip for an untabbed form", () => {
    expect(render()).not.toContain('role="tablist"');
  });

  it("draws that strip inside the inert container, so a tab there takes no click", () => {
    // `studio-form-editor`: "The strip the preview draws SHALL NOT be
    // interactive … `onTabChange` stays wired and stays silent while `inert`
    // holds". The canvas carries the strip that answers a click.
    //
    // The click itself is a browser fact, and `inert` suppressing interaction
    // on its subtree is a platform guarantee. What this repo owns is the one
    // precondition under both: the strip is a DESCENDANT of an `inert`
    // element. It is load-bearing — `onTabChange={setActiveTab}` means a
    // strip that escaped that subtree really would move the canvas.
    const html = render(TABBED);

    // React emitted the attribute at all.
    expect(html.indexOf('inert=""')).toBeGreaterThan(-1);
    expect(tablistsInsideInert(html)).toBe(1);
  });

  it("counts no strip for one sitting BESIDE the inert container", () => {
    // The arrangement the guard above exists to reject, and the reason it
    // reads the tree rather than the string: in serialized markup a later
    // string is a descendant OR a following sibling, and both of these put
    // `role="tablist"` after `inert=""`.
    expect(tablistsInsideInert('<div inert=""><div>m</div><div role="tablist"></div></div>')).toBe(1);
    expect(tablistsInsideInert('<div inert=""><div>m</div></div><div role="tablist"></div>')).toBe(0);
  });
});

/** How many tab strips sit inside an `inert` element. A descendant selector,
 * which is the relation the scenario turns on; `HTMLRewriter` ships with Bun,
 * so proving it costs no dependency and no DOM library. */
function tablistsInsideInert(html: string): number {
  let count = 0;
  new HTMLRewriter()
    .on("[inert] [role=tablist]", {
      element() {
        count++;
      },
    })
    .transform(html);
  return count;
}
