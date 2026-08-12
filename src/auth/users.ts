/**
 * Project-local BPS user accounts, backed by the `auth_users` table
 * (`src/engine/store.ts::initSchema`). Passwords are hashed with
 * `Bun.password` (argon2id, built into Bun — no dependency). Every account
 * write is reachable over HTTP through the `system:admin`-gated
 * `/admin/users*` routes (`src/http/admin-routes.ts`): listing, creating,
 * toggling `disabled`, assigning roles, setting a manager, setting a display
 * name, and setting a password. `src/auth/cli.ts`'s header names the routes
 * one by one, and it keeps its own email-keyed commands beside them, as the
 * recovery path for a deployment where no account holds `system:admin`.
 */
import { SQL } from "bun";
import { sql } from "../engine/store.js";
import { encodeCursor, decodeCursor } from "../pagination.js";
import { MAX_LIST_LIMIT, type Page } from "../engine/admin-queries.js";

/**
 * The one resolution of a user's displayable name: `COALESCE(display_name,
 * email)`. Every function here that hands a name to a caller goes through it,
 * so the login response and the admin listing cannot disagree about the same
 * account. The result is never null and never empty — `email` is `NOT NULL`,
 * and `normalizeDisplayName` keeps `""` out of the column.
 */
function resolveDisplayName(displayName: string | null, email: string): string {
  return displayName ?? email;
}

/** The bound every write path enforces: generous for a human name, still short of pathological input. */
export const DISPLAY_NAME_MAX_LENGTH = 200;

/**
 * Trim, store `NULL` rather than `""` for an empty result, and refuse a value
 * past `DISPLAY_NAME_MAX_LENGTH`. Applied on every write path (`createUser`,
 * `setDisplayName`, `setDisplayNameByEmail`, `updateAccount`), so a name the
 * HTTP routes would reject cannot enter the column through the CLI either.
 *
 * The bound throws a plain `Error` rather than an HTTP error type: this layer
 * carries no dependency on `src/http`. Both routes run `validateDisplayName`
 * before the write, so they answer 400 and never reach this throw.
 */
function normalizeDisplayName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) throw new Error(`display name is at most ${DISPLAY_NAME_MAX_LENGTH} characters`);
  return trimmed;
}

/**
 * The trim-then-bound check a route applies before writing, so an over-long or
 * empty submission answers 400 rather than reaching `normalizeDisplayName`'s
 * throw. `null` passes through as the clear. Exported so both routes enforce
 * one bound instead of re-deriving it — two validators drift the way two
 * resolvers would.
 */
export type DisplayNameValidation = { ok: true; displayName: string | null } | { ok: false; reason: "empty" | "too-long" };

export function validateDisplayName(value: string | null): DisplayNameValidation {
  if (value === null) return { ok: true, displayName: null };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, displayName: trimmed };
}

export async function createUser(email: string, password: string, roles: string[] = [], displayName?: string | null, db: SQL = sql): Promise<{ userId: string }> {
  const userId = `user_${crypto.randomUUID()}`;
  const passwordHash = await Bun.password.hash(password);
  await db`INSERT INTO auth_users (user_id, email, password_hash, roles, display_name) VALUES (${userId}, ${email}, ${passwordHash}, ${db.array(roles, "TEXT")}, ${normalizeDisplayName(displayName)})`;
  return { userId };
}

/**
 * A process-lifetime dummy hash, verified against on the no-such-row path so
 * that path costs the same argon2id work as a real one. A promise, not
 * `await`ed at module scope, so importing this module (e.g. from
 * `src/auth/cli.ts`) stays synchronous — the promise settles long before any
 * real login reaches it. Generated from a random UUID so no attacker-known
 * plaintext maps to it.
 */
const DUMMY_HASH = Bun.password.hash(crypto.randomUUID());

/**
 * Unknown email, wrong password and a disabled user all return `undefined` —
 * the same generic failure, so a caller cannot learn from this function's
 * result, or from its timing, which email addresses exist or which accounts
 * are disabled. Exactly one `Bun.password.verify` runs on every path: a
 * `return` before verifying (the no-such-row shape) would make the unknown-
 * email path roughly two orders of magnitude faster than a known one.
 */
export async function verifyLogin(email: string, password: string, db: SQL = sql): Promise<{ userId: string; roles: string[]; displayName: string } | undefined> {
  const rows = (await db`SELECT user_id, email, password_hash, roles, disabled, display_name FROM auth_users WHERE email = ${email}`) as {
    user_id: string;
    email: string;
    password_hash: string;
    roles: string[];
    disabled: boolean;
    display_name: string | null;
  }[];
  const row = rows[0];
  const valid = await Bun.password.verify(password, row?.password_hash ?? (await DUMMY_HASH));
  if (!row || !valid || row.disabled) return undefined;
  return { userId: row.user_id, roles: row.roles, displayName: resolveDisplayName(row.display_name, row.email) };
}

