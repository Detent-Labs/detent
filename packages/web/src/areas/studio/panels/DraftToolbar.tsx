import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useDraft } from "../draft/store.js";
import {
  createSavePoint as requestCreateSavePoint,
  deleteDraft,
  getDraft,
  publishDraft,
  removeSavePoint as requestRemoveSavePoint,
  restoreSavePoint as requestRestoreSavePoint,
  SAVE_TIMEOUT_MS,
  saveDraft,
} from "../api/client.js";
import { applySaveResult, applyReload, type DraftSaveState } from "../screens/draftSaveLogic.js";
import { isDraftDirty } from "../screens/draftToolbarState.js";
import {
  afterRunningSave,
  autosaveWait,
  classifySaveFailure,
  flushAnswer,
  keptPointName,
  landedEntry,
  nextDirtySince,
  nextFailure,
  nextUnconfirmed,
  savePointFailure,
  unmountPlan,
  type FlushResult,
  type SaveAnswer,
  type SaveFailure,
  type SavePointOutcome,
  type SentPair,
} from "../screens/draftAutosaveLogic.js";
import { StudioClientError } from "../api/client.js";
import { describeCaughtError, describePublishRefusal } from "../errors.js";
import { is401, useFail } from "../../../shell/useFail.js";
import type { DraftStash } from "../draft/draftStash.js";
import type { Draft } from "../draft/types.js";
import type { PublishResult, RestoredDraft, SavePointSummary } from "../api/types.js";

export interface DraftToolbarProps {
  processId: string;
  token: string;
  saveState: DraftSaveState;
  /** The `setState` signature, so a save applies its answer to the state as it
   * stands when the answer arrives, not to the state the request started from. */
  onSaveState: Dispatch<SetStateAction<DraftSaveState>>;
  /** The body last known to be persisted, and its setter — lifted into
   * `EditorArea` (design.md: "the header bar reads lifted DraftToolbar
   * state") so the header bar can read `dirtyNow`, built from `isDraftDirty`.
   * `DraftToolbar` still computes both; only where they live moved up
   * one level, mirroring how `saveState`/`onSaveState` already work. */
  savedBody: Draft;
  onSavedBodyChange: (body: Draft) => void;
  /** The layout last known to be persisted, beside `savedBody`. A save and a
   * reload advance it. The draft is dirty when the body or the layout differs
   * from these two. */
  savedLayout: Record<string, unknown>;
  onSavedLayoutChange: (layout: Record<string, unknown>) => void;
  /** Fired only from `doSave()`'s success branch — never from `reload()`'s
   * conflict-recovery branch, which calls `onSavedBodyChange` and
   * `onSavedLayoutChange` alone. A mere reload is not a save, and must not
   * advance the `lastSavedAt` the header bar's state line prints. It carries the
   * answer's revision. */
  onSaved?: (revision: number) => void;
  publishResult: PublishResult | null;
  /** A successful publish's answer. The caller raises the header bar's
   * just-published line and Versions offer from it. */
  onPublishResult: (result: PublishResult | null) => void;
  onDiscarded: () => void;
  onUnauthorized: () => void;
  /** `reload()` re-reads the draft, so it re-reads the caller's own publish
   * permission with it. Reported upward as its own callback, never folded into
   * `DraftSaveState`: that interface carries the save/conflict machine alone,
   * and `studio-draftSaveLogic.test.ts` pins its exact shape with `toEqual`.
   * `EditorArea` holds the re-read value in its own `useState` and folds it
   * over the loaded prop, the way `dockBaseVersion` already folds
   * `publishResult.version`. Without this, a stale `false` would survive the
   * one control the conflict banner offers. */
  onCanPublishChange?: (canPublish: boolean) => void;
  /** The restore notice stands. No automatic save runs until the author answers it. */
  noticeStands: boolean;
  /** Another dialog over this screen holds the automatic saves. */
  holdSaves?: boolean;
  /** Keeps work an unmount could not save, as a copy in the tab. */
  keepCopy: (copy: DraftStash) => void;
  /** A save point restore landed, and the draft holds its answer. */
  onRestored?: (record: RestoredDraft) => void;
}

/** Which confirmation dialog the header bar has open, if any. Publish and
 * discard each commit an act the developer cannot undo, so each confirms in
 * the application's own modal dialog (studio-publish, studio-app). */
export type PendingDialog = "publish" | "discard" | null;

/** The part of the hook that `root.tsx` holds for its exits: an exit saves first
 * through `flush`, and a confirmed leave dialog gives the work up through `drop`. */
