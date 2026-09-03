import { Fragment, useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import {
  listGroups,
  createGroup,
  renameGroup,
  setGroupMembers,
  setGroupScope,
  deleteGroup,
  listProcesses,
  listUsers,
  AdminClientError,
} from "../api/client.js";
import type { GroupSummary, GroupScope, ProcessSummary, UserSummary } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import {
  scopeText,
  groupMatchesFilter,
  prefillScope,
  resolveMemberTokens,
  memberDisplayText,
  blockingProcessLabels,
  scopeIsSavable,
} from "./groupsLogic.js";
import { labelText } from "./instancesLogic.js";
import { t, tFill } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface GroupsScreenProps {
  token: string;
  locale: UiLocale;
  /** Studio's "Manage assignment groups for this process" link's target, read once at mount. The operator can still change or clear the filter afterward. */
  initialProcessId?: string;
  onUnauthorized: () => void;
}

/** `MAX_LIST_LIMIT` from `src/engine/admin-queries.ts`, the same ceiling `UsersScreen`'s own walk asks for. */
const PAGE_LIMIT = 200;

/** The `busyId` a pending create holds. No group id collides with it: every `group_id` carries the `group_` prefix. */
const NEW_GROUP_ROW = "new-group";

type ScopeType = GroupScope["type"];

function scopeOf(type: ScopeType, processIds: string[]): GroupScope {
  return type === "global" ? { type: "global" } : { type: "processes", processIds };
}

/** `app.css`'s screen/controls/table/editor rules, as StyleX. `roleInput`
 * merges `.admin-role-input`'s two source declarations (design.md D12). */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  th: {
    textAlign: "left",
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  td: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "top",
  },
  tr: {
    background: { default: "none", ":hover": colors.surfaceMuted },
  },
  nameEditor: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: "18rem",
  },
  nameInput: {
    width: "100%",
    paddingBlock: 4,
    paddingInline: 6,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
  },
  roleEditor: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: "18rem",
  },
  roleInput: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    width: "100%",
    paddingBlock: 4,
    paddingInline: 6,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
  },
  error: {
    color: colors.refusal,
  },
});

/**
 * The Groups screen: list, process-filter, create, rename, scope-edit,
 * member-edit and delete, mirroring `UsersScreen.tsx`'s inline-edit shape and
 * `MigrationsScreen.tsx`'s process picker (design.md).
 */
