import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { draftFields } from "../src/areas/studio/draft/fields.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FormEditorScreen } from "../src/areas/studio/screens/FormEditorScreen.js";

/**
 * The canvas's group rendering (`studio-form-editor`): the
 * fieldset/legend/nested-`<ol>` shape, member order under array
 * interleaving, a group nested inside another group, and the
 * move-boundary/remove-count controls the legend carries. The array
 * outcomes live in `studio-view-tree.test.ts`; these tests cover what a
 * plain initial render can observe with no drag and no DOM interaction, the
 * same `renderToStaticMarkup` technique `studio-formEditor-strip.test.tsx`
 * and `studio-formsTab.test.tsx` already use. `FormEditorScreen` reads
 * `draft`, `mutate` and `contentLocale` off `useDraft()`, so this supplies
 * `DraftContext.Provider` directly, the way `studio-formsTab.test.tsx`
 * already does.
 */

const ALPHA = "field_00000000-0000-4000-8000-0000000000b1";
const BILLING = "field_00000000-0000-4000-8000-0000000000b2";
const BETA = "field_00000000-0000-4000-8000-0000000000b3";
const GAMMA = "field_00000000-0000-4000-8000-0000000000b4";
const DELTA = "field_00000000-0000-4000-8000-0000000000b5";
const ADDRESS = "field_00000000-0000-4000-8000-0000000000b6";
const STREET = "field_00000000-0000-4000-8000-0000000000b7";
const CITY = "field_00000000-0000-4000-8000-0000000000b8";

function validation(): ValidationResult {
  return {
    zodValid: true,
    issues: [],
    dimensions: {
      zod: "ran",
      duration: "ran",
      structural: "ran",
      actionType: "ran",
      assignmentType: "ran",
      dataSourceType: "ran",
      registryConfig: "not-run",
      cel: "ran",
    },
    subprocessStepStatus: {},
    chainingSiteStatus: {},
  };
}

function contextValue(draft: Draft): DraftContextValue {
  return {
    draft,
    mutate: () => {},
    replace: () => {},
    validation: validation(),
    loadedChildren: {},
    setChildForStep: () => {},
    registry: undefined,
    loadedChainingTargets: {},
    contentLocale: "en",
    setContentLocale: () => {},
    usedLocales: ["en"],
    loadGeneration: 0,
  };
}

// The catalog nests `beta`, the `address` group and `delta` under `billing`,
// and `street` and `city` under `address`, so every view entry below names
// its own catalog parent. Two roots (`alpha`, `gamma`) interleave the array:
// `gamma` sits between `address`'s subtree and `delta`, proving the fieldset
// draws billing's members adjacent, in their own order, regardless of the
// array gap between them.
const DRAFT = {
  baseLocale: "en",
  fields: [
    { id: ALPHA, key: "alpha", type: "string", label: { en: "Alpha" } },
    {
      id: BILLING,
      key: "billing",
      type: "group",
      label: { en: "Billing" },
      fields: [
        { id: BETA, key: "beta", type: "string", label: { en: "Beta" } },
        {
          id: ADDRESS,
          key: "address",
          type: "group",
          label: { en: "Address" },
          fields: [
            { id: STREET, key: "street", type: "string", label: { en: "Street" } },
            { id: CITY, key: "city", type: "string", label: { en: "City" } },
          ],
        },
        { id: DELTA, key: "delta", type: "string", label: { en: "Delta" } },
      ],
    },
    { id: GAMMA, key: "gamma", type: "string", label: { en: "Gamma" } },
  ],
  workflow: {
    initialStep: "step_a",
    steps: [
      {
        id: "step_a",
        key: "intake",
        label: { en: "Intake" },
        type: "task",
        view: {
          fields: [
            { ref: ALPHA },
            { ref: BILLING },
            { ref: BETA, group: "billing" },
            { ref: ADDRESS, group: "billing" },
            { ref: STREET, group: "address" },
            { ref: CITY, group: "address" },
            { ref: GAMMA },
            { ref: DELTA, group: "billing" },
          ],
        },
        paths: [{ id: "path_1", to: "step_b", trigger: "automatic", priority: 1 }],
      },
      { id: "step_b", key: "review", label: { en: "Review" }, type: "task", terminal: true },
    ],
  },
} as unknown as Draft;

/** The same catalog and entries on a tabbed form: `alpha` and the `billing`
 * group on `review`, `gamma` on `decision`, and every member with no tab of
 * its own. `order` sets which tab the strip lists first, which is the one a
 * fresh render shows. */
