import { Children, createContext, isValidElement, use, useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, focus, fonts, shadow, space } from "form-ui/tokens.stylex";
import { t } from "../../catalog.js";
import { btn } from "./btn.js";
import { activeControl, dialogFocusables, wrapTarget } from "./dialogFocus.js";

const styles = stylex.create({
  // `::backdrop` stays a literal rule in `shell/global.css`, matched by the
  // `studio-dialog` class beside this compiled style. The dialog is the one
  // scroll box, so arrow keys scroll it with Cancel focused. The end padding
  // stays 0 for the sticky footer, and the end scroll padding keeps a Tab stop
  // clear of that footer.
  dialog: {
    width: "min(34rem, 100% - 32px)",
    maxWidth: "none",
    maxHeight: "85vh",
    overflowY: "auto",
    overscrollBehavior: "contain",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.divider,
    paddingBlockStart: `max(${space.s4}, ${focus.reach})`,
    paddingInline: `max(${space.s4}, ${focus.reach})`,
    paddingBlockEnd: 0,
    scrollPaddingBlockStart: focus.reach,
    scrollPaddingBlockEnd: "5rem",
    backgroundColor: colors.surface,
    color: colors.text,
    boxShadow: shadow.lg,
  },
  // The Headline style over the global `h2`'s uppercase, tracking and slate, so
  // an author's label prints in the capitals they typed.
  heading: {
    fontSize: "1.25rem",
    letterSpacing: "-0.015em",
    textTransform: "none",
    color: colors.text,
    marginBlockStart: 0,
    marginBlockEnd: space.s3,
    marginInline: 0,
    overflowWrap: "anywhere",
  },
  footer: {
    position: "sticky",
    bottom: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBlockStart: space.s3,
    paddingBlock: space.s3,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  facts: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, max-content) minmax(0, 1fr)",
      "@media (max-width: 30rem)": "minmax(0, 1fr)",
    },
    columnGap: space.s3,
    rowGap: space.s1,
    alignItems: "baseline",
    marginBlock: space.s3,
    marginInline: 0,
  },
  // The Legend style. Below 30rem the columns stack, and 8px parts one row's
  // value from the next term.
  term: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    marginBlockStart: {
      default: 0,
      "@media (max-width: 30rem)": { default: space.s2, ":first-child": 0 },
    },
  },
  value: {
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  mono: {
    fontFamily: fonts.mono,
  },
  tabular: {
    fontVariantNumeric: "tabular-nums",
  },
  names: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // The fold's summary, in the body face at the list's own size.
  moreNames: {
    cursor: "pointer",
    color: colors.textMuted,
  },
  note: {
    color: colors.textMuted,
    fontSize: "0.9rem",
    marginBlock: space.s3,
    overflowWrap: "anywhere",
  },
  // The warning callout (`DESIGN.md`).
  warning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
    marginBlock: space.s3,
    overflowWrap: "anywhere",
  },
  refusal: {
    color: colors.refusal,
    whiteSpace: "pre-line",
    marginBlock: space.s3,
    overflowWrap: "anywhere",
  },
  // The server's own text for a refusal, kept as it came, line breaks and all.
  refusalDetail: {
    fontFamily: fonts.mono,
    fontSize: "0.9rem",
    marginBlock: space.s2,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  developer: {
    marginBlock: space.s3,
  },
  developerSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
});

const BusyContext = createContext(false);

/**
 * Opens a mounted dialog modally, holds the keyboard inside it, puts the
 * initial focus on Cancel or on `initialFocusRef`, and returns focus to
 * whatever the caller's trigger ref holds when the dialog unmounts.
 *
 * The caller owns the trigger ref: it points the ref at the control that
 * opened the dialog, and renders the dialog only while it is pending. A caller
 * whose confirm removes or remounts that control clears the ref before it
 * unmounts the dialog, so the cleanup below finds nothing to focus. That caller
 * then places the focus itself, after the commit that unmounts the dialog: the
 * page behind stands inert until then.
 *
 * Three separate mechanisms hold the initial focus, because none of them alone
 * holds:
 *
 * The `autoFocus` prop on Cancel states the intent and is the property a
 * rendered string carries, so a static-markup test can assert it. It serves the
 * markup alone. On the client it is NOT an attribute: React 19 skips it in
 * `setProp` and calls `.focus()` from `commitMount`, and a focus inside a closed
 * dialog does nothing, so the opener keeps the focus until `showModal()`.
 *
 * `showModal()` runs the dialog's own focusing steps. Those steps look for the
 * `autofocus` ATTRIBUTE, find none, and fall to the first focusable descendant,
 * which for a dialog whose first control commits an irreversible act would prime
 * that act instead. Those steps may also scroll to it. So the effect focuses
 * again after `showModal()`. It resets the scroll last, leaving the heading in
 * view: a tab panel's `scrollKeyboardFocusIntoView` runs on that focus, and
 * scrolls a control inside the end scroll padding.
 *
 * The cleanup covers every route that unmounts the dialog: Cancel, Escape, and
 * a completed request all end with the caller unmounting it. Without this
 * cleanup, focus drops to `<body>` and a keyboard user restarts their traversal
 * from the top of the screen.
 *
 * The keyboard hold listens on `document`, since the focus can stand on `body`,
 * where a listener on the dialog never hears Tab. A blur leaves it there, and a
 * click on a dialog's text leaves it on the dialog in Chromium. An empty list
 * still takes the `preventDefault()`, so a busy dialog with both controls
 * disabled keeps the focus from leaving.
 */
