import { useCallback, useEffect, useState } from "react";
import { getDataList, updateDataList, putDataListValues, deleteDataList, AdminClientError } from "../api/client.js";
import type { DataListDetail } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { readLabel, toPayload, validateValues, type ValueRow } from "./dataListsLogic.js";
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
 * One list: its name, its values, and the published versions that read it.
 *
 * A retired value keeps its row, marked, rather than vanishing — a running
 * instance can still hold it, and the operator needs to see that. Retiring is
 * the only removal this screen offers, because it is the only one the route
 * performs: saving sends the values that are not retired, and the server
 * deactivates the rest.
 */
export function DataListScreen({ listKey, token, locale, navigate, onUnauthorized }: DataListScreenProps) {
  const [detail, setDetail] = useState<DataListDetail | undefined>(undefined);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<ValueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { reloadToken, refresh } = useRefresh();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await getDataList(listKey, token);
      setDetail(next);
      setLabel(next.label);
      setDescription(next.description ?? "");
      setRows(next.values.map((v) => ({ value: v.value, label: readLabel(v.label, locale), retired: !v.active })));
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [listKey, token, locale, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const problems = validateValues(rows, locale);

  const patch = (index: number, change: Partial<ValueRow>) => {
    setSaved(false);
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)));
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    setError(undefined);
    try {
      const existingLabels = Object.fromEntries(detail.values.map((v) => [v.value, v.label]));
      await updateDataList(listKey, label.trim(), description.trim() === "" ? null : description.trim(), token);
      await putDataListValues(listKey, toPayload(rows, locale, existingLabels), token);
      setSaved(true);
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
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
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
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

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">{t(locale, "common.failed")}</span>
          <span className="admin-error-banner-message">{error}</span>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            {t(locale, "common.retry")}
          </button>
        </div>
      )}

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

          <h2>{t(locale, "dataList.valuesTitle")}</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t(locale, "dataList.colValue")}</th>
                <th>{tFill(locale, "dataList.colLabel", { locale })}</th>
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

          {/* Above the controls, so the reason a disabled Save is disabled is
              visible without scrolling past it. */}
          <ul className="admin-error" aria-live="polite">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>

          <div className="admin-controls">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSaved(false);
                setRows((prev) => [...prev, { value: "", label: "", retired: false }]);
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
                  {use.processId} <span className="admin-timeline-meta">v{use.version}</span>
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
