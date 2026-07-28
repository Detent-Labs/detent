/**
 * Project-local BPS user accounts, backed by the `auth_users` table
 * (`src/engine/store.ts::initSchema`). Passwords are hashed with
 * `Bun.password` (argon2id, built into Bun — no dependency). Creating a
 * user, changing a password, or assigning roles is CLI-only
 * (`src/auth/cli.ts`); listing users and toggling `disabled` are the one
 * carve-out, also reachable over HTTP through the `system:admin`-gated
 * `/admin/users*` routes (`src/http/admin-routes.ts`).
 */
import { SQL } from "bun";
import { sql } from "../engine/store.js";

export async function createUser(email: string, password: string, roles: string[] = [], db: SQL = sql): Promise<{ userId: string }> {
  const userId = `user_${crypto.randomUUID()}`;
  const passwordHash = await Bun.password.hash(password);
  await db`INSERT INTO auth_users (user_id, email, password_hash, roles) VALUES (${userId}, ${email}, ${passwordHash}, ${db.array(roles, "TEXT")})`;
  return { userId };
}

/**
 * Unknown email, wrong password and a disabled user all return `undefined` —
 * the same generic failure, so a caller cannot learn from this function's
 * result which email addresses exist or which accounts are disabled.
 */
export async function verifyLogin(email: string, password: string, db: SQL = sql): Promise<{ userId: string; roles: string[] } | undefined> {
  const rows = (await db`SELECT user_id, password_hash, roles, disabled FROM auth_users WHERE email = ${email}`) as {
    user_id: string;
    password_hash: string;
    roles: string[];
    disabled: boolean;
  }[];
  const row = rows[0];
  if (!row) return undefined;
  const valid = await Bun.password.verify(password, row.password_hash);
  if (!valid || row.disabled) return undefined;
  return { userId: row.user_id, roles: row.roles };
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
}

export async function listUsers(db: SQL = sql): Promise<UserSummary[]> {
  const rows = (await db`SELECT user_id, email, roles, disabled FROM auth_users ORDER BY email`) as {
    user_id: string;
    email: string;
    roles: string[];
    disabled: boolean;
  }[];
  return rows.map((r) => ({ userId: r.user_id, email: r.email, roles: r.roles, disabled: r.disabled }));
}

/** Keyed by `userId`, unlike `setRoles`/`setPassword` — see design.md. Returns the updated row, or `undefined` if no such `userId` exists. */
export async function setDisabled(userId: string, disabled: boolean, db: SQL = sql): Promise<UserSummary | undefined> {
  const rows = (await db`UPDATE auth_users SET disabled = ${disabled} WHERE user_id = ${userId} RETURNING user_id, email, roles, disabled`) as {
    user_id: string;
    email: string;
    roles: string[];
    disabled: boolean;
  }[];
  const row = rows[0];
  return row ? { userId: row.user_id, email: row.email, roles: row.roles, disabled: row.disabled } : undefined;
}
