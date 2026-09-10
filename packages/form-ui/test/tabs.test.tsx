import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldForm, nextTabIndex } from "../src/FieldForm.js";
import { drawnTabs, firstTabWithIssue, tabIssueCount } from "../src/tabs.js";
import { resolveTabsLocale } from "../src/locale.js";
import { issueCountText } from "../src/issue-messages.js";
import type { ResolvedViewEntry, ResolvedViewField, ResolvedViewTab, SubmissionIssue } from "../src/types.js";

/** `react-dom/server`'s `renderToStaticMarkup`, no jsdom/testing-library —
 * matches this package's own rendering-test convention. A behavior needing a
 * real event (a click, an arrow key) is asserted against the element tree or
 * against the pure function the handler calls. */

function noop() {
  // FieldForm requires an onChange handler; static rendering never fires one.
}

const field = (id: string, tab?: string, extra?: Partial<ResolvedViewField>): ResolvedViewField => ({
  field: { id, key: id, label: { en: `Label ${id}` }, type: "string" },
  value: undefined,
  required: false,
  readonly: false,
  ...(tab === undefined ? {} : { tab }),
  ...extra,
});

const group = (key: string, tab: string): ResolvedViewField => ({
  field: { id: `field_${key}`, key, label: { en: `Group ${key}` }, type: "group" },
  value: undefined,
  required: false,
  readonly: false,
  tab,
});

const TABS: ResolvedViewTab[] = [
  { key: "one", label: { en: "Details" } },
  { key: "two", label: { en: "Approval" } },
];

function render(
  fields: ResolvedViewEntry[],
  tabs?: ResolvedViewTab[],
  activeTab?: string,
  values: Record<string, unknown> = {},
  issuesByField?: Map<string, SubmissionIssue[]>,
): string {
  return renderToStaticMarkup(
    <FieldForm
      fields={fields}
      values={values}
      onChange={noop}
      locale="en"
      tabs={tabs}
      activeTab={activeTab}
      issuesByField={issuesByField}
    />,
  );
}

/** The key of the tab reporting `aria-selected="true"`, read back out of the
 * markup rather than out of an attribute order this test would then pin. */
function selectedTab(html: string): string | undefined {
  return /id="form-ui-tab-([^"]+)"[^>]*aria-selected="true"/.exec(html)?.[1];
}

/** A tab button's accessible name, computed the way name-from-content
 * computes it: the text its subtree carries, minus every subtree
 * `aria-hidden` takes out of the tree. That is what a screen reader
 * announces, and no attribute stands in for it. */