function tabbedDraft(order: ["review", "decision"] | ["decision", "review"]): Draft {
  const draft = structuredClone(DRAFT) as unknown as { workflow: { steps: { view: { tabs?: unknown; fields: Record<string, unknown>[] } }[] } };
  const view = draft.workflow.steps[0]!.view;
  view.tabs = order.map((key) => ({ key, label: { en: key === "review" ? "Review" : "Decision" } }));
  view.fields = view.fields.map((entry) => (entry.group ? entry : { ...entry, tab: entry.ref === GAMMA ? "decision" : "review" }));
  return draft as unknown as Draft;
}

/** Renders the screen with the field list `EditScreen.tsx` hands it: the
 * whole catalog, flattened through `draftFields`. */
function render(draft: Draft = DRAFT): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(draft)}>
      <FormEditorScreen step={draft.workflow!.steps![0]!} index={0} fields={draftFields(draft)} onBack={() => {}} />
    </DraftContext.Provider>,
  );
}

/** The canvas region alone, bounded by its own `aria-label` and the trailing
 * preview pane's. `form-ui`'s `FieldForm` (`FieldForm.tsx:318-338`) draws
 * its OWN `<fieldset>` for each group inside the mounted `FormPreview`, so a
 * search unscoped to the canvas could find the preview's copy. */
function canvasHtml(html: string): string {
  const start = html.indexOf('aria-label="Form layout"');
  const end = html.indexOf('aria-label="What a participant meets"');
  expect(start, "expected to find the canvas region").toBeGreaterThan(-1);
  expect(end, "expected to find the preview pane, to bound the canvas region").toBeGreaterThan(-1);
  return html.slice(start, end);
}

/** The preview pane alone, from its own `aria-label` to the end. */
function previewHtml(html: string): string {
  const start = html.indexOf('aria-label="What a participant meets"');
  expect(start, "expected to find the preview pane").toBeGreaterThan(-1);
  return html.slice(start);
}

/** The whole `<fieldset>` whose legend shows `legendText`, start to its own
 * matching close. Fieldsets nest here, so the close is found by depth rather
 * than by the first `</fieldset>` after the start. */
function fieldsetBlock(region: string, legendText: string): string {
  const labelIndex = region.indexOf(`>${legendText}<`);
  expect(labelIndex, `expected to find a fieldset legend reading "${legendText}"`).toBeGreaterThan(-1);
  const start = region.lastIndexOf("<fieldset", labelIndex);
  let depth = 0;
  let cursor = start;
  for (;;) {
    const open = region.indexOf("<fieldset", cursor + 1);
    const close = region.indexOf("</fieldset>", cursor + 1);
    expect(close, "expected a closing </fieldset>").toBeGreaterThan(-1);
    if (open !== -1 && open < close) {
      depth++;
      cursor = open;
      continue;
    }
    if (depth === 0) return region.slice(start, close + "</fieldset>".length);
    depth--;
    cursor = close;
  }
}

/** A fieldset's own `<legend>...</legend>`: the first legend in its block. */
function legendBlock(fieldset: string): string {
  const start = fieldset.indexOf("<legend");
  const end = fieldset.indexOf("</legend>");
  return fieldset.slice(start, end + "</legend>".length);
}

/** One leaf card's own `<li>...</li>`, found by its visible label. A leaf
 * card nests no `<li>` of its own, so the nearest enclosing pair bounds it
 * exactly, wherever it sits (root or member). */
function cardBlock(html: string, label: string): string {
  const labelIndex = html.indexOf(`>${label}<`);
  expect(labelIndex, `expected to find a card labelled "${label}"`).toBeGreaterThan(-1);
  const liStart = html.lastIndexOf("<li", labelIndex);
  const liEnd = html.indexOf("</li>", labelIndex) + "</li>".length;
  return html.slice(liStart, liEnd);
}

/** Whether the button showing `label` inside `block` carries the `disabled`
 * attribute -- read off that button's own opening tag, not the whole block,
 * since a card carries several buttons. */
function isButtonDisabled(block: string, label: string): boolean {
  const labelIndex = block.indexOf(`>${label}<`);
  expect(labelIndex, `expected to find a "${label}" button`).toBeGreaterThan(-1);
  const tagStart = block.lastIndexOf("<button", labelIndex);
  const tagEnd = block.indexOf(">", tagStart);
  return block.slice(tagStart, tagEnd).includes("disabled");
}

