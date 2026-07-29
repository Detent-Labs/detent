import { useCallback, useEffect, useState } from "react";
import { listUsers, disableUser, enableUser, AdminClientError } from "../api/client.js";
import type { UserSummary } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";

interface UsersScreenProps {
  token: string;
  onUnauthorized: () => void;
}

const DISABLE_CONFIRM =
  "Disabling blocks this user's next login attempt. It does not end an already-active session — a token issued before this remains valid until it expires (up to 8 hours). Continue?";

export function UsersScreen({ token, onUnauthorized }: UsersScreenProps) {
  const [items, setItems] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const { reloadToken, refresh } = useRefresh();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await listUsers(token);
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

  const toggle = async (user: UserSummary) => {
    if (!user.disabled && !window.confirm(DISABLE_CONFIRM)) return;
    setBusyId(user.userId);
    try {
      if (user.disabled) await enableUser(user.userId, token);
      else await disableUser(user.userId, token);
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <main className="admin-screen">
      <h1>Users</h1>

      <div className="admin-controls">
        <button type="button" onClick={refresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">Failed</span>
          <span className="admin-error-banner-message">{error}</span>
          <button type="button" onClick={refresh} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {items.length === 0 && !loading && !error && <p className="admin-empty">No users.</p>}

      {items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Roles</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <tr key={user.userId}>
                <td>{user.email}</td>
                <td>{user.roles.join(", ") || "—"}</td>
                <td>
                  <span className={`admin-badge admin-badge-${user.disabled ? "disabled" : "enabled"}`}>{user.disabled ? "disabled" : "enabled"}</span>
                </td>
                <td>
                  <button type="button" onClick={() => void toggle(user)} disabled={busyId === user.userId}>
                    {user.disabled ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
