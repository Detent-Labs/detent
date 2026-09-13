import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t, type CatalogKey } from "../catalog.js";
import { PROCESS_TABS, type ProcessTab } from "../routing.js";

/** The tab button's own element id, and the id of the body it controls. Both
 * are exported so the surface can stamp the matching `aria-labelledby` on each
 * body without repeating the format. */
export const tabDomId = (tab: ProcessTab) => `studio-tab-${tab}`;
export const tabPanelDomId = (tab: ProcessTab) => `studio-tabpanel-${tab}`;

const TAB_LABEL: Record<ProcessTab, CatalogKey> = {
  canvas: "tabs.canvas",
  steps: "tabs.steps",
  fields: "tabs.fields",
  dataSources: "tabs.dataSources",
  paths: "tabs.paths",
  forms: "tabs.forms",
  matrix: "tabs.matrix",
  contract: "tabs.contract",
  changes: "tabs.changes",
  checks: "tabs.checks",
};

/** Forced colors promise system contrast for every visible letter, and a fade
 * lowers it on a partly visible tab. Each fade style drops its mask under this
 * query, and the row's scrollbar stays the cue. */
const FORCED_COLORS = "@media (forced-colors: active)";

const styles = stylex.create({
  // The row scrolls sideways rather than wrapping: ten tabs overflow a narrow
  // window, and a second line would move the body down a row on every resize
  // (design.md Risks). The 2px divider under it is the structural rule between
  // the row and the body.
  row: {
    display: "flex",
    alignItems: "stretch",
    gap: space.s1,
    flex: "none",
    flexWrap: "nowrap",
    overflowX: "auto",
    overscrollBehavior: "contain",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    // Contains the Checks tab's hidden "blocking a publish" text; a
    // positioned container clips and scrolls it instead of the page. It also
    // makes each button's `offsetLeft` read against the row's content.
    position: "relative",
    // `scrollTabIntoRow` stops 32px clear of each edge the row can still
    // scroll past, outside the 24px fade and the tab's 4px focus ring.
    // `tabRestsInView` reads this value back off the computed style.
    scrollPaddingInline: space.s8,
    // A fade style's mask holds two layers. The gradient covers the band, the
    // row's `clientHeight`, which the resize observer writes as
    // `--tab-row-band`. The solid layer covers the rest, so the scrollbar and
    // the 2px divider keep full strength. With no fade style these size no image.
    maskSize: "100% var(--tab-row-band, 100%), 100% calc(100% - var(--tab-row-band, 100%))",
    maskPosition: "top, bottom",
    maskRepeat: "no-repeat",
  },
  // One style per `fadeState` value other than `"none"`. Each gradient runs
  // transparent at a fading edge to opaque 24px in from it. The opaque stops
  // read `colors.text`; a mask reads alpha alone, so that color never reaches
  // the screen.
  fadeStart: {
    maskImage: {
      default: `linear-gradient(to right, transparent, ${colors.text} ${space.s6}), linear-gradient(${colors.text}, ${colors.text})`,
      [FORCED_COLORS]: "none",
    },
  },
  fadeEnd: {
    maskImage: {
      default: `linear-gradient(to left, transparent, ${colors.text} ${space.s6}), linear-gradient(${colors.text}, ${colors.text})`,
      [FORCED_COLORS]: "none",
    },
  },
  fadeBoth: {
    maskImage: {
      default: `linear-gradient(to right, transparent, ${colors.text} ${space.s6}, ${colors.text} calc(100% - ${space.s6}), transparent), linear-gradient(${colors.text}, ${colors.text})`,
      [FORCED_COLORS]: "none",
    },
  },
  tab: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    flex: "none",
    whiteSpace: "nowrap",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: "inherit",
    borderWidth: 0,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  // The open tab, from a JS-computed check reading the same `aria-selected`
  // the button already carries. The written face holds two weights and no
  // third, so the mark is the accent rule under the tab plus weight 800.
  tabSelected: {
    fontWeight: 800,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
  tabCount: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
  },
  // The Checks tab's own count when the draft's worst open issue is a
  // blocker: the one tab whose count also reads as a publish-readiness
  // signal. `colors.refusal` is the same token the checks rail's own
  // held-back and blocker states already read (`studio-process-tabs`).
  // Weight 800 is the written face's own second weight, the one
  // `tabSelected` above already reads, so the row keeps one weight
  // vocabulary. It carries the state at a glance, where color alone reads
  // slowly.
  tabCountBlocker: {
    color: colors.refusal,
    fontWeight: 800,
  },
  // Off screen, never `display: none`: a hidden node is announced by no
  // engine. Carries the blocker state's text equivalent, since the color
  // above reaches no screen reader (`EntityTabs.tsx`'s own move-announcer
  // style is the precedent for this exact pattern in this area).
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});

