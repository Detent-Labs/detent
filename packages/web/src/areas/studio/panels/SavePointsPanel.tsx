import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listSavePoints } from "../api/client.js";
import type { SavePointList } from "../api/types.js";
import { t } from "../catalog.js";
import { describeCaughtError } from "../errors.js";
import { relativeAgo } from "../screens/processListLogic.js";
import { is401 } from "../../../shell/useFail.js";
import type { DraftToolbarActions } from "./DraftToolbar.js";
import { ABSOLUTE_TIME } from "./DiscardDraftDialog.js";
import { RemoveSavePointDialog, RestoreSavePointDialog, type SavePointRow } from "./SavePointDialogs.js";
import {
  SAVE_POINT_NAME_MAX,
  atBound,
  boundSentence,
  createLanding,
  entryFocus,
  movesToBound,
  nameDecision,
  removeLanding,
  removeRowLabel,
  restoreLanding,
  restoreRowLabel,
  savedLineTemplate,
  viewState,
} from "./savePointsLogic.js";
import { activeControl } from "./shared/dialogFocus.js";

const styles = stylex.create({
  // One subject on a plain page: a column at a reading width, with no box around it.
  column: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space.s4,
    maxWidth: "40rem",
  },
  help: {
    margin: 0,
    color: colors.textMuted,
  },
  // The design language's field: label above control, 4px apart.
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    margin: 0,
  },
  label: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: space.s2,
  },
  input: {
    flex: "1 1 16rem",
    minWidth: 0,
  },
  // Errors list in mono at 12px in the refusal tone, a sibling of the label.
  inputError: {
    margin: 0,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.refusal,
    overflowWrap: "anywhere",
  },
  // The bound's sentence takes the form's place, and the focus when the form leaves.
  bound: {
    margin: 0,
    outline: "none",
  },
  status: {
    margin: 0,
    overflowWrap: "anywhere",
  },
  waiting: {
    margin: 0,
    color: colors.textMuted,
  },
  empty: {
    margin: 0,
    color: colors.textMuted,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // The entity rail's register: a hairline under each row, content flush left.
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s2,
    paddingBlock: space.s2,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  identity: {
    flex: "1 1 14rem",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  name: {
    overflowWrap: "anywhere",
  },
  savedLine: {
    fontSize: "0.9rem",
    color: colors.textMuted,
  },
  actions: {
    display: "flex",
    gap: space.s2,
  },
  errorBanner: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s3,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.refusal,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    margin: 0,
  },
  errorBannerStamp: {
    flex: "none",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: colors.refusal,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
    transform: "rotate(-2deg)",
  },
  errorBannerMessage: {
    flex: 1,
    color: colors.text,
    overflowWrap: "anywhere",
  },
});

/** The saved line: "Saved by Roman, 3 minutes ago", or "Saved 3 minutes ago" where no name resolves. */
function SavedLine({ point, now }: { point: SavePointRow; now: number }) {
  const by = point.createdByDisplayName;
  const [before = "", after = ""] = savedLineTemplate(by).split("{when}");
  // A function fills the slot, so a `$` pattern in a name prints as written.
  const fill = (part: string) => (by == null ? part : part.replace("{name}", () => by));
  return (
    <span {...stylex.props(styles.savedLine)}>
      {fill(before)}
      <time dateTime={point.createdAt} title={ABSOLUTE_TIME.format(new Date(point.createdAt))}>
        {relativeAgo(point.createdAt, now)}
      </time>
      {fill(after)}
    </span>
  );
}

interface BodyProps {
  /** The server's list, or undefined before its first answer and after a failed one. */
  list: SavePointList | undefined;
  /** The failed fetch's message, printed where the rows would stand. */
  fetchFailure: string | undefined;
  /** Epoch milliseconds, read once per answer. */
  now: number;
  name: string;
  nameError: string | undefined;
  /** A request runs. The controls that start another stand `aria-disabled`, so the focus stays. */
  acting: boolean;
  /** The status line: what the last create or restore did. */
  status: string;
  inputRef: RefObject<HTMLInputElement | null>;
  boundRef: RefObject<HTMLParagraphElement | null>;
  onName: (name: string) => void;
  onCreate: () => void;
  onRestore: (point: SavePointRow, opener: HTMLElement | null) => void;
  onRemove: (point: SavePointRow, opener: HTMLElement | null) => void;
  onReload: () => void;
}

/**
 * The view's markup over plain data (`studio-app`: "The Save points view lists a
 * draft's save points"). One subject on a plain page: the form stands from the
 * first commit, and the rows' place holds a waiting line, the rows, a sentence
 * for none, or a banner for a failed fetch. No key, id, revision or hash prints.
 */