export type DraftExit = Pick<DraftToolbarActions, "flush" | "drop">;

/** What `useDraftToolbarActions` exposes: the calls a trigger (a
 * button, a menu item) invokes, plus the pending/error state a presentation
 * reads to decide what to show. `saveState.conflict` stays the caller's own
 * read (it already owns `saveState`) rather than duplicated here. */
export interface DraftToolbarActions {
  saving: boolean;
  publishing: boolean;
  /** True while the discard request runs. The discard dialog disables its controls. */
  discarding: boolean;
  error: string | null;
  /** The server's own text for a refused publish, for a closed Developer view
   * beside `error`. It clears wherever `error` clears. */
  errorDetail: string | null;
  /** Set by `publish()` or the menu's `discard()`, cleared when the developer resolves
   * the dialog or the act succeeds. A refused request leaves it set, so the
   * reason renders inside the open dialog rather than behind it. */
  pendingDialog: PendingDialog;
  /** Resolves whichever dialog `pendingDialog` names. `true` runs the act,
   * `false` declines it and sends no request. */
  resolveDialog: (confirmed: boolean) => void;
  /** A save's standing failure. `retryable` says the backoff runs. `detail` is the
   * caught text, for a closed Developer view. */
  saveFailed: Pick<SaveFailure, "retryable" | "detail"> | null;
  /** Sends at once and keeps the failure until the answer replaces or clears it. */
  retry: () => void;
  /** The one way to hurry a save. It settles after the commit that answers it. It
   * keeps one identity, so a caller can hold it in a ref. */
  flush: () => Promise<FlushResult>;
  /** Marks the draft's unsaved work as given up, so the unmount sends nothing. */
  drop: () => void;
  createSavePoint: (name: string) => Promise<SavePointOutcome<SavePointSummary>>;
  /** The value names the point the restore kept. */
  restoreSavePoint: (point: Pick<SavePointSummary, "savePointId" | "name">) => Promise<SavePointOutcome<{ kept: string }>>;
  removeSavePoint: (savePointId: string) => Promise<SavePointOutcome<undefined>>;
  discard: () => void;
  /** Opens the publish dialog. Under a standing conflict it opens none and answers
   * `"conflict"`, and the caller moves the focus to the banner's Reload. */
  publish: () => "conflict" | undefined;
  reload: () => void;
  /** Routes an error the screen caught elsewhere through the same 401 rule
   * and the same `error` banner. The Arrange command reports a layout library
   * that failed to load through it. */
  reportError: (err: unknown) => void;
}

/**
 * The save/discard/publish logic `DraftToolbar` has always owned — pending
 * flags, the timer that saves the draft, the network calls, the 401 and conflict
 * handling — lives in this one hook. `EditScreen.tsx` calls it once and threads the result down as props,
 * so whichever component renders the controls (`ProcessHeaderBar` and its `⋮`
 * menu today) never reimplements the logic itself.
 *
 * It raises no native browser prompt. Publish and discard each open the
 * studio's own dialog (`StudioDialog`): `publish()` and `discard()` only set
 * `pendingDialog`, and `resolveDialog(true)` runs the act the dialog named.
 * `packages/web/test/studio-no-confirm.test.ts` guards the studio area against
 * a native `confirm()` call.
 */