function useStudioDialog(triggerRef: RefObject<HTMLElement | null>, initialFocusRef?: RefObject<HTMLElement | null>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    (initialFocusRef?.current ?? cancelRef.current)?.focus({ preventScroll: true });
    if (dialog) dialog.scrollTop = 0;
    return () => triggerRef.current?.focus();
  }, [triggerRef, initialFocusRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog?.open) return;
      const focusables = dialogFocusables(dialog);
      const target = wrapTarget(focusables, activeControl(), event.shiftKey);
      if (target === undefined && focusables.length > 0) return;
      event.preventDefault();
      target?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { dialogRef, cancelRef };
}

interface StudioDialogProps {
  heading: string;
  /** The control that opened this dialog, for the focus return. */
  triggerRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  /** `DestructiveConfirm` or `PrimaryConfirm`. A choice with nothing to confirm has none. */
  confirm?: ReactNode;
  /** A `DialogRefusal`. It stands outside the described body. */
  refusal?: ReactNode;
  /** Disables both controls and ignores Escape. */
  busy?: boolean;
  /** Takes the opening focus from Cancel, for a dialog that commits nothing. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

/**
 * The studio's one dialog: a heading, the described body, the refusal, then a
 * sticky footer with the confirm and Cancel. Cancel is no prop, so no caller can
 * omit it, relabel it or put it first.
 */
export function StudioDialog({ heading, triggerRef, onCancel, confirm, refusal, busy = false, initialFocusRef, children }: StudioDialogProps) {
  const { dialogRef, cancelRef } = useStudioDialog(triggerRef, initialFocusRef);
  const headingId = useId();
  const bodyId = useId();
  const refusalRef = useRef<HTMLDivElement>(null);
  const hasRefusal = Boolean(refusal);

  // A disabled control drops the focus, so a request that ends hands it back.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (busy || !dialog?.open) return;
    const active = document.activeElement;
    if (active === dialog || !dialog.contains(active)) cancelRef.current?.focus({ preventScroll: true });
  }, [busy, dialogRef, cancelRef]);

  // A refusal under a long list still shows.
  useEffect(() => {
    if (hasRefusal) refusalRef.current?.scrollIntoView({ block: "nearest" });
  }, [hasRefusal]);

  return (
    <dialog
      ref={dialogRef}
      {...btn("studio-dialog", styles.dialog)}
      aria-labelledby={headingId}
      aria-describedby={confirm ? bodyId : undefined}
      // The caller unmounts the dialog, so the platform never closes one React
      // still holds.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      // Chromium's close watcher can skip `cancel` on a repeat press and close
      // natively, and `close` fires for that route alone. A busy dialog opens
      // again. Its focusing steps can land on a Developer view's summary, so the
      // blur leaves the focus for the request's end to hand to Cancel.
      onClose={() => {
        const dialog = dialogRef.current;
        if (!busy) onCancel();
        else if (dialog) {
          dialog.showModal();
          activeControl()?.blur();
          dialog.scrollTop = 0;
        }
      }}
    >
      <h2 id={headingId} {...stylex.props(styles.heading)}>
        {heading}
      </h2>
      <div id={bodyId}>{children}</div>
      {hasRefusal && <div ref={refusalRef}>{refusal}</div>}
      <div {...stylex.props(styles.footer)}>
        <BusyContext value={busy}>{confirm}</BusyContext>
        <button
          ref={cancelRef}
          autoFocus={initialFocusRef === undefined}
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          {t("dialog.cancel")}
        </button>
      </div>
    </dialog>
  );
}

interface ConfirmProps {
  onClick: () => void;
  children: ReactNode;
}

/** Outlined in the accent, for an act the studio cannot undo. Disabled while busy. */
export function DestructiveConfirm({ onClick, children }: ConfirmProps) {
  return (
    <button type="button" className="btn btn-secondary btn-destructive" onClick={onClick} disabled={use(BusyContext)}>
      {children}
    </button>
  );
}