/**
 * True when `userId` names a row this directory holds and does not hold as
 * disabled. Read by the JWT resolver behind every locally issued token, so it
 * is one lookup on the primary key that selects no column: a deleted account
 * and a disabled one are the same answer, and neither needs a row's contents.
 *
 * A `false` therefore covers both, which is what the caller acts on. Nothing
 * here caches: a cached answer would hold open the gap the per-request read
 * exists to close, for as long as the entry lives.
 */
export async function isActiveUser(userId: string, db: SQL = sql): Promise<boolean> {
  const rows = (await db`SELECT 1 FROM auth_users WHERE user_id = ${userId} AND NOT disabled`) as unknown[];
  return rows.length > 0;
}

/**
 * The subset of `userIds` this directory holds, disabled or not. One query for
 * a caller that must ask about two ids at once — `delegateClaim` asks whether
 * the delegator resolves here and whether the target does, and a single answer
 * keeps those two facts from disagreeing.
 *
 * `disabled` is deliberately not filtered: an account taken out of service is
 * still a known identity, and delegating to it is an operator's decision, not
 * a typo. The resolver, not this function, stops that account from acting.
 */
export async function knownUserIds(userIds: string[], db: SQL = sql): Promise<Set<string>> {
  const rows = (await db`SELECT user_id FROM auth_users WHERE user_id = ANY(${db.array(userIds, "TEXT")})`) as { user_id: string }[];
  return new Set(rows.map((r) => r.user_id));
}

export async function setRoles(email: string, roles: string[], db: SQL = sql): Promise<void> {
  await db`UPDATE auth_users SET roles = ${db.array(roles, "TEXT")} WHERE email = ${email}`;
}

export async function setPassword(email: string, password: string, db: SQL = sql): Promise<void> {
  const passwordHash = await Bun.password.hash(password);
  await db`UPDATE auth_users SET password_hash = ${passwordHash} WHERE email = ${email}`;
}

export interface UserSummary {
  userId: string;
  email: string;
  roles: string[];
  disabled: boolean;
  /** The account's manager, or `undefined` for no manager on record. One pointer to one other account, never a tree. */
  managerUserId: string | undefined;
  /** The resolved display name (`resolveDisplayName`), never null and never empty. The stored `display_name`, or the email when that column is `NULL`. */
  displayName: string;
}

/** The column list every user-returning query below selects, so one mapper serves them all. */
interface UserRow {
  user_id: string;
  email: string;
  roles: string[];
  disabled: boolean;
  manager_user_id: string | null;
  display_name: string | null;
  /**
   * The account's own UI locale, `NULL` where it never set one. Selected by the
   * two self-scoped queries alone (`getAccountById`, `updateAccount`): the four
   * admin queries leave it out of their `SELECT`/`RETURNING` lists, and
   * `toSummary` never reads it, so `GET /admin/users` and the four
   * `/admin/users/:id/*` routes keep the body `admin-user-management` pins.
   */
  locale: string | null;
}

const toSummary = (r: UserRow): UserSummary => ({
  userId: r.user_id,
  email: r.email,
  roles: r.roles,
  disabled: r.disabled,
  managerUserId: r.manager_user_id ?? undefined,
  displayName: resolveDisplayName(r.display_name, r.email),
});

/**
 * Its own copy of the constant `admin-queries.ts` keeps private, for the same
 * reason `listOutbox` and `listPendingTimers` each apply one: `parseLimit`
 * returns `undefined` for an absent `limit`, and an unbounded user list is the
 * gap this default closes.
 */
const DEFAULT_LIST_LIMIT = 50;

/**
 * Accounts by email ascending, keyset-paged on `(email, user_id)` — `email` is
 * unique, but the tiebreaker keeps the tuple comparison total and matches the
 * shape `listOutbox` pages with. Never selects `password_hash`.
 */
