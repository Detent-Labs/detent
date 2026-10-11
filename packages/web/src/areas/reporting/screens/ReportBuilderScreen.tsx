import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { layout, colors, fonts, space } from "form-ui/tokens.stylex";
import {
  createReport,
  downloadReportCsv,
  fetchReportColumnChoices,
  getReport,
  previewReport,
  updateReport,
} from "../api/client.js";
import {
  allVersionsInRange,
  draftFromReport,
  draftToInput,
  emptyDraft,
  isValidReportName,
  rememberTypes,
  syncRowIds,
  withoutRowId,
  withRowId,
  type RememberedTypes,
  type ReportDraft,
} from "./reportsLogic.js";
import { describeCaughtError } from "./reportingLogic.js";
import { useSettledKey } from "./debounce.js";
import { ComparisonRow } from "./ComparisonRow.js";
import { ColumnEditor } from "./ColumnEditor.js";
import { ShareEditor } from "./ShareEditor.js";
import { ReportTable } from "./ReportTable.js";
import { ProcessPickerScreen } from "./ProcessPickerScreen.js";
import { EmptyState, ErrorNote, WaitingNote } from "../components.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ClientError, ColumnChoice, ReportExecutionResult, ReportQuery } from "../api/types.js";

const STATUSES = ["running", "completed", "cancelled", "faulted"] as const;
/** The quiet time after the last filter change before the column request goes out. */
const COLUMN_REQUEST_WAIT_MS = 300;
const NO_TYPES: RememberedTypes = new Map();

/** `app.css`'s screen/controls/scope/comparison rules, as StyleX. The
 * status checkboxes below keep their own literal inline layout style
 * (display/alignItems/gap) exactly as it renders today; `controlsLabel`
 * composes alongside it, contributing only the properties the inline
 * style leaves untouched (`flexDirection`, `fontSize`). */
const styles = stylex.create({
  screen: {
    maxWidth: layout.capWide,
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  scope: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s3,
    maxWidth: "46rem",
  },
  empty: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s3,
    maxWidth: "46rem",
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    paddingLeft: space.s3,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s3,
    alignItems: "flex-end",
    paddingBottom: space.s3,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  controlsLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
  },
  controlsLabelSpan: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: colors.textMuted,
  },
});

