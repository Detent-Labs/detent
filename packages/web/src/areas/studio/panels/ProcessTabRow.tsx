import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  const tabRefs = useRef(new Map<ProcessTab, HTMLButtonElement>());
  const wasBlocked = useRef(checksBlocked);

  // Opening a tab brings focus and selection back together, whatever opened
  // it (`studio-process-tabs`). A click on the already-open tab moves no
  // selection, so the `onFocus` below is what re-seats the stop in that case.
  useEffect(() => {
    setFocusedTab(open);
  }, [open]);

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
    tabRefs.current.get(next)?.focus();
  };

  return (
    <>
    <div {...stylex.props(styles.row)} role="tablist" aria-label={t("tabs.rowLabel")} onKeyDown={onKeyDown}>
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
            onFocus={() => setFocusedTab(tab)}
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
