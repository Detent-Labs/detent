import { useState } from "react";
import { useDraft } from "../draft/store.js";
import { saveDraft, getDraft, deleteDraft, publishDraft } from "../api/client.js";
import { applySaveResult, applyReload, type DraftSaveState } from "../screens/draftSaveLogic.js";
import { isDirty } from "../screens/draftToolbarState.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import type { Draft } from "../draft/types.js";
import type { PublishResult } from "../api/types.js";

export interface DraftToolbarProps {
  processId: string;
  token: string;
  saveState: DraftSaveState;
  onSaveState: (next: DraftSaveState) => void;
  /** The body last known to be persisted, and its setter — lifted into
   * `EditorArea` (design.md: "the header bar reads lifted DraftToolbar
   * state") so the new process-identity header bar can read `isDirty`
   * too. `DraftToolbar` still computes both; only where they live moved up
   * one level, mirroring how `saveState`/`onSaveState` already work. */
  savedBody: Draft;
  onSavedBodyChange: (body: Draft) => void;
  /** Fired only from `doSave()`'s success branch — never from `reload()`'s
   * conflict-recovery branch, which calls `onSavedBodyChange` alone. A mere
   * reload is not a save, and must not advance `EditorArea`'s
   * `lastSavedAt`. */
  onSaved?: () => void;
  publishResult: PublishResult | null;
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
}

/** Which confirmation dialog the header bar has open, if any. Publish and
 * discard each commit an act the developer cannot undo, so each confirms in
 * the application's own modal dialog (studio-publish, studio-app). */
export type PendingDialog = "publish" | "discard" | null;

/** What `useDraftToolbarActions` exposes: the four calls a trigger (a
 * button, a menu item) invokes, plus the pending/error state a presentation
 * reads to decide what to show. `saveState.conflict` stays the caller's own
 * read (it already owns `saveState`) rather than duplicated here. */
export interface DraftToolbarActions {
  saving: boolean;
  publishing: boolean;
  error: string | null;
  /** Set by `publish()` or `discard()`, cleared when the developer resolves
   * the dialog or the act succeeds. A refused request leaves it set, so the
   * reason renders inside the open dialog rather than behind it. */
  pendingDialog: PendingDialog;
  /** Resolves whichever dialog `pendingDialog` names. `true` runs the act,
   * `false` declines it and sends no request. */
  resolveDialog: (confirmed: boolean) => void;
  save: () => void;
  discard: () => void;
  publish: () => void;
  reload: () => void;
}

/**
 * The save/discard/publish logic `DraftToolbar` has always owned — pending
 * flags, the network calls, the 401 and conflict handling — extracted so
 * `ProcessHeaderBar`'s `⋮` menu can call it too, per design.md's
 * "DraftToolbar keeps its logic. ProcessHeaderBar renders the buttons.".
 * This is the one place the logic lives; neither caller reimplements it.
 *
 * It raises no native browser prompt. Publish and discard each open the
 * application's own modal dialog instead: `publish()` and `discard()` only set
 * `pendingDialog`, and `resolveDialog(true)` runs the act the dialog named.
 * The native prompt carried neither the version a publish mints nor the rule
 * that a published version never changes, and it bypassed the design language
 * entirely. `packages/web/test/studio-no-confirm.test.ts` guards the
 * regression that would put it back.
 */
export function useDraftToolbarActions({
  processId,
  token,
  saveState,
  onSaveState,
  savedBody,
  onSavedBodyChange,
  onSaved,
  onPublishResult,
  onDiscarded,
  onUnauthorized,
  onCanPublishChange,
}: DraftToolbarProps): DraftToolbarActions {
  const { draft, replace } = useDraft();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);
  const fail = useFail(onUnauthorized, (e) => setError(describeCaughtError(e)));

  const withUnauthorized = async (action: () => Promise<void>) => {
    try {
      await action();
      setError(null);
    } catch (e) {
      fail(e);
    }
  };

  /** Returns whether the save persisted (false on a 409 — the conflict banner below already explains that, so a caller chaining off this shouldn't proceed). */
  const doSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const result = await saveDraft(processId, { body: draft, layout: saveState.layout, revision: saveState.revision }, token);
      if (result) {
        onSavedBodyChange(draft);
        onSaved?.();
      }
      onSaveState(applySaveResult(saveState, result));
      return result !== undefined;
    } finally {
      setSaving(false);
    }
  };

  const save = () => withUnauthorized(() => doSave().then(() => undefined));

  const doPublish = async () => {
    setPublishing(true);
    try {
      onPublishResult(await publishDraft(processId, token));
    } finally {
      setPublishing(false);
    }
  };

  /**
   * Opens the publish dialog. It sends nothing: the request leaves only from
   * `resolveDialog(true)` (studio-publish spec: "no publish request is sent
   * until the developer confirms").
   */
  const publish = () => {
    // A dialog reports its own refusal alone. Without this, a failure from an
    // earlier action renders inside a dialog that has sent nothing yet, and
    // reads as a refusal of the act the developer is about to confirm.
    setError(null);
    setPendingDialog("publish");
  };

  /**
   * The act the publish dialog confirms. Publish always targets the persisted
   * draft (studio-publish spec) — a dirty in-browser edit is never sent
   * implicitly — so a dirty draft saves first, under that one dialog and with
   * no second prompt between the two calls (studio-app spec: "does not call
   * the publish route until the save completes").
   *
   * A save conflict closes the dialog rather than reporting inside it. The
   * conflict is not a refusal; it is a state with its own banner and its own
   * Reload button, and a modal puts both out of reach.
   */
  const runPublish = () =>
    withUnauthorized(async () => {
      if (isDirty(draft, savedBody) && !(await doSave())) {
        setPendingDialog(null);
        return;
      }
      await doPublish();
      setPendingDialog(null);
    });

  const reload = () =>
    withUnauthorized(async () => {
      const record = await getDraft(processId, token);
      if (!record) return; // draft was discarded elsewhere — nothing to reload into
      const body = record.body as Draft;
      replace(body);
      // A reload is by definition the point where current and saved coincide
      // (design.md) — without this, savedBody keeps pointing at the discarded
      // local edits, so a draft byte-identical to the server's reads as dirty
      // for the rest of the session and Publish always prompts to save first.
      // No onSaved() call here (design.md): a reload is not a save, and must
      // not advance EditorArea's lastSavedAt.
      onSavedBodyChange(body);
      // An administrator can grant or withdraw the publish permission while the
      // edit screen sits open. Reload is the one control the conflict banner
      // offers, so it has to clear a stale report too.
      onCanPublishChange?.(record.canPublish);
      onSaveState(applyReload({ revision: record.revision, layout: record.layout }));
    });

  /**
   * Opens the discard dialog. Like `publish()`, it sends nothing: the request
   * leaves only from `resolveDialog(true)` (studio-app spec: "no request is
   * sent and the draft stays open, unchanged").
   */
  const discard = () => {
    setError(null);
    setPendingDialog("discard");
  };

  /** The act the discard dialog confirms. */
  const runDiscard = () =>
    withUnauthorized(async () => {
      await deleteDraft(processId, token);
      setPendingDialog(null);
      onDiscarded();
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
    if (open === "publish") void runPublish();
    else void runDiscard();
  };

  return {
    saving,
    publishing,
    error,
    pendingDialog,
    resolveDialog,
    save: () => void save(),
    discard,
    publish,
    reload: () => void reload(),
  };
}