export function GroupsScreen({ token, locale, initialProcessId, onUnauthorized }: GroupsScreenProps) {
  const [items, setItems] = useState<GroupSummary[]>([]);
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [filterProcessId, setFilterProcessId] = useState(initialProcessId ?? "");

  // The open editor and its pending values are local state a reload must not
  // reset: `useRefresh` refetches on window focus, unasked.
  const [editing, setEditing] = useState<{ groupId: string; field: "name" | "scope" | "members" } | undefined>(undefined);
  const [draftName, setDraftName] = useState("");
  const [draftScopeType, setDraftScopeType] = useState<ScopeType>("global");
  const [draftScopeProcessIds, setDraftScopeProcessIds] = useState<string[]>([]);
  const [draftScopeError, setDraftScopeError] = useState<string | undefined>(undefined);
  const [draftMembers, setDraftMembers] = useState("");
  const [draftMembersError, setDraftMembersError] = useState<string[] | undefined>(undefined);

  // The creation form is its own row rather than a per-row editor, so it
  // keeps its own drafts. A reload must not reset a half-typed group either.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScopeType, setNewScopeType] = useState<ScopeType>("global");
  const [newScopeProcessIds, setNewScopeProcessIds] = useState<string[]>([]);

  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const editingName = (groupId: string) => editing?.groupId === groupId && editing.field === "name";
  const editingScope = (groupId: string) => editing?.groupId === groupId && editing.field === "scope";
  const editingMembers = (groupId: string) => editing?.groupId === groupId && editing.field === "members";

  const busy = useCallback(
    async (id: string, fn: () => Promise<void>) => {
      setBusyId(id);
      try {
        await fn();
      } catch (err) {
        fail(err);
      } finally {
        setBusyId(undefined);
      }
    },
    [fail],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      // Follows the cursor to the end rather than showing one page, the same
      // way `UsersScreen.tsx`'s own `load()` does — `group-administration`'s
      // spec requires the same pagination `GET /admin/users` uses.
      const allGroups: GroupSummary[] = [];
      let groupCursor: string | undefined = undefined;
      do {
        const page = await listGroups(token, { limit: PAGE_LIMIT, cursor: groupCursor });
        allGroups.push(...page.items);
        groupCursor = page.cursor;
      } while (groupCursor);
      setItems(allGroups);

      // The full account directory, the same way `UsersScreen.tsx`'s manager
      // control resolves one, so the member editor can resolve an email
      // against every account, not just the first page.
      const allUsers: UserSummary[] = [];
      let userCursor: string | undefined = undefined;
      do {
        const page = await listUsers(token, { limit: PAGE_LIMIT, cursor: userCursor });
        allUsers.push(...page.items);
        userCursor = page.cursor;
      } while (userCursor);
      setUsers(allUsers);

      setProcesses(await listProcesses(token));
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, fail]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const visible = items.filter((g) => groupMatchesFilter(g.scope, filterProcessId || undefined));

  const cancelEditing = () => {
    setEditing(undefined);
    setDraftName("");
    setDraftScopeType("global");
    setDraftScopeProcessIds([]);
    setDraftScopeError(undefined);
    setDraftMembers("");
    setDraftMembersError(undefined);
  };

  const startEditingName = (group: GroupSummary) => {
    setError(undefined);
    cancelEditing();
    setEditing({ groupId: group.groupId, field: "name" });
    setDraftName(group.name);
  };

  const startEditingScope = (group: GroupSummary) => {
    setError(undefined);
    cancelEditing();
    setEditing({ groupId: group.groupId, field: "scope" });
    setDraftScopeType(group.scope.type);
    setDraftScopeProcessIds(group.scope.type === "processes" ? group.scope.processIds : []);
  };

  const startEditingMembers = (group: GroupSummary) => {
    setError(undefined);
    cancelEditing();
    setEditing({ groupId: group.groupId, field: "members" });
    setDraftMembers(memberDisplayText(group.members, users));
  };

  const startCreating = () => {
    setError(undefined);
    cancelEditing();
    setCreating(true);
    setNewName("");
    const scope = prefillScope(filterProcessId || undefined);
    setNewScopeType(scope.type);
    setNewScopeProcessIds(scope.type === "processes" ? scope.processIds : []);
  };

  const cancelCreating = () => {
    setCreating(false);
    setNewName("");
    setNewScopeType("global");
    setNewScopeProcessIds([]);
  };

  const saveNewGroup = async () => {
    const scope = scopeOf(newScopeType, newScopeProcessIds);
    if (!scopeIsSavable(scope)) return;
    await busy(NEW_GROUP_ROW, async () => {
      await createGroup(newName.trim(), scope, token);
      cancelCreating();
      refresh();
    });
  };

  const saveName = async (group: GroupSummary) => {
    await busy(group.groupId, async () => {
      await renameGroup(group.groupId, draftName, token);
      cancelEditing();
      refresh();
    });
  };

  const saveScope = async (group: GroupSummary) => {
    const scope = scopeOf(draftScopeType, draftScopeProcessIds);
    if (!scopeIsSavable(scope)) {
      setDraftScopeError(t(locale, "groups.scopeEmptyError"));
      return;
    }
    await busy(group.groupId, async () => {
      await setGroupScope(group.groupId, scope, token);
      cancelEditing();
      refresh();
    });
  };

  const saveMembers = async (group: GroupSummary) => {
    const result = resolveMemberTokens(draftMembers, users, group.members);
    if (!result.ok) {
      setDraftMembersError(result.unresolvedTokens);
      return;
    }
    await busy(group.groupId, async () => {
      await setGroupMembers(group.groupId, result.memberIds, token);
      cancelEditing();
      refresh();
    });
  };

  // `describeCaughtError` cannot render this refusal (task 3.10): it never
  // reads `error.message`, and it has no field for resolved process labels.
  // This catch block is scoped to this screen's own `deleteGroup` call, so a
  // `"conflict"` caught here cannot be any other route's refusal.
  const remove = async (group: GroupSummary) => {
    if (!window.confirm(tFill(locale, "groups.deleteConfirm", { name: group.name }))) return;
    setBusyId(group.groupId);
    setError(undefined);
    try {
      await deleteGroup(group.groupId, token);
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.error.type === "group-referenced") {
        const ids = err.error.blockingProcessIds;
        if (ids && ids.length > 0) {
          setError(tFill(locale, "groups.deleteBlocked", { processes: blockingProcessLabels(ids, processes).join(", ") }));
        } else {
          setError(t(locale, "groups.deleteBlockedGeneric"));
        }
      } else if (err instanceof AdminClientError && err.error.type === "conflict") {
        setError(t(locale, "groups.deleteBlockedGeneric"));
      } else {
        fail(err);
      }
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <main {...stylex.props(styles.screen)}>
      <h1>{t(locale, "groups.title")}</h1>

      <div {...stylex.props(styles.controls)}>
        <label>
          {t(locale, "groups.filterProcess")}
          <select value={filterProcessId} onChange={(e) => setFilterProcessId(e.target.value)}>
            <option value="">{t(locale, "groups.filterAll")}</option>
            {processes.map((p) => (
              <option key={p.processId} value={p.processId}>
                {labelText(p.label, p.baseLocale)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" onClick={startCreating} disabled={loading || creating}>
          {t(locale, "groups.new")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {t(locale, "common.refresh")}
        </button>
      </div>

      {error && <ErrorBanner error={error} locale={locale} onRetry={refresh} retryDisabled={loading} />}

      {visible.length === 0 && !creating && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "groups.empty")}</p>}

      {(visible.length > 0 || creating) && (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>{t(locale, "groups.colName")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "groups.colScope")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "groups.colMembers")}</th>
              <th {...stylex.props(styles.th)} />
            </tr>
          </thead>
          <tbody>
            {creating && (
              <tr {...stylex.props(styles.tr)}>
                <td {...stylex.props(styles.td)}>
                  <div {...stylex.props(styles.nameEditor)}>
                    {/* autoFocus: the first field of a form the operator just opened by an explicit click. */}
                    <input
                      type="text"
                      {...stylex.props(styles.nameInput)}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelCreating();
                      }}
                      aria-label={t(locale, "groups.newNameAria")}
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                    />
                  </div>
                </td>
                <td {...stylex.props(styles.td)}>
                  <div {...stylex.props(styles.roleEditor)}>
                    <select
                      value={newScopeType}
                      onChange={(e) => setNewScopeType(e.target.value as ScopeType)}
                      aria-label={t(locale, "groups.scopeAria")}
                    >
                      <option value="global">{t(locale, "groups.scopeGlobal")}</option>
                      <option value="processes">{t(locale, "groups.scopeProcessesLabel")}</option>
                    </select>
                    {newScopeType === "processes" && (
                      <select
                        multiple
                        value={newScopeProcessIds}
                        onChange={(e) => setNewScopeProcessIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                        aria-label={t(locale, "groups.scopeProcessesLabel")}
                      >
                        {processes.map((p) => (
                          <option key={p.processId} value={p.processId}>
                            {labelText(p.label, p.baseLocale)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </td>
                <td {...stylex.props(styles.td)}>—</td>
                <td {...stylex.props(styles.td)}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void saveNewGroup()}
                    disabled={busyId === NEW_GROUP_ROW || !newName.trim() || !scopeIsSavable(scopeOf(newScopeType, newScopeProcessIds))}
                  >
                    {t(locale, "groups.create")}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={cancelCreating} disabled={busyId === NEW_GROUP_ROW}>
                    {t(locale, "common.cancel")}
                  </button>
                </td>
              </tr>
            )}
            {visible.map((group) => (
              <Fragment key={group.groupId}>
                <tr {...stylex.props(styles.tr)}>
                  <td {...stylex.props(styles.td)}>
                    {editingName(group.groupId) ? (
                      <div {...stylex.props(styles.nameEditor)}>
                        {/* autoFocus: the single input of an editor the operator just opened by an explicit click. */}
                        <input
                          type="text"
                          {...stylex.props(styles.nameInput)}
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveName(group);
                            if (e.key === "Escape") cancelEditing();
                          }}
                          aria-label={tFill(locale, "groups.nameAria", { name: group.name })}
                          autoComplete="off"
                          spellCheck={false}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <span>{group.name}</span>
                    )}
                  </td>
                  <td {...stylex.props(styles.td)}>
                    {editingScope(group.groupId) ? (
                      <div {...stylex.props(styles.roleEditor)}>
                        {/* autoFocus: the first control of an editor the operator just opened by an explicit click. */}
                        <select
                          value={draftScopeType}
                          onChange={(e) => {
                            setDraftScopeType(e.target.value as ScopeType);
                            setDraftScopeError(undefined);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") cancelEditing();
                          }}
                          aria-label={tFill(locale, "groups.scopeAria", { name: group.name })}
                          autoFocus
                        >
                          <option value="global">{t(locale, "groups.scopeGlobal")}</option>
                          <option value="processes">{t(locale, "groups.scopeProcessesLabel")}</option>
                        </select>
                        {draftScopeType === "processes" && (
                          <select
                            multiple
                            value={draftScopeProcessIds}
                            onChange={(e) => {
                              setDraftScopeProcessIds(Array.from(e.target.selectedOptions).map((o) => o.value));
                              setDraftScopeError(undefined);
                            }}
                            aria-label={t(locale, "groups.scopeProcessesLabel")}
                          >
                            {processes.map((p) => (
                              <option key={p.processId} value={p.processId}>
                                {labelText(p.label, p.baseLocale)}
                              </option>
                            ))}
                          </select>
                        )}
                        {draftScopeError && <p {...stylex.props(styles.error)}>{draftScopeError}</p>}
                      </div>
                    ) : (
                      <span>{scopeText(group.scope, locale)}</span>
                    )}
                  </td>
                  <td {...stylex.props(styles.td)}>
                    {editingMembers(group.groupId) ? (
                      <div {...stylex.props(styles.roleEditor)}>
                        {/* autoFocus: the single input of an editor the operator just opened by an explicit click. */}
                        <input
                          type="text"
                          {...stylex.props(styles.roleInput)}
                          value={draftMembers}
                          onChange={(e) => {
                            setDraftMembers(e.target.value);
                            setDraftMembersError(undefined);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveMembers(group);
                            if (e.key === "Escape") cancelEditing();
                          }}
                          placeholder={t(locale, "groups.membersPlaceholder")}
                          aria-label={tFill(locale, "groups.membersAria", { name: group.name })}
                          autoComplete="off"
                          spellCheck={false}
                          autoFocus
                        />
                        {draftMembersError && (
                          <p {...stylex.props(styles.error)}>{tFill(locale, "groups.memberUnresolved", { tokens: draftMembersError.join(", ") })}</p>
                        )}
                      </div>
                    ) : (
                      <span {...stylex.props(styles.mono)}>{group.members.length}</span>
                    )}
                  </td>
                  <td {...stylex.props(styles.td)}>
                    {editingName(group.groupId) && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => void saveName(group)} disabled={busyId === group.groupId}>
                          {t(locale, "groups.saveName")}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={cancelEditing} disabled={busyId === group.groupId}>
                          {t(locale, "common.cancel")}
                        </button>
                      </>
                    )}
                    {editingScope(group.groupId) && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => void saveScope(group)} disabled={busyId === group.groupId}>
                          {t(locale, "groups.saveScope")}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={cancelEditing} disabled={busyId === group.groupId}>
                          {t(locale, "common.cancel")}
                        </button>
                      </>
                    )}
                    {editingMembers(group.groupId) && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => void saveMembers(group)} disabled={busyId === group.groupId}>
                          {t(locale, "groups.saveMembers")}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={cancelEditing} disabled={busyId === group.groupId}>
                          {t(locale, "common.cancel")}
                        </button>
                      </>
                    )}
                    {editing?.groupId !== group.groupId && (
                      <>
                        <button type="button" className="btn btn-secondary" onClick={() => startEditingName(group)} disabled={busyId === group.groupId}>
                          {t(locale, "groups.editName")}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => startEditingScope(group)} disabled={busyId === group.groupId}>
                          {t(locale, "groups.editScope")}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => startEditingMembers(group)} disabled={busyId === group.groupId}>
                          {t(locale, "groups.editMembers")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-destructive"
                          onClick={() => void remove(group)}
                          disabled={busyId === group.groupId}
                        >
                          {t(locale, "groups.delete")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
