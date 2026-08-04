import type { ReactNode } from "react";
import { t } from "../catalog.js";
import {
  checkPlan,
  isUnresolved,
  nextRowId,
  selectableSteps,
  UNMAPPABLE_ROW_ID,
  type Catalogs,
  type MapRow,
  type PlanRows,
  type StepEntry,
  type TransformRow,
  type UnmappablePolicy,
} from "../screens/migrationPlanLogic.js";

interface Props {
  rows: PlanRows;
  catalogs: Catalogs;
  onChange: (next: PlanRows) => void;
}

/** `key — label`, or the raw id when the catalog does not declare it. */
function entryText(entry: StepEntry | undefined, id: string): string {
  if (!entry) return id;
  return entry.label && entry.label !== entry.key ? `${entry.key} — ${entry.label}` : entry.key || entry.id;
}

interface PickerProps {
  value: string;
  entries: readonly StepEntry[];
  label: string;
  describedBy?: string;
  invalid: boolean;
  onChange: (id: string) => void;
}

/**
 * An id the catalog does not declare stays selected: the option is added rather
 * than dropped, so a stored plan the author never edited survives the round trip
 * (studio-migration-plan-form spec).
 */
function EntryPicker({ value, entries, label, describedBy, invalid, onChange }: PickerProps) {
  const unresolved = isUnresolved(value, entries);
  return (
    <select
      className={unresolved ? "studio-map-picker studio-map-unresolved" : "studio-map-picker"}
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {entries.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entryText(entry, entry.id)}
        </option>
      ))}
      {unresolved && (
        <option value={value}>
          {value} {t("migrationForm.unresolved")}
        </option>
      )}
    </select>
  );
}

function Section({ legend, hint, children }: { legend: string; hint: string; children: ReactNode }) {
  return (
    <fieldset className="studio-map-section">
      <legend>{legend}</legend>
      <p className="studio-map-hint">{hint}</p>
      {children}
    </fieldset>
  );
}

