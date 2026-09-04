import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
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

const styles = stylex.create({
  studioMapEditor: {
    display: "grid",
    gap: space.s3,
    marginBottom: space.s3,
  },
  studioMapSection: {
    border: `1px solid ${colors.border}`,
    padding: space.s3,
  },
  studioMapSectionLegend: {
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    paddingBlock: 0,
    paddingInline: space.s1,
  },
  studioMapHint: {
    marginBlockEnd: space.s3,
    marginBlockStart: 0,
    marginInline: 0,
    fontSize: "0.85rem",
    color: colors.textMuted,
    maxWidth: "60ch",
    textWrap: "pretty",
  },
  studioMapRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr) auto",
    gap: space.s2,
    alignItems: "center",
    paddingBlock: space.s1,
    paddingInline: 0,
    maxWidth: "64rem",
  },
  // `.studio-map-section .studio-empty`: every `.studio-empty` this file
  // renders sits inside a `Section`'s own fieldset.
  studioEmpty: {
    color: colors.textMuted,
    paddingBlockStart: 0,
    paddingBlockEnd: space.s2,
    paddingInline: 0,
  },
  studioMapArrow: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  studioMapPicker: {
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
    minWidth: 0,
    padding: space.s1,
    border: `1px solid ${colors.border}`,
    background: colors.surface,
    color: colors.text,
  },
  studioMapExpression: {
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
    minWidth: 0,
    padding: space.s1,
    border: `1px solid ${colors.border}`,
    background: colors.surface,
    color: colors.text,
  },
  studioMapUnresolved: {
    borderColor: colors.accent400,
    borderStyle: "dashed",
    color: colors.refusal,
  },
  studioMapError: {
    gridColumn: "1 / -1",
    margin: 0,
    fontSize: "0.85rem",
    color: colors.refusal,
  },
});

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
      {...stylex.props(styles.studioMapPicker, unresolved && styles.studioMapUnresolved)}
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
    <fieldset {...stylex.props(styles.studioMapSection)}>
      <legend {...stylex.props(styles.studioMapSectionLegend)}>{legend}</legend>
      <p {...stylex.props(styles.studioMapHint)}>{hint}</p>
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
      {list.length === 0 && <p {...stylex.props(styles.studioEmpty)}>{t("migrationForm.noRows")}</p>}
      {list.map((row, index) => {
        const rowIssues = issuesFor(row.rowId);
        const errorId = rowIssues.length > 0 ? `${kind}-error-${row.rowId}` : undefined;
        return (
          <div {...stylex.props(styles.studioMapRow)} key={row.rowId}>
            <EntryPicker
              value={row.from}
              entries={from}
              label={t("migrationForm.sourceLabel")}
              describedBy={errorId}
              invalid={rowIssues.length > 0}
              onChange={(id) => setList(list.map((r, i) => (i === index ? { ...r, from: id } : r)))}
            />
            <span {...stylex.props(styles.studioMapArrow)} aria-hidden="true">
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
            <button type="button" className="btn btn-secondary" onClick={() => setList(list.filter((_, i) => i !== index))}>
              {t("migrationForm.removeRow")}
            </button>
            {errorId && (
              <p {...stylex.props(styles.studioMapError)} id={errorId}>
                {rowIssues.map((i) => i.message).join("; ")}
              </p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={from.length === 0 || to.length === 0}
        onClick={() => setList([...list, { rowId: nextRowId(), from: from[0]?.id ?? "", to: to[0]?.id ?? "" }])}
      >
        {t("migrationForm.addRow")}
      </button>
    </>
  );

  const unmappableIssues = issuesFor(UNMAPPABLE_ROW_ID);

  return (
    <div {...stylex.props(styles.studioMapEditor)} aria-live="polite">
      <Section legend={t("migrationForm.stepMapLegend")} hint={t("migrationForm.stepMapHint")}>
        {mapRows("stepMap", rows.stepMap, setStepMap, sourceSteps, targetSteps)}
      </Section>

      <Section legend={t("migrationForm.fieldMapLegend")} hint={t("migrationForm.fieldMapHint")}>
        {mapRows("fieldMap", rows.fieldMap, setFieldMap, catalogs.source.fields, catalogs.target.fields)}
      </Section>

      <Section legend={t("migrationForm.transformsLegend")} hint={t("migrationForm.transformsHint")}>
        {rows.transforms.length === 0 && <p {...stylex.props(styles.studioEmpty)}>{t("migrationForm.noRows")}</p>}
        {rows.transforms.map((row, index) => (
          <div {...stylex.props(styles.studioMapRow)} key={row.rowId}>
            <EntryPicker
              value={row.target}
              entries={catalogs.target.fields}
              label={t("migrationForm.targetLabel")}
              invalid={false}
              onChange={(id) => setTransforms(rows.transforms.map((r, i) => (i === index ? { ...r, target: id } : r)))}
            />
            <span {...stylex.props(styles.studioMapArrow)} aria-hidden="true">
              ←
            </span>
            <input
              {...stylex.props(styles.studioMapExpression)}
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
            <button type="button" className="btn btn-secondary" onClick={() => setTransforms(rows.transforms.filter((_, i) => i !== index))}>
              {t("migrationForm.removeRow")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
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
        <div {...stylex.props(styles.studioMapRow)}>
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
              <span {...stylex.props(styles.studioMapArrow)} aria-hidden="true">
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
            <p {...stylex.props(styles.studioMapError)} id="unmappable-error">
              {unmappableIssues.map((i) => i.message).join("; ")}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
