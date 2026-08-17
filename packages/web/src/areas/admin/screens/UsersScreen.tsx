import { Fragment, useCallback, useEffect, useState } from "react";
import { listUsers, createUser, disableUser, enableUser, setUserRoles, setUserManager, setUserPassword } from "../api/client.js";
import type { UserSummary } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { parseRoles, appendRole, managerChoices, managerLabel, managerValueOf } from "./usersLogic.js";
import { t, tFill } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface UsersScreenProps {
  token: string;
  locale: UiLocale;
  onUnauthorized: () => void;
}

/**
 * `MAX_LIST_LIMIT` from `src/engine/admin-queries.ts`. The screen asks for the
 * route's ceiling and walks the cursor from there, so an operator-scale
 * directory arrives in one request.
 */
const PAGE_LIMIT = 200;

/** The `busyId` a pending create holds. No account id collides with it: every `user_id` carries the `user_` prefix. */
const NEW_USER_ROW = "new-user";

/**
 * What the roles input shows when empty. Role names are values the engine
 * matches exactly, so this example stays as the engine spells it.
 *
 * The email input's `jane@example.com` stays a literal for the same kind of
 * reason: an address is a shape, not a word, and it reads alike in either
 * locale.
 */
const ROLES_PLACEHOLDER = "finance:approver, system:admin";

/**
 * The eight reserved roles, spelled the way `src/auth/authorize.ts` exports
 * them. Hardcoded here as the area's other screens hardcode theirs
 * (`root.tsx`, `routing.ts`): no route serves the list, and a role string is
 * otherwise free.
 */
const RESERVED_ROLES = [
  "system:admin",
  "system:publish",
  "system:cancel-any",
  "system:developer",
  "system:author",
  "system:reports",
  "system:datalists",
  "system:templates",
];

