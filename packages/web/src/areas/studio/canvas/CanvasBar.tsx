import { useId, useRef, useState, type ToggleEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { ChevronDown } from "lucide-react";
import { t } from "../catalog.js";
import { newStepNote, newStepPhrase } from "../draft/guided-labels.js";
import type { StepKind } from "../draft/createStep.js";
import { groupMembersDomId } from "./CanvasView.js";
import { canGroup, groupMatching, type StepGroup } from "./groups.js";
import { dragDelta, exceedsClickThreshold, type Point } from "./geometry.js";

/** Mirrors `--space-1`: the gap `Chrome.tsx`'s account menu sits below its own
 * trigger by. */
const MENU_GAP_PX = 4;

/**
 * The two kinds the menu names (`studio-guided-vocabulary`): a call to
 * another process, and an end. Add step is the press and drag source for the
 * third kind, a step someone works, so the menu lists only the two kinds Add
 * step does not add.
 */
const MENU_KINDS: readonly StepKind[] = ["subprocess", "end"];

const styles = stylex.create({
  // The ledger rule under the tab row: one flex row, content flush left, a
  // hairline against the canvas below it. Zero radius, no shadow. No
  // minHeight: Add step is the tallest control in every selection state, so
  // its own height is the row's floor (`studio-canvas`'s "The bar stands one
  // control row tall").
  bar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: space.s3,
    paddingBlock: space.s2,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    // Below ~760px the row's controls outrun the viewport (Ungroup is the
    // last to go). A scrollbar keeps every control reachable by pointer
    // instead of clipping the tail with no hint.
    overflowX: "auto",
  },
  // Nothing in the row shrinks: a shrunk button wraps its own label, which
  // would grow the bar. Narrow-window behaviour is design.md's own open
  // question, and a browser check answers it.
  control: {
    flexShrink: 0,
  },
  // Add step and its caret read as one control pair, so they share one
  // hairline rather than stacking two.
  addGroup: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    position: "relative",
  },
  caret: {
    marginLeft: -1,
    paddingInline: space.s2,
  },
  unconnectedReport: {
    flexShrink: 0,
    color: colors.textMuted,
    whiteSpace: "nowrap",
  },
  selectionReport: {
    display: "flex",
    alignItems: "baseline",
    flexShrink: 0,
    gap: space.s2,
    whiteSpace: "nowrap",
  },
  selectionCount: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
  },
  // The one exception `DESIGN.md`'s Fields list carries: a toolbar field's
  // label sits beside the field, not above it, so the row never grows past
  // the height Add step already sets. No `cursor: grab`: nothing in the bar
  // drags a group.
  groupNameField: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    flexShrink: 0,
  },
  // The design language's field label: 11px, uppercase, tracked 0.1em, in
  // slate (mirrors `StepPage.tsx`'s `fieldLabelText`), now flush against the
  // input beside it instead of floated above it.
  groupNameLabelText: {
    fontSize: 11,
    lineHeight: 1,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
    whiteSpace: "nowrap",
  },
  // The button's own type, 14px at `line-height: normal`: inheriting the
  // body's 15px at that same `normal` drew the input one pixel taller than
  // Add step, which would grow the bar past its floor.
  groupNameInput: {
    width: "9rem",
    fontSize: 14,
    lineHeight: "normal",
  },
  // The popover's own top-layer promotion strips any CSS anchoring to the
  // trigger, so the panel's position is set inline off the trigger's live
  // rect each time it opens.
  menu: {
    left: "auto",
    right: "auto",
    top: "auto",
    bottom: "auto",
    margin: 0,
    zIndex: 1,
    minWidth: "18rem",
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.surface,
    // The UA stylesheet's [popover]:not(:popover-open){display:none} hides it
    // while closed; an explicit "none" here matches that, deliberately, so
    // the open state's "flex" wins the cascade the same way.
    display: { default: "none", ":popover-open": "flex" },
    flexDirection: "column",
  },
  // A register row: a hairline between rows, content flush left. The last
  // row's own rule would double the panel's border, so it carries none.
  menuItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s1,
    width: "100%",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: colors.text,
    borderWidth: 0,
    borderBottomWidth: { default: 1, ":last-child": 0 },
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "grab",
    touchAction: "none",
  },
  menuItemNote: {
    color: colors.textMuted,
    fontSize: "0.85rem",
  },
  // Follows the pointer during a drag. Screen-fixed (`position: fixed`,
  // client coordinates straight from the pointer event) since the drag
  // crosses from the bar over the canvas, outside either element's own local
  // coordinate space.
  ghost: {
    position: "fixed",
    zIndex: 3,
    transform: "translate(-50%, -50%)",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.accent,
    color: colors.text,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    fontSize: "0.85rem",
    pointerEvents: "none",
  },
});