export function useDraftToolbarActions({
  processId,
  token,
  saveState,
  onSaveState,
  savedBody,
  onSavedBodyChange,
  savedLayout,
  onSavedLayoutChange,
  onSaved,
  onPublishResult,
  onDiscarded,
  onUnauthorized,
  onCanPublishChange,
  noticeStands,
  holdSaves = false,
  keepCopy,
  onRestored,
}: DraftToolbarProps): DraftToolbarActions {
  const { draft, replace } = useDraft();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const clearError = () => {
    setError(null);
    setErrorDetail(null);
  };
  const fail = useFail(onUnauthorized, (e) => {
    const refusal = e instanceof StudioClientError ? describePublishRefusal(e.error, draft) : undefined;
    setError(refusal ? refusal.text : describeCaughtError(e));
    setErrorDetail(refusal ? refusal.detail : null);
  });

  const withUnauthorized = async (action: () => Promise<void>) => {
    try {
      await action();
      clearError();
    } catch (e) {
      fail(e);
    }
  };

  const [failure, setFailure] = useState<SaveFailure | undefined>(undefined);
  const [savePointActs, setSavePointActs] = useState(0);
  const dirty = useMemo(
    () => isDraftDirty(draft, savedBody, saveState.layout, savedLayout),
    [draft, savedBody, saveState.layout, savedLayout],
  );
  // A clean draft has nothing left to fail. An author may take a change back by
  // hand. Adjusted during render, as `justPublishedAfter` is.
  if (failure !== undefined && !dirty) setFailure(undefined);

  const held = noticeStands || holdSaves || pendingDialog === "discard" || savePointActs > 0;
  const dropped = useRef(false);
  const drop = useCallback(() => {
    dropped.current = true;
  }, []);
  // The request that runs. A second send cannot leave beside it, and an unmount
  // chains on it.
  const running = useRef<Promise<SaveAnswer> | undefined>(undefined);
  const lastSent = useRef<SentPair>({ draft, layout: saveState.layout });
  const dirtySince = useRef<number | undefined>(undefined);
  const unconfirmed = useRef<SentPair[]>([]);
  const flushWaiters = useRef<((result: FlushResult) => void)[]>([]);
  const [flushTick, setFlushTick] = useState(0);

  /**
   * Sends the draft as this render holds it. The answer lands in one commit, so
   * none reads "dirty, not saving, no failure" and arms a second timer. A 409 while
   * `unconfirmed` holds an entry reads the stored draft first: a lost send may have
   * committed. `savedBody` then takes the entry's draft, since `isDirty` compares
   * with `JSON.stringify` and `jsonb` reorders keys. The answer's layout replaces
   * only the entry's own, so a newer one stays dirty and saves next. It never rejects.
   */
  const doSave = (): Promise<SaveAnswer> => {
    if (running.current !== undefined) return running.current;
    const sentDraft = draft;
    const sentLayout = saveState.layout;
    const sent: SentPair = { draft: sentDraft, layout: sentLayout };
    dirtySince.current = undefined;
    lastSent.current = sent;
    setSaving(true);
    const send = async (): Promise<SaveAnswer> => {
      let answered = false;
      try {
        let result = await saveDraft(processId, { body: sentDraft, layout: sentLayout, revision: saveState.revision }, token);
        answered = true;
        let landed = sent;
        if (result === undefined && unconfirmed.current.length > 0) {
          // A hung read would hold `saving`, and every save and flush behind it, for good.
          const stored = await getDraft(processId, token, AbortSignal.timeout(SAVE_TIMEOUT_MS));
          const entry = stored && landedEntry(unconfirmed.current, stored);
          if (entry) {
            result = stored;
            landed = entry;
          }
        }
        unconfirmed.current = nextUnconfirmed(unconfirmed.current, sent, "answered");
        if (result) {
          onSavedBodyChange(landed.draft);
          onSavedLayoutChange(result.layout);
          onSaved?.(result.revision);
        }
        // Only the failure's own banner leaves. `error` may hold another act's.
        setFailure(undefined);
        onSaveState((current) => applySaveResult(current, result, landed.layout));
        return result ? { saved: true, revision: result.revision, ...landed } : { saved: false };
      } catch (e) {
        if (is401(e)) {
          fail(e);
          return { saved: false };
        }
        if (!answered) unconfirmed.current = nextUnconfirmed(unconfirmed.current, sent, classifySaveFailure(e).lost ? "lost" : "failed");
        setFailure((prior) => nextFailure(prior, sent, e));
        return { saved: false };
      } finally {
        running.current = undefined;
        setSaving(false);
      }
    };
    running.current = send();
    return running.current;
  };

  const retry = () => {
    if (!saving) void doSave();
  };

  /** A flush that fails settles false. One the screen unmounts under never settles:
   * its caller left with it, and a 401 must run no exit. */
  const flush = useCallback(
    () =>
      new Promise<FlushResult>((resolve) => {
        flushWaiters.current.push(resolve);
        // One fresh try, and that try settles it.
        setFailure(undefined);
        setFlushTick((tick) => tick + 1);
      }),
    [],
  );

  // Ahead of the timer below, so a flush that settles here reads as settled there:
  // a timer armed for a settled flush could beat the commit that holds the saves.
  useEffect(() => {
    if (flushWaiters.current.length === 0) return;
    const answer = flushAnswer({ dirty, saving, failed: failure !== undefined, conflict: saveState.conflict, revision: saveState.revision });
    if (answer === undefined) return;
    const waiters = flushWaiters.current;
    flushWaiters.current = [];
    for (const settle of waiters) settle(answer);
  }, [flushTick, dirty, saving, failure, saveState.conflict, saveState.revision]);

  // The closure holds the current draft and revision, so `doSave` reads no ref for
  // them. A commit that moves either clears the timer, and that is the debounce.
  useEffect(() => {
    if (dropped.current) return;
    const now = Date.now();
    dirtySince.current = nextDirtySince(dirtySince.current, {
      dirty,
      changed: draft !== lastSent.current.draft || saveState.layout !== lastSent.current.layout,
      now,
    });
    const wait = autosaveWait({
      dirty,
      saving,
      conflict: saveState.conflict,
      held,
      flushAsked: flushWaiters.current.length > 0,
      failure,
      changedSinceFailure: failure !== undefined && (draft !== failure.draft || saveState.layout !== failure.layout),
      dirtyFor: dirtySince.current === undefined ? 0 : now - dirtySince.current,
    });
    if (wait === undefined) return;
    const timer = setTimeout(() => void doSave(), wait);
    return () => clearTimeout(timer);
  }, [draft, saveState.layout, saveState.revision, saveState.conflict, dirty, saving, held, failure, flushTick, processId, token]);

  // What the unmount below reads. No commit follows it, so it holds the last one.
  const commit = { draft, layout: saveState.layout, revision: saveState.revision, conflict: saveState.conflict, dirty, failure, noticeStands, keepCopy, processId, token };
  const latest = useRef(commit);
  latest.current = commit;

  // An unmount that bypassed the leave rule (the browser's Back or Forward) would
  // drop a waiting change with the timer. A fetch outlives the unmount.
  useEffect(
    () => () => {
      const last = latest.current;
      const keep = (revision: number) => last.keepCopy({ body: last.draft, layout: last.layout, revision });
      const lastSave = (revision: number) => {
        saveDraft(last.processId, { body: last.draft, layout: last.layout, revision }, last.token)
          .then((result) => {
            if (result === undefined) keep(revision);
          })
          .catch(() => keep(revision));
      };
      const request = running.current;
      const plan = unmountPlan({
        dropped: dropped.current,
        noticeStands: last.noticeStands,
        running: request !== undefined,
        dirty: last.dirty,
        failed: last.failure !== undefined,
        conflict: last.conflict,
      });
      if (plan === "save") lastSave(last.revision);
      else if (plan === "keepCopy") keep(last.revision);
      else if (plan === "chain") {
        void request?.then((answer) => {
          if (dropped.current) return;
          const next = afterRunningSave(answer, last);
          if (next === "keepCopy") keep(last.revision);
          else if (next === "save" && answer.saved) lastSave(answer.revision);
        });
      }
    },
    [],
  );

  const doPublish = async () => {
    setPublishing(true);
    try {
      onPublishResult(await publishDraft(processId, token));
    } finally {
      setPublishing(false);
    }
  };

  /**
   * Opens the publish dialog and hurries a change that has not landed. It sends no
   * publish: that request leaves only from `resolveDialog(true)` (studio-publish
   * spec: "no publish request is sent until the developer confirms"). A failed save
   * closes this dialog alone, and the banner reports it. A standing conflict opens
   * none: the author would publish a stored draft that differs from the one on screen.
   */
  const publish = (): "conflict" | undefined => {
    if (saveState.conflict) return "conflict";
    // A dialog reports its own refusal alone. Without this, a failure from an
    // earlier action renders inside a dialog that has sent nothing yet, and
    // reads as a refusal of the act the developer is about to confirm.
    clearError();
    setPendingDialog("publish");
    if (!dirty && !saving) return;
    void flush().then((result) => {
      if (!result.saved) setPendingDialog((open) => (open === "publish" ? null : open));
    });
  };

  /**
   * The act the publish dialog confirms. Publish targets the persisted draft
   * (studio-publish spec), and the confirm waits while a change has not landed.
   */
  const runPublish = () =>
    withUnauthorized(async () => {
      // The slot leaves and returns, so a repeated refusal scrolls and announces again.
      clearError();
      await doPublish();
      setPendingDialog(null);
    });

  /**
   * Puts a stored draft in the editor, where current and saved coincide (design.md).
   * Without the saved-state calls, `savedBody` keeps pointing at the replaced work,
   * so a draft byte-identical to the server's reads as dirty for the rest of the
   * session. It leaves the draft clean and starts no save. No `onSaved()` here
   * (design.md): this is no save, and must not advance the `lastSavedAt` the header
   * bar's state line prints.
   */
  const adoptDraft = (record: RestoredDraft) => {
    const body = record.body as Draft;
    replace(body);
    onSavedBodyChange(body);
    unconfirmed.current = [];
    onSaveState(applyReload({ revision: record.revision, layout: record.layout }));
    // The layout is part of the same coincidence: the adopted layout is both the
    // current and the saved one.
    onSavedLayoutChange(record.layout);
  };

  const reload = () =>
    withUnauthorized(async () => {
      const record = await getDraft(processId, token);
      if (!record) return; // draft was discarded elsewhere — nothing to reload into
      adoptDraft(record);
      setFailure(undefined);
      // An administrator can grant or withdraw the publish permission while the
      // edit screen sits open. Reload is the one control the conflict banner
      // offers, so it has to clear a stale report too.
      onCanPublishChange?.(record.canPublish);
    });

  const raiseConflict = () => onSaveState((current) => applySaveResult(current, undefined, current.layout));

  /** One save point request, under `held`: a save landing beside it would move the
   * revision it carries. Each outcome has one home (`SavePointOutcome`). */
  const savePointRequest = async <T,>(act: "create" | "restore" | "remove", send: () => Promise<SavePointOutcome<T>>): Promise<SavePointOutcome<T>> => {
    setSavePointActs((count) => count + 1);
    try {
      return await send();
    } catch (e) {
      if (is401(e)) {
        fail(e);
        return { kind: "ended" };
      }
      const outcome = savePointFailure(act, e);
      if (outcome.kind === "conflict") raiseConflict();
      return outcome;
    } finally {
      setSavePointActs((count) => count - 1);
    }
  };

  /** Flushes first, so the copy holds what the author sees. */
  const createSavePoint = (name: string) =>
    savePointRequest<SavePointSummary>("create", async () => {
      const flushed = await flush();
      if (!flushed.saved) return { kind: "unsaved" };
      const point = await requestCreateSavePoint(processId, { name, revision: flushed.revision }, token);
      if (point === undefined) {
        raiseConflict();
        return { kind: "conflict" };
      }
      return { kind: "done", value: point };
    });

  /**
   * Flushes first, so the kept point holds what the author sees. The answer carries
   * no `canPublish`, so this adopts it with no permission report: `reload` whole
   * would wipe a re-read permission.
   */
  const restoreSavePoint = (point: Pick<SavePointSummary, "savePointId" | "name">) =>
    savePointRequest<{ kept: string }>("restore", async () => {
      const flushed = await flush();
      if (!flushed.saved) return { kind: "unsaved" };
      const kept = keptPointName(point.name);
      const record = await requestRestoreSavePoint(processId, point.savePointId, { revision: flushed.revision, keepName: kept }, token);
      if (record === undefined) {
        raiseConflict();
        return { kind: "conflict" };
      }
      adoptDraft(record);
      onRestored?.(record);
      return { kind: "done", value: { kept } };
    });

  /** Sends at once: a removal copies nothing and carries no revision. */
  const removeSavePoint = (savePointId: string) =>
    savePointRequest<undefined>("remove", async () => {
      await requestRemoveSavePoint(processId, savePointId, token);
      return { kind: "done", value: undefined };
    });

  /**
   * Opens the discard dialog. Like `publish()`, it sends nothing: the request
   * leaves only from `resolveDialog(true)` (studio-app spec: "no request is
   * sent and the draft stays open, unchanged").
   */
  const discard = () => {
    clearError();
    setPendingDialog("discard");
  };

  /** The act the discard dialog confirms. */
  const runDiscard = () =>
    withUnauthorized(async () => {
      clearError();
      setDiscarding(true);
      // A `PUT` at revision 0 landing after the delete would create the draft again.
      dropped.current = true;
      try {
        await deleteDraft(processId, token);
        setPendingDialog(null);
        onDiscarded();
      } catch (e) {
        dropped.current = false;
        throw e;
      } finally {
        setDiscarding(false);
      }
    });

  /**
   * Declining closes the dialog and sends nothing. Confirming runs the act the
   * open dialog named, and leaves the dialog open when the request is refused
   * — `error` then renders inside it, since a modal puts everything behind it
   * out of reach (spa-error-reporting).
   */
  const resolveDialog = (confirmed: boolean) => {
    const open = pendingDialog;
    if (!confirmed || open === null) {
      setPendingDialog(null);
      return;
    }
    if (open === "publish") {
      // The confirm waits while a change has not landed, and a press does nothing.
      if (!dirty && !saving) void runPublish();
    } else void runDiscard();
  };

  return {
    saving,
    publishing,
    discarding,
    error,
    errorDetail,
    pendingDialog,
    resolveDialog,
    saveFailed: failure === undefined ? null : { retryable: failure.retryable, detail: failure.detail },
    retry,
    flush,
    drop,
    createSavePoint,
    restoreSavePoint,
    removeSavePoint,
    discard,
    publish,
    reload: () => void reload(),
    reportError: fail,
  };
}
