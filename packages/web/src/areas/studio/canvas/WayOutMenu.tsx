import { useId, type RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, focus, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { menuKeyTarget, typeAheadIndex, type WayOutMenuItem } from "./wayOutMenuLogic";

/** The gap between the step's node and the menu, above or below it. */
const MENU_GAP_PX = 4;

const styles = stylex.create({
  // The canvas bar menu's box: a hairline frame on paper, no radius, no
  // shadow. `position: fixed` and the offsets come from `openWayOutMenu`.
  menu: {
    margin: 0,
    padding: 0,
    minWidth: "18rem",
    maxWidth: "24rem",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    // The UA stylesheet hides a closed popover; the open state's "flex" wins
    // the cascade the same way the canvas bar menu's does.
    display: { default: "none", ":popover-open": "flex" },
    flexDirection: "column",
  },
  // The Label style: 11px, uppercase, tracked, slate.
  heading: {
    margin: 0,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  // Scrolls past half the viewport. The padding and the scroll padding keep a
  // focused item's ring inside the box (`spa-accessibility`).
  list: {
    display: "flex",
    flexDirection: "column",
    maxHeight: "50vh",
    overflowY: "auto",
    padding: focus.reach,
    scrollPadding: focus.reach,
  },
  // One register row: the body face, flush left, a hairline under it. The
  // text wraps rather than clips.
  item: {
    display: "block",
    width: "100%",
    margin: 0,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: colors.text,
    font: "inherit",
    textAlign: "left",
    overflowWrap: "anywhere",
    cursor: "pointer",
  },
  // The separator draws the rule; the last row needs none.
  itemUnruled: {
    borderBottomWidth: 0,
  },
  // The 2px divider, so it reads apart from the 1px row rules.
  separator: {
    flexShrink: 0,
    height: 2,
    backgroundColor: colors.divider,
  },
});

/** The menu items' buttons, in item order, with their item index. */
function itemButtons(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
}

function focusItem(menu: HTMLElement, index: number): void {
  menu.querySelector<HTMLButtonElement>(`[data-menu-index="${index}"]`)?.focus({ preventScroll: true });
}

/** `hidePopover()` throws on a panel that is not showing. */
function hideMenu(menu: HTMLElement | null): void {
  try {
    menu?.hidePopover();
  } catch {
    // already hidden
  }
}

/**
 * Opens the menu beside `anchor`, the node's client rect, and focuses its
 * first item. The placement runs once `showPopover()` has returned, since a
 * popover still has no layout at `beforetoggle`. Both writes run before the
 * next paint: first 4px under the node, then 4px above it when the bottom
 * passes the viewport.
 */
export function openWayOutMenu(menu: HTMLElement, anchor: DOMRect): void {
  menu.showPopover();
  menu.style.position = "fixed";
  const width = menu.getBoundingClientRect().width;
  menu.style.left = `${Math.max(0, Math.min(anchor.left, window.innerWidth - width))}px`;
  menu.style.top = `${anchor.bottom + MENU_GAP_PX}px`;
  const box = menu.getBoundingClientRect();
  if (box.bottom > window.innerHeight) menu.style.top = `${Math.max(0, anchor.top - MENU_GAP_PX - box.height)}px`;
  itemButtons(menu)[0]?.focus({ preventScroll: true });
}

interface Props {
  menuRef: RefObject<HTMLDivElement | null>;
  items: WayOutMenuItem[];
  /** Adds the way out an item names. Enter, Space and a click all reach it. */
  onPick: (item: WayOutMenuItem) => void;
  /** Hands focus back to the source step. Runs on the closed edge, only while
   * focus sits inside the menu or on the page body. */
  onReturnFocus: () => void;
}

/**
 * The way-out menu: a heading, then a `role="menu"` of the steps, a separator
 * and "A new step". It renders outside the canvas frame, so Panzoom's press
 * and wheel handlers never see it and its keys never reach the canvas's.
 */
export function WayOutMenu({ menuRef, items, onPick, onReturnFocus }: Props) {
  const headingId = useId();

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    const at = Number((e.target as Element).closest("[data-menu-index]")?.getAttribute("data-menu-index") ?? 0);
    if (e.key === "Tab") {
      e.preventDefault();
      hideMenu(menu);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const stepped = menuKeyTarget(e.key, at, items);
    if (stepped !== undefined) {
      e.preventDefault();
      focusItem(menu, stepped);
      return;
    }
    // A printable letter jumps by name. Space stays the button's own.
    if (e.key.length === 1 && e.key !== " ") {
      e.preventDefault();
      const found = typeAheadIndex(items, at, e.key);
      if (found !== undefined) focusItem(menu, found);
    }
  };

  const onToggle = (e: React.ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== "closed") return;
    const active = document.activeElement;
    if (active === null || active === document.body || menuRef.current?.contains(active)) onReturnFocus();
  };

  const pick = (item: WayOutMenuItem) => {
    hideMenu(menuRef.current);
    onPick(item);
  };

  return (
    <div ref={menuRef} popover="auto" {...stylex.props(styles.menu)} onKeyDown={onKeyDown} onToggle={onToggle}>
      <p id={headingId} {...stylex.props(styles.heading)}>
        {t("canvas.wayOutMenuHeading")}
      </p>
      <div role="menu" aria-labelledby={headingId} {...stylex.props(styles.list)}>
        {items.map((item, i) =>
          item.kind === "separator" ? (
            <div key="separator" role="separator" {...stylex.props(styles.separator)} />
          ) : (
            <button
              key={item.kind === "step" ? item.stepId : "newStep"}
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-menu-index={i}
              {...stylex.props(styles.item, (i === items.length - 1 || items[i + 1]?.kind === "separator") && styles.itemUnruled)}
              onClick={() => pick(item)}
            >
              {item.text}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
