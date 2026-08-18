/**
 * `POST /auth/login`: email + password in, an 8-hour `iss: "bps"` token
 * signed with `AUTH_JWT_SECRET` out. Registered only when that key is set
 * (`src/http/server.ts`) — there is no state in which this route is reachable
 * without a signing key. Wrong password, unknown email and disabled user all
 * produce the same generic 401 (`verifyLogin`'s non-disclosure rule).
 *
 * Repeated failed attempts are rate-limited (see `checkAndRecordAttempt`)
 * before `verifyLogin` is ever called, across two windows a request must pass
 * both of: one keyed on the normalized email, one on the client address. The
 * normalized email is only a tracking key, never the value passed to
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
export const MAX_TRACKED_EMAILS = 50_000;

/**
 * The per-address threshold, ten times the per-email one inside the same
 * window. It bounds what the per-email window cannot see: one password tried
 * against many accounts, where every email opens its own window and no counter
 * ever trips. It sits well above ordinary use, so a whole office behind one
 * address does not reach it.
 */
export const MAX_ADDRESS_ATTEMPTS = MAX_ATTEMPTS * 10;

/**
 * One entry per distinct address, so the same capacity covers a far larger
 * population than it does for emails: an address holds one slot no matter how
 * many emails it names, and `MAX_ADDRESS_ATTEMPTS` caps how fast one caller
 * mints new ones.
 */
export const MAX_TRACKED_ADDRESSES = MAX_TRACKED_EMAILS;

type AttemptEntry = { count: number; windowStart: number };

/**
 * ponytail: single-process, in-memory — resets on restart and does not
 * coordinate across multiple server instances. Upgrade path if this ever
 * runs as more than one process: move to a shared store (e.g. a Postgres
 * row or Redis) keyed the same way.
 */
const loginAttempts = new Map<string, AttemptEntry>();

/**
 * The second window, keyed on the client address. Same shape, same
 * `WINDOW_MS`, its own threshold and capacity. A login passes both or it is
 * refused.
 */
const addressAttempts = new Map<string, AttemptEntry>();

/**
 * Must stay synchronous end-to-end (no `await` in this function or between
 * calling it and awaiting `verifyLogin`): that's what makes the check and
 * the increment atomic against concurrent requests for the same key.
 * Adding an `await` in between would let concurrent attempts all pass the
 * check before any of them is recorded.
 *
 * `maxAttempts` and `capacity` are parameters because two maps share this
 * function and carry different numbers.
 */
export function checkAndRecordAttempt(
  map: Map<string, AttemptEntry>,
  key: string,
  now: () => number = Date.now,
  maxAttempts: number = MAX_ATTEMPTS,
  capacity: number = MAX_TRACKED_EMAILS,
): "ok" | "limited" {
  const t = now();
  const entry = map.get(key);
  if (entry && t - entry.windowStart <= WINDOW_MS) {
    if (entry.count >= maxAttempts) return "limited";
    entry.count += 1;
    return "ok";
  }
  if (!entry && map.size >= capacity) {
    // Expired entries carry no information (they'd reset on next use anyway),
    // so reclaim them before judging capacity.
    for (const [trackedKey, trackedEntry] of map) {
      if (t - trackedEntry.windowStart > WINDOW_MS) map.delete(trackedKey);
    }
    // Still full of live windows: evict the earliest window rather than refuse
    // the request. Refusal used to guard against a flood of distinct emails
    // disabling the control for everyone; the per-address window above stops
    // that flood at its source, so what refusal now costs is the larger harm —
    // every untracked account loses its login until the window rolls. The
    // evicted entry is the one closest to resetting on its own, and losing it
    // costs at worst one unthrottled try. The guard matters: when the sweep
    // above already freed enough room, no further eviction runs. Deleting the
    // map's first key is correct because every write below re-inserts rather
    // than updates in place, so insertion order always tracks windowStart
    // order and the first key is always the earliest window.
    if (map.size >= capacity) map.delete(map.keys().next().value as string);
  }
  // Delete before re-set: on the re-arm path (entry truthy, window expired)
  // `key` is already in the map, and Map.set on an existing key updates its
  // value without moving it in iteration order. Without this delete, a
  // re-armed entry would keep its old, early position while carrying the
  // newest windowStart in the map, breaking the invariant the eviction above
  // relies on. Deleting an absent key (the brand-new-key path) is a no-op.
  map.delete(key);
  map.set(key, { count: 1, windowStart: t });
  return "ok";
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

  const limited: HttpResult = { status: 429, body: { error: { type: "rate-limited", message: "too many login attempts, try again later" } } };

  // The address window is checked FIRST, so a caller past its threshold never
  // reaches the email map. That is what keeps one caller from filling the email
  // map with distinct addresses, which is the premise the eviction path above
  // rests on. An address the server could not determine skips this window; the
  // email window still applies.
  if (clientAddress !== undefined) {
    if (checkAndRecordAttempt(addressAttempts, clientAddress, Date.now, MAX_ADDRESS_ATTEMPTS, MAX_TRACKED_ADDRESSES) === "limited") return limited;
  }

  const normalizedEmail = body.email.trim().toLowerCase();
  if (checkAndRecordAttempt(loginAttempts, normalizedEmail) === "limited") return limited;

  const result = await verifyLogin(body.email, body.password, db);
  if (!result) {
    return { status: 401, body: { error: { type: "actor-resolution", message: "invalid email or password" } } };
  }
  // The email's window clears; the address's does not. Clearing it would let a
  // caller holding one valid account reset the address window at will, and so
  // try one password against every other account for free.
  loginAttempts.delete(normalizedEmail);

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
