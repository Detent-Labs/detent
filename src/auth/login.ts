/**
 * `POST /auth/login`: email + password in, an 8-hour `iss: "bps"` token
 * signed with `AUTH_JWT_SECRET` out. Registered only when that key is set
 * (`src/http/server.ts`) — there is no state in which this route is reachable
 * without a signing key. Wrong password, unknown email and disabled user all
 * produce the same generic 401 (`verifyLogin`'s non-disclosure rule).
 */
import { SQL } from "bun";
import { SignJWT } from "jose";
import { sql } from "../engine/store.js";
import { verifyLogin } from "./users.js";
import { LOCAL_ISSUER } from "./jwt.js";
import type { HttpResult } from "../http/errors.js";

const TOKEN_LIFETIME = "8h";
const TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;

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

  const result = await verifyLogin(body.email, body.password, db);
  if (!result) {
    return { status: 401, body: { error: { type: "actor-resolution", message: "invalid email or password" } } };
  }

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
