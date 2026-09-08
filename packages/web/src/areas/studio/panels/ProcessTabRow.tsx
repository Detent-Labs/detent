import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { MoreHorizontal } from "lucide-react";
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
  // The overflow control keeps the trailing edge whatever the row scrolls to.
  overflow: {
    position: "relative",
    flex: "none",
    marginLeft: "auto",
    display: "flex",
    alignItems: "stretch",
  },
  overflowPanel: {
    position: "absolute",
    right: 0,
    top: "100%",
    zIndex: 1,
    minWidth: "16rem",
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    padding: space.s2,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  menuItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in srgb, ${colors.text} 7%, transparent)`,
    },
    color: colors.text,
    borderWidth: 0,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    font: "inherit",
    cursor: "pointer",
  },
});

interface Props {
  open: ProcessTab;
  /** What each tab prints beside its name. `undefined` prints nothing. */
  counts: Record<ProcessTab, number | undefined>;
  onOpen: (tab: ProcessTab) => void;
  /** True while the JSON surface stands in place of the tab body. The row
   * still renders: the overflow entry is how an author leaves that surface. */
  jsonOpen: boolean;
  onToggleJson: () => void;
  onVersions: () => void;
  onPlayer: () => void;
}

/**
 * The process surface's tab row (`studio-process-tabs`). Ten tabs in authoring
 * order, then the overflow menu holding what is not a tab: the JSON surface,
 * Versions and Player.
 *
 * The keyboard model is the area's own, per `spa-accessibility`'s tab pattern:
 * every tab is its own stop in the tab order, the way a button is, and Enter or
 * Space opens the focused one. It carries no roving tab stop and binds no
 * arrow key, so the row introduces no second model beside the one the rest of
 * the area follows.
 *
 * The JSON entry names its own state, so an author reads from the entry whether
 * it opens the surface or leaves it.
 */
export function ProcessTabRow({ open, counts, onOpen, jsonOpen, onToggleJson, onVersions, onPlayer }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocument = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDocument);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocument);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div {...stylex.props(styles.row)} role="tablist" aria-label={t("tabs.rowLabel")}>
      {PROCESS_TABS.map((tab) => {
        const count = counts[tab];
        // The JSON surface stands no tab, so none reports itself selected
        // while it is open (`studio-app`: "The surface SHALL stand no tab
        // while the JSON surface is open").
        const selected = !jsonOpen && tab === open;
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
            {count !== undefined && <span {...stylex.props(styles.tabCount)}>{count}</span>}
          </button>
        );
      })}
      <div {...stylex.props(styles.overflow)} ref={menuRef}>
        <button
          type="button"
          className="btn btn-ghost"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("tabs.overflowTrigger")}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {menuOpen && (
          <div {...stylex.props(styles.overflowPanel)} role="menu">
            <button
              type="button"
              role="menuitem"
              {...stylex.props(styles.menuItem)}
              onClick={() => runMenuAction(onToggleJson)}
            >
              {t(jsonOpen ? "tabs.overflowJsonLeave" : "tabs.overflowJsonOpen")}
            </button>
            <button type="button" role="menuitem" {...stylex.props(styles.menuItem)} onClick={() => runMenuAction(onVersions)}>
              {t("tabs.overflowVersions")}
            </button>
            <button type="button" role="menuitem" {...stylex.props(styles.menuItem)} onClick={() => runMenuAction(onPlayer)}>
              {t("tabs.overflowPlayer")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