export function MigrationSpecEditor({ rows, catalogs, onChange }: Props) {
  const issues = checkPlan(rows, catalogs);
  const issuesFor = (rowId: string) => issues.filter((i) => i.rowId === rowId);

  const sourceSteps = selectableSteps(catalogs.source);
  const targetSteps = selectableSteps(catalogs.target);

  const setStepMap = (stepMap: MapRow[]) => onChange({ ...rows, stepMap });
  const setFieldMap = (fieldMap: MapRow[]) => onChange({ ...rows, fieldMap });
  const setTransforms = (transforms: TransformRow[]) => onChange({ ...rows, transforms });

  const setPolicy = (onUnmappable: UnmappablePolicy) => {
    // The schema pairs these as an iff, so route-to-step takes a step at once.
    const unmappableStep =
      onUnmappable === "route-to-step" ? rows.unmappableStep || (targetSteps[0]?.id ?? "") : "";
    onChange({ ...rows, onUnmappable, unmappableStep });
  };

  const mapRows = (
    kind: "stepMap" | "fieldMap",
    list: MapRow[],
    setList: (next: MapRow[]) => void,
    from: readonly StepEntry[],
    to: readonly StepEntry[],
  ) => (
    <>
      {list.length === 0 && <p className="studio-empty">{t("migrationForm.noRows")}</p>}
      {list.map((row, index) => {
        const rowIssues = issuesFor(row.rowId);
        const errorId = rowIssues.length > 0 ? `${kind}-error-${row.rowId}` : undefined;
        return (
          <div className="studio-map-row" key={row.rowId}>
            <EntryPicker
              value={row.from}
              entries={from}
              label={t("migrationForm.sourceLabel")}
              describedBy={errorId}
              invalid={rowIssues.length > 0}
              onChange={(id) => setList(list.map((r, i) => (i === index ? { ...r, from: id } : r)))}
            />
            <span className="studio-map-arrow" aria-hidden="true">
              →
            </span>
            <EntryPicker
              value={row.to}
              entries={to}
              label={t("migrationForm.targetLabel")}
              describedBy={errorId}
              invalid={rowIssues.length > 0}
              onChange={(id) => setList(list.map((r, i) => (i === index ? { ...r, to: id } : r)))}
            />
            <button type="button" onClick={() => setList(list.filter((_, i) => i !== index))}>
              {t("migrationForm.removeRow")}
            </button>
            {errorId && (
              <p className="studio-map-error studio-error" id={errorId}>
                {rowIssues.map((i) => i.message).join("; ")}
              </p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        disabled={from.length === 0 || to.length === 0}
        onClick={() => setList([...list, { rowId: nextRowId(), from: from[0]?.id ?? "", to: to[0]?.id ?? "" }])}
      >
        {t("migrationForm.addRow")}
      </button>
    </>
  );

  const unmappableIssues = issuesFor(UNMAPPABLE_ROW_ID);

  return (
    <div className="studio-map-editor" aria-live="polite">
      <Section legend={t("migrationForm.stepMapLegend")} hint={t("migrationForm.stepMapHint")}>
        {mapRows("stepMap", rows.stepMap, setStepMap, sourceSteps, targetSteps)}
      </Section>

      <Section legend={t("migrationForm.fieldMapLegend")} hint={t("migrationForm.fieldMapHint")}>
        {mapRows("fieldMap", rows.fieldMap, setFieldMap, catalogs.source.fields, catalogs.target.fields)}
      </Section>

      <Section legend={t("migrationForm.transformsLegend")} hint={t("migrationForm.transformsHint")}>
        {rows.transforms.length === 0 && <p className="studio-empty">{t("migrationForm.noRows")}</p>}
        {rows.transforms.map((row, index) => (
          <div className="studio-map-row" key={row.rowId}>
            <EntryPicker
              value={row.target}
              entries={catalogs.target.fields}
              label={t("migrationForm.targetLabel")}
              invalid={false}
              onChange={(id) => setTransforms(rows.transforms.map((r, i) => (i === index ? { ...r, target: id } : r)))}
            />
            <span className="studio-map-arrow" aria-hidden="true">
              ←
            </span>
            <input
              className="studio-map-expression"
              type="text"
              spellCheck={false}
              autoComplete="off"
              aria-label={t("migrationForm.expressionLabel")}
              placeholder={t("migrationForm.expressionPlaceholder")}
              value={row.src}
              onChange={(e) =>
                setTransforms(rows.transforms.map((r, i) => (i === index ? { ...r, src: e.target.value } : r)))
              }
            />
            <button type="button" onClick={() => setTransforms(rows.transforms.filter((_, i) => i !== index))}>
              {t("migrationForm.removeRow")}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={catalogs.target.fields.length === 0}
          onClick={() =>
            setTransforms([
              ...rows.transforms,
              { rowId: nextRowId(), target: catalogs.target.fields[0]?.id ?? "", src: "" },
            ])
          }
        >
          {t("migrationForm.addRow")}
        </button>
      </Section>

      <Section legend={t("migrationForm.unmappableLegend")} hint={t("migrationForm.unmappableHint")}>
        <div className="studio-map-row">
          <label>
            onUnmappable
            <select value={rows.onUnmappable} onChange={(e) => setPolicy(e.target.value as UnmappablePolicy)}>
              <option value="">{t("migrationForm.policyNone")}</option>
              <option value="reject-and-pin">reject-and-pin</option>
              <option value="route-to-step">route-to-step</option>
            </select>
          </label>
          {rows.onUnmappable === "route-to-step" && (
            <>
              <span className="studio-map-arrow" aria-hidden="true">
                →
              </span>
              <EntryPicker
                value={rows.unmappableStep}
                entries={targetSteps}
                label={t("migrationForm.unmappableStepLabel")}
                describedBy={unmappableIssues.length > 0 ? "unmappable-error" : undefined}
                invalid={unmappableIssues.length > 0}
                onChange={(unmappableStep) => onChange({ ...rows, unmappableStep })}
              />
            </>
          )}
          {unmappableIssues.length > 0 && (
            <p className="studio-map-error studio-error" id="unmappable-error">
              {unmappableIssues.map((i) => i.message).join("; ")}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
