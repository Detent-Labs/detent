import type { KeyboardEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { nextTabIndex } from "form-ui";
import { colors, focus, space } from "form-ui/tokens.stylex";
import type { ProcessTab, TabView } from "../routing.js";

/** A sub-row entry's own element id, and the id of the view body it controls.
 * Both are exported so the tab body can stamp the matching `aria-labelledby`
 * on each view body without repeating the format: `tabDomId`'s pattern, one
 * level down. */
export const subTabDomId = (tab: ProcessTab, view: TabView) => `studio-subtab-${tab}-${view}`;
export const subTabPanelDomId = (tab: ProcessTab, view: TabView) => `studio-subtabpanel-${tab}-${view}`;

const styles = stylex.create({
  // One line at every width, scrolling sideways in its own container rather
  // than wrapping, as the form tab strip does. `overflowX` resolves
  // `overflow-y` to `auto` as well, so `focus.reach` pads both axes and the
  // scroll padding keeps that room when a focus scroll stops short of either
  // end (`studio-focus-ring-clipping`). The 2px divider under it is the rule
  // between the sub-row and the view body.
  row: {
    display: "flex",
    alignItems: "stretch",
    flexWrap: "nowrap",
    flex: "none",
    gap: space.s1,
    paddingBlock: focus.reach,
    paddingInline: focus.reach,
    scrollPaddingInline: focus.reach,
    overflowX: "auto",
    overscrollBehavior: "contain",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  // `FormTabStrip.tsx`'s own tab: 14px pinned text with an explicit 1.5, so
  // the entry does not depend on an ambient size.
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
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: 1.5,
    textAlign: "left",
    cursor: "pointer",
  },
  // The open entry: the accent rule under it plus weight 800, the written
  // face's own second weight and no third.
  tabSelected: {
    fontWeight: 800,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
});

interface Props {
  /** The tab this sub-row belongs to, for the DOM ids. */
  tab: ProcessTab;
  /** The tab's views, in sub-row order, each with its catalog label. */
  views: readonly { id: TabView; label: string }[];
  open: TabView;
  onOpen: (view: TabView) => void;
  /** The tablist's accessible name. */
  label: string;
}

/**
 * The strip of a tab's own views, under the tab row (`studio-process-tabs`:
 * "A sub-row holds a tab's views"). The Fields and Settings tabs carry one.
 *
 * The keyboard model is the plain-button pattern `spa-accessibility` gives an
 * ordinary tab set: each entry is its own stop in the tab order, and a
 * `<button>`'s own Enter and Space handling opens the focused one. No entry
 * carries a `tabindex`. The arrow keys, `Home` and `End` also move focus,
 * through `form-ui`'s `nextTabIndex`, as on the form tab strip. The entry
 * prints no count.
 */
export function SubRow({ tab, views, open, onOpen, label }: Props) {
  // Arrow keys, `Home` and `End` move focus alone; they open no view.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const from = buttons.findIndex((b) => b === e.target);
    const next = nextTabIndex(e.key, from, buttons.length);
    if (next === undefined) return;
    e.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div {...stylex.props(styles.row)} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {views.map((view) => {
        const selected = view.id === open;
        return (
          <button
            key={view.id}
            id={subTabDomId(tab, view.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={subTabPanelDomId(tab, view.id)}
            {...stylex.props(styles.tab, selected && styles.tabSelected)}
            onClick={() => onOpen(view.id)}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
