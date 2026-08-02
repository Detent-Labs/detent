import { useCallback, useEffect, useState } from "react";
import { listDataLists, createDataList, AdminClientError } from "../api/client.js";
import type { DataListSummary } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import type { Route } from "../routing.js";

interface DataListsScreenProps {
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/**
 * The overview: every data list, with how many values it currently offers.
 * Creating one takes a key and a label; the values are the detail screen's job,
 * and a list is allowed to exist with none.
 */
export function DataListsScreen({ token, navigate, onUnauthorized }: DataListsScreenProps) {
  const [items, setItems] = useState<DataListSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [listKey, setListKey] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const { reloadToken, refresh } = useRefresh();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await listDataLists(token);
      setItems(page.items);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setLoading(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const create = async () => {
    setCreating(true);
    setError(undefined);
    try {
      await createDataList(listKey.trim(), label.trim(), null, token);
      setListKey("");
      setLabel("");
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setCreating(false);
    }
  };

  const canCreate = listKey.trim() !== "" && label.trim() !== "" && !creating;

  return (
    <main className="admin-screen">
      <h1>Data lists</h1>
      <p className="admin-note">
        Values a process offers without being republished. Changing them takes effect on the next form a participant opens.
      </p>

      <form
        className="admin-controls"
        onSubmit={(e) => {
          e.preventDefault();
          if (canCreate) void create();
        }}
      >
        <input
          value={listKey}
          onChange={(e) => setListKey(e.target.value)}
          placeholder="cost_centres…"
          aria-label="List key"
          autoComplete="off"
          spellCheck={false}
        />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cost centres…" aria-label="List name" autoComplete="off" />
        <button type="submit" disabled={!canCreate}>
          {creating ? "Creating…" : "Create list"}
        </button>
        <button type="button" onClick={refresh} disabled={loading}>
          Refresh
        </button>
      </form>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">Failed</span>
          <span className="admin-error-banner-message">{error}</span>
          <button type="button" onClick={refresh} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {items.length === 0 && !loading && !error && <p className="admin-empty">No data lists yet. Create one to give a process a maintainable option list.</p>}

      {items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Name</th>
              <th>Active values</th>
              <th>Last change</th>
            </tr>
          </thead>
          <tbody>
            {items.map((list) => (
              <tr key={list.listKey}>
                <td>
                  <button type="button" className="admin-row-link" onClick={() => navigate({ name: "dataList", listKey: list.listKey })}>
                    {list.listKey}
                  </button>
                </td>
                <td>{list.label}</td>
                <td>{list.activeValueCount}</td>
                <td>
                  {new Date(list.updatedAt).toLocaleString()} · {list.updatedBy}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