export function UsersScreen({ token, locale, onUnauthorized }: UsersScreenProps) {
  const [items, setItems] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  // The open editor and its pending value are local state a reload must not
  // reset: `useRefresh` refetches on window focus, unasked. `field` keeps one
  // editor open per screen, so a row never shows two pending changes at once.
  const [editing, setEditing] = useState<{ userId: string; field: "roles" | "manager" | "password" } | undefined>(undefined);
  const [draftRoles, setDraftRoles] = useState("");
  const [draftManager, setDraftManager] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  // The creation form is its own row rather than a per-row editor, so it keeps
  // its own drafts. A reload must not reset a half-typed account either.
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRoles, setNewRoles] = useState("");
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const editingRoles = (userId: string) => editing?.userId === userId && editing.field === "roles";
  const editingManager = (userId: string) => editing?.userId === userId && editing.field === "manager";
  const editingPassword = (userId: string) => editing?.userId === userId && editing.field === "password";

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      // Follows the cursor to the end rather than showing one page.
      // `managerChoices` and `managerLabel` below read this array as the whole
      // account directory: on a partial set an account past the first page
      // leaves the manager dropdown, and a row pointing at one renders its raw
      // `user_id` through `managerLabel`'s fallback.
      const all: UserSummary[] = [];
      let cursor: string | undefined = undefined;
      do {
        const page = await listUsers(token, { limit: PAGE_LIMIT, cursor });
        all.push(...page.items);
        cursor = page.cursor;
      } while (cursor);
      setItems(all);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, locale, fail]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const toggle = async (user: UserSummary) => {
    if (!user.disabled && !window.confirm(t(locale, "users.disableConfirm"))) return;
    setBusyId(user.userId);
    try {
      if (user.disabled) await enableUser(user.userId, token);
      else await disableUser(user.userId, token);
      refresh();
    } catch (err) {
      fail(err);
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

  const startEditingPassword = (user: UserSummary) => {
    setError(undefined);
    setEditing({ userId: user.userId, field: "password" });
    setDraftPassword("");
  };

  const cancelEditing = () => {
    setEditing(undefined);
    setDraftRoles("");
    setDraftManager("");
    setDraftPassword("");
  };

  const startCreating = () => {
    setError(undefined);
    cancelEditing();
    setCreating(true);
    setNewEmail("");
    setNewPassword("");
    setNewRoles("");
  };

  const cancelCreating = () => {
    setCreating(false);
    setNewEmail("");
    setNewPassword("");
    setNewRoles("");
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
      fail(err);
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
      fail(err);
    } finally {
      setBusyId(undefined);
    }
  };

  const savePassword = async (user: UserSummary) => {
    setBusyId(user.userId);
    try {
      await setUserPassword(user.userId, draftPassword, token);
      cancelEditing();
      // Nothing in a row shows a password, so this reloads for one reason: the
      // rest of the screen may have moved while the editor was open.
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(undefined);
    }
  };

  const saveNewUser = async () => {
    setBusyId(NEW_USER_ROW);
    try {
      await createUser(newEmail, newPassword, parseRoles(newRoles), token);
      cancelCreating();
      refresh();
    } catch (err) {
      // A taken email reads through `describeError`'s `email-in-use` case. The
      // form stays open holding what was typed, so only the address changes.
      fail(err);
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <main className="admin-screen">
      <h1>{t(locale, "users.title")}</h1>

      <div className="admin-controls">
        <button type="button" className="btn btn-primary" onClick={startCreating} disabled={loading || creating}>
          {t(locale, "users.new")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {t(locale, "common.refresh")}
        </button>
      </div>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">{t(locale, "common.failed")}</span>
          <span className="admin-error-banner-message">{error}</span>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            {t(locale, "common.retry")}
          </button>
        </div>
      )}

      {items.length === 0 && !creating && !loading && !error && <p className="admin-empty">{t(locale, "users.empty")}</p>}

      {(items.length > 0 || creating) && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t(locale, "users.colEmail")}</th>
              <th>{t(locale, "users.colRoles")}</th>
              <th>{t(locale, "users.colManager")}</th>
              <th>{t(locale, "users.colStatus")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {creating && (
              <tr>
                <td>
                  <div className="admin-role-editor">
                    {/* autoFocus: the first field of a form the operator just opened by an explicit click. */}
                    <label className="admin-field">
                      <span className="admin-field-label">{t(locale, "users.email")}</span>
                      <input
                        type="email"
                        className="admin-role-input"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelCreating();
                        }}
                        placeholder="jane@example.com"
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field-label">{t(locale, "users.password")}</span>
                      <input
                        type="text"
                        className="admin-role-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelCreating();
                        }}
                        // Shown rather than masked: the operator reads this
                        // value back to hand it over, and nobody is recalling
                        // a secret they already know.
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <p className="admin-role-caveat">{t(locale, "users.createCaveat")}</p>
                  </div>
                </td>
                <td>
                  <div className="admin-role-editor">
                    <input
                      type="text"
                      className="admin-role-input"
                      value={newRoles}
                      onChange={(e) => setNewRoles(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelCreating();
                      }}
                      placeholder={ROLES_PLACEHOLDER}
                      aria-label={t(locale, "users.rolesAriaNew")}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className="admin-role-hint">
                      <span>{t(locale, "users.reserved")}</span>
                      {RESERVED_ROLES.map((role) => (
                        <button key={role} type="button" className="admin-role-chip" onClick={() => setNewRoles((text) => appendRole(text, role))}>
                          {role}
                        </button>
                      ))}
                    </p>
                  </div>
                </td>
                {/* The route takes no manager and no disabled flag: an account
                    is created enabled and unmanaged, then edited from its row. */}
                <td>—</td>
                <td>—</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void saveNewUser()}
                    disabled={busyId === NEW_USER_ROW || !newEmail.trim() || !newPassword.trim()}
                  >
                    {t(locale, "users.createUser")}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={cancelCreating} disabled={busyId === NEW_USER_ROW}>
                    {t(locale, "common.cancel")}
                  </button>
                </td>
              </tr>
            )}
            {items.map((user) => (
              <Fragment key={user.userId}>
                <tr>
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
                          placeholder={ROLES_PLACEHOLDER}
                          aria-label={tFill(locale, "users.rolesAria", { email: user.email })}
                          autoComplete="off"
                          spellCheck={false}
                          autoFocus
                        />
                        <p className="admin-role-hint">
                          <span>{t(locale, "users.reserved")}</span>
                          {RESERVED_ROLES.map((role) => (
                            <button key={role} type="button" className="admin-role-chip" onClick={() => setDraftRoles((text) => appendRole(text, role))}>
                              {role}
                            </button>
                          ))}
                        </p>
                        <p className="admin-role-caveat">{t(locale, "users.roleCaveat")}</p>
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
                          aria-label={tFill(locale, "users.managerAria", { email: user.email })}
                          autoFocus
                        >
                          <option value="">{t(locale, "users.noManager")}</option>
                          {managerChoices(items, user.userId).map((choice) => (
                            <option key={choice.userId} value={choice.userId}>
                              {choice.email}
                            </option>
                          ))}
                        </select>
                        <p className="admin-role-caveat">{t(locale, "users.managerCaveat")}</p>
                      </div>
                    ) : (
                      <span className="admin-manager-name">{managerLabel(items, user.managerUserId)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge-${user.disabled ? "disabled" : "enabled"}`}>
                      {t(locale, user.disabled ? "users.statusDisabled" : "users.statusEnabled")}
                    </span>
                  </td>
                  <td>
                    {editingRoles(user.userId) && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => void saveRoles(user)} disabled={busyId === user.userId}>
                          {t(locale, "users.saveRoles")}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={cancelEditing} disabled={busyId === user.userId}>
                          {t(locale, "common.cancel")}
                        </button>
                      </>
                    )}
                    {editingManager(user.userId) && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => void saveManager(user)} disabled={busyId === user.userId}>
                          {t(locale, "users.saveManager")}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={cancelEditing} disabled={busyId === user.userId}>
                          {t(locale, "common.cancel")}
                        </button>
                      </>
                    )}
                    {editing?.userId !== user.userId && (
                      <>
                        <button type="button" className="btn btn-secondary" onClick={() => startEditing(user)} disabled={busyId === user.userId}>
                          {t(locale, "users.editRoles")}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => startEditingManager(user)} disabled={busyId === user.userId}>
                          {t(locale, "users.editManager")}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => startEditingPassword(user)} disabled={busyId === user.userId}>
                          {t(locale, "users.resetPassword")}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => void toggle(user)} disabled={busyId === user.userId}>
                          {t(locale, user.disabled ? "users.enable" : "users.disable")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {editingPassword(user.userId) && (
                  // Its own row rather than a replaced cell: a password matches
                  // no column here, and displacing one would put the editor
                  // under a heading that names something else.
                  <tr className="admin-editor-row">
                    <td colSpan={5}>
                      <div className="admin-role-editor">
                        <label className="admin-field">
                          <span className="admin-field-label">{tFill(locale, "users.newPasswordFor", { email: user.email })}</span>
                          {/* autoFocus: the single input of an editor the operator just opened by an explicit click. */}
                          <input
                            type="text"
                            className="admin-role-input"
                            value={draftPassword}
                            onChange={(e) => setDraftPassword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && draftPassword.trim()) void savePassword(user);
                              if (e.key === "Escape") cancelEditing();
                            }}
                            autoComplete="off"
                            spellCheck={false}
                            autoFocus
                          />
                        </label>
                        <p className="admin-role-caveat">{t(locale, "users.resetCaveat")}</p>
                        <div className="admin-editor-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void savePassword(user)}
                            disabled={busyId === user.userId || !draftPassword.trim()}
                          >
                            {t(locale, "users.setPassword")}
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={cancelEditing} disabled={busyId === user.userId}>
                            {t(locale, "common.cancel")}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
