import { useCallback, useEffect, useState } from "react";
import { getDataList, updateDataList, putDataListValues, deleteDataList } from "../api/client.js";
import type { DataListDetail } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import {
  attributesToInputs,
  badNumberAttributes,
  droppedColumns,
  mappingProcesses,
  readLabel,
  toPayload,
  validateColumns,
  validateValues,
  type ColumnRow,
  type ValueRow,
} from "./dataListsLogic.js";
import type { Route } from "../routing.js";
import { t, tFill } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface DataListScreenProps {
  listKey: string;
  token: string;
  /** Both the chrome's locale and the one a value's label is edited under. */
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/**
 * One list: its columns, its values, and the published versions that read it.
 *
 * A retired value keeps its row, marked, rather than vanishing — a running
 * instance can still hold it, and the operator needs to see that. Retiring is
 * the only removal this screen offers, because it is the only one the route
 * performs: saving sends the values that are not retired, and the server
 * deactivates the rest.
 *
 * Columns sit above values because a value's attribute inputs come from the
 * declaration. The order on screen is the order the two depend on.
 */
export function DataListScreen({ listKey, token, locale, navigate, onUnauthorized }: DataListScreenProps) {
  const [detail, setDetail] = useState<DataListDetail | undefined>(undefined);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [rows, setRows] = useState<ValueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await getDataList(listKey, token);
      setDetail(next);
      setLabel(next.label);
      setDescription(next.description ?? "");
      setColumns(next.columns.map((c) => ({ ...c })));
      setRows(
        next.values.map((v) => ({
          value: v.value,
          label: readLabel(v.label, locale),
          attributes: attributesToInputs(v.attributes, next.columns),
          retired: !v.active,
        })),
      );
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [listKey, token, locale, fail]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const problems = [...validateColumns(columns, locale), ...validateValues(rows, locale), ...badNumberAttributes(rows, columns, locale)];

  const patch = (index: number, change: Partial<ValueRow>) => {
    setSaved(false);
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)));
  };

  const patchAttribute = (index: number, key: string, value: string) => {
    setSaved(false);
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, attributes: { ...row.attributes, [key]: value } } : row)));
  };

  const patchColumn = (index: number, change: Partial<ColumnRow>) => {
    setSaved(false);
    setColumns((prev) => prev.map((column, i) => (i === index ? { ...column, ...change } : column)));
  };

  const save = async () => {
    if (!detail) return;
    // The warning fires before the write, not after: dropping a column drops
    // its entry from every value, and no screen here undoes that.
    const dropping = droppedColumns(detail.columns, columns);
    if (dropping.length > 0) {
      // The processes come after the columns sentence, each key its own whole
      // sentence: a translator never sees half of one.
      const breaking = mappingProcesses(detail.usedBy, dropping);
      const warning = [
        tFill(locale, "dataList.dropColumnConfirm", { columns: dropping.join(", ") }),
        ...(breaking.length === 0 ? [] : [tFill(locale, "dataList.dropColumnMapped", { processes: breaking.join(", ") })]),
      ].join(" ");
      if (!window.confirm(warning)) return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const existingLabels = Object.fromEntries(detail.values.map((v) => [v.value, v.label]));
      // The declaration goes first: the values route checks every attribute
      // against the columns the list holds, so it has to hold them by then.
      await updateDataList(listKey, label.trim(), description.trim() === "" ? null : description.trim(), token, columns);
      await putDataListValues(listKey, toPayload(rows, locale, existingLabels, columns), token);
      setSaved(true);
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t(locale, "dataList.deleteConfirm"))) return;
    setSaving(true);
    setError(undefined);
    try {
      await deleteDataList(listKey, token);
      navigate({ name: "dataLists" });
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-screen">
      <button type="button" className="admin-row-link" onClick={() => navigate({ name: "dataLists" })}>
        {t(locale, "dataList.back")}
      </button>
      <h1>{listKey}</h1>

      {error && <ErrorBanner error={error} locale={locale} onRetry={refresh} retryDisabled={loading} />}

      {detail && (
        <>
          <div className="admin-controls">
            <label className="admin-field">
              {t(locale, "dataList.name")}
              <input
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="admin-field">
              {t(locale, "dataList.description")}
              <input
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>

          <h2>{t(locale, "dataList.columnsTitle")}</h2>
          <p className="admin-note">{t(locale, "dataList.columnsNote")}</p>
          {columns.length === 0 ? (
            <p className="admin-empty">{t(locale, "dataList.columnsEmpty")}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t(locale, "dataList.colColumnKey")}</th>
                  <th>{t(locale, "dataList.colColumnLabel")}</th>
                  <th>{t(locale, "dataList.colColumnType")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {/* Keyed by position, for the reason the value rows are: the
                    key is what the input edits, so keying on it would remount
                    the field and drop focus on every keystroke. */}
                {columns.map((column, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className="admin-mono"
                        value={column.key}
                        onChange={(e) => patchColumn(i, { key: e.target.value })}
                        aria-label={tFill(locale, "dataList.columnKeyAria", { n: i + 1 })}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="unit_price…"
                      />
                    </td>
                    <td>
                      <input
                        value={column.label}
                        onChange={(e) => patchColumn(i, { label: e.target.value })}
                        aria-label={tFill(locale, "dataList.columnLabelAria", { n: i + 1 })}
                      />
                    </td>
                    <td>
                      <select
                        value={column.type}
                        onChange={(e) => patchColumn(i, { type: e.target.value as ColumnRow["type"] })}
                        aria-label={tFill(locale, "dataList.columnTypeAria", { n: i + 1 })}
                      >
                        <option value="string">{t(locale, "dataList.typeString")}</option>
                        <option value="number">{t(locale, "dataList.typeNumber")}</option>
                        <option value="boolean">{t(locale, "dataList.typeBoolean")}</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setSaved(false);
                          setColumns((prev) => prev.filter((_, j) => j !== i));
                        }}
                      >
                        {t(locale, "dataList.removeColumn")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="admin-controls">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSaved(false);
                setColumns((prev) => [...prev, { key: "", label: "", type: "string" }]);
              }}
            >
              {t(locale, "dataList.addColumn")}
            </button>
          </div>

          <h2>{t(locale, "dataList.valuesTitle")}</h2>
          {/* The one admin table whose width an operator decides: it grows a
              column per declared column. It scrolls inside this container, so
              the page never scrolls sideways. */}
          <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t(locale, "dataList.colValue")}</th>
                <th>{tFill(locale, "dataList.colLabel", { locale })}</th>
                {columns.map((column, i) => (
                  <th key={i}>{column.label || column.key}</th>
                ))}
                <th>{t(locale, "dataList.colState")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                // Keyed by position, not by `row.value`: the value is what the
                // input edits, so keying on it would remount the field — and
                // drop focus — on every keystroke. Rows are only appended and
                // edited in place, never reordered.
                <tr key={i} className={row.retired ? "admin-row-retired" : undefined}>
                  <td>
                    <input
                      value={row.value}
                      onChange={(e) => patch(i, { value: e.target.value })}
                      aria-label={tFill(locale, "dataList.valueKeyAria", { n: i + 1 })}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="cost_centre_a…"
                    />
                  </td>
                  <td>
                    <input value={row.label} onChange={(e) => patch(i, { label: e.target.value })} aria-label={tFill(locale, "dataList.valueLabelAria", { n: i + 1 })} />
                  </td>
                  {/* A retired value's attributes are readonly: the values
                      route retires such a row rather than rewriting it, so an
                      editable input would promise a write that never happens. */}
                  {columns.map((column, ci) => {
                    const aria = tFill(locale, "dataList.attributeAria", { column: column.label || column.key, n: i + 1 });
                    if (column.type === "boolean") {
                      return (
                        <td key={ci}>
                          <input
                            type="checkbox"
                            checked={row.attributes[column.key] === "true"}
                            disabled={row.retired}
                            onChange={(e) => patchAttribute(i, column.key, e.target.checked ? "true" : "false")}
                            aria-label={aria}
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={ci}>
                        <input
                          type={column.type === "number" ? "number" : "text"}
                          className={column.type === "number" ? "admin-mono" : undefined}
                          value={row.attributes[column.key] ?? ""}
                          readOnly={row.retired}
                          onChange={(e) => patchAttribute(i, column.key, e.target.value)}
                          aria-label={aria}
                        />
                      </td>
                    );
                  })}
                  <td>
                    <span className={`admin-badge admin-badge-${row.retired ? "disabled" : "enabled"}`}>
                      {t(locale, row.retired ? "dataList.stateRetired" : "dataList.stateOffered")}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => patch(i, { retired: !row.retired })}>
                      {t(locale, row.retired ? "dataList.offerAgain" : "dataList.retire")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Above the controls, so the reason a disabled Save is disabled is
              visible without scrolling past it. */}
          {/* Keyed by position, not by the message. Two blank columns produce
              the SAME sentence twice, and a duplicate React key breaks
              reconciliation: the list keeps stale entries after the problems
              clear, while Save re-enables from the same render. A production
              build strips React's duplicate-key warning, so nothing says so.
              The list is fully re-derived every render and never reordered, so
              the index is the honest key. */}
          <ul className="admin-error" aria-live="polite">
            {problems.map((problem, i) => (
              <li key={i}>{problem}</li>
            ))}
          </ul>

          <div className="admin-controls">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSaved(false);
                setRows((prev) => [...prev, { value: "", label: "", attributes: {}, retired: false }]);
              }}
            >
              {t(locale, "dataList.addValue")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || problems.length > 0}>
              {saving ? t(locale, "common.saving") : t(locale, "common.saveChanges")}
            </button>
            <span className="admin-note" aria-live="polite">
              {saved ? t(locale, "common.saved") : ""}
            </span>
          </div>

          <p className="admin-note">{t(locale, "dataList.retiredNote")}</p>

          <h2>{t(locale, "dataList.usedByTitle")}</h2>
          {detail.usedBy.length === 0 ? (
            <p className="admin-empty">{t(locale, "dataList.usedByEmpty")}</p>
          ) : (
            <ul className="admin-timeline">
              {detail.usedBy.map((use) => (
                <li key={`${use.processId}-${use.version}`}>
                  {use.processId} <span className="admin-timeline-meta">v{use.version}</span>{" "}
                  {use.columns.length === 0 ? (
                    <span className="admin-timeline-meta">{t(locale, "dataList.usedByNoColumns")}</span>
                  ) : (
                    <span className="admin-timeline-meta">
                      {t(locale, "dataList.usedByColumns")}{" "}
                      <code className="admin-timeline-key">{use.columns.join(", ")}</code>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="admin-controls">
            <button type="button" className="btn btn-secondary btn-destructive" onClick={() => void remove()} disabled={saving || detail.usedBy.length > 0}>
              {t(locale, "dataList.delete")}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
