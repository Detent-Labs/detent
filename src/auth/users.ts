/**
 * Project-local BPS user accounts, backed by the `auth_users` table
 * (`src/engine/store.ts::initSchema`). Passwords are hashed with
 * `Bun.password` (argon2id, built into Bun — no dependency). Every account
 * write is reachable over HTTP through the `system:admin`-gated
 * `/admin/users*` routes (`src/http/admin-routes.ts`): listing, creating,
 * toggling `disabled`, assigning roles, setting a manager, and setting a
 * password. `src/auth/cli.ts` keeps its own email-keyed commands beside them,
 * as the recovery path for a deployment where no account holds `system:admin`.
 */
import { SQL } from "bun";
import { sql } from "../engine/store.js";
import { encodeCursor, decodeCursor } from "../pagination.js";
import { MAX_LIST_LIMIT, type Page } from "../engine/admin-queries.js";

export async function createUser(email: string, password: string, roles: string[] = [], db: SQL = sql): Promise<{ userId: string }> {
  const userId = `user_${crypto.randomUUID()}`;
  const passwordHash = await Bun.password.hash(password);
  await db`INSERT INTO auth_users (user_id, email, password_hash, roles) VALUES (${userId}, ${email}, ${passwordHash}, ${db.array(roles, "TEXT")})`;
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
export async function verifyLogin(email: string, password: string, db: SQL = sql): Promise<{ userId: string; roles: string[] } | undefined> {
  const rows = (await db`SELECT user_id, password_hash, roles, disabled FROM auth_users WHERE email = ${email}`) as {
    user_id: string;
    password_hash: string;
    roles: string[];
    disabled: boolean;
  }[];
  const row = rows[0];
  const valid = await Bun.password.verify(password, row?.password_hash ?? (await DUMMY_HASH));
  if (!row || !valid || row.disabled) return undefined;
  return { userId: row.user_id, roles: row.roles };
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
}

/** The column list every user-returning query below selects, so one mapper serves them all. */
interface UserRow {
  user_id: string;
  email: string;
  roles: string[];
  disabled: boolean;
  manager_user_id: string | null;
}

const toSummary = (r: UserRow): UserSummary => ({
  userId: r.user_id,
  email: r.email,
  roles: r.roles,
  disabled: r.disabled,
  managerUserId: r.manager_user_id ?? undefined,
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
    SELECT user_id, email, roles, disabled, manager_user_id
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
  const rows = (await db`UPDATE auth_users SET roles = ${db.array(roles, "TEXT")} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id`) as UserRow[];
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
  const rows = (await db`UPDATE auth_users SET password_hash = ${passwordHash} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id`) as UserRow[];
  const row = rows[0];
  return row ? toSummary(row) : undefined;
}

/** Keyed by `userId`, unlike `setRoles`/`setPassword` — see design.md. Returns the updated row, or `undefined` if no such `userId` exists. */
export async function setDisabled(userId: string, disabled: boolean, db: SQL = sql): Promise<UserSummary | undefined> {
  const rows = (await db`UPDATE auth_users SET disabled = ${disabled} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id`) as UserRow[];
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
  const rows = (await db`UPDATE auth_users SET manager_user_id = ${managerUserId} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled, manager_user_id`) as UserRow[];
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
