import { useCallback, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Upload } from "lucide-react";
import { colors, fonts, space, shadow } from "form-ui/tokens.stylex";
import {
  listProcesses,
  listDrafts,
  saveDraft,
  deleteDraft,
  getVersionBody,
  publishProcess,
  listTemplates,
  getTemplate,
} from "../api/client.js";
import {
  deriveProcessRows,
  seedVersionFor,
  seededDraftInput,
  templateDraftInput,
  templateDisplayName,
  type ProcessRow,
} from "./processListLogic.js";
import type { TemplateSummary } from "../api/types.js";
import { collidingProcessId, parsePromotionFile, type PromotionPreview } from "./promotionImportLogic.js";
import { mintId } from "../draft/ids.js";
import type { Route } from "../routing.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../catalog.js";
import { is401, useFail } from "../../../shell/useFail.js";

/** Every class this file's own markup renders, from `app.css`. `dialog*`
 * duplicates `panels/ProcessHeaderBar.tsx`'s own near-identical shapes on
 * purpose (D9); the source rules survive, dead code, until Group 9's
 * cleanup pass (D11). */
const styles = stylex.create({
  // `::backdrop` itself stays a literal fallback (D12): the real production
  // build carries no compiled `::backdrop` rule anywhere in its output.
  // `studio-dialog` composes alongside this style on every `<dialog>`
  // below, so `app.css`'s literal `.studio-dialog::backdrop` rule keeps
  // matching.
  dialog: {
    maxWidth: "34rem",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.divider,
    padding: space.s4,
    background: colors.surface,
    color: colors.text,
    overscrollBehavior: "contain",
    boxShadow: shadow.lg,
  },
  dialogFacts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: `${space.s1} ${space.s3}`,
    marginBlock: space.s3,
    marginInline: 0,
  },
  dialogFactsDt: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  dialogFactsDd: {
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  warning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.accent400,
    paddingLeft: space.s2,
  },
  dialogNote: {
    color: colors.textMuted,
    fontSize: "0.9rem",
  },
  dialogError: {
    color: colors.refusal,
    whiteSpace: "pre-line",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  dialogChoices: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    marginBottom: space.s3,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    marginBlock: 0,
    paddingBlock: `${space.s4} ${space.s6}`,
    paddingInline: space.s3,
  },
  fileLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.s1,
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  note: {
    color: colors.textMuted,
    minHeight: "1.25rem",
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
  },
  errorBanner: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.refusal,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    marginBlock: space.s3,
    marginInline: 0,
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
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  tableHeadCell: {
    textAlign: "left",
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  tableCell: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "top",
  },
});

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
  const dialogProps = stylex.props(styles.dialog);

  return (
    <dialog
      ref={ref}
      className={`studio-dialog ${dialogProps.className}`}
      style={dialogProps.style}
      aria-labelledby="promotion-preview-heading"
      onCancel={onCancel}
    >
      <h2 id="promotion-preview-heading">Import a published version</h2>
      <dl {...stylex.props(styles.dialogFacts)}>
        <dt {...stylex.props(styles.dialogFactsDt)}>Process</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>{preview.label ?? preview.key ?? preview.processId}</dd>
        <dt {...stylex.props(styles.dialogFactsDt)}>Key</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>
          <code>{preview.key === "" ? "—" : preview.key}</code>
        </dd>
        <dt {...stylex.props(styles.dialogFactsDt)}>Process id</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>
          <code>{preview.processId}</code>
        </dd>
        <dt {...stylex.props(styles.dialogFactsDt)}>Source version</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>{preview.version === undefined ? "—" : `v${preview.version}`}</dd>
        <dt {...stylex.props(styles.dialogFactsDt)}>Source hash</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>
          <code>{preview.definitionHash ?? "—"}</code>
        </dd>
      </dl>
      {collision === undefined ? null : (
        <p {...stylex.props(styles.warning)}>
          Another process (<code>{collision}</code>) already publishes under the key <code>{preview.key}</code>. Importing
          leaves both, and a published process cannot be deleted.
        </p>
      )}
      <p {...stylex.props(styles.dialogNote)}>
        This environment assigns its own version number. The definition keeps its process id, so a subprocess reference
        stays valid once its child is promoted too.
      </p>
      {/* A refused publish leaves the dialog open so the developer can read the
          reason beside the file it describes, then cancel or retry. It must
          render INSIDE the dialog: `showModal()` puts this element in the top
          layer, so anything on the screen behind it is inert and dimmed. */}
      {error === undefined ? null : (
        <p {...stylex.props(styles.dialogError)} role="alert">
          {error}
        </p>
      )}
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {busy ? "Publishing…" : "Publish here"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

/** `seededDraftInput` with no seed version never calls its reader; this names that rather than passing a reader that could run. */
const noSeedToRead = (): Promise<never> => Promise.reject(new Error("no seed version to read"));

interface StartPickerDialogProps {
  templates: TemplateSummary[];
  onCancel: () => void;
  onPick: (templateKey: string | undefined) => void;
}

/**
 * What `+ New process` opens. The same native `<dialog>` treatment
 * `PromotionPreviewDialog` takes, so the focus trap, Escape and the backdrop
 * come from the platform rather than from hand-rolled code.
 *
 * The empty choice leads first and stays available when no template exists —
 * an installation starts with none, and the picker must not be a dead end.
 */
function StartPickerDialog({ templates, onCancel, onPick }: StartPickerDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  const dialogProps = stylex.props(styles.dialog);

  return (
    <dialog
      ref={ref}
      className={`studio-dialog ${dialogProps.className}`}
      style={dialogProps.style}
      aria-labelledby="start-picker-heading"
      onCancel={onCancel}
    >
      <h2 id="start-picker-heading">Start a new process</h2>
      <div {...stylex.props(styles.dialogChoices)}>
        <button type="button" className="btn btn-primary" onClick={() => onPick(undefined)}>
          Empty process
        </button>
        {templates.map((template) => (
          <button key={template.templateKey} type="button" className="btn btn-secondary" onClick={() => onPick(template.templateKey)}>
            {templateDisplayName(template.label, "en", template.templateKey)}
          </button>
        ))}
      </div>
      {templates.length === 0 && <p {...stylex.props(styles.empty)}>No templates exist yet. A curator creates them on the Templates screen.</p>}
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
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
  // The start picker's own state. `templates` is undefined until the picker opens,
  // so the list screen issues no template request an author may never need.
  const [picking, setPicking] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err)));
  const failImport = useFail(onUnauthorized, (err) => setImportError(describeCaughtError(err)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [processes, drafts] = await Promise.all([listProcesses(token), listDrafts(token)]);
      setRows(deriveProcessRows(processes, drafts));
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, fail]);

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
      fail(err);
    }
  };

  /**
   * `+ New process` opens the picker rather than minting straight away. The
   * template list is read here, not on mount: an author who always starts empty
   * never pays for it. A failed read still opens the picker, with the empty
   * choice, since starting empty must not depend on the template route.
   */
  const newProcess = async () => {
    setError(undefined);
    try {
      setTemplates(await listTemplates(token));
    } catch (err) {
      // A 401 here skips the picker entirely, unlike every other error on this
      // screen — `fail`'s void return cannot express that, so this site keeps
      // its own `is401` check instead of the shared callback.
      if (is401(err)) return onUnauthorized();
      setTemplates([]);
      setError(describeCaughtError(err));
    }
    setPicking(true);
  };

  /**
   * Both branches mint the process id here and write one draft, so a template
   * start is the same single round trip an empty start already was.
   * `templateDraftInput` throws when the template cannot be read, so no empty
   * draft lands in place of the template the author picked.
   */
  const startProcess = async (templateKey: string | undefined) => {
    setPicking(false);
    const processId = mintId("process");
    try {
      const input =
        templateKey === undefined
          ? await seededDraftInput(undefined, noSeedToRead)
          : await templateDraftInput(templateKey, (key) => getTemplate(key, token));
      await saveDraft(processId, input, token);
      navigate({ name: "edit", processId });
    } catch (err) {
      fail(err);
    }
  };

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
      failImport(err);
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
      fail(err);
    }
  };

  return (
    <main {...stylex.props(styles.screen)}>
      {picking && <StartPickerDialog templates={templates} onCancel={() => setPicking(false)} onPick={(key) => void startProcess(key)} />}
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-primary" onClick={() => void newProcess()}>
          + New process
        </button>
        <label {...stylex.props(styles.fileLabel)} htmlFor="promotion-import">
          <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
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
        <p {...stylex.props(styles.dialogError)} role="alert">
          {importError}
        </p>
      )}
      <p {...stylex.props(styles.note)} aria-live="polite">
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
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{error}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {t("error.retry")}
          </button>
        </div>
      )}
      {loading && rows.length === 0 ? (
        <p {...stylex.props(styles.empty)}>Loading…</p>
      ) : rows.length === 0 ? (
        !error && <p {...stylex.props(styles.empty)}>No processes yet.</p>
      ) : (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.tableHeadCell)}>Process</th>
              <th {...stylex.props(styles.tableHeadCell)}>Draft</th>
              <th {...stylex.props(styles.tableHeadCell)}>Published</th>
              <th {...stylex.props(styles.tableHeadCell)}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.processId}>
                <td {...stylex.props(styles.tableCell)}>{row.published?.key ?? row.processId}</td>
                <td {...stylex.props(styles.tableCell)}>
                  {row.draft ? (
                    <>
                      saved by {row.draft.updatedBy} at {new Date(row.draft.updatedAt).toLocaleString()} (rev {row.draft.revision})
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td {...stylex.props(styles.tableCell)}>{row.published ? <>v{row.published.version} · {row.published.definitionHash.slice(0, 12)}</> : "—"}</td>
                <td {...stylex.props(styles.tableCell)}>
                  {row.draft ? (
                    <>
                      <button type="button" className="btn btn-secondary" onClick={() => navigate({ name: "edit", processId: row.processId })}>
                        Open
                      </button>
                      <button type="button" className="btn btn-secondary btn-destructive" onClick={() => void discard(row.processId)}>
                        Discard
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => void createDraft(row.processId, seedVersionFor(row))}>
                      Create draft
                    </button>
                  )}
                  {row.published && (
                    <button type="button" className="btn btn-secondary" onClick={() => navigate({ name: "versions", processId: row.processId })}>
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
