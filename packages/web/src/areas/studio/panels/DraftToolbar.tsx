import { useState } from "react";
import { useDraft } from "../draft/store.js";
import { t } from "../catalog.js";
import { saveDraft, getDraft, deleteDraft, publishDraft, StudioClientError } from "../api/client.js";
import { applySaveResult, applyReload, type DraftSaveState } from "../screens/draftSaveLogic.js";
import { isDirty } from "../screens/draftToolbarState.js";
import { describeCaughtError } from "../errors.js";
import type { Draft } from "../draft/types.js";
import type { PublishResult } from "../api/types.js";

interface DraftToolbarProps {
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
}

/**
 * Replaces the editor's FileToolbar: explicit save/discard against the draft
 * routes instead of file I/O. Live validation stays exactly what it is and
 * never blocks saving (studio-app spec: "the save action remains available
 * and succeeds" for an invalid draft).
 */
export function DraftToolbar({
  processId,
  token,
  saveState,
  onSaveState,
  savedBody,
  onSavedBodyChange,
  onSaved,
  publishResult,
  onPublishResult,
  onDiscarded,
  onUnauthorized,
}: DraftToolbarProps) {
  const { draft, replace } = useDraft();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const withUnauthorized = async (action: () => Promise<void>) => {
    try {
      await action();
      setError(null);
    } catch (e) {
      if (e instanceof StudioClientError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setError(describeCaughtError(e));
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
   * Publish always targets the persisted draft (studio-publish spec) — a dirty
   * in-browser edit is never sent implicitly. Confirming saves first and only
   * then publishes; declining or a save conflict leaves the draft unpublished
   * (studio-app spec: "does not call the publish route until the save completes").
   */
  const publish = () => {
    if (isDirty(draft, savedBody)) {
      if (!confirm(t("draftToolbar.publishConfirmSave"))) return;
      return withUnauthorized(async () => {
        if (await doSave()) await doPublish();
      });
    }
    return withUnauthorized(doPublish);
  };

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
      onSaveState(applyReload({ revision: record.revision, layout: record.layout }));
    });

  const discard = () =>
    withUnauthorized(async () => {
      if (!confirm(t("draftToolbar.discardConfirm"))) return;
      await deleteDraft(processId, token);
      onDiscarded();
    });

  return (
    <fieldset className="draft-toolbar">
      <legend>{t("draftToolbar.legend")}</legend>
      <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void save()}>
        {saving ? t("draftToolbar.saving") : t("draftToolbar.save")}
      </button>
      <button type="button" className="btn btn-secondary btn-destructive" onClick={() => void discard()}>
        {t("draftToolbar.discard")}
      </button>
      <button type="button" className="btn btn-primary" disabled={publishing} onClick={() => void publish()}>
        {publishing ? t("draftToolbar.publishing") : t("draftToolbar.publish")}
      </button>
      {error && <p className="studio-error">{error}</p>}
      {publishResult && (
        <p className="studio-publish-result">
          {t("draftToolbar.publishSuccess")} v{publishResult.version} ({publishResult.definitionHash.slice(0, 12)})
        </p>
      )}
      {saveState.conflict && (
        <p className="studio-conflict">
          {t("draftToolbar.conflictMessage")}{" "}
          <button type="button" className="btn btn-secondary" onClick={() => void reload()}>
            {t("draftToolbar.conflictReload")}
          </button>
        </p>
      )}
    </fieldset>
  );
}
