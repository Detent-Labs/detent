/**
 * What the three http suites share: the DB flag, the schema call their
 * `beforeAll` wraps, and the two request builders. `test/http.test.ts`,
 * `test/http-admin.test.ts` and `test/http-studio.test.ts` each held a copy
 * before `dedup-server-helpers`.
 *
 * This module registers NO hook. Bun caches a module across test files in one
 * process, so a `beforeAll` at this module's top level would register once,
 * under whichever suite imported it first, and the other two would run without
 * it. Each suite writes its own two hooks.
 *
 * The `beforeEach` truncate stays per suite as well. The three truncate
 * different tables — only studio truncates `drafts`, only admin truncates
 * `auth_users` — and each is one tagged-template line. Passing the list here
 * would need `sql.unsafe`, which nothing in this repository uses.
 *
 * The registries and the `fetch` handler stay per suite too. Each registers
 * different plugin types, and only `http.test.ts` spies on the outbox.
 */
import { initSchema } from "../../src/engine/store.js";
import type { Actor } from "../../src/cel/eval.js";

/** The DB-backed suites are `test.skipIf(!DB)`; without DATABASE_URL they skip. */
export const DB = !!process.env.DATABASE_URL;

/** `beforeAll` body. A no-op without a database, matching every DB-backed suite. */
export async function initDb(): Promise<void> {
  if (DB) await initSchema();
}

/** The dev resolver's two headers. `X-Actor-Roles` is omitted for a roleless actor, never sent empty. */
export const authHeaders = (actor: Actor): Record<string, string> => ({
  "X-Actor-Id": actor.id,
  ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
});

/** The optional `body` is studio's version, which subsumes the other two suites' builders. */
export const authedReq = (url: string, method: string, actor: Actor, body?: unknown): Request =>
  new Request(url, {
    method,
    headers: {
      ...authHeaders(actor),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