interface Props {
  open: ProcessTab;
  /** What each tab prints beside its name. `undefined` prints nothing. */
  counts: Record<ProcessTab, number | undefined>;
  /** True when the loaded draft's worst open issue is a blocker. Colors only
   * the Checks tab's own count; every other tab's count stays uncolored,
   * clear or advisory-only leaves the Checks count uncolored too
   * (`studio-process-tabs`). */
  checksBlocked: boolean;
  onOpen: (tab: ProcessTab) => void;
  /** True while the JSON surface stands in place of the tab body. No tab
   * reports itself selected while it is open — the header bar's `⋮` menu is
   * what opens and leaves that surface; this row only reads the state. */
  jsonOpen: boolean;
}

/**
 * What the live region below carries after a blocked-state transition.
 * `null` leaves it as it stands.
 *
 * Only the clear-to-blocker edge announces. A fix resolving is a different
 * concern, and the reverse transition stays silent (design.md Non-Goals).
 * That edge still empties the region rather than leaving the sentence
 * standing: both edges write the same constant, so a second rise into
 * blocker would otherwise re-set identical text, mutate no text node and
 * reach no screen reader. Measured in a real browser before this branch
 * existed — the count recolored while a `MutationObserver` on the region
 * counted zero mutations. Emptying a polite region announces nothing itself.
 *
 * Extracted because this repo ships no DOM test library, so no test here can
 * fire the effect that calls it (`studio-draftProvider-chainingFetch.test.ts`
 * states the same convention).
 */
export function announcementAfter(was: boolean, now: boolean, sentence: string): string | null {
  if (now) return was ? null : sentence;
  return "";
}

/** Which edges of the tab row fade. */
export type FadeState = "none" | "start" | "end" | "both";

/** The slack every row measure allows. It absorbs a fractional `scrollLeft`
 * on a high-density screen. */
const SLACK_PX = 1;

/**
 * Which edges of the tab row fade, from the row's own scroll measures
 * (`studio-process-tabs`). The leading edge fades once `scrollLeft` passes
 * 1px. The trailing edge fades while more than 1px of content lies past the
 * view.
 */
export function fadeState(scrollLeft: number, clientWidth: number, scrollWidth: number): FadeState {
  const start = scrollLeft > SLACK_PX;
  const end = scrollWidth - clientWidth - scrollLeft > SLACK_PX;
  if (start) return end ? "both" : "start";
  return end ? "end" : "none";
}

/**
 * Whether a tab's box rests in the row's view (`studio-process-tabs`). The
 * box stands whole inside the visible range. At each edge the row can still
 * scroll past, it also keeps `padding` clear. At an edge where `scrollLeft`
 * sits at its limit, 0 or `scrollWidth - clientWidth`, the padding counts as
 * met. Each measure allows 1px of slack, as in `fadeState`.
 *
 * `tabStart` and `tabEnd` read against the row's content, as a button's
 * `offsetLeft` does inside the positioned row.
 */
export function tabRestsInView(
  tabStart: number,
  tabEnd: number,
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  padding: number,
): boolean {
  const atStart = scrollLeft <= SLACK_PX;
  const atEnd = scrollWidth - clientWidth - scrollLeft <= SLACK_PX;
  const viewStart = scrollLeft + (atStart ? 0 : padding);
  const viewEnd = scrollLeft + clientWidth - (atEnd ? 0 : padding);
  return tabStart >= viewStart - SLACK_PX && tabEnd <= viewEnd + SLACK_PX;
}

/**
 * The one call that scrolls the tab row (`studio-process-tabs`). The row
 * moves by the least distance that brings the button whole into view, clear
 * of the row's scroll padding, and jumps there. A tab already in view leaves
 * the row where it stands. Each caller focuses with `preventScroll: true`
 * first, so this call alone decides where the row stands.
 */
export function scrollTabIntoRow(button: HTMLElement): void {
  button.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
}

/** `tabRestsInView` over the live row and the open tab's button. The padding
 * comes off the row's computed scroll padding, so the record and the scroll
 * read one value. */
