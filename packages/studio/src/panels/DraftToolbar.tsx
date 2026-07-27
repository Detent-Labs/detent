import { useState } from "react";
import { useDraft } from "../draft/store.js";
import { t } from "../i18n/catalog.js";
import { saveDraft, getDraft, deleteDraft, StudioClientError } from "../api/client.js";
import { applySaveResult, applyReload, type DraftSaveState } from "../screens/draftSaveLogic.js";
import type { Draft } from "../draft/types.js";

interface DraftToolbarProps {
  processId: string;
  token: string;
  saveState: DraftSaveState;
  onSaveState: (next: DraftSaveState) => void;
  onDiscarded: () => void;
  onUnauthorized: () => void;
}

/**
 * Replaces the editor's FileToolbar: explicit save/discard against the draft
 * routes instead of file I/O. Live validation stays exactly what it is and
 * never blocks saving (studio-app spec: "the save action remains available
 * and succeeds" for an invalid draft).
 */
export function DraftToolbar({ processId, token, saveState, onSaveState, onDiscarded, onUnauthorized }: DraftToolbarProps) {
  const { draft, replace } = useDraft();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withUnauthorized = async (action: () => Promise<void>) => {
    try {
      await action();
      setError(null);
    } catch (e) {
      if (e instanceof StudioClientError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setError(e instanceof Error ? e.message : t("draftToolbar.operationFailed"));
    }
  };

  const save = () =>
    withUnauthorized(async () => {
      setSaving(true);
      try {
        const result = await saveDraft(processId, { body: draft, layout: saveState.layout, revision: saveState.revision }, token);
        onSaveState(applySaveResult(saveState, result));
      } finally {
        setSaving(false);
      }
    });

  const reload = () =>
    withUnauthorized(async () => {
      const record = await getDraft(processId, token);
      if (!record) return; // draft was discarded elsewhere — nothing to reload into
      replace(record.body as Draft);
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
      <button type="button" disabled={saving} onClick={() => void save()}>
        {saving ? t("draftToolbar.saving") : t("draftToolbar.save")}
      </button>
      <button type="button" onClick={() => void discard()}>
        {t("draftToolbar.discard")}
      </button>
      {error && <p className="studio-error">{error}</p>}
      {saveState.conflict && (
        <p className="studio-conflict">
          {t("draftToolbar.conflictMessage")}{" "}
          <button type="button" onClick={() => void reload()}>
            {t("draftToolbar.conflictReload")}
          </button>
        </p>
      )}
    </fieldset>
  );
}
