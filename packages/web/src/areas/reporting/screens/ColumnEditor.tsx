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
        <p className="rep-empty">{t(locale, "builder.columnsEmpty")}</p>
      ) : (
        <ol className="rep-column-list">
          {columns.map((col, i) => (
            <li key={i} className="rep-column-row">
              <div className="rep-column-row-head">
                <span className="rep-column-index" translate="no">
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
                  <span className="rep-stamp">{t(locale, "builder.mergeColumnLabel")}</span>
                )}
                <div className="rep-column-row-actions">
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
                <div className="rep-merge-sources">
                  <p className="rep-scope">{t(locale, "builder.mergeSources")}</p>
                  <ol>
                    {col.fieldIds.map((fieldId, sourceIndex) => (
                      <li key={sourceIndex} className="rep-merge-source-row">
                        <span translate="no" className="rep-figure">
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
      <div className="rep-column-add">
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
    <select className="rep-field-picker" aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)}>
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
