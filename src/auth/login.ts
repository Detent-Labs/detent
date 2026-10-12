/**
 * `POST /auth/login`: email + password in, an 8-hour `iss: "bps"` token
 * signed with `AUTH_JWT_SECRET` out. Registered only when that key is set
 * (`src/http/server.ts`) — there is no state in which this route is reachable
 * without a signing key. Wrong password, unknown email and disabled user all
 * produce the same generic 401 (`verifyLogin`'s non-disclosure rule).
 *
 * Repeated failed attempts are rate-limited (see `checkAndRecordAttempt`)
 * before `verifyLogin` is ever called, across two windows a request must pass
 * both of: one keyed on the normalized email, one on the client address. Both
 * live in the `login_attempts` table of the tenant's own database, so every
 * server process of a tenant shares them and one tenant never sees another's.
 * The normalized email is only a tracking key, never the value passed to
 * `verifyLogin`, since that lookup is case-sensitive and nothing else in this
 * codebase normalizes a stored email.
 */
import { SQL } from "bun";
import { SignJWT } from "jose";
import { verifyLogin } from "./users.js";
import { LOCAL_ISSUER } from "./jwt.js";
import type { HttpResult } from "../http/errors.js";

const TOKEN_LIFETIME_HOURS = 8;
const TOKEN_LIFETIME = `${TOKEN_LIFETIME_HOURS}h`;
const TOKEN_LIFETIME_MS = TOKEN_LIFETIME_HOURS * 60 * 60 * 1000;

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000;

/**
 * The per-address threshold, ten times the per-email one inside the same
 * window. It bounds what the per-email window cannot see: one password tried
 * against many accounts, where every email opens its own window and no counter
 * ever trips. It sits well above ordinary use, so a whole office behind one
 * address does not reach it.
 */
export const MAX_ADDRESS_ATTEMPTS = MAX_ATTEMPTS * 10;

/**
 * Deletes every window that has ended. An ended window carries no information,
 * since its next use starts a new one. The rows are locked with SKIP LOCKED,
 * so two concurrent cleanups never wait on each other, and a row held by a
 * concurrent try stays for the next request.
 */
async function deleteExpiredAttempts(db: SQL): Promise<void> {
  await db`
    DELETE FROM login_attempts
    WHERE (scope, key) IN (
      SELECT scope, key FROM login_attempts
      WHERE window_start <= now() - ${WINDOW_MS}::double precision * interval '1 millisecond'
      FOR UPDATE SKIP LOCKED
    )`;
}

/**
 * Counts one try for `(scope, key)` in the `login_attempts` table of `db` and
 * answers whether it passes. One upsert checks and records, so the row lock
 * serializes concurrent tries for a key across requests and across server
 * processes. A window that has ended restarts at 1. The count stops at
 * `maxAttempts + 1`, and a refused try leaves `window_start` alone, so refusals
 * do not extend the window. The window's age compares with the database clock.
 * A database error propagates.
 */
export async function checkAndRecordAttempt(
  db: SQL,
  scope: "email" | "address",
  key: string,
  maxAttempts: number,
): Promise<"ok" | "limited"> {
  const rows = (await db`
    INSERT INTO login_attempts (scope, key, attempts, window_start)
    VALUES (${scope}, ${key}, 1, now())
    ON CONFLICT (scope, key) DO UPDATE SET
      attempts = CASE WHEN login_attempts.window_start <= now() - ${WINDOW_MS}::double precision * interval '1 millisecond'
                      THEN 1 ELSE LEAST(login_attempts.attempts + 1, ${maxAttempts}::integer + 1) END,
      window_start = CASE WHEN login_attempts.window_start <= now() - ${WINDOW_MS}::double precision * interval '1 millisecond'
                          THEN now() ELSE login_attempts.window_start END
    RETURNING attempts`) as { attempts: number }[];
  return rows[0]!.attempts <= maxAttempts ? "ok" : "limited";
}

export async function handleLogin(
  req: Request,
  secret: string,
  db: SQL,
  clientAddress?: string,
  tenant?: string,
): Promise<HttpResult> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; password?: unknown };
  } catch {
    return { status: 400, body: { error: { type: "request-shape", message: "request body is not valid JSON" } } };
  }
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return { status: 400, body: { error: { type: "request-shape", message: "request body must be { email: string, password: string }" } } };
  }
  // Postgres refuses a NUL in a text parameter, so such an email could only
  // reach `verifyLogin` and raise. It names no account, so it is no guess: it
  // runs before both windows and counts against neither.
  if (body.email.includes("\u0000")) {
    return { status: 400, body: { error: { type: "request-shape", message: "email must not contain a NUL character" } } };
  }

  const limited: HttpResult = { status: 429, body: { error: { type: "rate-limited", message: "too many login attempts, try again later" } } };

  // One cleanup per request, before the first window statement. The table
  // thereby holds no ended window, so it needs no capacity cap.
  await deleteExpiredAttempts(db);

  // The address window is checked FIRST, so a caller past its threshold never
  // reaches the email window. That is what keeps one caller from adding rows
  // for many distinct emails: one address adds at most `MAX_ADDRESS_ATTEMPTS`
  // rows per window. An address the server could not determine skips this
  // window; the email window still applies.
  if (clientAddress !== undefined) {
    if ((await checkAndRecordAttempt(db, "address", clientAddress, MAX_ADDRESS_ATTEMPTS)) === "limited") return limited;
  }

  const normalizedEmail = body.email.trim().toLowerCase();
  if ((await checkAndRecordAttempt(db, "email", normalizedEmail, MAX_ATTEMPTS)) === "limited") return limited;

  const result = await verifyLogin(body.email, body.password, db);
  if (!result) {
    return { status: 401, body: { error: { type: "actor-resolution", message: "invalid email or password" } } };
  }
  // The email's window clears; the address's does not. Clearing it would let a
  // caller holding one valid account reset the address window at will, and so
  // try one password against every other account for free.
  await db`DELETE FROM login_attempts WHERE scope = 'email' AND key = ${normalizedEmail}`;

  const key = new TextEncoder().encode(secret);
  // The tenant this database belongs to, so every later request resolves its
  // own without another host lookup. Absent in a single-tenant deployment, and
  // the resolver reads its absence as "the process database". LOCAL_ISSUER
  // stays one constant: every deployment issues under it, so the issuer cannot
  // name a tenant and this claim must.
  const token = await new SignJWT({ roles: result.roles, ...(tenant ? { tenant } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(LOCAL_ISSUER)
    .setSubject(result.userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(key);

  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();
  // `displayName` is a presentation field on this response only. It never joins
  // the trusted `Actor` the resolver hands to CEL and authorization.
  return { status: 200, body: { token, expiresAt, actor: { id: result.userId, roles: result.roles, displayName: result.displayName } } };
}
