import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { SavePointList } from "../src/areas/studio/api/types.js";
import { RemoveSavePointDialog, RestoreSavePointDialog, type SavePointRow } from "../src/areas/studio/panels/SavePointDialogs.js";
import { SavePointsBody } from "../src/areas/studio/panels/SavePointsPanel.js";

/**
 * The Save points view's markup, state by state (`studio-app`: "The Save points
 * view lists a draft's save points", "The Save points view states the engine's
 * bound"). A static render reads the words and the attributes. The focus and the
 * requests are pinned at the source in `studio-savePoints-wiring.test.ts`.
 */

const NOW = Date.parse("2026-11-02T10:03:00.000Z");

function point(over: Partial<SavePointRow> = {}): SavePointRow {
  return {
    savePointId: "spt_9f2c7a10-1111-4222-8333-444455556666",
    processId: "proc_1",
    name: "Before the review step",
    revision: 7731,
    createdBy: "actor_secret_1",
    createdAt: "2026-11-02T10:00:00.000Z",
    createdByDisplayName: "Roman",
    ...over,
  };
}

function listOf(count: number, limit = 50): SavePointList {
  return {
    limit,
    items: Array.from({ length: count }, (_, i) =>
      point({ savePointId: `spt_${i}`, name: `Point ${i}`, createdAt: new Date(NOW - (i + 3) * 60_000).toISOString() }),
    ),
  };
}

type Props = React.ComponentProps<typeof SavePointsBody>;

function render(over: Partial<Props> = {}): string {
  return renderToStaticMarkup(
    <SavePointsBody
      list={undefined}
      fetchFailure={undefined}
      now={NOW}
      name=""
      nameError={undefined}
      acting={false}
      status=""
      inputRef={{ current: null }}
      boundRef={{ current: null }}
      onName={() => {}}
      onCreate={() => {}}
      onRestore={() => {}}
      onRemove={() => {}}
      onReload={() => {}}
      {...over}
    />,
  );
}

const buttonTags = (html: string): string[] => html.match(/<button[^>]*>/g) ?? [];

