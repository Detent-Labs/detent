import { useEffect, useState } from "react";
import {
  createReport,
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
  type ReportDraft,
} from "./reportsLogic.js";
import { describeCaughtError } from "./reportingLogic.js";
import { ColumnEditor } from "./ColumnEditor.js";
import { ShareEditor } from "./ShareEditor.js";
import { ReportTable } from "./ReportTable.js";
import { ProcessPickerScreen } from "./ProcessPickerScreen.js";
import { EmptyState, ErrorNote, WaitingNote } from "../components.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ClientError, ColumnChoice, DataComparison, ReportExecutionResult } from "../api/types.js";

const STATUSES = ["running", "completed", "cancelled", "faulted"] as const;
const OPERATORS = ["eq", "ne", "in"] as const;

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
  // drop a version, which can add or drop a field from the union.
  useEffect(() => {
    if (!draft?.processId) return;
    let cancelled = false;
    const { query } = draftToInput(draft);
    fetchReportColumnChoices(draft.processId, query, token)
      .then((next) => {
        if (!cancelled) setChoices(next);
      })
      .catch(() => {
        if (!cancelled) setChoices([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.processId, draft?.status, draft?.createdAfter, draft?.createdBefore, draft?.dataWhere, token]);

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

  return (
    <main className="rep-screen">
      <h1>{t(locale, reportId ? "builder.titleEdit" : "builder.titleNew")}</h1>
      <p className="rep-scope" translate="no">
        {t(locale, "builder.process")}: {processLabel ?? draft.processId}
      </p>

      <label className="rep-controls">
        <span>{t(locale, "builder.name")}</span>
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      {!isValidReportName(draft.name) && <p className="rep-scope">{t(locale, "builder.nameRequired")}</p>}

      <section>
        <h2>{t(locale, "builder.filtersTitle")}</h2>
        <fieldset className="rep-controls">
          <legend>{t(locale, "builder.status")}</legend>
          {STATUSES.map((s) => (
            <label key={s} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
        <div className="rep-controls">
          <label>
            <span>{t(locale, "range.from")}</span>
            <input
              type="date"
              value={draft.createdAfter ? draft.createdAfter.slice(0, 10) : ""}
              onChange={(e) => setDraft({ ...draft, createdAfter: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            />
          </label>
          <label>
            <span>{t(locale, "range.to")}</span>
            <input
              type="date"
              value={draft.createdBefore ? draft.createdBefore.slice(0, 10) : ""}
              onChange={(e) => setDraft({ ...draft, createdBefore: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            />
          </label>
        </div>

        <h3>{t(locale, "builder.dataWhereTitle")}</h3>
        {draft.dataWhere.length === 0 && <p className="rep-empty">{t(locale, "builder.dataWhereEmpty")}</p>}
        {draft.dataWhere.map((cmp, i) => (
          <ComparisonRow
            key={i}
            comparison={cmp}
            choices={choices}
            onChange={(next) => setDraft({ ...draft, dataWhere: draft.dataWhere.map((c, j) => (j === i ? next : c)) })}
            onRemove={() => setDraft({ ...draft, dataWhere: draft.dataWhere.filter((_, j) => j !== i) })}
            locale={locale}
          />
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            setDraft({ ...draft, dataWhere: [...draft.dataWhere, { fieldId: choices[0]?.fieldId ?? "", operator: "eq", value: "" }] })
          }
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

      <div className="rep-controls">
        <button type="button" className="btn btn-secondary" onClick={runPreview} disabled={previewLoading || draft.columns.length === 0}>
          {t(locale, previewLoading ? "builder.previewing" : "builder.preview")}
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !isValidReportName(draft.name)}>
          {t(locale, saving ? "builder.saving" : "builder.save")}
        </button>
      </div>
      {saveError && <ErrorNote error={saveError} locale={locale} />}
      {previewError && <ErrorNote error={previewError} locale={locale} />}
      {preview && (draft.columns.length === 0 ? <EmptyState>{t(locale, "builder.columnsEmpty")}</EmptyState> : <ReportTable result={preview} locale={locale} />)}
    </main>
  );
}

function ComparisonRow({
  comparison,
  choices,
  onChange,
  onRemove,
  locale,
}: {
  comparison: DataComparison;
  choices: ColumnChoice[];
  onChange: (next: DataComparison) => void;
  onRemove: () => void;
  locale: UiLocale;
}) {
  return (
    <div className="rep-comparison-row">
      <select value={comparison.fieldId} onChange={(e) => onChange({ ...comparison, fieldId: e.target.value })}>
        {choices.map((c) => (
          <option key={c.fieldId} value={c.fieldId}>
            {c.fieldId}
          </option>
        ))}
      </select>
      <select value={comparison.operator} onChange={(e) => onChange({ ...comparison, operator: e.target.value as DataComparison["operator"] })}>
        {OPERATORS.map((op) => (
          <option key={op} value={op}>
            {t(locale, `builder.op.${op}`)}
          </option>
        ))}
      </select>
      <label>
        <span className="sr-only">{t(locale, "builder.comparisonValue")}</span>
        <input
          type="text"
          value={typeof comparison.value === "string" ? comparison.value : JSON.stringify(comparison.value)}
          onChange={(e) =>
            onChange({ ...comparison, value: comparison.operator === "in" ? e.target.value.split(",").map((s) => s.trim()) : e.target.value })
          }
        />
      </label>
      {comparison.operator === "in" && <span className="rep-scope">{t(locale, "builder.comparisonValueHint")}</span>}
      <button type="button" className="btn btn-secondary" onClick={onRemove}>
        {t(locale, "builder.removeComparison")}
      </button>
    </div>
  );
}