export function ReportBuilderScreen({
  reportId,
  token,
  locale,
  actorId,
  onSaved,
}: {
  reportId?: string;
  token: string;
  locale: UiLocale;
  actorId: string;
  onSaved: (reportId: string) => void;
}) {
  const [draft, setDraft] = useState<ReportDraft | undefined>(reportId ? undefined : undefined);
  const [owner, setOwner] = useState(actorId);
  const [processLabel, setProcessLabel] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<ClientError | undefined>();
  const [choices, setChoices] = useState<ColumnChoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ClientError | undefined>();
  const [preview, setPreview] = useState<ReportExecutionResult | undefined>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<ClientError | undefined>();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<ClientError | undefined>();

  // Load the existing report, once, when editing.
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    getReport(reportId, token)
      .then((report) => {
        if (cancelled) return;
        setDraft(draftFromReport(report));
        setOwner(report.owner);
        setProcessLabel(report.processId);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(describeCaughtError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, token]);

  // Column choices track the process and the query axes that bound which
  // versions are in range — a status/date-range/comparison change can add or
  // drop a version, which can add or drop a field from the union. The key is
  // the complete query, so an incomplete comparison sends nothing, and it
  // settles 300 ms after the last change. A new process settles at once.
  const columnKey = draft ? JSON.stringify([draft.processId, draftToInput(draft).query]) : undefined;
  const settledKey = useSettledKey(draft?.processId, columnKey, COLUMN_REQUEST_WAIT_MS);
  // Every field type any response named, per process: a comparison that
  // empties the range keeps its own field's type.
  const typesRef = useRef<{ processId: string; types: RememberedTypes } | undefined>(undefined);
  useEffect(() => {
    if (!settledKey) return;
    let cancelled = false;
    const [processId, query] = JSON.parse(settledKey) as [string, ReportQuery];
    fetchReportColumnChoices(processId, query, token)
      .then((next) => {
        if (cancelled) return;
        const known = typesRef.current?.processId === processId ? typesRef.current.types : NO_TYPES;
        typesRef.current = { processId, types: rememberTypes(known, next) };
        setChoices(next);
      })
      .catch(() => {
        if (!cancelled) setChoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [settledKey, token]);

  // One key per comparison row, so a removal never hands one row's text to
  // the next (`reportsLogic.ts::syncRowIds`).
  const [rowIds, setRowIds] = useState<string[]>([]);
  const comparisonCount = draft?.dataWhere.length ?? 0;
  const syncedIds = syncRowIds(rowIds, comparisonCount);
  if (syncedIds) setRowIds(syncedIds);
  const comparisonIds = syncedIds ?? rowIds;

  if (loadError) return <ErrorNote error={loadError} locale={locale} />;
  if (reportId && !draft) return <WaitingNote locale={locale} />;

  if (!draft) {
    return (
      <ProcessPickerScreen
        token={token}
        locale={locale}
        onPick={(processId, label) => {
          setProcessLabel(label);
          setDraft(emptyDraft(processId));
        }}
      />
    );
  }

  const versionsInRange = allVersionsInRange(choices);
  // Written only together with `setChoices`, so this draw sees the types of the choices it draws.
  const types = typesRef.current?.processId === draft.processId ? typesRef.current.types : NO_TYPES;

  const runPreview = () => {
    setPreviewLoading(true);
    setPreviewError(undefined);
    const input = draftToInput(draft);
    previewReport({ processId: input.processId, query: input.query, columns: input.columns }, token)
      .then((result) => setPreview(result))
      .catch((cause: unknown) => setPreviewError(describeCaughtError(cause)))
      .finally(() => setPreviewLoading(false));
  };

  const save = () => {
    setSaving(true);
    setSaveError(undefined);
    const input = draftToInput(draft);
    const call = reportId ? updateReport(reportId, input, token) : createReport(input, token);
    call
      .then((report) => onSaved(report.reportId))
      .catch((cause: unknown) => setSaveError(describeCaughtError(cause)))
      .finally(() => setSaving(false));
  };

  /**
   * Blob + `URL.createObjectURL` + `<a download>`, the same pattern
   * `TaskScreen.tsx`'s `doDownloadAttachment` uses. A plain `<a href>`
   * cannot carry the bearer-header auth this route needs.
   */
  const downloadCsv = () => {
    if (!reportId) return;
    setDownloading(true);
    setDownloadError(undefined);
    downloadReportCsv(reportId, token)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `report-${reportId}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
      })
      .catch((cause: unknown) => setDownloadError(describeCaughtError(cause)))
      .finally(() => setDownloading(false));
  };

  return (
    <main {...stylex.props(styles.screen)}>
      <h1>{t(locale, reportId ? "builder.titleEdit" : "builder.titleNew")}</h1>
      <p {...stylex.props(styles.scope)} translate="no">
        {t(locale, "builder.process")}: {processLabel ?? draft.processId}
      </p>

      <label {...stylex.props(styles.controls)}>
        <span>{t(locale, "builder.name")}</span>
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      {!isValidReportName(draft.name) && <p {...stylex.props(styles.scope)}>{t(locale, "builder.nameRequired")}</p>}

      <section>
        <h2>{t(locale, "builder.filtersTitle")}</h2>
        <fieldset {...stylex.props(styles.controls)}>
          <legend>{t(locale, "builder.status")}</legend>
          {STATUSES.map((s) => (
            <label
              key={s}
              className={stylex.props(styles.controlsLabel).className}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <input
                type="checkbox"
                checked={draft.status.includes(s)}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.checked ? [...draft.status, s] : draft.status.filter((x) => x !== s) })
                }
              />
              {t(locale, `builder.status.${s}`)}
            </label>
          ))}
        </fieldset>
        <div {...stylex.props(styles.controls)}>
          <label {...stylex.props(styles.controlsLabel)}>
            <span {...stylex.props(styles.controlsLabelSpan)}>{t(locale, "range.from")}</span>
            <input
              type="date"
              value={draft.createdAfter ? draft.createdAfter.slice(0, 10) : ""}
              onChange={(e) => setDraft({ ...draft, createdAfter: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            />
          </label>
          <label {...stylex.props(styles.controlsLabel)}>
            <span {...stylex.props(styles.controlsLabelSpan)}>{t(locale, "range.to")}</span>
            <input
              type="date"
              value={draft.createdBefore ? draft.createdBefore.slice(0, 10) : ""}
              onChange={(e) => setDraft({ ...draft, createdBefore: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            />
          </label>
        </div>

        <h3>{t(locale, "builder.dataWhereTitle")}</h3>
        {draft.dataWhere.length === 0 && <p {...stylex.props(styles.empty)}>{t(locale, "builder.dataWhereEmpty")}</p>}
        {draft.dataWhere.map((cmp, i) => (
          <ComparisonRow
            key={comparisonIds[i]}
            comparison={cmp}
            choices={choices}
            types={types}
            onChange={(next) => setDraft({ ...draft, dataWhere: draft.dataWhere.map((c, j) => (j === i ? next : c)) })}
            onRemove={() => {
              setRowIds(withoutRowId(comparisonIds, i));
              setDraft({ ...draft, dataWhere: draft.dataWhere.filter((_, j) => j !== i) });
            }}
            locale={locale}
          />
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setRowIds(withRowId(comparisonIds));
            setDraft({ ...draft, dataWhere: [...draft.dataWhere, { fieldId: choices[0]?.fieldId ?? "", operator: "eq", value: undefined }] });
          }}
          disabled={choices.length === 0}
        >
          {t(locale, "builder.addComparison")}
        </button>
      </section>

      <ColumnEditor
        columns={draft.columns}
        choices={choices}
        versionsInRange={versionsInRange}
        onChange={(columns) => setDraft({ ...draft, columns })}
        locale={locale}
      />

      <ShareEditor
        owner={owner}
        viewers={draft.viewers}
        editors={draft.editors}
        onViewersChange={(viewers) => setDraft({ ...draft, viewers })}
        onEditorsChange={(editors) => setDraft({ ...draft, editors })}
        locale={locale}
      />

      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-secondary" onClick={runPreview} disabled={previewLoading || draft.columns.length === 0}>
          {t(locale, previewLoading ? "builder.previewing" : "builder.preview")}
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !isValidReportName(draft.name)}>
          {t(locale, saving ? "builder.saving" : "builder.save")}
        </button>
        {reportId && (
          <button type="button" className="btn btn-secondary" onClick={downloadCsv} disabled={downloading}>
            {t(locale, downloading ? "builder.downloadingCsv" : "builder.downloadCsv")}
          </button>
        )}
      </div>
      {saveError && <ErrorNote error={saveError} locale={locale} />}
      {previewError && <ErrorNote error={previewError} locale={locale} />}
      {downloadError && <ErrorNote error={downloadError} locale={locale} />}
      {preview && (draft.columns.length === 0 ? <EmptyState>{t(locale, "builder.columnsEmpty")}</EmptyState> : <ReportTable result={preview} locale={locale} />)}
    </main>
  );
}
