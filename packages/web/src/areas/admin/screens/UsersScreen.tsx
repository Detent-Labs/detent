import { useCallback, useEffect, useState } from "react";
import { listUsers, disableUser, enableUser, setUserRoles, setUserManager, AdminClientError } from "../api/client.js";
import type { UserSummary } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { parseRoles, appendRole, managerChoices, managerLabel, managerValueOf } from "./usersLogic.js";

interface UsersScreenProps {
  token: string;
  onUnauthorized: () => void;
}

const DISABLE_CONFIRM =
  "Disabling blocks this user's next login attempt. It does not end an already-active session — a token issued before this remains valid until it expires (up to 8 hours). Continue?";

const ROLE_CAVEAT = "A role change takes effect at the user's next login. Their active session keeps the roles it was issued with.";

const MANAGER_CAVEAT =
  "A manager change applies to instances started from now on. An instance already waiting at an approval step keeps the manager resolved when it got there.";

/**
 * The six reserved roles, spelled the way `src/auth/authorize.ts` exports them.
 * Hardcoded here as the area's other screens hardcode theirs (`root.tsx`,
 * `routing.ts`): no route serves the list, and a role string is otherwise free.
 */
const RESERVED_ROLES = ["system:admin", "system:publish", "system:cancel-any", "system:developer", "system:reports", "system:datalists"];

export function UsersScreen({ token, onUnauthorized }: UsersScreenProps) {
  const [items, setItems] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  // The open editor and its pending value are local state a reload must not
  // reset: `useRefresh` refetches on window focus, unasked. `field` keeps one
  // editor open per screen, so a row never shows two pending changes at once.
  const [editing, setEditing] = useState<{ userId: string; field: "roles" | "manager" } | undefined>(undefined);
  const [draftRoles, setDraftRoles] = useState("");
  const [draftManager, setDraftManager] = useState("");
  const { reloadToken, refresh } = useRefresh();

  const editingRoles = (userId: string) => editing?.userId === userId && editing.field === "roles";
  const editingManager = (userId: string) => editing?.userId === userId && editing.field === "manager";

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

  const startEditing = (user: UserSummary) => {
    setError(undefined);
    setEditing({ userId: user.userId, field: "roles" });
    setDraftRoles(user.roles.join(", "));
  };

  const startEditingManager = (user: UserSummary) => {
    setError(undefined);
    setEditing({ userId: user.userId, field: "manager" });
    setDraftManager(user.managerUserId ?? "");
  };

  const cancelEditing = () => {
    setEditing(undefined);
    setDraftRoles("");
    setDraftManager("");
  };

  const saveRoles = async (user: UserSummary) => {
    setBusyId(user.userId);
    try {
      await setUserRoles(user.userId, parseRoles(draftRoles), token);
      cancelEditing();
      refresh();
    } catch (err) {
      // A self-strip refusal reads through `describeError`'s `self-role-strip`
      // case, like every other typed failure on this screen.
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setBusyId(undefined);
    }
  };

  const saveManager = async (user: UserSummary) => {
    setBusyId(user.userId);
    try {
      await setUserManager(user.userId, managerValueOf(draftManager), token);
      cancelEditing();
      refresh();
    } catch (err) {
      // A refusal leaves the editor open and the row's stored manager on
      // screen: nothing was written, so nothing should read as written.
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
              <th>Manager</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <tr key={user.userId}>
                <td>{user.email}</td>
                <td>
                  {editingRoles(user.userId) ? (
                    <div className="admin-role-editor">
                      {/* autoFocus: the single input of an editor the operator just opened by an explicit click. */}
                      <input
                        type="text"
                        className="admin-role-input"
                        value={draftRoles}
                        onChange={(e) => setDraftRoles(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveRoles(user);
                          if (e.key === "Escape") cancelEditing();
                        }}
                        placeholder="finance:approver, system:admin"
                        aria-label={`Roles for ${user.email}, separated by commas`}
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                      />
                      <p className="admin-role-hint">
                        <span>Reserved:</span>
                        {RESERVED_ROLES.map((role) => (
                          <button key={role} type="button" className="admin-role-chip" onClick={() => setDraftRoles((text) => appendRole(text, role))}>
                            {role}
                          </button>
                        ))}
                      </p>
                      <p className="admin-role-caveat">{ROLE_CAVEAT}</p>
                    </div>
                  ) : (
                    <span className="admin-role-list">{user.roles.join(", ") || "—"}</span>
                  )}
                </td>
                <td>
                  {editingManager(user.userId) ? (
                    <div className="admin-role-editor">
                      {/* autoFocus: the single control of an editor the operator just opened by an explicit click. */}
                      <select
                        className="admin-manager-select"
                        value={draftManager}
                        onChange={(e) => setDraftManager(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveManager(user);
                          if (e.key === "Escape") cancelEditing();
                        }}
                        aria-label={`Manager for ${user.email}`}
                        autoFocus
                      >
                        <option value="">No manager</option>
                        {managerChoices(items, user.userId).map((choice) => (
                          <option key={choice.userId} value={choice.userId}>
                            {choice.email}
                          </option>
                        ))}
                      </select>
                      <p className="admin-role-caveat">{MANAGER_CAVEAT}</p>
                    </div>
                  ) : (
                    <span className="admin-manager-name">{managerLabel(items, user.managerUserId)}</span>
                  )}
                </td>
                <td>
                  <span className={`admin-badge admin-badge-${user.disabled ? "disabled" : "enabled"}`}>{user.disabled ? "disabled" : "enabled"}</span>
                </td>
                <td>
                  {editingRoles(user.userId) && (
                    <>
                      <button type="button" onClick={() => void saveRoles(user)} disabled={busyId === user.userId}>
                        Save roles
                      </button>
                      <button type="button" onClick={cancelEditing} disabled={busyId === user.userId}>
                        Cancel
                      </button>
                    </>
                  )}
                  {editingManager(user.userId) && (
                    <>
                      <button type="button" onClick={() => void saveManager(user)} disabled={busyId === user.userId}>
                        Save manager
                      </button>
                      <button type="button" onClick={cancelEditing} disabled={busyId === user.userId}>
                        Cancel
                      </button>
                    </>
                  )}
                  {editing?.userId !== user.userId && (
                    <>
                      <button type="button" onClick={() => startEditing(user)} disabled={busyId === user.userId}>
                        Edit roles
                      </button>
                      <button type="button" onClick={() => startEditingManager(user)} disabled={busyId === user.userId}>
                        Edit manager
                      </button>
                      <button type="button" onClick={() => void toggle(user)} disabled={busyId === user.userId}>
                        {user.disabled ? "Enable" : "Disable"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