export async function listUsers(page: { limit?: number; cursor?: string } = {}, db: SQL = sql): Promise<Page<UserSummary>> {
  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const [cursorEmail, cursorUserId] = page.cursor ? decodeCursor(page.cursor, 2) : [undefined, undefined];
  const rows = (await db`
    SELECT user_id, email, roles, disabled, manager_user_id, display_name
    FROM auth_users
    WHERE (
      ${cursorEmail ?? null}::text IS NULL
      OR (email, user_id) > (${cursorEmail ?? null}::text, ${cursorUserId ?? null}::text)
    )
    ORDER BY email, user_id
    LIMIT ${limit + 1}
  `) as UserRow[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([last.email, last.user_id]) : undefined;
  return { items: pageRows.map(toSummary), cursor };
}

/**
 * Keyed by `userId`, unlike `setRoles` — the browser holds ids, never emails.
 * Replaces the whole role set: an omitted role is a removed role. Returns the
 * updated row, or `undefined` if no such `userId` exists.
 */
export async function setRolesById(userId: string, roles: string[], db: SQL = sql): Promise<UserSummary | undefined> {
  const rows = (await db`UPDATE auth_users SET roles = ${db.array(roles, "TEXT")} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id, display_name`) as UserRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

/**
 * Keyed by `userId`, unlike `setPassword` — the browser holds ids, never
 * emails. Returns the updated row, or `undefined` if no such `userId` exists.
 *
 * Writes `password_hash` alone. A reset does not touch `disabled`, and it does
 * not reach a JWT already issued to the account: no token claim derives from
 * the password, so an outstanding one keeps authenticating until it expires.
 */
export async function setPasswordById(userId: string, password: string, db: SQL = sql): Promise<UserSummary | undefined> {
  const passwordHash = await Bun.password.hash(password);
  const rows = (await db`UPDATE auth_users SET password_hash = ${passwordHash} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id, display_name`) as UserRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

/** Keyed by `userId`, unlike `setRoles`/`setPassword` — see design.md. Returns the updated row, or `undefined` if no such `userId` exists. */
export async function setDisabled(userId: string, disabled: boolean, db: SQL = sql): Promise<UserSummary | undefined> {
  const rows = (await db`UPDATE auth_users SET disabled = ${disabled} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id, display_name`) as UserRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

/**
 * Set (or, with `null`, clear) the account's manager. Keyed by `userId` like
 * `setRolesById`. Returns the updated row, or `undefined` if no such `userId`
 * exists.
 *
 * A self-pointer is rejected here rather than by a constraint: it would name an
 * instance's starter as their own approver, which is an operator mistake rather
 * than an organizational fact. A cycle between two accounts is NOT rejected —
 * `org.manager-of-starter` reads one hop and never walks, so a cycle has no
 * effect. A `managerUserId` naming no account is refused by the column's own
 * foreign key.
 */
export async function setManagerById(userId: string, managerUserId: string | null, db: SQL = sql): Promise<UserSummary | undefined> {
  if (managerUserId !== null && managerUserId === userId) throw new SelfManagerError(userId);
  const rows = (await db`UPDATE auth_users SET manager_user_id = ${managerUserId} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id, display_name`) as UserRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

/** Thrown by `setManagerById` when an account is pointed at itself. */
export class SelfManagerError extends Error {
  constructor(readonly userId: string) {
    super(`a user cannot be their own manager: ${userId}`);
    this.name = "SelfManagerError";
  }
}

/**
 * The email-keyed sibling of `setManagerById`, for `src/auth/cli.ts` — a human
 * types an email, never a `user_id`. `managerEmail` `null` clears the pointer.
 * Throws when either email names no account, so the CLI reports which one.
 */
export async function setManagerByEmail(email: string, managerEmail: string | null, db: SQL = sql): Promise<void> {
  const userId = await userIdForEmail(email, db);
  if (!userId) throw new Error(`no such user: ${email}`);
  let managerUserId: string | null = null;
  if (managerEmail !== null) {
    managerUserId = (await userIdForEmail(managerEmail, db)) ?? null;
    if (!managerUserId) throw new Error(`no such user: ${managerEmail}`);
  }
  await setManagerById(userId, managerUserId, db);
}

/**
 * Set (or, with `null`, clear) the account's display name. Keyed by `userId`
 * like `setRolesById`. An empty-after-trim value is normalized rather than
 * rejected: it stores as `NULL`, never `""`, so the resolution invariant holds
 * on this path as it does on `createUser`'s. A value past
 * `DISPLAY_NAME_MAX_LENGTH` throws (`normalizeDisplayName`). Turning an empty
 * submission into a 400 rather than a `NULL` is the HTTP route's job
 * (`validateDisplayName`). Returns the updated row, or `undefined` if no such
 * `userId` exists.
 */
export async function setDisplayName(userId: string, displayName: string | null, db: SQL = sql): Promise<UserSummary | undefined> {
  const value = normalizeDisplayName(displayName);
  const rows = (await db`UPDATE auth_users SET display_name = ${value} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id, display_name`) as UserRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

/**
 * The email-keyed sibling of `setDisplayName`, for `src/auth/cli.ts` — a human
 * types an email, never a `user_id`. Throws when the email names no account, so
 * the CLI reports which one. Delegates the write, so the trim and the `NULL`
 * normalization stay in one place.
 */
export async function setDisplayNameByEmail(email: string, displayName: string | null, db: SQL = sql): Promise<void> {
  const userId = await userIdForEmail(email, db);
  if (!userId) throw new Error(`no such user: ${email}`);
  await setDisplayName(userId, displayName, db);
}

/**
 * What `GET`/`PATCH /account/me` read: a `UserSummary` plus the account's own
 * UI locale. The admin listing carries no locale (see `UserRow`), so the extra
 * field lives on its own type rather than widening `UserSummary`.
 */
export interface AccountRecord extends UserSummary {
  /** The stored UI locale, or `undefined` where the account never set one. `account-self-service` bounds the accepted value set; this column stores whatever the route accepted. */
  locale: string | undefined;
  /**
   * The raw `display_name` column, `null` where the account never set one —
   * beside the inherited `displayName`, which is the resolved value and never
   * null. The profile page's editable name box seeds from this one: seeding it
   * from the resolved value pre-fills the email, and any save then stores that
   * email as the account's name.
   */
  storedDisplayName: string | null;
}

const toAccount = (r: UserRow): AccountRecord => ({ ...toSummary(r), locale: r.locale ?? undefined, storedDisplayName: r.display_name });

/**
 * One account by `user_id`, for the self-scoped read. Deliberately not a filter
 * added to `listUsers`: that function returns every account, which is the admin
 * list view's job. Returns `undefined` when no row carries that id — the signal
 * `GET /account/me` reads as a federated actor.
 */
export async function getAccountById(userId: string, db: SQL = sql): Promise<AccountRecord | undefined> {
  const rows = (await db`SELECT user_id, email, roles, disabled, manager_user_id, display_name, locale FROM auth_users WHERE user_id = ${userId}`) as UserRow[];
  const row = rows[0];
  return row ? toAccount(row) : undefined;
}

/**
 * The self-service write behind `PATCH /account/me`. A key absent from `changes`
 * leaves its column untouched, which is what lets one statement serve a request
 * carrying either field or both — and what keeps a locale change from clearing a
 * display name. `display_name` is normalized the way `setDisplayName` normalizes
 * it, so `""` never reaches the column on any write path. `locale` is stored
 * verbatim; bounding its value set is the route's job.
 *
 * Returns the updated record, or `undefined` if no such `userId` exists.
 */
export async function updateAccount(
  userId: string,
  changes: { displayName?: string | null; locale?: string },
  db: SQL = sql,
): Promise<AccountRecord | undefined> {
  // `undefined` means "leave it"; `null` is the explicit clear, so the check is
  // against `undefined` rather than a `in` test.
  const setsDisplayName = changes.displayName !== undefined;
  const setsLocale = changes.locale !== undefined;
  const rows = (await db`
    UPDATE auth_users
    SET display_name = CASE WHEN ${setsDisplayName}::boolean THEN ${normalizeDisplayName(changes.displayName)}::text ELSE display_name END,
        locale       = CASE WHEN ${setsLocale}::boolean THEN ${changes.locale ?? null}::text ELSE locale END
    WHERE user_id = ${userId}
    RETURNING user_id, email, roles, disabled, manager_user_id, display_name, locale`) as UserRow[];
  const row = rows[0];
  return row ? toAccount(row) : undefined;
}

/**
 * The email address each of `userIds` holds, keyed by `user_id`. One round trip
 * whatever the size of the set: the caller holds a candidate list it did not
 * choose the length of, and a per-id lookup would issue one query per candidate.
 *
 * A disabled account is left out, as is an id matching no row. A disabled
 * account is one nobody may act under, so a message to it reaches nobody who can
 * answer — worse than no address, since it looks delivered and is not.
 *
 * The empty set short-circuits without touching the database. Read by the
 * `notification.email` handler's `toActors` resolution.
 */
export async function emailsForUserIds(userIds: string[], db: SQL = sql): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = (await db`SELECT user_id, email FROM auth_users
    WHERE user_id = ANY(${db.array(userIds, "TEXT")}) AND disabled = false`) as { user_id: string; email: string }[];
  return new Map(rows.map((r) => [r.user_id, r.email]));
}

async function userIdForEmail(email: string, db: SQL): Promise<string | undefined> {
  const rows = (await db`SELECT user_id FROM auth_users WHERE email = ${email}`) as { user_id: string }[];
  return rows[0]?.user_id;
}

/**
 * The `user_id` of `userId`'s manager, or `undefined` when that account has no
 * manager on record or does not exist. One hop: this never walks a chain.
 * Read by the `org.manager-of-starter` assignment strategy.
 */
export async function getManagerOf(userId: string, db: SQL = sql): Promise<string | undefined> {
  const rows = (await db`SELECT manager_user_id FROM auth_users WHERE user_id = ${userId}`) as { manager_user_id: string | null }[];
  return rows[0]?.manager_user_id ?? undefined;
}