describe("The canvas draws a group's members inside its own card", () => {
  it("draws every member inside the fieldset, and draws neither root inside it", () => {
    const billing = fieldsetBlock(canvasHtml(render()), "billing");
    for (const member of [">beta<", ">address<", ">street<", ">city<", ">delta<"]) expect(billing).toContain(member);
    expect(billing).not.toContain(">alpha<");
    expect(billing).not.toContain(">gamma<");
  });

  it("draws a nested group's own members inside its own fieldset, within the outer one", () => {
    const address = fieldsetBlock(canvasHtml(render()), "address");
    expect(address).toContain(">street<");
    expect(address).toContain(">city<");
    expect(address).not.toContain(">beta<");
    expect(address).not.toContain(">delta<");
  });

  it("draws the members in the order the preview renders them, despite an unrelated root sitting between them in the array", () => {
    const html = render();
    const canvas = fieldsetBlock(canvasHtml(html), "billing");
    const canvasOrder = [">beta<", ">address<", ">street<", ">city<", ">delta<"].map((s) => canvas.indexOf(s));
    expect(canvasOrder).toEqual([...canvasOrder].sort((a, b) => a - b));

    const preview = fieldsetBlock(previewHtml(html), "Billing");
    const previewOrder = ["Beta", "Address", "Street", "City", "Delta"].map((s) => preview.indexOf(s));
    expect(previewOrder.every((i) => i > -1)).toBe(true);
    expect(previewOrder).toEqual([...previewOrder].sort((a, b) => a - b));
    expect(preview).not.toContain("Alpha");
    expect(preview).not.toContain("Gamma");
  });
});

describe("A member's move command stops at its own group's boundary", () => {
  it("disables move-up on the group's first member, and leaves its move-down enabled", () => {
    const html = render();
    const beta = cardBlock(html, "beta");
    expect(isButtonDisabled(beta, "Move up")).toBe(true);
    expect(isButtonDisabled(beta, "Move down")).toBe(false);
  });

  it("disables move-down on the group's last member, and leaves its move-up enabled", () => {
    const html = render();
    const delta = cardBlock(html, "delta");
    expect(isButtonDisabled(delta, "Move down")).toBe(true);
    expect(isButtonDisabled(delta, "Move up")).toBe(false);
  });
});

describe("The group's own remove control", () => {
  it("names how many entries the click takes, a nested group's own members included", () => {
    const canvas = canvasHtml(render());
    expect(legendBlock(fieldsetBlock(canvas, "billing"))).toContain("Remove (5)");
    expect(legendBlock(fieldsetBlock(canvas, "address"))).toContain("Remove (2)");
  });
});

describe("On a tabbed form, the canvas draws the shown tab's roots, each group card nesting its members", () => {
  it("draws the group card with every member on the group's own tab, and no root from another tab", () => {
    const canvas = canvasHtml(render(tabbedDraft(["review", "decision"])));
    const billing = fieldsetBlock(canvas, "billing");
    for (const member of [">beta<", ">address<", ">street<", ">city<", ">delta<"]) expect(billing).toContain(member);
    expect(fieldsetBlock(canvas, "address")).toContain(">street<");
    expect(canvas).toContain(">alpha<");
    expect(canvas).not.toContain(">gamma<");
  });

  it("draws neither the group card nor any member on a tab the group is not on", () => {
    const canvas = canvasHtml(render(tabbedDraft(["decision", "review"])));
    expect(canvas).toContain(">gamma<");
    for (const hidden of [">alpha<", ">billing<", ">beta<", ">address<", ">street<", ">city<", ">delta<"]) expect(canvas).not.toContain(hidden);
  });

  it("bounds a root's move commands by the roots its own tab draws", () => {
    const review = canvasHtml(render(tabbedDraft(["review", "decision"])));
    expect(isButtonDisabled(cardBlock(review, "alpha"), "Move up")).toBe(true);
    const billing = legendBlock(fieldsetBlock(review, "billing"));
    expect(isButtonDisabled(billing, "Move up")).toBe(false);
    expect(isButtonDisabled(billing, "Move down")).toBe(true);

    const gamma = cardBlock(canvasHtml(render(tabbedDraft(["decision", "review"]))), "gamma");
    expect(isButtonDisabled(gamma, "Move up")).toBe(true);
    expect(isButtonDisabled(gamma, "Move down")).toBe(true);
  });
});