interface Props {
  /** A press with no drag: add a step of this kind at the visible canvas
   * centre. */
  onAddStep: (kind: StepKind) => void;
  /** A drag's release, in screen (client) coordinates: the bar holds no canvas
   * geometry, so resolving a client point to a canvas point is the caller's
   * job. */
  onDrop: (kind: StepKind, clientX: number, clientY: number) => void;
  /** Every pointer move a drag makes, same coordinates. */
  onDragMove: (kind: StepKind, clientX: number, clientY: number) => void;
  /** The canvas selection, in selection order. */
  selectedStepIds: string[];
  /** True when exactly one step is selected and no chain of paths reaches it.
   * The caller resolves it through `reachableStepIds`. */
  unconnected: boolean;
  /** Deletes every step in the selection. */
  onDeleteSelection: () => void;
  groups: StepGroup[];
  onGroupsChange: (groups: StepGroup[]) => void;
}

/** A live drag out of one of the four add controls. */
interface BarDrag {
  kind: StepKind;
  /** Where the press landed, in client coordinates. Decides press against
   * drag. */
  start: Point;
  /** Where the pointer stands now, same coordinates. Places the ghost. */
  at: Point;
  /** Set once the pointer passed `CLICK_THRESHOLD`, and never cleared while
   * the drag lives: a return to the press point stays a drag. */
  moved: boolean;
}

/**
 * The canvas bar (`studio-canvas`), the row between the tab row and the
 * canvas. It carries the three add controls, the selection's own count and
 * controls, and one selected step's reachability report.
 *
 * Every add control is both a button and a drag source. A press adds a step
 * at the visible canvas centre, which the caller computes; a drag adds one at
 * the drop point, reported in screen (client) coordinates for the caller to
 * resolve against the live canvas.
 */
