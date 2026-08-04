import { useCallback, useEffect, useState } from "react";
import { getDataList, updateDataList, putDataListValues, deleteDataList, AdminClientError } from "../api/client.js";
import type { DataListDetail } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { readLabel, toPayload, validateValues, type ValueRow } from "./dataListsLogic.js";
import type { Route } from "../routing.js";

interface DataListScreenProps {
  listKey: string;
  token: string;
  locale: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

const DELETE_CONFIRM = "Deleting removes the list and every value in it. A list a published process references cannot be deleted. Continue?";

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
      else setError(describeCaughtError(err));
    } finally {
      setLoading(false);
    }
  }, [listKey, token, locale, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const problems = validateValues(rows);

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
      else setError(describeCaughtError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(DELETE_CONFIRM)) return;
    setSaving(true);
    setError(undefined);
    try {
      await deleteDataList(listKey, token);
      navigate({ name: "dataLists" });
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-screen">
      <button type="button" className="admin-row-link" onClick={() => navigate({ name: "dataLists" })}>
        ← Data lists
      </button>
      <h1>{listKey}</h1>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">Failed</span>
          <span className="admin-error-banner-message">{error}</span>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {detail && (
        <>
          <div className="admin-controls">
            <label className="admin-field">
              Name
              <input
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="admin-field">
              Description
              <input
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>

          <h2>Values</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Value</th>
                <th>Label ({locale})</th>
                <th>State</th>
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
                      aria-label={`Value ${i + 1} key`}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="cost_centre_a…"
                    />
                  </td>
                  <td>
                    <input value={row.label} onChange={(e) => patch(i, { label: e.target.value })} aria-label={`Value ${i + 1} label`} />
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge-${row.retired ? "disabled" : "enabled"}`}>{row.retired ? "retired" : "offered"}</span>
                  </td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => patch(i, { retired: !row.retired })}>
                      {row.retired ? "Offer again" : "Retire"}
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
              Add value
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || problems.length > 0}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <span className="admin-note" aria-live="polite">
              {saved ? "Saved." : ""}
            </span>
          </div>

          <p className="admin-note">
            A retired value stays in this table. Instances that already hold it keep seeing its label, and it is no longer offered to anyone else.
          </p>

          <h2>Used by</h2>
          {detail.usedBy.length === 0 ? (
            <p className="admin-empty">No published version reads this list. It can be deleted.</p>
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
              Delete list
            </button>
          </div>
        </>
      )}
    </main>
  );
}