function openTabRests(row: HTMLElement | null, button: HTMLElement | null): boolean {
  if (row === null || button === null) return false;
  const padding = Number.parseFloat(getComputedStyle(row).scrollPaddingInlineStart) || 0;
  const start = button.offsetLeft;
  return tabRestsInView(start, start + button.offsetWidth, row.scrollLeft, row.clientWidth, row.scrollWidth, padding);
}

/**
 * Whether a resize report moved an element's width, given the width its last
 * report held (`undefined` before any). A first report counts as a move. It
 * arrives at the first rendering update after `observe()`, and a count
 * printed before that update has already widened a tab.
 */
export function widthMoved(was: number | undefined, width: number): boolean {
  return was !== width;
}

/** True for a keyboard focus. An engine that cannot parse `:focus-visible`
 * reads false, so its pointer presses never scroll. */
function focusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

/**
 * The process surface's tab row (`studio-process-tabs`). Ten tabs in
 * authoring order, and nothing else — the trailing edge is the last tab.
 *
 * The keyboard model is roving-tabindex, per `spa-accessibility`'s own named
 * exception for a tab set carrying many tabs in one line that scrolls
 * sideways. This row is the one tab set of that shape in the browser
 * packages. The whole row is one stop in the page's tab order: the focused
 * tab carries `tabindex="0"` and the other nine `tabindex="-1"`. The left and
 * right arrow keys move focus, wrapping at the row's ends, and Enter or Space
 * opens the focused tab. Ten plain stops would cost a keyboard user ten Tab
 * presses to cross the row. Every other tab set keeps the plain-button model.
 */
