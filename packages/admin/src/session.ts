export const SESSION_STORAGE_KEY = "admin.session";

export interface Session {
  token: string;
  actorId: string;
  roles: string[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

/** Pure (storage injectable) — round-trips directly in tests without mounting a Provider. */
export function loadSession(storage: StorageLike | undefined = browserStorage()): Session | undefined {
  const raw = storage?.getItem(SESSION_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    return parsed.token && parsed.actorId && Array.isArray(parsed.roles) ? { token: parsed.token, actorId: parsed.actorId, roles: parsed.roles } : undefined;
  } catch {
    return undefined;
  }
}

export function persistSession(session: Session, storage: StorageLike | undefined = browserStorage()): void {
  storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(storage: StorageLike | undefined = browserStorage()): void {
  storage?.removeItem(SESSION_STORAGE_KEY);
}
