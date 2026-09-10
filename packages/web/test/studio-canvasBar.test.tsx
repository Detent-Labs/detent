import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasBar } from "../src/areas/studio/canvas/CanvasBar.js";
import { t } from "../src/areas/studio/catalog.js";
import { newStepNote, newStepPhrase } from "../src/areas/studio/draft/guided-labels.js";
import type { StepKind } from "../src/areas/studio/draft/createStep.js";
import type { StepGroup } from "../src/areas/studio/canvas/groups.js";

/**
 * The bar follows the same split `studio-processTabRow.test.tsx` states in
 * its own header: these tests render through `renderToStaticMarkup` and mount
 * no DOM, so none of them can move focus, fire a key, run an effect, or
 * measure a height.
 *
 * `development-toolchain`'s split rule decides what lands here. The four
 * selection states rendering one bar element with one class is a property of
 * the rendered string; that the bar's height never actually changes across
 * them needs a real browser. The popover's wiring — `aria-expanded`,
 * `aria-haspopup`, `popovertarget`, the panel's `popover` and `role="menu"`,
 * and one `role="menuitem"` per entry — is a property of the rendered string
 * too. That Escape dismisses the open menu and returns focus to the caret
 * trigger needs a real browser. Both land in `docs/browser-checks.md`.
 */
const MENU_KINDS: readonly StepKind[] = ["task", "subprocess", "end"];

function render(
  over: {
    selectedStepIds?: string[];
    unconnected?: boolean;
    groups?: StepGroup[];
  } = {},
): string {
  return renderToStaticMarkup(
    <CanvasBar
      onAddStep={() => {}}
      onDrop={() => {}}
      onDragMove={() => {}}
      selectedStepIds={over.selectedStepIds ?? []}
      unconnected={over.unconnected ?? false}
      onDeleteSelection={() => {}}
      groups={over.groups ?? []}
      onGroupsChange={() => {}}
    />,
  );
}

/** The bar's own root `<div ...>` opening tag, whole. `CanvasBar` returns
 * nothing above it, so it is the rendered string's first element. */
function barTag(html: string): string {
  const found = /^<div[^>]*>/.exec(html);
  if (!found) throw new Error("no root div in rendered output");
  return found[0];
}

describe("CanvasBar with nothing selected", () => {
  it("renders the Add step button, the caret trigger, and no selection report", () => {
    const html = render();

    expect(html).toContain(`>${t("canvas.addStep")}<`);
    expect(html).toContain(`aria-label="${t("canvas.addStepMore")}"`);
    expect(html).not.toContain(t("canvas.selectionHeading"));
    expect(html).not.toContain(t("canvas.unconnected"));
  });
});

describe("CanvasBar with one step selected", () => {
  it("reports nothing about reachability for a step a path chain reaches", () => {
    const html = render({ selectedStepIds: ["s1"], unconnected: false });

    expect(html).not.toContain(t("canvas.unconnected"));
    expect(html).not.toContain(t("canvas.selectionHeading"));
  });

  it("stands the unconnected text for a step no path chain reaches", () => {
    const html = render({ selectedStepIds: ["s1"], unconnected: true });

    expect(html).toContain(t("canvas.unconnected"));
  });
});

describe("CanvasBar with two steps selected", () => {
  it("stands the count and drops the unconnected text, even where the caller passes it true", () => {
    // unconnected only ever means something for a lone selected step
    // (studio-canvas); setting it true here would leak the text if the
    // bar keyed the report on `unconnected` alone instead of also on count.
    const html = render({ selectedStepIds: ["s1", "s2"], unconnected: true });

    expect(html).toContain(t("canvas.selectionHeading"));
    expect(html).toContain(">2<");
    expect(html).not.toContain(t("canvas.unconnected"));
  });

  it("renders the delete control, with no matching group", () => {
    const html = render({ selectedStepIds: ["s1", "s2"] });

    expect(html).toContain(`>${t("canvas.selectionRemove")}<`);
    expect(html).not.toContain(t("canvas.groupName"));
  });

  it("renders that group's own name, collapse and ungroup controls instead of the group control, for a selection matching one group", () => {
    const groups: StepGroup[] = [{ id: "g1", stepIds: ["s1", "s2"], name: "Approvals" }];
    const html = render({ selectedStepIds: ["s1", "s2"], groups });

    expect(html).toContain('value="Approvals"');
    expect(html).toContain(`>${t("canvas.groupCollapse")}<`);
    expect(html).toContain(`>${t("canvas.groupUngroup")}<`);
    expect(html).not.toContain(`>${t("canvas.groupCreate")}<`);
  });
});

describe("The bar's own element", () => {
  it("stays one element carrying one class across every selection state", () => {
    const renders = [
      render(),
      render({ selectedStepIds: ["s1"], unconnected: false }),
      render({ selectedStepIds: ["s1"], unconnected: true }),
      render({ selectedStepIds: ["s1", "s2"] }),
    ];
    const tags = renders.map(barTag);

    for (const tag of tags) expect(tag).toBe(tags[0]);
    for (const html of renders) {
      const occurrences = html.split(tags[0]!).length - 1;
      expect(occurrences).toBe(1);
    }
  });
});

describe("The add-step menu", () => {
  it("lists three menu items, one per step kind, each with its own phrase and note", () => {
    const html = render();
    const items = html.match(/<button[^>]*role="menuitem"[^>]*>[\s\S]*?<\/button>/g) ?? [];

    expect(items).toHaveLength(MENU_KINDS.length);
    for (const kind of MENU_KINDS) {
      const item = items.find((b) => b.includes(`>${newStepPhrase(kind)}<`));
      expect(item).toBeDefined();
      expect(item).toContain(`>${newStepNote(kind)}<`);
    }
  });
});

describe("The caret trigger and its panel", () => {
  it("wires aria-haspopup, aria-expanded, and a popovertarget naming the panel's own id", () => {
    const html = render();
    const trigger = /<button[^>]*aria-haspopup="menu"[^>]*>/.exec(html)?.[0];

    expect(trigger).toBeDefined();
    expect(trigger).toContain('aria-expanded="false"');
    // React passes popoverTarget through as written rather than lowering it
    // to the HTML attribute name; a browser's HTML parser lowercases it on
    // ingestion, so this camelCase form is what the rendered string carries.
    const target = /popoverTarget="([^"]+)"/.exec(trigger!);
    expect(target).not.toBeNull();

    const panelId = target![1];
    const panel = new RegExp(`<div id="${panelId}"[^>]*>`).exec(html)?.[0];

    expect(panel).toBeDefined();
    expect(panel).toContain('role="menu"');
    expect(panel).toContain('popover="auto"');
  });
});