export function SavePointsBody({
  list,
  fetchFailure,
  now,
  name,
  nameError,
  acting,
  status,
  inputRef,
  boundRef,
  onName,
  onCreate,
  onRestore,
  onRemove,
  onReload,
}: BodyProps) {
  const inputId = useId();
  const errorId = useId();
  const view = viewState(list, fetchFailure !== undefined);
  const bound = view.form === "bound";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!acting) onCreate();
  };

  return (
    <div {...stylex.props(styles.column)}>
      <p {...stylex.props(styles.help)}>{t("savePoints.help")}</p>
      {bound && list !== undefined ? (
        <p ref={boundRef} tabIndex={-1} {...stylex.props(styles.bound)}>
          {boundSentence(list.limit)}
        </p>
      ) : (
        <form onSubmit={submit} noValidate {...stylex.props(styles.field)}>
          <label htmlFor={inputId} {...stylex.props(styles.label)}>
            {t("savePoints.nameLabel")}
          </label>
          <div {...stylex.props(styles.controls)}>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={name}
              maxLength={SAVE_POINT_NAME_MAX}
              autoComplete="off"
              aria-invalid={nameError !== undefined || undefined}
              aria-describedby={nameError !== undefined ? errorId : undefined}
              onChange={(event) => onName(event.target.value)}
              {...stylex.props(styles.input)}
            />
            <button type="submit" className="btn btn-secondary" aria-disabled={acting || undefined}>
              {t("savePoints.create")}
            </button>
          </div>
          {nameError !== undefined && (
            <p id={errorId} role="alert" {...stylex.props(styles.inputError)}>
              {nameError}
            </p>
          )}
        </form>
      )}
      <p role="status" {...stylex.props(styles.status)}>
        {status}
      </p>
      {view.rows === "waiting" && <p {...stylex.props(styles.waiting)}>{t("savePoints.loading")}</p>}
      {view.rows === "failed" && (
        <div role="alert" {...stylex.props(styles.errorBanner)}>
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>
            {t("savePoints.loadFailed")} {fetchFailure}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onReload}>
            {t("savePoints.tryAgain")}
          </button>
        </div>
      )}
      {view.rows === "empty" && <p {...stylex.props(styles.empty)}>{t("savePoints.empty")}</p>}
      {view.rows === "list" && list !== undefined && (
        <ul {...stylex.props(styles.list)}>
          {list.items.map((point) => (
            <li key={point.savePointId} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.identity)}>
                <span {...stylex.props(styles.name)}>{point.name}</span>
                <SavedLine point={point} now={now} />
              </div>
              <div {...stylex.props(styles.actions)}>
                {/* At the bound a restore would keep a point the draft has no room for. `aria-disabled` keeps the focus a native `disabled` would drop. */}
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-label={restoreRowLabel(point.name)}
                  aria-disabled={bound || undefined}
                  onClick={(event) => {
                    if (!bound) onRestore(point, event.currentTarget);
                  }}
                >
                  {t("savePoints.restore")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-destructive"
                  aria-label={removeRowLabel(point.name)}
                  onClick={(event) => onRemove(point, event.currentTarget)}
                >
                  {t("savePoints.remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SavePointActions = Pick<DraftToolbarActions, "createSavePoint" | "restoreSavePoint" | "removeSavePoint">;

interface Props {
  processId: string;
  token: string;
  /** True while the Settings tab stands open on this view. The first true commit fetches. */
  visible: boolean;
  /** Counts the `⋮` entry's presses. Each moves the focus to the input, or to the bound's sentence. */
  focusRequest: number;
  actions: SavePointActions;
  onUnauthorized: () => void;
}

type OpenDialog = { act: "restore" | "remove"; point: SavePointRow; refusal: string | undefined };

/**
 * The Settings tab's Save points view (`studio-app`, `design.md` D10). It fetches
 * on its first visible commit and after each act, since every Settings view
 * stays mounted and an unopened one should cost nothing. A refetch keeps the old
 * rows until its answer, so Restore keeps its focus. The hook owns the acts.
 */
export function SavePointsPanel({ processId, token, visible, focusRequest, actions, onUnauthorized }: Props) {
  const [opened, setOpened] = useState(false);
  const [list, setList] = useState<SavePointList | undefined>(undefined);
  const [fetchFailure, setFetchFailure] = useState<string | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [fetching, setFetching] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState("");
  const [acting, setActing] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // The input takes the focus once the refetch after a remove has answered.
  const [inputAfterFetch, setInputAfterFetch] = useState(false);
  // Counts the answers that reached the bound under the input's focus.
  const [boundMoves, setBoundMoves] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const boundRef = useRef<HTMLParagraphElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const latest = useRef(0);
  const listRef = useRef(list);
  listRef.current = list;
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;
  const handledFocus = useRef(0);

  // Adjusted during render, as the Fields tab's views do: no effect, no extra commit.
  if (visible && !opened) setOpened(true);

  const load = useCallback(() => {
    const mine = ++latest.current;
    setFetching(true);
    listSavePoints(processId, token).then(
      (answer) => {
        if (mine !== latest.current) return;
        // Read before the commit: the bound takes the input away.
        const inputHeld = inputRef.current !== null && document.activeElement === inputRef.current;
        if (movesToBound({ inputHeld, atBound: atBound(listRef.current) }, { atBound: atBound(answer) })) setBoundMoves((n) => n + 1);
        setList(answer);
        setFetchFailure(undefined);
        setNow(Date.now());
        setFetching(false);
      },
      (err: unknown) => {
        if (mine !== latest.current) return;
        setFetching(false);
        if (is401(err)) {
          onUnauthorizedRef.current();
          return;
        }
        setList(undefined);
        setFetchFailure(describeCaughtError(err));
      },
    );
  }, [processId, token]);

  useEffect(() => {
    if (opened) load();
    return () => {
      latest.current += 1;
    };
  }, [opened, load]);

  // The bound took the input while it held the focus.
  useEffect(() => {
    if (boundMoves > 0) boundRef.current?.focus();
  }, [boundMoves]);

  // After a remove: the commit that drops the row also returns the input at the bound.
  useEffect(() => {
    if (!inputAfterFetch || fetching) return;
    setInputAfterFetch(false);
    (entryFocus(atBound(list)) === "bound" ? boundRef.current : inputRef.current)?.focus();
  }, [inputAfterFetch, fetching, list]);

  // The `⋮` entry: the input, or the sentence where it stands in its place. Before the
  // list answers the input stands, and the bound rule above moves the focus if it must.
  useEffect(() => {
    if (!visible || focusRequest === handledFocus.current) return;
    handledFocus.current = focusRequest;
    (entryFocus(atBound(list)) === "bound" ? boundRef.current : inputRef.current)?.focus();
  }, [visible, focusRequest, list]);

  const create = async () => {
    const decision = nameDecision(name);
    if (decision.kind === "empty") {
      setNameError(t("savePoints.nameRequired"));
      return;
    }
    setActing(true);
    setNameError(undefined);
    setStatus("");
    try {
      const outcome = await actions.createSavePoint(decision.name);
      const landing = createLanding(outcome, decision.name);
      if (landing.clearName) setName("");
      if (landing.status !== undefined) setStatus(landing.status);
      if (landing.inputError !== undefined) setNameError(landing.inputError);
      if (landing.refetch) load();
      // A press on the control leaves the focus there. The input holds it, so a
      // create that reaches the bound moves it from the input.
      if (outcome.kind === "done") inputRef.current?.focus();
    } finally {
      setActing(false);
    }
  };

  const openDialog = (act: OpenDialog["act"], point: SavePointRow, trigger: HTMLElement | null) => {
    opener.current = trigger ?? activeControl();
    setStatus("");
    setDialog({ act, point, refusal: undefined });
  };

  const confirmAct = async () => {
    if (dialog === null) return;
    const { act, point } = dialog;
    setActing(true);
    setDialog({ act, point, refusal: undefined });
    try {
      const landing =
        act === "restore"
          ? restoreLanding(await actions.restoreSavePoint(point), point.name)
          : removeLanding(await actions.removeSavePoint(point.savePointId));
      if (landing.dialog === "stay") {
        setDialog({ act, point, refusal: landing.refusal });
        return;
      }
      setDialog(null);
      if (landing.status !== undefined) setStatus(landing.status);
      if (landing.focusInputAfter) setInputAfterFetch(true);
      if (landing.refetch) load();
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <SavePointsBody
        list={list}
        fetchFailure={fetchFailure}
        now={now}
        name={name}
        nameError={nameError}
        acting={acting}
        status={status}
        inputRef={inputRef}
        boundRef={boundRef}
        onName={(next) => {
          setName(next);
          setNameError(undefined);
        }}
        onCreate={() => void create()}
        onRestore={(point, trigger) => openDialog("restore", point, trigger)}
        onRemove={(point, trigger) => openDialog("remove", point, trigger)}
        onReload={load}
      />
      {dialog?.act === "restore" && (
        <RestoreSavePointDialog
          point={dialog.point}
          refusal={dialog.refusal}
          busy={acting}
          triggerRef={opener}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmAct()}
        />
      )}
      {dialog?.act === "remove" && (
        <RemoveSavePointDialog
          point={dialog.point}
          refusal={dialog.refusal}
          busy={acting}
          triggerRef={opener}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmAct()}
        />
      )}
    </>
  );
}
