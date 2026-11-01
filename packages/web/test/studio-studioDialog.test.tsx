import { describe, expect, it } from "bun:test";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DestructiveConfirm,
  DialogCount,
  DialogDeveloperView,
  DialogFact,
  DialogFacts,
  DialogMonoFact,
  DialogNames,
  DialogNote,
  DialogRefusal,
  DialogWarning,
  PrimaryConfirm,
  StudioDialog,
} from "../src/areas/studio/panels/shared/StudioDialog.js";

/**
 * The one dialog form's markup (`spa-accessibility`, `studio-app`). A static
 * render reads the name, the description, the opening focus's attribute and the
 * order of the parts. The preload stub keeps a style's key as its class, so a
 * face reads off its class name. `e2e/dialog.e2e.ts` drives the keyboard and
 * the focus return in a real browser.
 */

const trigger = createRef<HTMLElement>();
const noop = () => {};

function frame(children: React.ReactNode, extra: Partial<React.ComponentProps<typeof StudioDialog>> = {}): string {
  return renderToStaticMarkup(
    <StudioDialog heading="Remove “Prüfung”?" triggerRef={trigger} onCancel={noop} {...extra}>
      {children}
    </StudioDialog>,
  );
}

function attribute(html: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(html)?.[1];
}

/** The opening tag of the button whose label is `label`. */
function buttonTag(html: string, label: string): string {
  const end = html.indexOf(`>${label}</button>`);
  expect(end).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<button", end), end + 1);
}

