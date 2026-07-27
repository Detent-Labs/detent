import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { editableFieldIds as formUiEditableFieldIds, filterToEditable as formUiFilterToEditable } from "form-ui";
import { createInstance as apiCreateInstance, getInstanceView as apiGetInstanceView, submit as apiSubmit, login as apiLogin, PlayerClientError } from "./client";
import type { ClientError, InstanceView } from "./types";

export const STORAGE_KEY = "player.connection";

export interface StoredConnection {
  serverUrl: string;
  token: string;
}

export const DEFAULT_CONNECTION: StoredConnection = { serverUrl: "http://localhost:3000", token: "" };

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StorageLike | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

/** Pure (storage injectable), so persistence round-trips directly without
 * mounting a Provider — see `player-store.test.ts`. */
export function loadStoredConnection(storage: StorageLike | undefined = browserStorage()): StoredConnection {
  if (!storage) return DEFAULT_CONNECTION;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONNECTION;
    return { ...DEFAULT_CONNECTION, ...(JSON.parse(raw) as Partial<StoredConnection>) };
  } catch {
    return DEFAULT_CONNECTION;
  }
}

export function persistConnection(conn: StoredConnection, storage: StorageLike | undefined = browserStorage()): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(conn));
}

/** Visible, non-readonly, non-group-container field ids — the field-set
 * boundary `submitAndTransition` enforces server-side (editor-player spec:
 * "Player submits only visible, editable fields"). Shared with the end-user
 * app via `form-ui`; re-exported here so existing callers/tests need no
 * import-path change. */
export function editableFieldIds(view: InstanceView): Set<string> {
  return formUiEditableFieldIds(view.fields);
}

function filterToEditable(data: Record<string, unknown>, view: InstanceView): Record<string, unknown> {
  return formUiFilterToEditable(data, view.fields);
}

/** Empty/whitespace-only input means "no seed data", not an error. */
export function parseSeedData(seedDataJson: string): Record<string, unknown> | undefined {
  if (!seedDataJson.trim()) return undefined;
  try {
    return JSON.parse(seedDataJson) as Record<string, unknown>;
  } catch {
    throw new PlayerClientError({ type: "validation", issues: [{ kind: "invalid-json", fieldId: "" }] });
  }
}

/** create -> ignore the created Instance body beyond its id -> re-fetch the
 * view, so the caller has exactly one "instance changed" code path
 * regardless of which call triggered the change (design.md "Data flow"). */
export async function createInstanceAndFetchView(
  serverUrl: string,
  processId: string,
  token: string,
  opts: { version?: number; seedDataJson: string },
): Promise<{ instanceId: string; view: InstanceView }> {
  const data = parseSeedData(opts.seedDataJson);
  const created = await apiCreateInstance(serverUrl, processId, token, { version: opts.version, data });
  const view = await apiGetInstanceView(serverUrl, created.instanceId, token);
  return { instanceId: created.instanceId, view };
}

/** submit (its response body ignored, whether an `Instance` or, on the
 * `AutomaticCascadeLoop` case, an `InstanceView` already) -> always re-fetch
 * the view via a fresh `GET`. */
export async function submitAndFetchView(
  serverUrl: string,
  instanceId: string,
  pathId: string,
  data: Record<string, unknown>,
  token: string,
  currentView: InstanceView,
): Promise<InstanceView> {
  await apiSubmit(serverUrl, instanceId, pathId, filterToEditable(data, currentView), token);
  return apiGetInstanceView(serverUrl, instanceId, token);
}

interface PlayerContextValue {
  serverUrl: string;
  isLoggedIn: boolean;
  setServerUrl: (url: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  instanceId: string | undefined;
  view: InstanceView | undefined;
  loading: boolean;
  error: ClientError | undefined;
  createInstance: (processId: string, version: number | undefined, seedDataJson: string) => Promise<void>;
  openInstance: (instanceId: string) => Promise<void>;
  refresh: () => Promise<void>;
  submit: (pathId: string, data: Record<string, unknown>) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<StoredConnection>(() => loadStoredConnection());
  const { serverUrl, token } = connection;
  const [instanceId, setInstanceId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<InstanceView | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientError | undefined>(undefined);

  useEffect(() => {
    persistConnection(connection);
  }, [connection]);

  const logout = () => {
    setConnection((c) => ({ ...c, token: "" }));
    setInstanceId(undefined);
    setView(undefined);
  };

  const toClientError = (err: unknown): ClientError =>
    err instanceof PlayerClientError ? err.error : { type: "internal", message: err instanceof Error ? err.message : String(err) };

  /** For every authenticated call: a 401 means an invalid/expired session —
   * discard the token and return to the login screen (no error shown; the
   * login screen itself is the signal). No client-side expiry tracking.
   * `isLogin` opts out of that: login's own 401 (wrong credentials) is
   * reported as a generic failure instead, since there is no session yet
   * to discard. */
  const run = async (fn: () => Promise<void>, opts?: { isLogin?: boolean }) => {
    setLoading(true);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      if (!opts?.isLogin && err instanceof PlayerClientError && err.status === 401) {
        logout();
        return;
      }
      setError(toClientError(err));
    } finally {
      setLoading(false);
    }
  };

  const value: PlayerContextValue = {
    serverUrl,
    isLoggedIn: token !== "",
    setServerUrl: (url) => setConnection((c) => ({ ...c, serverUrl: url })),
    login: (email, password) =>
      run(async () => {
        const result = await apiLogin(serverUrl, email, password);
        setConnection((c) => ({ ...c, token: result.token }));
      }, { isLogin: true }),
    logout,
    instanceId,
    view,
    loading,
    error,
    createInstance: (processId, version, seedDataJson) =>
      run(async () => {
        const created = await createInstanceAndFetchView(serverUrl, processId, token, { version, seedDataJson });
        setInstanceId(created.instanceId);
        setView(created.view);
      }),
    openInstance: (id) =>
      run(async () => {
        const nextView = await apiGetInstanceView(serverUrl, id, token);
        setInstanceId(id);
        setView(nextView);
      }),
    refresh: () =>
      run(async () => {
        if (!instanceId) return;
        setView(await apiGetInstanceView(serverUrl, instanceId, token));
      }),
    submit: (pathId, data) =>
      run(async () => {
        if (!instanceId || !view) return;
        setView(await submitAndFetchView(serverUrl, instanceId, pathId, data, token, view));
      }),
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}
