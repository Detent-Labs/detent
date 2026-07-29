import { useCallback, useEffect, useState } from "react";
import { listProcesses, listDrafts, saveDraft, deleteDraft, StudioClientError } from "../api/client.js";
import { deriveProcessRows, type ProcessRow } from "./processListLogic.js";
import { mintId } from "../draft/ids.js";
import type { Route } from "../routing.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../i18n/catalog.js";

interface ProcessesScreenProps {
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

export function ProcessesScreen({ token, navigate, onUnauthorized }: ProcessesScreenProps) {
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [processes, drafts] = await Promise.all([listProcesses(token), listDrafts(token)]);
      setRows(deriveProcessRows(processes, drafts));
    } catch (err) {
      if (err instanceof StudioClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setLoading(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const createDraft = async (processId: string) => {
    try {
      await saveDraft(processId, { body: {}, layout: {}, revision: 0 }, token);
      navigate({ name: "edit", processId });
    } catch (err) {
      if (err instanceof StudioClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    }
  };

  const newProcess = () => void createDraft(mintId("process"));

  const discard = async (processId: string) => {
    if (!confirm(`Discard the draft for ${processId}? Unpublished edits will be lost.`)) return;
    try {
      await deleteDraft(processId, token);
      await load();
    } catch (err) {
      if (err instanceof StudioClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    }
  };

  return (
    <main className="studio-screen">
      <div className="studio-controls">
        <button type="button" onClick={newProcess}>
          + New process
        </button>
      </div>
      {error && (
        <div className="studio-error-banner" role="alert">
          <span className="studio-error-banner-stamp">{t("error.failed")}</span>
          <span className="studio-error-banner-message">{error}</span>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {t("error.retry")}
          </button>
        </div>
      )}
      {loading && rows.length === 0 ? (
        <p className="studio-empty">Loading…</p>
      ) : rows.length === 0 ? (
        !error && <p className="studio-empty">No processes yet.</p>
      ) : (
        <table className="studio-table">
          <thead>
            <tr>
              <th>Process</th>
              <th>Draft</th>
              <th>Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.processId}>
                <td>{row.published?.key ?? row.processId}</td>
                <td>
                  {row.draft ? (
                    <>
                      saved by {row.draft.updatedBy} at {new Date(row.draft.updatedAt).toLocaleString()} (rev {row.draft.revision})
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{row.published ? <>v{row.published.version} · {row.published.definitionHash.slice(0, 12)}</> : "—"}</td>
                <td>
                  {row.draft ? (
                    <>
                      <button type="button" onClick={() => navigate({ name: "edit", processId: row.processId })}>
                        Open
                      </button>
                      <button type="button" onClick={() => void discard(row.processId)}>
                        Discard
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => void createDraft(row.processId)}>
                      Create draft
                    </button>
                  )}
                  {row.published && (
                    <button type="button" onClick={() => navigate({ name: "versions", processId: row.processId })}>
                      Versions
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
