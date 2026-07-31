import { useCallback, useEffect, useRef, useState } from "react";
import { listProcesses, listDrafts, saveDraft, deleteDraft, getVersionBody, publishProcess, StudioClientError } from "../api/client.js";
import { deriveProcessRows, seedVersionFor, seededDraftInput, type ProcessRow } from "./processListLogic.js";
import { collidingProcessId, parsePromotionFile, type PromotionPreview } from "./promotionImportLogic.js";
import { mintId } from "../draft/ids.js";
import type { Route } from "../routing.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../i18n/catalog.js";

interface ProcessesScreenProps {
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

interface PromotionPreviewDialogProps {
  preview: PromotionPreview;
  /** The process id already publishing under this key, or undefined. Derived by the caller during render. */
  collision: string | undefined;
  /** A refused publish, shown inside the dialog — see the failure note below. */
  error: string | undefined;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * environment-promotion spec: the preview a developer confirms before an import
 * publishes. A native `<dialog>` opened with `showModal()` brings the focus
 * trap, the Escape key and the backdrop with it, so none of that is hand-rolled
 * here. Mounted only while a file is pending, so the open effect runs once.
 *
 * Shows the INCOMING version's own metadata only. It never compares against
 * another environment — the target may hold no version of this process at all.
 */
function PromotionPreviewDialog({ preview, collision, error, busy, onCancel, onConfirm }: PromotionPreviewDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog ref={ref} className="studio-dialog" aria-labelledby="promotion-preview-heading" onCancel={onCancel}>
      <h2 id="promotion-preview-heading">Import a published version</h2>
      <dl className="studio-dialog-facts">
        <dt>Process</dt>
        <dd>{preview.label ?? preview.key ?? preview.processId}</dd>
        <dt>Key</dt>
        <dd>
          <code>{preview.key === "" ? "—" : preview.key}</code>
        </dd>
        <dt>Process id</dt>
        <dd>
          <code>{preview.processId}</code>
        </dd>
        <dt>Source version</dt>
        <dd>{preview.version === undefined ? "—" : `v${preview.version}`}</dd>
        <dt>Source hash</dt>
        <dd>
          <code>{preview.definitionHash ?? "—"}</code>
        </dd>
      </dl>
      {collision === undefined ? null : (
        <p className="studio-warning">
          Another process (<code>{collision}</code>) already publishes under the key <code>{preview.key}</code>. Importing
          leaves both, and a published process cannot be deleted.
        </p>
      )}
      <p className="studio-dialog-note">
        This environment assigns its own version number. The definition keeps its process id, so a subprocess reference
        stays valid once its child is promoted too.
      </p>
      {/* A refused publish leaves the dialog open so the developer can read the
          reason beside the file it describes, then cancel or retry. It must
          render INSIDE the dialog: `showModal()` puts this element in the top
          layer, so anything on the screen behind it is inert and dimmed. */}
      {error === undefined ? null : (
        <p className="studio-error studio-json-error" role="alert">
          {error}
        </p>
      )}
      <div className="studio-controls">
        <button type="button" onClick={onConfirm} disabled={busy}>
          {busy ? "Publishing…" : "Publish here"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

export function ProcessesScreen({ token, navigate, onUnauthorized }: ProcessesScreenProps) {
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Import state, kept apart from `error` above: a rejected file or a refused
  // publish must not blank the process list's own empty state, and vice versa.
  const [pending, setPending] = useState<PromotionPreview | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | undefined>(undefined);
  const [importResult, setImportResult] = useState<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

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

  /**
   * `seededDraftInput` decides the body and throws if the published version
   * cannot be read, so the `saveDraft` below never runs on a failed seed —
   * writing an empty draft over a version the author wanted to continue from is
   * the bug this path exists to remove.
   */
  const createDraft = async (processId: string, seedVersion?: number) => {
    try {
      const input = await seededDraftInput(seedVersion, (v) => getVersionBody(processId, v, token));
      await saveDraft(processId, input, token);
      navigate({ name: "edit", processId });
    } catch (err) {
      if (err instanceof StudioClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    }
  };

  const newProcess = () => void createDraft(mintId("process"));

  /**
   * Reads a chosen promotion file and, when it passes the shape guard, opens
   * the preview. Nothing reaches the network on this path: a bad file is
   * reported inline and no request goes out. The input is cleared afterwards so
   * choosing the same file twice fires `change` again.
   */
  const chooseFile = (file: File | undefined) => {
    setImportError(undefined);
    setImportResult(undefined);
    setPending(undefined);
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setImportError("The file could not be read.");
    reader.onload = () => {
      const parsed = parsePromotionFile(String(reader.result ?? ""));
      if (parsed.ok) setPending(parsed.preview);
      else setImportError(parsed.message);
    };
    reader.readAsText(file);
  };

  /**
   * Publishes the pending file through the unchanged `POST /processes`, under
   * the source environment's own process id. A failure here is the server's —
   * cross-process validation, authorization, a schema violation — and its
   * message is shown as returned rather than reworded.
   */
  const confirmImport = async () => {
    if (!pending) return;
    setImporting(true);
    setImportError(undefined);
    try {
      const published = await publishProcess(pending.processId, pending.body, token);
      setImportResult(`Published v${published.version} · ${published.definitionHash.slice(0, 12)}`);
      setPending(undefined);
      await load();
    } catch (err) {
      if (err instanceof StudioClientError && err.status === 401) onUnauthorized();
      else setImportError(describeCaughtError(err));
    } finally {
      setImporting(false);
    }
  };

  /**
   * Closes the preview without publishing, and resets what the preview owned.
   *
   * Clearing `importError` is the load-bearing part. A refused publish sets it
   * while the dialog is open, and the screen-level error below renders only
   * when no dialog is open — so cancelling after a refusal would move that
   * message out from the dialog and onto the screen, where it would sit as a
   * standing error over an import the developer had just abandoned.
   *
   * Clearing `importResult` is defensive. `chooseFile` already clears it, and
   * no path opens this dialog without going through there.
   */
  const cancelImport = () => {
    setPending(undefined);
    setImportError(undefined);
    setImportResult(undefined);
  };

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
        <label className="studio-file-label" htmlFor="promotion-import">
          Import a promoted version
        </label>
        <input
          id="promotion-import"
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            chooseFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {/* Only a file the guard rejected lands here — no dialog is open then. A
          publish failure renders inside the dialog instead. */}
      {importError === undefined || pending !== undefined ? null : (
        <p className="studio-error studio-json-error" role="alert">
          {importError}
        </p>
      )}
      <p className="studio-note" aria-live="polite">
        {importResult ?? ""}
      </p>
      {pending === undefined ? null : (
        <PromotionPreviewDialog
          preview={pending}
          collision={collidingProcessId(pending, rows)}
          error={importError}
          busy={importing}
          onCancel={cancelImport}
          onConfirm={() => void confirmImport()}
        />
      )}
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
                    <button type="button" onClick={() => void createDraft(row.processId, seedVersionFor(row))}>
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
