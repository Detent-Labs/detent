/**
 * `POST /auth/login`: email + password in, an 8-hour `iss: "bps"` token
 * signed with `AUTH_JWT_SECRET` out. Registered only when that key is set
 * (`src/http/server.ts`) — there is no state in which this route is reachable
 * without a signing key. Wrong password, unknown email and disabled user all
 * produce the same generic 401 (`verifyLogin`'s non-disclosure rule).
 *
 * Repeated failed attempts for one email are rate-limited (see
 * `checkAndRecordAttempt`) before `verifyLogin` is ever called — the
 * normalized email is only the rate-limit tracking key, never the value
 * passed to `verifyLogin`, since that lookup is case-sensitive and nothing
 * else in this codebase normalizes a stored email.
 */
import { SQL } from "bun";
import { SignJWT } from "jose";
import { sql } from "../engine/store.js";
import { verifyLogin } from "./users.js";
import { LOCAL_ISSUER } from "./jwt.js";
import type { HttpResult } from "../http/errors.js";

const TOKEN_LIFETIME_HOURS = 8;
const TOKEN_LIFETIME = `${TOKEN_LIFETIME_HOURS}h`;
const TOKEN_LIFETIME_MS = TOKEN_LIFETIME_HOURS * 60 * 60 * 1000;

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_TRACKED_EMAILS = 50_000;

type AttemptEntry = { count: number; windowStart: number };

/**
 * ponytail: single-process, in-memory — resets on restart and does not
 * coordinate across multiple server instances. Upgrade path if this ever
 * runs as more than one process: move to a shared store (e.g. a Postgres
 * row or Redis) keyed the same way.
 */
const loginAttempts = new Map<string, AttemptEntry>();

/**
 * Must stay synchronous end-to-end (no `await` in this function or between
 * calling it and awaiting `verifyLogin`): that's what makes the check and
 * the increment atomic against concurrent requests for the same email.
 * Adding an `await` in between would let concurrent attempts all pass the
 * check before any of them is recorded.
 */
export function checkAndRecordAttempt(map: Map<string, AttemptEntry>, email: string, now: () => number = Date.now): "ok" | "limited" {
  const t = now();
  const entry = map.get(email);
  if (entry && t - entry.windowStart <= WINDOW_MS) {
    if (entry.count >= MAX_ATTEMPTS) return "limited";
    entry.count += 1;
    return "ok";
  }
  if (!entry && map.size >= MAX_TRACKED_EMAILS) return "ok"; // fail open: don't grow the map without bound
  map.set(email, { count: 1, windowStart: t });
  return "ok";
}

export async function handleLogin(req: Request, secret: string, db: SQL = sql): Promise<HttpResult> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; password?: unknown };
  } catch {
    return { status: 400, body: { error: { type: "request-shape", message: "request body is not valid JSON" } } };
  }
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return { status: 400, body: { error: { type: "request-shape", message: "request body must be { email: string, password: string }" } } };
  }

  const normalizedEmail = body.email.trim().toLowerCase();
  if (checkAndRecordAttempt(loginAttempts, normalizedEmail) === "limited") {
    return { status: 429, body: { error: { type: "rate-limited", message: "too many login attempts, try again later" } } };
  }

  const result = await verifyLogin(body.email, body.password, db);
  if (!result) {
    return { status: 401, body: { error: { type: "actor-resolution", message: "invalid email or password" } } };
  }
  loginAttempts.delete(normalizedEmail);

  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({ roles: result.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(LOCAL_ISSUER)
    .setSubject(result.userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(key);

  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();
  return { status: 200, body: { token, expiresAt, actor: { id: result.userId, roles: result.roles } } };
}