/** The filled primary action. Disabled while busy. */
export function PrimaryConfirm({ onClick, children }: ConfirmProps) {
  return (
    <button type="button" className="btn btn-primary" onClick={onClick} disabled={use(BusyContext)}>
      {children}
    </button>
  );
}

/** Whether a direct child of `DialogFacts` renders a row. A Fragment counts as one. */
function rendersRow(child: ReactNode): boolean {
  if (!child) return false;
  if (!isValidElement(child)) return true;
  if (child.type === DialogCount) return (child.props as DialogCountProps).count !== 0;
  if (child.type === DialogNames) return (child.props as DialogNamesProps).names.length > 0;
  return true;
}

/** The facts list, term then value. It renders nothing when no child renders a row. */
export function DialogFacts({ children }: { children?: ReactNode }) {
  const rows = Children.toArray(children).filter(rendersRow);
  if (rows.length === 0) return null;
  return <dl {...stylex.props(styles.facts)}>{rows}</dl>;
}

function Row({ term, faces = [], children }: { term: string; faces?: stylex.StyleXStyles[]; children: ReactNode }) {
  return (
    <>
      <dt {...stylex.props(styles.term)}>{term}</dt>
      <dd {...stylex.props(styles.value, ...faces)}>{children}</dd>
    </>
  );
}

interface FactProps {
  term: string;
  children: ReactNode;
}

/** One row, value in the written face. */
export function DialogFact({ term, children }: FactProps) {
  return <Row term={term}>{children}</Row>;
}

/** One row, value in mono. It prints a zero. */
export function DialogMonoFact({ term, children }: FactProps) {
  return (
    <Row term={term} faces={[styles.mono]}>
      {children}
    </Row>
  );
}

interface DialogCountProps {
  term: string;
  count: number;
}

/** One row, value in mono tabular figures. It renders nothing at zero. */
export function DialogCount({ term, count }: DialogCountProps) {
  if (count === 0) return null;
  return (
    <Row term={term} faces={[styles.mono, styles.tabular]}>
      {count}
    </Row>
  );
}

interface DialogNamesProps {
  term: string;
  names: readonly string[];
}

/** The longest list that prints whole, and what a longer one prints before its fold. */
const NAMES_UNFOLDED = 8;
const NAMES_BEFORE_FOLD = 5;

function NameList({ names }: { names: readonly string[] }) {
  return (
    <ul {...stylex.props(styles.names)}>
      {names.map((name, index) => (
        <li key={index}>{name}</li>
      ))}
    </ul>
  );
}

/**
 * One row, value a list of names with no marker. It renders nothing for an empty
 * list. A list longer than eight prints five, and a closed disclosure holds the
 * rest and counts them.
 */
export function DialogNames({ term, names }: DialogNamesProps) {
  if (names.length === 0) return null;
  if (names.length <= NAMES_UNFOLDED) {
    return (
      <Row term={term}>
        <NameList names={names} />
      </Row>
    );
  }
  const folded = names.slice(NAMES_BEFORE_FOLD);
  return (
    <Row term={term}>
      <NameList names={names.slice(0, NAMES_BEFORE_FOLD)} />
      <details>
        <summary {...stylex.props(styles.moreNames)}>{t("dialog.moreNames").replace("{count}", () => String(folded.length))}</summary>
        <NameList names={folded} />
      </details>
    </Row>
  );
}

/** One slate paragraph. */
export function DialogNote({ children }: { children: ReactNode }) {
  return <p {...stylex.props(styles.note)}>{children}</p>;
}

/** The warning callout's form, for a blocked publish or a key collision. */
export function DialogWarning({ children }: { children: ReactNode }) {
  return <p {...stylex.props(styles.warning)}>{children}</p>;
}

/** The server's text for a refused request, in a closed Developer view. */
export function RefusalDetail({ detail }: { detail: string }) {
  return (
    <details {...stylex.props(styles.developer)}>
      <summary {...stylex.props(styles.developerSummary)}>{t("draftToolbar.dialogDeveloperView")}</summary>
      <p {...stylex.props(styles.refusalDetail)}>{detail}</p>
    </details>
  );
}

/** The refusal's alert. A closed Developer view holds the server's text, where there is one. */
export function DialogRefusal({ detail, children }: { detail?: string | null; children: ReactNode }) {
  return (
    <>
      <p {...stylex.props(styles.refusal)} role="alert">
        {children}
      </p>
      {detail != null && <RefusalDetail detail={detail} />}
    </>
  );
}

/** A closed disclosure over the machine values, as `DialogMonoFact` rows. */
export function DialogDeveloperView({ children }: { children: ReactNode }) {
  return (
    <details {...stylex.props(styles.developer)}>
      <summary {...stylex.props(styles.developerSummary)}>{t("draftToolbar.dialogDeveloperView")}</summary>
      <DialogFacts>{children}</DialogFacts>
    </details>
  );
}