describe("the form", () => {
  it("stands from the first commit, with a waiting line where the rows will be", () => {
    const html = render();

    expect(html).toContain("Name this save point</label>");
    expect(html).toContain("Save this point</button>");
    expect(html).toMatch(/autocomplete="off"/i);
    expect(html).toMatch(/maxlength="120"/i);
    expect(html).toContain("A save point keeps the draft as it stands now, so you can come back to it.");
    expect(html).toContain("Loading save points…");
    expect(html).not.toContain("<ul");
  });

  it("ties the label to the input", () => {
    const html = render();
    const label = /<label for="([^"]+)"/.exec(html)!;

    expect(html).toContain(`id="${label[1]}"`);
  });

  it("prints a sentence at the input, apart from the label, and keeps the name typed", () => {
    const html = render({ name: "x", nameError: "Give this save point a name." });

    expect(html).toContain('role="alert"');
    expect(html).toContain("Give this save point a name.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="([^"]+)"/);
    expect(/<label[^>]*>[^<]*<\/label>/.exec(html)![0]).not.toContain("Give this save point a name.");
    expect(html).toContain('value="x"');
  });

  it("prints no alert without an error", () => {
    expect(render()).not.toContain('role="alert"');
  });

  it("keeps the focus on the control while a request runs, by aria-disabled", () => {
    const tag = buttonTags(render({ acting: true })).find((b) => b.includes('type="submit"'))!;

    expect(tag).toContain('aria-disabled="true"');
    expect(tag).not.toContain(" disabled");
  });

  it("keeps a row's Restore and Remove from starting another request, by aria-disabled", () => {
    const idle = buttonTags(render({ list: listOf(2) })).filter((b) => /aria-label="(Restore|Remove) /.test(b));
    const busy = buttonTags(render({ list: listOf(2), acting: true })).filter((b) => /aria-label="(Restore|Remove) /.test(b));

    expect(idle).toHaveLength(4);
    expect(idle.every((b) => !b.includes("aria-disabled"))).toBe(true);
    expect(busy).toHaveLength(4);
    expect(busy.every((b) => b.includes('aria-disabled="true"') && !b.includes(" disabled"))).toBe(true);
  });

  it("holds an always-present polite status line for the last create or restore", () => {
    expect(render()).toMatch(/<p role="status"[^>]*><\/p>/);
    expect(render({ status: "Saved “A”." })).toMatch(/<p role="status"[^>]*>Saved “A”\.<\/p>/);
  });
});

describe("the rows", () => {
  it("says so in a sentence when none exist", () => {
    const html = render({ list: listOf(0) });

    expect(html).toContain("No save points yet.");
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("Loading save points…");
  });

  it("prints a name, who saved it and how long ago, with Restore and Remove", () => {
    const html = render({ list: listOf(2) });

    expect(html).toContain("Point 0");
    expect(html).toMatch(/Saved by Roman, <time[^>]*>3 minutes ago<\/time>/);
    expect(html).toMatch(/Saved by Roman, <time[^>]*>4 minutes ago<\/time>/);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain(">Restore</button>");
    expect(html).toContain(">Remove</button>");
    expect(html).not.toContain("Loading save points…");
  });

  it("reads without a name for a point whose saver does not resolve", () => {
    const html = render({ list: { limit: 50, items: [point({ createdByDisplayName: null })] } });

    expect(html).toMatch(/Saved <time[^>]*>3 minutes ago<\/time>/);
    expect(html).not.toContain("Saved by");
    expect(html).not.toContain("null");
  });

  it("wraps a 120-character name rather than clipping it", () => {
    const long = "w".repeat(120);
    const html = render({ list: { limit: 50, items: [point({ name: long })] } });

    expect(html).toContain(long);
  });

  it("prints an author's markup as text", () => {
    const html = render({ list: { limit: 50, items: [point({ name: "<b>x</b>" })] } });

    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("names the point in each control's accessible name", () => {
    const html = render({ list: { limit: 50, items: [point({ name: "Alpha" })] } });

    expect(html).toContain('aria-label="Restore “Alpha”"');
    expect(html).toContain('aria-label="Remove “Alpha”"');
  });

  it("styles Remove destructive and Restore secondary", () => {
    const tags = buttonTags(render({ list: listOf(1) }));
    const restore = tags.find((b) => b.includes("Restore"))!;
    const remove = tags.find((b) => b.includes("Remove"))!;

    expect(restore).toContain("btn btn-secondary");
    expect(restore).not.toContain("btn-destructive");
    expect(remove).toContain("btn btn-secondary btn-destructive");
  });

  it("reports a failed fetch where the rows would stand, with the form kept", () => {
    const html = render({ fetchFailure: "The server did not answer.", list: undefined });

    expect(html).toContain('role="alert"');
    expect(html).toContain("The save points did not load. The server did not answer.");
    expect(html).toContain("Try again</button>");
    expect(html).toContain("Save this point</button>");
    expect(html).not.toContain("Loading save points…");
  });

  it("stands no card, no chip and no stamp on a row", () => {
    const html = render({ list: listOf(3) });
    const rows = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"));

    expect(rows).not.toMatch(/<(article|aside|details|table)/);
    expect(rows.match(/<button/g)).toHaveLength(6);
  });
});

describe("the bound", () => {
  it("replaces the form with a sentence that takes the focus, and keeps Remove", () => {
    const html = render({ list: listOf(50) });

    expect(html).toContain("This draft holds 50 save points. Remove one to name another or to restore one.");
    expect(html).toMatch(/<p[^>]*tabindex="-1"[^>]*>This draft holds 50/);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Save this point");
    expect(html.match(/>Remove<\/button>/g)).toHaveLength(50);
  });

  it("names the limit the server states, not a constant", () => {
    expect(render({ list: listOf(3, 3) })).toContain("This draft holds 3 save points.");
  });

  it("leaves Restore aria-disabled and focusable, never natively disabled", () => {
    const restores = buttonTags(render({ list: listOf(50) })).filter((b) => b.includes('aria-label="Restore'));

    expect(restores).toHaveLength(50);
    for (const tag of restores) {
      expect(tag).toContain('aria-disabled="true"');
      expect(tag).not.toContain(" disabled");
    }
  });

  it("keeps Restore available one below the bound", () => {
    const restores = buttonTags(render({ list: listOf(49) })).filter((b) => b.includes('aria-label="Restore'));

    expect(restores).toHaveLength(49);
    expect(restores.some((tag) => tag.includes("aria-disabled"))).toBe(false);
    expect(render({ list: listOf(49) })).toContain("<form");
  });
});

describe("the view prints no machine value", () => {
  it("shows no id, revision, hash or actor id, in any state", () => {
    const states = [
      render(),
      render({ list: listOf(0) }),
      render({ list: { limit: 50, items: [point()] } }),
      render({ list: listOf(50) }),
      render({ fetchFailure: "x" }),
    ];

    for (const html of states) {
      expect(html).not.toContain("spt_");
      expect(html).not.toContain("proc_1");
      expect(html).not.toContain("actor_secret_1");
      expect(html).not.toMatch(/revision/i);
      expect(html).not.toMatch(/hash/i);
      expect(html).not.toContain("7731");
    }
  });

  it("is a scan that flags a leak, the violating input", () => {
    const leaked = render({ list: { limit: 50, items: [point({ name: "spt_9f2c" })] } });

    expect(leaked).toContain("spt_");
  });
});

function renderDialog(act: "restore" | "remove", over: { refusal?: string; busy?: boolean; point?: SavePointRow } = {}): string {
  const Dialog = act === "restore" ? RestoreSavePointDialog : RemoveSavePointDialog;
  return renderToStaticMarkup(
    <Dialog
      point={over.point ?? point()}
      refusal={over.refusal}
      busy={over.busy ?? false}
      triggerRef={{ current: null }}
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );
}

describe("the Restore dialog", () => {
  it("asks about the point by name, says who saved it and when, and what the current work becomes", () => {
    const html = renderDialog("restore");

    expect(html).toContain("Restore “Before the review step”?</h2>");
    expect(html).toMatch(/<dt[^>]*>Saved by<\/dt><dd[^>]*>Roman<\/dd>/);
    expect(html).toMatch(/<dt[^>]*>Saved<\/dt><dd[^>]*>Nov 2, 2026/);
    expect(html).toContain("Your work as it stands now becomes a save point, so you can come back to it.");
    expect(html).toContain(">Restore</button>");
  });

  it("names the point in the heading as written, a $ pattern included", () => {
    expect(renderDialog("restore", { point: point({ name: "$& costs" }) })).toContain("Restore “$&amp; costs”?</h2>");
  });

  it("leaves out Saved by where no name resolves", () => {
    const html = renderDialog("restore", { point: point({ createdByDisplayName: null }) });

    expect(html).not.toContain("Saved by");
    expect(html).toMatch(/<dt[^>]*>Saved<\/dt>/);
  });

  it("confirms with the filled primary and ends with Cancel holding the focus", () => {
    const tags = buttonTags(renderDialog("restore"));

    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain("btn btn-primary");
    expect(tags[1]).toContain("autofocus");
  });

  it("prints a refusal inside the dialog, as an alert", () => {
    const html = renderDialog("restore", { refusal: "The engine refused." });

    expect(html).toContain('role="alert"');
    expect(html).toContain("The engine refused.");
    expect(renderDialog("restore")).not.toContain('role="alert"');
  });

  it("disables both controls while busy", () => {
    expect(buttonTags(renderDialog("restore", { busy: true })).every((tag) => tag.includes("disabled"))).toBe(true);
  });

  it("prints no id or revision", () => {
    const html = renderDialog("restore");

    expect(html).not.toContain("spt_");
    expect(html).not.toMatch(/revision/i);
  });
});

describe("the Remove dialog", () => {
  it("asks about the point by name and says the studio has no undo", () => {
    const html = renderDialog("remove");

    expect(html).toContain("Remove “Before the review step”?</h2>");
    expect(html).toContain("The studio has no undo.");
    expect(html).toContain(">Remove</button>");
  });

  it("confirms with the destructive control and ends with Cancel holding the focus", () => {
    const tags = buttonTags(renderDialog("remove"));

    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain("btn btn-secondary btn-destructive");
    expect(tags[0]).not.toContain("autofocus");
    expect(tags[1]).toContain("autofocus");
  });

  it("prints a refusal inside the dialog", () => {
    expect(renderDialog("remove", { refusal: "Nope." })).toContain("Nope.");
  });

  it("disables both controls while busy", () => {
    expect(buttonTags(renderDialog("remove", { busy: true })).every((tag) => tag.includes("disabled"))).toBe(true);
  });
});