export function ProcessTabRow({ open, counts, checksBlocked, onOpen, jsonOpen }: Props) {
  const [focusedTab, setFocusedTab] = useState<ProcessTab>(open);
  const [announcement, setAnnouncement] = useState("");
  const [fade, setFade] = useState<FadeState>("none");
  const tabRefs = useRef(new Map<ProcessTab, HTMLButtonElement>());
  const wasBlocked = useRef(checksBlocked);
  const rowRef = useRef<HTMLDivElement>(null);
  // The open tab's button, for the resize observer, which serves every tab.
  const openButton = useRef<HTMLButtonElement | null>(null);
  // Whether the open tab rests in view, as of the last scroll event or the
  // last `scrollTabIntoRow` call this component made. A call that moves
  // nothing fires no scroll event, so each call records it as well.
  const openRests = useRef(false);

  // Opening a tab brings focus and selection back together, whatever opened
  // it (`studio-process-tabs`). A click on the already-open tab moves no
  // selection, so the `onFocus` below is what re-seats the stop in that case.
  useEffect(() => {
    setFocusedTab(open);
  }, [open]);

  // The open tab stands whole in view on mount and after every tab change,
  // whatever changed the tab. A layout effect: a passive one would paint the
  // row at its old position for one frame, then jump. A pointer press opens
  // its tab on `click`, after the press ends, so the row never moves under it.
  useLayoutEffect(() => {
    const button = tabRefs.current.get(open) ?? null;
    openButton.current = button;
    if (button !== null) scrollTabIntoRow(button);
    openRests.current = openTabRests(rowRef.current, button);
  }, [open]);

  // One observer over the row and its ten buttons. A window resize moves the
  // row's width, and a count's digits move a button's. The callback writes
  // the band the fade mask sizes its gradient to, and recomputes the fade.
  // A row width change scrolls the open tab back into view. A button width
  // change scrolls it only while it rested in view, so a tab the author
  // scrolled away by hand stays where it is. The first report counts as a
  // move (`widthMoved`): its scroll moves nothing when no width changed since
  // the layout effect, and corrects the row when a count printed in between.
  useEffect(() => {
    const row = rowRef.current;
    if (row === null || typeof ResizeObserver === "undefined") return;
    const widths = new Map<Element, number>();
    const observer = new ResizeObserver((entries) => {
      let rowMoved = false;
      let tabMoved = false;
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const was = widths.get(entry.target);
        widths.set(entry.target, width);
        if (!widthMoved(was, width)) continue;
        if (entry.target === row) rowMoved = true;
        else tabMoved = true;
      }
      row.style.setProperty("--tab-row-band", `${row.clientHeight}px`);
      const button = openButton.current;
      if (button !== null && (rowMoved || (tabMoved && openRests.current))) scrollTabIntoRow(button);
      setFade(fadeState(row.scrollLeft, row.clientWidth, row.scrollWidth));
      openRests.current = openTabRests(row, button);
    });
    observer.observe(row);
    for (const button of tabRefs.current.values()) observer.observe(button);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const row = rowRef.current;
    if (row === null) return;
    setFade(fadeState(row.scrollLeft, row.clientWidth, row.scrollWidth));
    openRests.current = openTabRests(row, openButton.current);
  };

  useEffect(() => {
    const next = announcementAfter(wasBlocked.current, checksBlocked, t("tabs.checksBlockingAnnounced"));
    if (next !== null) setAnnouncement(next);
    wasBlocked.current = checksBlocked;
  }, [checksBlocked]);

  // Arrow keys move focus alone; they open no tab. That is the WAI-ARIA tabs
  // pattern's manual-activation variant, and `FieldMatrixGrid.tsx`'s own grid
  // reads the same way. Opening a studio tab mounts a canvas, a grid or a form
  // editor, so a stray arrow press must not swap the body by accident.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    // A key event from anything but one of the ten tab buttons is not ours.
    const from = PROCESS_TABS.findIndex((tab) => tabRefs.current.get(tab) === e.target);
    if (from === -1) return;
    // `preventDefault` on the two arrow keys alone, so the row's own sideways
    // scroll does not fire beside the focus move.
    e.preventDefault();
    const next = PROCESS_TABS[(from + step + PROCESS_TABS.length) % PROCESS_TABS.length];
    if (next === undefined) return;
    setFocusedTab(next);
    const button = tabRefs.current.get(next);
    if (button === undefined) return;
    button.focus({ preventScroll: true });
    scrollTabIntoRow(button);
    openRests.current = openTabRests(rowRef.current, openButton.current);
  };

  // A pointer press focuses its button on `mousedown`, and a scroll then would
  // move the button before `mouseup`, so the click would miss it. No engine
  // matches a press against `:focus-visible`, and a Tab-key entry does match,
  // so only a keyboard focus scrolls here.
  const onTabFocus = (tab: ProcessTab, button: HTMLButtonElement) => {
    setFocusedTab(tab);
    if (!focusVisible(button)) return;
    scrollTabIntoRow(button);
    openRests.current = openTabRests(rowRef.current, openButton.current);
  };

  return (
    <>
    <div
      ref={rowRef}
      {...stylex.props(
        styles.row,
        fade === "start" && styles.fadeStart,
        fade === "end" && styles.fadeEnd,
        fade === "both" && styles.fadeBoth,
      )}
      role="tablist"
      aria-label={t("tabs.rowLabel")}
      onKeyDown={onKeyDown}
      onScroll={onScroll}
    >
      {PROCESS_TABS.map((tab) => {
        const count = counts[tab];
        // The JSON surface stands no tab, so none reports itself selected
        // while it is open (`studio-app`: "The surface SHALL stand no tab
        // while the JSON surface is open").
        const selected = !jsonOpen && tab === open;
        const blocked = tab === "checks" && checksBlocked;
        return (
          <button
            key={tab}
            id={tabDomId(tab)}
            ref={(node) => {
              if (node) tabRefs.current.set(tab, node);
              else tabRefs.current.delete(tab);
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tabPanelDomId(tab)}
            tabIndex={tab === focusedTab ? 0 : -1}
            {...stylex.props(styles.tab, selected && styles.tabSelected)}
            onClick={() => onOpen(tab)}
            onFocus={(e) => onTabFocus(tab, e.currentTarget)}
          >
            <span>{t(TAB_LABEL[tab])}</span>
            {count !== undefined && (
              <span {...stylex.props(styles.tabCount, blocked && styles.tabCountBlocker)}>{count}</span>
            )}
            {blocked && <span {...stylex.props(styles.visuallyHidden)}>{t("tabs.checksBlocking")}</span>}
          </button>
        );
      })}
    </div>
    {/* Outside the `tablist`, whose ARIA content model owns `tab` children
      * alone. Mounted at all times and empty until the edge above fills it,
      * so the engine announces a change rather than an arrival. Polite: a
      * blocker appearing is not worth interrupting what is already speaking. */}
    <p {...stylex.props(styles.visuallyHidden)} role="status" aria-live="polite">
      {announcement}
    </p>
    </>
  );
}
