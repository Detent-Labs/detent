import { useState, type KeyboardEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { mergeLocalizedTextEntry, resolveDraftLocalizedText, type DraftLocalizedText } from "../draft/localized-text";
import type { DraftViewTab } from "../draft/view-layout";

/** The tab button's own element id, and the id of the canvas it controls.
 * Both are exported so `FormEditorScreen` can stamp the matching
 * `aria-labelledby` on the canvas without repeating the format. The
 * `studio-form-` prefix keeps them apart from `form-ui`'s own
 * `form-ui-tab-…`, which the participant preview on this same screen
 * already emits for the same tab keys. */
export const formTabDomId = (key: string) => `studio-form-tab-${key}`;
export const formTabPanelDomId = (key: string) => `studio-form-tabpanel-${key}`;

/**
 * The tab a focus-moving key press moves focus to, as an index into the drawn
 * strip; `undefined` for a key the strip leaves alone. Arrow keys wrap at the
 * row's ends, and `Home` and `End` jump to it.
 *
 * Focus moves alone: `Enter` and `Space` are what open a tab, and a
 * `<button>` turns both into the click this strip listens for. These four
 * keys are a convenience OVER the plain-button pattern, not the
 * roving-tabindex variant (`form-ui`'s own strip spec) — every tab here stays
 * tabbable, and no tab carries a `tabIndex`.
 *
 * A copy of `packages/form-ui/src/FieldForm.tsx`'s own `nextTabIndex`, which
 * the package does not export. The two strips share the tokens and no code:
 * the dependency direction forbids `form-ui` importing from `packages/web`,
 * and design.md accepts that cost for one tab language. Extracted here for
 * the same reason it is extracted there — this repo ships no DOM test
 * library, so no test can fire the event that calls it.
 */
export function nextTabIndex(key: string, from: number, count: number): number | undefined {
  if (count === 0 || from < 0 || from >= count) return undefined;
  if (key === "ArrowRight") return (from + 1) % count;
  if (key === "ArrowLeft") return (from - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
}

const styles = stylex.create({
  // The row wraps rather than scrolling sideways: a form's own tabs are few,
  // where the process surface's ten are not, and the canvas under this row
  // must not move down a line on every resize.
  row: {
    display: "flex",
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: space.s1,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    marginBottom: space.s3,
  },
  tabs: {
    display: "flex",
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: space.s1,
    minWidth: 0,
  },
  // `ProcessTabRow.tsx`'s own tab, character for character (design.md
  // "Visual direction": one tab language, two strips).
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
  // The open tab: the accent rule under it plus weight 800, the written
  // face's own second weight and no third.
  tabSelected: {
    fontWeight: 800,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
  // The authoring controls, at the strip's TRAILING end. A participant never
  // gets them, which is why they carry the mono face the machine marks on the
  // canvas already read, not the tabs' own written face.
  controls: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.s1,
    marginLeft: "auto",
  },
  control: {
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  rename: {
    fontFamily: fonts.mono,
    fontSize: 11,
    minWidth: "8rem",
  },
});

interface Props {
  /** The draft's own tabs, in strip order. Empty draws the add control
   * alone (`studio-form-editor`: "A form with no tab SHALL show the strip's
   * add control alone"). */
  tabs: DraftViewTab[];
  /** The tab the canvas is showing — `shownTab`'s answer, so it always names
   * one of `tabs` or nothing at all. */
  open: string | undefined;
  contentLocale: string;
  baseLocale: string;
  onOpen: (key: string) => void;
  onAdd: () => void;
  onRename: (key: string, label: DraftLocalizedText) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onRemove: (key: string) => void;
}

/**
 * The form's own tab strip, above the canvas (`studio-form-editor`: "A tab
 * strip above the canvas authors the form's tabs"). Outside the JSON view it
 * is the only control that writes `view.tabs`.
 *
 * The keyboard model is the plain-button pattern `spa-accessibility` gives an
 * ordinary tab set: each tab is its own stop in the tab order, and a
 * `<button>`'s own Enter and Space handling is what opens the focused one.
 * The roving-tabindex variant that spec names is reserved for a many-tab row
 * that scrolls sideways, which is `ProcessTabRow.tsx` above this one and
 * nothing else.
 *
 * Every write leaves through a callback: the screen owns the draft, and this
 * component holds one piece of state, which tab the author is renaming.
 */
export function FormTabStrip({ tabs, open, contentLocale, baseLocale, onOpen, onAdd, onRename, onMove, onRemove }: Props) {
  const [renaming, setRenaming] = useState<string | undefined>(undefined);
  // A tab mid-mint with no `key` draws nothing: no entry can name it, and the
  // strip's own DOM ids are built from the key.
  const drawn = tabs.filter((tab): tab is DraftViewTab & { key: string } => !!tab.key);
  const openIndex = drawn.findIndex((tab) => tab.key === open);
  const openTab = openIndex === -1 ? undefined : drawn[openIndex];
  const renamingOpen = openTab !== undefined && renaming === openTab.key;

  // Arrow keys, `Home` and `End` move focus alone; a `<button>`'s own `Enter`
  // and `Space` handling is what opens the focused tab. The participant's
  // strip answers the same four keys, so one area holds one behavior.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const from = buttons.findIndex((b) => b === e.target || b.contains(e.target as Node));
    const next = nextTabIndex(e.key, from, buttons.length);
    if (next === undefined) return;
    // `preventDefault` on the four handled keys alone, so a wrapped row's own
    // scroll does not fire beside the focus move.
    e.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div {...stylex.props(styles.row)}>
      {drawn.length > 0 && (
        <div {...stylex.props(styles.tabs)} role="tablist" aria-label={t("formEditor.tabRowLabel")} onKeyDown={onKeyDown}>
          {drawn.map((tab) => {
            const selected = tab.key === open;
            return (
              <button
                key={tab.key}
                id={formTabDomId(tab.key)}
                type="button"
                role="tab"
                aria-selected={selected}
                // The open tab alone. One canvas is in the DOM, so
                // `aria-controls` on a closed tab would name an element that
                // is not there.
                aria-controls={selected ? formTabPanelDomId(tab.key) : undefined}
                {...stylex.props(styles.tab, selected && styles.tabSelected)}
                onClick={() => {
                  setRenaming(undefined);
                  onOpen(tab.key);
                }}
              >
                {resolveDraftLocalizedText(tab.label, contentLocale, baseLocale) || t("formEditor.unnamedTab")}
              </button>
            );
          })}
        </div>
      )}
      <div {...stylex.props(styles.controls)}>
        {/* Outside the `tablist`, whose ARIA content model owns `tab`
            children alone. It writes the content locale on every keystroke,
            the way every other authored-text input in this area does, so
            leaving it needs no commit gesture: Enter, Escape and a blur all
            just close it. autoFocus: the single input of an editor the
            developer just opened by an explicit click. */}
        {renamingOpen && (
          <input
            type="text"
            autoFocus
            aria-label={t("formEditor.tabName")}
            {...ghost(styles.rename)}
            value={openTab.label?.[contentLocale] ?? ""}
            onChange={(e) => onRename(openTab.key, mergeLocalizedTextEntry(openTab.label, contentLocale, e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setRenaming(undefined);
            }}
            onBlur={() => setRenaming(undefined)}
          />
        )}
        <button type="button" {...ghost(styles.control)} onClick={onAdd}>
          {t("formEditor.addTab")}
        </button>
        {openTab !== undefined && (
          <>
            <button type="button" {...ghost(styles.control)} onClick={() => setRenaming(openTab.key)}>
              {t("formEditor.renameTab")}
            </button>
            <button type="button" {...ghost(styles.control)} disabled={openIndex === 0} onClick={() => onMove(openTab.key, -1)}>
              {t("formEditor.moveTabLeft")}
            </button>
            <button
              type="button"
              {...ghost(styles.control)}
              disabled={openIndex === drawn.length - 1}
              onClick={() => onMove(openTab.key, 1)}
            >
              {t("formEditor.moveTabRight")}
            </button>
            <button
              type="button"
              {...ghost(styles.control)}
              onClick={() => {
                setRenaming(undefined);
                onRemove(openTab.key);
              }}
            >
              {t("formEditor.removeTab")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** `btn btn-ghost` plus a compiled style, as one set of props. Spreading
 * `stylex.props(...)` beside a `className` attribute drops whichever of the
 * two the JSX writes first, so the two class lists are joined here instead —
 * the same join the form canvas already makes for a note card. */
function ghost(style: stylex.StyleXStyles) {
  const compiled = stylex.props(style);
  return { ...compiled, className: `btn btn-ghost ${compiled.className ?? ""}`.trim() };
}