export function CanvasBar({
  onAddStep,
  onDrop,
  onDragMove,
  selectedStepIds,
  unconnected,
  onDeleteSelection,
  groups,
  onGroupsChange,
}: Props) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The Popover API wires no ARIA state of its own, so `aria-expanded` stays
  // hand-set here, driven by the same toggle that opens and closes the panel.
  const [expanded, setExpanded] = useState(false);
  const [drag, setDrag] = useState<BarDrag | null>(null);
  // A pointer-captured release fires a click on the control it started from,
  // wherever the pointer landed. That click must not add a second step.
  const suppressClick = useRef(false);

  // Fires on both directions of the toggle; only the opening edge needs a
  // position. Left-aligned under the caret, unlike the account menu's own
  // right alignment.
  const onMenuBeforeToggle = (e: ToggleEvent<HTMLDivElement>) => {
    setExpanded(e.newState === "open");
    if (e.newState !== "open") return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || !menuRef.current) return;
    menuRef.current.style.position = "fixed";
    menuRef.current.style.top = `${rect.bottom + MENU_GAP_PX}px`;
    menuRef.current.style.left = `${rect.left}px`;
  };

  /** `hidePopover()` throws on a panel that is not showing, and a drag out of
   * the Add step button releases with no menu open. */
  const hideMenu = () => {
    try {
      menuRef.current?.hidePopover();
    } catch {
      // already hidden
    }
  };

  const onPointerDown = (e: React.PointerEvent, kind: StepKind) => {
    // The flag's own reset. A drop sets it for a click that two paths can
    // swallow: a failed capture retargets the release off the button, and a
    // menu entry sits in a `display: none` subtree once the release hides the
    // panel. Left standing, it would eat the next press instead.
    suppressClick.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // best-effort, matching CanvasView's own capturePointer
    }
    const at = { x: e.clientX, y: e.clientY };
    setDrag({ kind, start: at, at, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const at = { x: e.clientX, y: e.clientY };
    const moved = drag.moved || exceedsClickThreshold(dragDelta(drag.start, at));
    setDrag({ ...drag, at, moved });
    // Under the threshold the press has not become a drag, so the canvas gets
    // no drop-target highlight that a press would then leave standing.
    if (moved) onDragMove(drag.kind, at.x, at.y);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    // Under the threshold this was a press, and the click handler adds the
    // step. Nothing here fires, so a stray press never drops.
    if (!drag.moved) return;
    // The menu closes on the release, never on the press: a hidden popover's
    // item leaves the tree, which drops the pointer capture and ends the drag
    // (design D3).
    hideMenu();
    suppressClick.current = true;
    onDrop(drag.kind, e.clientX, e.clientY);
  };

  const onPointerCancel = () => {
    if (!drag) return;
    setDrag(null);
    // A cancel fires no release, so the caller's own drop-target highlight
    // would stand until the next drag started. The callback it already reads
    // carries the retraction: a point outside the viewport hits no element,
    // so the caller's hit test resolves it to no path.
    if (drag.moved) onDragMove(drag.kind, -1, -1);
  };

  /** The press path, which the keyboard reaches too: a focused control's
   * Enter or Space fires a click and no pointer event at all. */
  const onActivate = (kind: StepKind) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    hideMenu();
    onAddStep(kind);
  };

  const dragProps = (kind: StepKind) => ({
    onPointerDown: (e: React.PointerEvent) => onPointerDown(e, kind),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick: () => onActivate(kind),
  });

  const matched = groupMatching(selectedStepIds, groups);

  return (
    <div {...stylex.props(styles.bar)}>
      <div {...stylex.props(styles.addGroup)}>
        <button
          type="button"
          className={`btn btn-secondary ${stylex.props(styles.control).className ?? ""}`.trim()}
          {...dragProps("task")}
        >
          {t("canvas.addStep")}
        </button>
        <button
          ref={triggerRef}
          type="button"
          className={`btn btn-secondary ${stylex.props(styles.control, styles.caret).className ?? ""}`.trim()}
          aria-label={t("canvas.addStepMore")}
          aria-expanded={expanded}
          aria-haspopup="menu"
          popoverTarget={menuId}
          popoverTargetAction="toggle"
        >
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <div
          id={menuId}
          ref={menuRef}
          {...stylex.props(styles.menu)}
          role="menu"
          popover="auto"
          onBeforeToggle={onMenuBeforeToggle}
        >
          {MENU_KINDS.map((kind) => (
            <button key={kind} type="button" role="menuitem" {...stylex.props(styles.menuItem)} {...dragProps(kind)}>
              <span>{newStepPhrase(kind)}</span>
              <span {...stylex.props(styles.menuItemNote)}>{newStepNote(kind)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* One step selected reports its reachability, then offers Remove;
          several report their count instead, then Remove steps; nothing
          selected reports neither (`studio-canvas`). */}
      {selectedStepIds.length === 1 && unconnected && (
        <span {...stylex.props(styles.unconnectedReport)}>{t("canvas.unconnected")}</span>
      )}

      {selectedStepIds.length === 1 && (
        <button
          type="button"
          className={`btn btn-secondary btn-destructive ${stylex.props(styles.control).className ?? ""}`.trim()}
          onClick={onDeleteSelection}
        >
          {t("canvas.selectionRemoveOne")}
        </button>
      )}

      {selectedStepIds.length > 1 && (
        <>
          <span {...stylex.props(styles.selectionReport)}>
            <span>{t("canvas.selectionHeading")}</span>
            <span {...stylex.props(styles.selectionCount)}>{selectedStepIds.length}</span>
          </span>
          <button
            type="button"
            className={`btn btn-secondary btn-destructive ${stylex.props(styles.control).className ?? ""}`.trim()}
            onClick={onDeleteSelection}
          >
            {t("canvas.selectionRemove")}
          </button>
          {/* One selection, three states: a set no group holds offers
              grouping, a set that IS a group offers that group's own
              controls, and a set spanning a group's members and others offers
              neither. The canvas keeps no group selection of its own. */}
          {matched ? (
            <>
              <label {...stylex.props(styles.groupNameField)}>
                <span {...stylex.props(styles.groupNameLabelText)}>{t("canvas.groupName")}</span>
                <input
                  {...stylex.props(styles.groupNameInput)}
                  value={matched.name}
                  onChange={(e) => onGroupsChange(groups.map((g) => (g.id === matched.id ? { ...g, name: e.target.value } : g)))}
                />
              </label>
              <button
                type="button"
                className={`btn btn-secondary ${stylex.props(styles.control).className ?? ""}`.trim()}
                // The same attribute the canvas box's own disclosure carries.
                // Both write this one `collapsed` flag, so neither may report
                // it as a pressed state instead. `aria-controls` names the
                // members `<g>`, and only where the box draws: below two
                // members `drawnBox` returns nothing and no wrapper exists to
                // name. A step delete can leave a group at one member.
                aria-expanded={matched.collapsed !== true}
                aria-controls={matched.stepIds.length > 1 ? groupMembersDomId(matched.id) : undefined}
                onClick={() => onGroupsChange(groups.map((g) => (g.id === matched.id ? { ...g, collapsed: !g.collapsed } : g)))}
              >
                {matched.collapsed ? t("canvas.groupExpand") : t("canvas.groupCollapse")}
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${stylex.props(styles.control).className ?? ""}`.trim()}
                onClick={() => onGroupsChange(groups.filter((g) => g.id !== matched.id))}
              >
                {t("canvas.groupUngroup")}
              </button>
            </>
          ) : (
            canGroup(selectedStepIds, groups) && (
              <button
                type="button"
                className={`btn btn-secondary ${stylex.props(styles.control).className ?? ""}`.trim()}
                onClick={() =>
                  onGroupsChange([
                    ...groups,
                    { id: `grp_${crypto.randomUUID()}`, stepIds: [...selectedStepIds], name: t("canvas.groupDefaultName") },
                  ])
                }
              >
                {t("canvas.groupCreate")}
              </button>
            )
          )}
        </>
      )}

      {drag?.moved && (
        <div {...stylex.props(styles.ghost)} style={{ left: drag.at.x, top: drag.at.y }} aria-hidden="true">
          {newStepPhrase(drag.kind)}
        </div>
      )}
    </div>
  );
}
