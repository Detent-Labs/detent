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
  tabCountBlocker: {
    color: colors.refusal,
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
 * The process surface's tab row (`studio-process-tabs`). Ten tabs in
 * authoring order, and nothing else — the trailing edge is the last tab.
 *
 * The keyboard model is the area's own, per `spa-accessibility`'s tab pattern:
 * every tab is its own stop in the tab order, the way a button is, and Enter or
 * Space opens the focused one. It carries no roving tab stop and binds no
 * arrow key, so the row introduces no second model beside the one the rest of
 * the area follows.
 */
export function ProcessTabRow({ open, counts, checksBlocked, onOpen, jsonOpen }: Props) {
  return (
    <div {...stylex.props(styles.row)} role="tablist" aria-label={t("tabs.rowLabel")}>
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
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tabPanelDomId(tab)}
            {...stylex.props(styles.tab, selected && styles.tabSelected)}
            onClick={() => onOpen(tab)}
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
  );
}