describe("StudioDialog", () => {
  it("names itself through the heading and describes itself through the body", () => {
    const html = frame(<DialogNote>Only the draft goes.</DialogNote>);
    const labelledBy = attribute(html, "aria-labelledby");
    const describedBy = attribute(html, "aria-describedby");
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(labelledBy).not.toBe(describedBy);
    expect(html).toContain(`<h2 id="${labelledBy}"`);
    expect(html).toContain("Remove “Prüfung”?</h2>");
    const body = html.slice(html.indexOf(`id="${describedBy}"`));
    expect(body.slice(0, body.indexOf("</div>"))).toContain("Only the draft goes.");
  });

  it("carries the literal class beside its compiled one", () => {
    const classes = (attribute(frame(null), "class") ?? "").split(" ");
    expect(classes).toContain("studio-dialog");
    expect(classes).toContain("dialog");
  });

  it("opens on Cancel, a secondary button, and never on the confirm", () => {
    const html = frame(null, { confirm: <DestructiveConfirm onClick={noop}>Remove step</DestructiveConfirm> });
    const cancel = buttonTag(html, "Cancel");
    expect(cancel).toContain("autofocus");
    expect(cancel).toContain('class="btn btn-secondary"');
    expect(buttonTag(html, "Remove step")).not.toContain("autofocus");
  });

  it("leaves the opening focus to a named place", () => {
    const html = frame(null, { initialFocusRef: createRef<HTMLElement>() });
    expect(buttonTag(html, "Cancel")).not.toContain("autofocus");
  });

  it("reads heading, body, refusal, confirm, Cancel, in that order", () => {
    const html = frame(<DialogNote>The note.</DialogNote>, {
      confirm: <PrimaryConfirm onClick={noop}>Publish</PrimaryConfirm>,
      refusal: <DialogRefusal detail={null}>The engine refused.</DialogRefusal>,
    });
    const order = ["<h2", "The note.", "The engine refused.", ">Publish<", ">Cancel<"].map((part) => html.indexOf(part));
    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("renders the refusal after the body closes, so the description leaves it out", () => {
    const html = frame(<DialogNote>The note.</DialogNote>, { refusal: <DialogRefusal detail={null}>The engine refused.</DialogRefusal> });
    const describedBy = attribute(html, "aria-describedby");
    const body = html.slice(html.indexOf(`id="${describedBy}"`));
    const closes = body.indexOf("</div>");
    expect(body.indexOf("The note.")).toBeLessThan(closes);
    expect(body.indexOf('role="alert"')).toBeGreaterThan(closes);
  });

  it("renders no refusal slot and no alert without a refusal", () => {
    const html = frame(null);
    expect(html).not.toContain("alert");
    expect(html).not.toContain("refusalSlot");
  });

  it("closes with Cancel alone where no confirm stands", () => {
    const html = frame(null);
    expect(html.match(/<button/g)?.length).toBe(1);
    expect(html).toContain(">Cancel</button>");
  });

  it("disables both controls while busy, through the confirm's context", () => {
    const html = frame(null, { busy: true, confirm: <DestructiveConfirm onClick={noop}>Remove step</DestructiveConfirm> });
    expect(buttonTag(html, "Cancel")).toContain("disabled");
    expect(buttonTag(html, "Remove step")).toContain("disabled");
  });

  it("keeps both controls enabled when not busy", () => {
    const html = frame(null, { confirm: <PrimaryConfirm onClick={noop}>Publish</PrimaryConfirm> });
    expect(buttonTag(html, "Cancel")).not.toContain("disabled");
    expect(buttonTag(html, "Publish")).not.toContain("disabled");
  });
});

describe("the confirm variants", () => {
  it("write the button's own classes", () => {
    const html = frame(null, { confirm: <DestructiveConfirm onClick={noop}>Remove step</DestructiveConfirm> });
    expect(buttonTag(html, "Remove step")).toContain('class="btn btn-secondary btn-destructive"');
    const primary = frame(null, { confirm: <PrimaryConfirm onClick={noop}>Publish</PrimaryConfirm> });
    expect(buttonTag(primary, "Publish")).toContain('class="btn btn-primary"');
  });
});

describe("DialogFacts", () => {
  const facts = (children: React.ReactNode) => renderToStaticMarkup(<DialogFacts>{children}</DialogFacts>);

  it("prints a written fact in the written face", () => {
    const html = facts(<DialogFact term="Process">Laptop Pool</DialogFact>);
    expect(html).toContain(">Process</dt>");
    const dd = html.slice(html.indexOf("<dd"));
    expect(dd).toContain("Laptop Pool</dd>");
    expect(dd.slice(0, dd.indexOf(">"))).not.toContain("mono");
  });

  it("prints a count in mono", () => {
    const html = facts(<DialogCount term="Ways out leading here" count={2} />);
    expect(html).toContain(">Ways out leading here</dt>");
    const dd = html.slice(html.indexOf("<dd"));
    expect(dd).toContain(">2</dd>");
    const open = dd.slice(0, dd.indexOf(">"));
    expect(open).toContain("mono");
    expect(open).toContain("tabular");
  });

  it("prints a mono fact's zero", () => {
    const html = facts(<DialogMonoFact term="Open issues">{0}</DialogMonoFact>);
    expect(html).toContain(">Open issues</dt>");
    const dd = html.slice(html.indexOf("<dd"));
    expect(dd).toContain(">0</dd>");
    expect(dd.slice(0, dd.indexOf(">"))).toContain("mono");
  });

  it("prints no row for a count at zero beside a row that stands", () => {
    const mixed = facts([<DialogCount key="a" term="Zero" count={0} />, <DialogCount key="b" term="Two" count={2} />]);
    expect(mixed).not.toContain("Zero");
    expect(mixed).toContain(">Two</dt>");
  });

  it("counts a Fragment as a row, whose zero count still prints nothing", () => {
    const html = facts(
      <>
        <DialogCount term="Zero" count={0} />
      </>,
    );
    expect(html.startsWith("<dl")).toBe(true);
    expect(html).not.toContain("Zero");
  });

  it("renders no dl when no child renders a row", () => {
    expect(facts(<DialogCount term="Zero" count={0} />)).toBe("");
    expect(facts(<DialogNames term="Asked on" names={[]} />)).toBe("");
    expect(facts(null)).toBe("");
    expect(facts(false)).toBe("");
    expect(facts(0)).toBe("");
    expect(facts("")).toBe("");
  });

  it("renders no dl for an array of zero counts", () => {
    const zeros = ["a", "b", "c"].map((term) => <DialogCount key={term} term={term} count={0} />);
    expect(facts(zeros)).toBe("");
    expect(facts([zeros, <DialogNames key="n" term="None" names={[]} />, false])).toBe("");
  });

  it("names a list with no marker and renders nothing for an empty one", () => {
    const html = facts(<DialogNames term="Asked on" names={["Review", "Book"]} />);
    expect(html).toContain(">Asked on</dt>");
    expect(html).toContain("<ul");
    expect(html).toContain(">Review</li>");
    expect(html).toContain(">Book</li>");
    expect(renderToStaticMarkup(<DialogNames term="Asked on" names={[]} />)).toBe("");
  });

  it("takes rows beside a falsy child, and drops the falsy child", () => {
    const html = facts([false, 0, <DialogFact key="p" term="Process">Laptop Pool</DialogFact>]);
    expect(html.startsWith("<dl")).toBe(true);
    expect(html).toContain(">Process</dt>");
    expect(html).not.toContain(">0<");
  });
});

describe("the notes", () => {
  it("prints a note and a warning", () => {
    expect(renderToStaticMarkup(<DialogNote>The note.</DialogNote>)).toContain("The note.</p>");
    expect(renderToStaticMarkup(<DialogWarning>The warning.</DialogWarning>)).toContain("The warning.</p>");
  });

  it("follows a refusal with a closed Developer view only for a non-null detail", () => {
    const bare = renderToStaticMarkup(<DialogRefusal detail={null}>Refused.</DialogRefusal>);
    expect(bare).toContain('role="alert"');
    expect(bare).toContain("Refused.</p>");
    expect(bare).not.toContain("<details");

    const absent = renderToStaticMarkup(<DialogRefusal>Refused.</DialogRefusal>);
    expect(absent).not.toContain("<details");

    const detailed = renderToStaticMarkup(<DialogRefusal detail="409: stale revision">Refused.</DialogRefusal>);
    expect(detailed.indexOf('role="alert"')).toBeLessThan(detailed.indexOf("<details"));
    const details = detailed.slice(detailed.indexOf("<details"));
    expect(details.slice(0, details.indexOf(">"))).not.toContain("open");
    expect(details).toContain("Developer view</summary>");
    expect(details).toContain("409: stale revision");
    // The server's text stays outside the alert, in the closed disclosure.
    expect(detailed.slice(0, detailed.indexOf("</p>"))).not.toContain("409");
  });

  it("holds machine values in a closed Developer view of one facts list", () => {
    const html = renderToStaticMarkup(
      <DialogDeveloperView>
        <DialogMonoFact term="Process id">proc_1</DialogMonoFact>
      </DialogDeveloperView>,
    );
    const open = html.slice(0, html.indexOf(">"));
    expect(open.startsWith("<details")).toBe(true);
    expect(open).not.toContain("open");
    expect(html).toContain("Developer view</summary>");
    expect(html.match(/<dl/g)?.length).toBe(1);
    expect(html).toContain("proc_1</dd>");
  });
});
