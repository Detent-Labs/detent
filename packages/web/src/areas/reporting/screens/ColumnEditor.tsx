import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import {
  addFieldColumn,
  addMergeColumn,
  addMergeSource,
  isPartialCoverage,
  moveColumn,
  removeColumn,
  removeMergeSource,
  usedFieldIds,
} from "./reportsLogic.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ColumnChoice, ReportColumn } from "../api/types.js";

/**
 * The ordered column list an author builds: a direct field reference, or a
 * merge column collecting an ordered list of source fields. Reordering is
 * up/down buttons rather than drag-and-drop — keyboard-reachable with no new
 * dependency, and the list is short enough that a button pair costs nothing.
 */
/** `app.css`'s column-editor rules, as StyleX. `.rep-field-picker select`
 * never matched any element even before this migration: the class it
 * gates always sits on the `<select>` itself, never a wrapper, so no
 * descendant `select` exists for it to reach. This migration drops the
 * dead className rather than inventing a style for a rule that never
 * applied anything. */
const styles = stylex.create({
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
  columnList: {
    listStyle: "none",
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s3,
    padding: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  columnRow: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: 0,
  },
  columnRowHead: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    flexWrap: "wrap",
  },
  columnIndex: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
    minWidth: "1.5em",
  },
  stamp: {
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  columnRowActions: {
    display: "flex",
    gap: space.s1,
    marginLeft: "auto",
  },
  mergeSources: {
    marginTop: space.s2,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: `calc(1.5em + ${space.s2})`,
    paddingLeft: space.s3,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
  },
  scope: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s3,
    maxWidth: "46rem",
  },
  mergeSourcesList: {
    listStyle: "none",
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s2,
    padding: 0,
  },
  mergeSourceRow: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    paddingBlock: space.s1,
    paddingInline: 0,
  },
  figure: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
  },
  columnAdd: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    flexWrap: "wrap",
  },
});

export function ColumnEditor({
  columns,
  choices,
  versionsInRange,
  onChange,
  locale,
}: {
  columns: ReportColumn[];
  choices: ColumnChoice[];
  versionsInRange: number[];
  onChange: (next: ReportColumn[]) => void;
  locale: UiLocale;
}) {
  const available = choices.filter((c) => !usedFieldIds(columns).has(c.fieldId));

  return (
    <section>
      <h2>{t(locale, "builder.columnsTitle")}</h2>
      {columns.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t(locale, "builder.columnsEmpty")}</p>
      ) : (
        <ol {...stylex.props(styles.columnList)}>
          {columns.map((col, i) => (
            <li key={i} {...stylex.props(styles.columnRow)}>
              <div {...stylex.props(styles.columnRowHead)}>
                <span {...stylex.props(styles.columnIndex)} translate="no">
                  {i + 1}
                </span>
                {col.type === "field" ? (
                  <FieldPicker
                    value={col.fieldId}
                    choices={choices}
                    onChange={(fieldId) => onChange(columns.map((c, j) => (j === i ? { type: "field", fieldId } : c)))}
                    versionsInRange={versionsInRange}
                    locale={locale}
                  />
                ) : (
                  <span {...stylex.props(styles.stamp)}>{t(locale, "builder.mergeColumnLabel")}</span>
                )}
                <div {...stylex.props(styles.columnRowActions)}>
                  <button type="button" className="btn btn-secondary" onClick={() => onChange(moveColumn(columns, i, -1))} disabled={i === 0}>
                    {t(locale, "builder.moveUp")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onChange(moveColumn(columns, i, 1))}
                    disabled={i === columns.length - 1}
                  >
                    {t(locale, "builder.moveDown")}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => onChange(removeColumn(columns, i))}>
                    {t(locale, "builder.removeColumn")}
                  </button>
                </div>
              </div>
              {col.type === "merge" && (
                <div {...stylex.props(styles.mergeSources)}>
                  <p {...stylex.props(styles.scope)}>{t(locale, "builder.mergeSources")}</p>
                  <ol {...stylex.props(styles.mergeSourcesList)}>
                    {col.fieldIds.map((fieldId, sourceIndex) => (
                      <li key={sourceIndex} {...stylex.props(styles.mergeSourceRow)}>
                        <span translate="no" {...stylex.props(styles.figure)}>
                          {fieldId}
                        </span>
                        <button type="button" className="btn btn-secondary" onClick={() => onChange(removeMergeSource(columns, i, sourceIndex))}>
                          {t(locale, "builder.removeSource")}
                        </button>
                      </li>
                    ))}
                  </ol>
                  <FieldPicker
                    value=""
                    choices={choices.filter((c) => !col.fieldIds.includes(c.fieldId))}
                    onChange={(fieldId) => onChange(addMergeSource(columns, i, fieldId))}
                    versionsInRange={versionsInRange}
                    locale={locale}
                    addLabel={t(locale, "builder.addSource")}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <div {...stylex.props(styles.columnAdd)}>
        <FieldPicker
          value=""
          choices={available}
          onChange={(fieldId) => onChange(addFieldColumn(columns, fieldId))}
          versionsInRange={versionsInRange}
          locale={locale}
          addLabel={t(locale, "builder.addFieldColumn")}
        />
        <button type="button" className="btn btn-secondary" onClick={() => onChange(addMergeColumn(columns))}>
          {t(locale, "builder.addMergeColumn")}
        </button>
      </div>
    </section>
  );
}

/**
 * A `<select>` naming every offered field, each with its version-coverage
 * note when it is not common to every in-range version — the coverage a
 * process owner needs to tell a field only an older version carried from one
 * every version still declares (spec: "A column choice shows its version
 * coverage").
 */
function FieldPicker({
  value,
  choices,
  onChange,
  versionsInRange,
  locale,
  addLabel,
}: {
  value: string;
  choices: ColumnChoice[];
  onChange: (fieldId: string) => void;
  versionsInRange: number[];
  locale: UiLocale;
  addLabel?: string;
}) {
  const placeholder = addLabel ?? t(locale, "builder.fieldPickerPlaceholder");
  return (
    <select aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        {placeholder}
      </option>
      {choices.map((c) => (
        <option key={c.fieldId} value={c.fieldId}>
          {c.fieldId}
          {isPartialCoverage(c, versionsInRange) ? ` — ${t(locale, "builder.partialCoverage")}` : ""}
        </option>
      ))}
    </select>
  );
}
