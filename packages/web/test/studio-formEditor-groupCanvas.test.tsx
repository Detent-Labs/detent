import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FormEditorScreen } from "../src/areas/studio/screens/FormEditorScreen.js";

/**
 * The canvas's group rendering (`studio-form-editor`, task group 6): the
 * fieldset/legend/nested-`<ol>` shape, member order under array
 * interleaving, and the move-boundary/remove-count controls the legend
 * carries. Fix round 1 flagged that this group added no test of its own —
 * the array-outcome half already lives in `studio-view-tree.test.ts`
 * (group 4), and these four are exactly the delta-spec outcomes a plain
 * initial render can observe with no drag and no DOM interaction, the same
 * `renderToStaticMarkup` technique `studio-formEditor-strip.test.tsx` and
 * `studio-formsTab.test.tsx` already use. `FormEditorScreen` reads `draft`,
 * `mutate` and `contentLocale` off `useDraft()`, so this supplies
 * `DraftContext.Provider` directly, the way `studio-formsTab.test.tsx`
 * already does.
 */

const ALPHA = "field_00000000-0000-4000-8000-0000000000b1";
const BILLING = "field_00000000-0000-4000-8000-0000000000b2";
const BETA = "field_00000000-0000-4000-8000-0000000000b3";
const GAMMA = "field_00000000-0000-4000-8000-0000000000b4";
const DELTA = "field_00000000-0000-4000-8000-0000000000b5";

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

// Two roots (`alpha`, `gamma`) interleave the group's own card and its two
// members in the raw array, so `gamma` sits physically between `beta` and
// `delta` -- proving the fieldset draws the two members adjacent, in their
// own order, regardless of the array gap between them.
const DRAFT = {
  baseLocale: "en",
  fields: [
    { id: ALPHA, key: "alpha", type: "string", label: { en: "Alpha" } },
    { id: BILLING, key: "billing", type: "group", label: { en: "Billing" } },
    { id: BETA, key: "beta", type: "string", label: { en: "Beta" } },
    { id: GAMMA, key: "gamma", type: "string", label: { en: "Gamma" } },
    { id: DELTA, key: "delta", type: "string", label: { en: "Delta" } },
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
          fields: [{ ref: ALPHA }, { ref: BILLING }, { ref: BETA, group: "billing" }, { ref: GAMMA }, { ref: DELTA, group: "billing" }],
        },
        paths: [{ id: "path_1", to: "step_b", trigger: "automatic", priority: 1 }],
      },
      { id: "step_b", key: "review", label: { en: "Review" }, type: "task", terminal: true },
    ],
  },
} as unknown as Draft;

function render(): string {
  const draft = DRAFT;
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(draft)}>
      <FormEditorScreen step={draft.workflow!.steps![0]!} index={0} fields={draft.fields!} onBack={() => {}} />
    </DraftContext.Provider>,
  );
}

/** The group's own fieldset, start to end. Exactly one exists in this
 * fixture, so a plain first-open/first-close slice bounds it correctly. */
function fieldsetBlock(html: string): string {
  const start = html.indexOf("<fieldset");
  const end = html.indexOf("</fieldset>");
  return html.slice(start, end + "</fieldset>".length);
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
  it("draws both members inside the fieldset, and draws neither root inside it", () => {
    const fieldset = fieldsetBlock(render());
    expect(fieldset).toContain(">beta<");
    expect(fieldset).toContain(">delta<");
    expect(fieldset).not.toContain(">alpha<");
    expect(fieldset).not.toContain(">gamma<");
  });

  it("draws the members in the order the preview renders them, despite an unrelated root sitting between them in the array", () => {
    const fieldset = fieldsetBlock(render());
    expect(fieldset.indexOf(">beta<")).toBeLessThan(fieldset.indexOf(">delta<"));
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
  it("names its member count in its label", () => {
    const fieldset = fieldsetBlock(render());
    expect(fieldset).toContain("Remove (2)");
  });
});