function accessibleName(html: string, tabKey: string): string {
  const button = new RegExp(`<button[^>]*id="form-ui-tab-${tabKey}"[\\s\\S]*?</button>`).exec(html)?.[0] ?? "";
  return button
    .replace(/<span[^>]*aria-hidden="true"[\s\S]*?<\/span>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every drawn tab's key, in the order the strip drew them. */
function drawnTabKeys(html: string): string[] {
  return [...html.matchAll(/id="form-ui-tab-([^"]+)"/g)].map((m) => m[1]!);
}

const required = (fieldId: string): SubmissionIssue => ({ kind: "required-missing", fieldId });

/** A React element as this test walks it: enough shape to find a rendered
 * `role="tab"` button and call its handler, with no react import of its own. */
type Elementish = { type: unknown; props: Record<string, unknown> };

function isElement(node: unknown): node is Elementish {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

function collect(node: unknown, out: Elementish[] = []): Elementish[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (!isElement(node)) return out;
  out.push(node);
  return collect(node.props.children, out);
}

/** The rendered tab buttons, as elements — `FieldForm` is a plain function
 * holding no state, so calling it returns its tree directly. */
function tabElements(fields: ResolvedViewEntry[], tabs: ResolvedViewTab[], activeTab: string | undefined, onTabChange: (key: string) => void): Elementish[] {
  const tree = FieldForm({ fields, values: {}, onChange: noop, locale: "en", tabs, activeTab, onTabChange });
  return collect(tree).filter((el) => el.props.role === "tab");
}

describe("FieldForm: a view declaring tabs renders as a tab strip over one panel", () => {
  it("a form with no tabs renders as it does today, byte for byte", () => {
    const fields = [field("f1"), field("f2")];
    const today = renderToStaticMarkup(<FieldForm fields={fields} values={{}} onChange={noop} locale="en" />);
    expect(today).not.toContain('role="tablist"');
    expect(today).toContain("Label f1");
    expect(today).toContain("Label f2");
    // An absent prop and an empty list are the same form: neither draws a
    // strip, and neither changes one byte of the grid.
    expect(render(fields)).toBe(today);
    expect(render(fields, [])).toBe(today);
  });

  it("a tabbed form draws one panel at a time", () => {
    const html = render([field("f1", "one"), field("f2", "two")], TABS, "one");
    expect(selectedTab(html)).toBe("one");
    expect(html).toContain("Label f1");
    expect(html).not.toContain("Label f2");
    // One panel, and it names the tab that labels it.
    expect(html).toContain('role="tabpanel" id="form-ui-tabpanel-one" aria-labelledby="form-ui-tab-one"');
    expect([...html.matchAll(/role="tabpanel"/g)]).toHaveLength(1);
    expect(html).not.toContain("form-ui-tabpanel-two");
  });

  it("a closed tab names no panel", () => {
    const three: ResolvedViewTab[] = [...TABS, { key: "three", label: { en: "History" } }];
    const html = render([field("f1", "one"), field("f2", "two"), field("f3", "three")], three, "two");
    // The open tab alone: the panel a closed tab would name is not in the
    // DOM, so naming it would leave a dangling reference.
    expect(html).toContain('aria-selected="true" aria-controls="form-ui-tabpanel-two"');
    expect([...html.matchAll(/aria-controls=/g)]).toHaveLength(1);
    expect(html).toContain('id="form-ui-tab-one" type="button" role="tab" aria-selected="false" class=');
    expect(html).toContain('id="form-ui-tab-three" type="button" role="tab" aria-selected="false" class=');
  });

  it("opening a tab calls back rather than switching", () => {
    const opened: string[] = [];
    const fields = [field("f1", "one"), field("f2", "two")];
    const tabs = tabElements(fields, TABS, "one", (key) => opened.push(key));
    (tabs[1]!.props.onClick as () => void)();
    expect(opened).toEqual(["two"]);
    // FieldForm switched nothing on its own: the first tab is still the open
    // one until the consumer passes the new activeTab back in.
    expect(selectedTab(render(fields, TABS, "one"))).toBe("one");
    expect(selectedTab(render(fields, TABS, "two"))).toBe("two");
    expect(render(fields, TABS, "two")).toContain("Label f2");
  });

  it("an activeTab naming an undrawn tab falls back to the first drawn tab", () => {
    const html = render([field("f1", "one"), field("f2", "two")], TABS, "ghost");
    expect(selectedTab(html)).toBe("one");
    expect(html).toContain("Label f1");
    expect(html).not.toContain("Label f2");
  });

  it("a group draws whole inside its tab", () => {
    const fields = [
      field("f1", "one"),
      group("grp", "two"),
      field("m1", undefined, { group: "grp" }),
      field("m2", undefined, { group: "grp" }),
      field("m3", undefined, { group: "grp" }),
    ];
    const second = render(fields, TABS, "two");
    expect(second).toContain("<fieldset");
    expect(second).toContain("Label m1");
    expect(second).toContain("Label m2");
    expect(second).toContain("Label m3");
    const first = render(fields, TABS, "one");
    expect(first).not.toContain("Label m1");
    expect(first).not.toContain("Label m2");
    expect(first).not.toContain("Label m3");
    expect(first).not.toContain("Group grp");
  });

  it("a value typed on one tab survives a tab switch", () => {
    const fields = [field("f1", "one"), field("f2", "two")];
    const values = { f1: "typed" };
    expect(render(fields, TABS, "one", values)).toContain('value="typed"');
    expect(render(fields, TABS, "two", values)).not.toContain('value="typed"');
    // Back again: the consumer held the value, so it is still there.
    expect(render(fields, TABS, "one", values)).toContain('value="typed"');
  });

  it("the strip draws its tabs in the view's own order", () => {
    const reversed = [TABS[1]!, TABS[0]!];
    expect(drawnTabKeys(render([field("f1", "one"), field("f2", "two")], reversed, "one"))).toEqual(["two", "one"]);
  });

  it("the strip and its panel compile from StyleX, reading the shared tokens", () => {
    // `test/preload-stylex.ts` stubs `stylex.props()` to space-join each
    // applied style's own key name into `className`, so this checks the
    // styles are applied, not a compiled CSS value.
    const html = render([field("f1", "one")], TABS, "one");
    expect(html).toContain("tabRow");
    expect(html).toContain("tabSelected");
  });
});

describe("nextTabIndex: arrow keys move focus without opening a tab", () => {
  it("ArrowRight and ArrowLeft step one tab, wrapping at the row's ends", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 1, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
  });

  it("Home and End reach the first and last tab", () => {
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
  });

  it("Enter and Space move no focus — the button's own activation opens the tab", () => {
    expect(nextTabIndex("Enter", 0, 3)).toBeUndefined();
    expect(nextTabIndex(" ", 0, 3)).toBeUndefined();
    expect(nextTabIndex("Tab", 0, 3)).toBeUndefined();
  });

  it("a press from outside the strip, and an empty strip, move nothing", () => {
    expect(nextTabIndex("ArrowRight", -1, 3)).toBeUndefined();
    expect(nextTabIndex("ArrowRight", 3, 3)).toBeUndefined();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeUndefined();
  });

  it("every tab is its own tab stop", () => {
    // `spa-accessibility` gives an ordinary tab set the plain-button pattern.
    // Roving tabindex is its named exception for the studio's ten-tab
    // scrolling row, and it would need focus state this package cannot hold.
    const html = render([field("f1", "one"), field("f2", "two")], TABS, "one");
    expect(html).not.toContain('tabindex="-1"');
    expect(html).not.toContain("tabindex");
  });
});

describe("drawnTabs: a tab with nothing to draw hides itself", () => {
  const three: ResolvedViewTab[] = [...TABS, { key: "three", label: { en: "History" } }];

  it("an empty tab draws no tab button", () => {
    const fields = [field("f1", "one"), field("f2", "two")];
    expect(drawnTabs(fields, three).map((t) => t.key)).toEqual(["one", "two"]);
    const html = render(fields, three, "one");
    expect(drawnTabKeys(html)).toEqual(["one", "two"]);
    expect(html).not.toContain("History");
  });

  it("a tab whose entries all hide disappears", () => {
    // A hidden entry never reaches the renderer, so a tab whose entries all
    // resolved invisible arrives as a tab no entry names.
    const html = render([field("f1", "one")], TABS, "one");
    expect(drawnTabKeys(html)).toEqual(["one"]);
    expect(html).not.toContain("Approval");
  });

  it("hiding the open tab moves the participant to the first drawn one", () => {
    const html = render([field("f1", "one")], TABS, "two");
    expect(selectedTab(html)).toBe("one");
    expect(html).toContain("Label f1");
  });

  it("drawnTabs answers the same list the strip draws, in the strip's own order", () => {
    const fields = [field("f2", "two"), field("f1", "one")];
    expect(drawnTabs(fields, three).map((t) => t.key)).toEqual(drawnTabKeys(render(fields, three, "one")));
  });

  it("a form whose every tab is empty draws no strip", () => {
    const html = render([], TABS, "one");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tabpanel"');
    expect(drawnTabs([], TABS)).toEqual([]);
  });

  it("a group's member draws through its group, never as a tab of its own", () => {
    // A member carries no `tab` (the authoring rules forbid one), so it never
    // makes a tab draw by itself.
    expect(drawnTabs([field("m1", undefined, { group: "grp" })], TABS)).toEqual([]);
  });
});

describe("firstTabWithIssue: a helper names the first tab holding an issue", () => {
  const three: ResolvedViewTab[] = [...TABS, { key: "three", label: { en: "History" } }];
  const fields = [field("f1", "one"), field("f2", "two"), field("f3", "three")];

  it("names the offending tab", () => {
    const issues = new Map([["f2", [required("f2")]]]);
    expect(firstTabWithIssue(fields, three, issues)).toBe("two");
  });

  it("two tabs holding issues answer the earlier one, and both report their counts", () => {
    const issues = new Map([
      ["f3", [required("f3")]],
      ["f2", [required("f2")]],
    ]);
    expect(firstTabWithIssue(fields, three, issues)).toBe("two");
    const html = render(fields, three, "one", {}, issues);
    expect(accessibleName(html, "two")).toBe("Approval 1 issue");
    expect(accessibleName(html, "three")).toBe("History 1 issue");
    expect(tabIssueCount(fields, "two", issues)).toBe(1);
    expect(tabIssueCount(fields, "three", issues)).toBe(1);
    expect(tabIssueCount(fields, "one", issues)).toBe(0);
  });

  it("a clean map names no tab", () => {
    expect(firstTabWithIssue(fields, three, new Map())).toBeUndefined();
    expect(firstTabWithIssue(fields, three, undefined)).toBeUndefined();
  });

  it("names no undrawn tab", () => {
    // The issue sits on a tab the strip does not draw, so switching to it
    // would show the participant an empty panel.
    const issues = new Map([["ghost", [required("ghost")]]]);
    expect(firstTabWithIssue(fields, three, issues)).toBeUndefined();
  });

  it("counts a group's member under the group's own tab", () => {
    const grouped = [field("f1", "one"), group("grp", "two"), field("m1", undefined, { group: "grp" })];
    const issues = new Map([["m1", [required("m1")]]]);
    expect(firstTabWithIssue(grouped, TABS, issues)).toBe("two");
    expect(tabIssueCount(grouped, "two", issues)).toBe(1);
  });
});

describe("The tab stamp: each drawn tab marks its own issues", () => {
  const fields = [field("f1", "one"), field("f2", "two")];

  it("a tab's issue count is available to a screen reader, beyond its color", () => {
    const issues = new Map([
      ["f2", [required("f2"), { kind: "rule-failed", fieldId: "f2" } as SubmissionIssue]],
    ]);
    const html = render(fields, TABS, "one", {}, issues);
    expect(tabIssueCount(fields, "two", issues)).toBe(2);
    // The name a screen reader announces, not an attribute that happens to
    // sit in the markup. The stamp itself is out of the tree, so the count
    // reads once.
    expect(accessibleName(html, "two")).toBe("Approval 2 issues");
    expect(accessibleName(html, "one")).toBe("Details");
    expect(html).toContain("tabIssueStamp");
  });

  it("a tab's issue count survives a re-render", () => {
    const issues = new Map([["f2", [required("f2")]]]);
    const first = render(fields, TABS, "one", {}, issues);
    expect(render(fields, TABS, "one", {}, issues)).toBe(first);
    // activeTab alone decides which panel draws; the counts do not move.
    const second = render(fields, TABS, "two", {}, issues);
    expect(accessibleName(second, "two")).toBe("Approval 1 issue");
    expect(selectedTab(second)).toBe("two");
  });

  it("a clean tab carries no stamp", () => {
    expect(render(fields, TABS, "one", {}, new Map())).not.toContain("tabIssueStamp");
    expect(render(fields, TABS, "one")).not.toContain("tabIssueStamp");
  });

  it("issueCountText names the count in the form's own locale", () => {
    expect(issueCountText(1, "en")).toBe("1 issue");
    expect(issueCountText(2, "en")).toBe("2 issues");
    expect(issueCountText(1, "de")).toBe("1 Problem");
    expect(issueCountText(3, "de")).toBe("3 Probleme");
    // An unlisted locale falls back the way `issueMessage` does.
    expect(issueCountText(2, "fr", "de")).toBe("2 Probleme");
    expect(issueCountText(2, "fr")).toBe("2 issues");
  });
});

describe("resolveTabsLocale: the sibling of resolveFieldsLocale", () => {
  const tabs: ResolvedViewTab[] = [
    { key: "one", label: { en: "Details", de: "Details DE" } },
    { key: "two", label: { en: "Approval" } },
  ];

  it("resolves each label to the locale, falling back to the base locale", () => {
    expect(resolveTabsLocale(tabs, "de", "en")).toEqual([
      { key: "one", label: { de: "Details DE" } },
      { key: "two", label: { de: "Approval" } },
    ]);
  });

  it("never mutates its input", () => {
    const before = JSON.stringify(tabs);
    resolveTabsLocale(tabs, "de", "en");
    expect(JSON.stringify(tabs)).toBe(before);
  });

  it("hands the strip a label FieldForm renders as it stands", () => {
    const resolved = resolveTabsLocale(tabs, "de", "en");
    const html = renderToStaticMarkup(
      <FieldForm fields={[field("f1", "one")]} values={{}} onChange={noop} locale="de" tabs={resolved} activeTab="one" />,
    );
    expect(html).toContain("Details DE");
  });
});
