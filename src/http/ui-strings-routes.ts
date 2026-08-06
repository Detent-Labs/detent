/**
 * The one public UI-string route. Its own module for the reason `health.ts` has
 * one: it resolves no actor and requires no role, and `admin-routes.ts` states
 * the opposite invariant about every handler it carries.
 *
 * The two write routes stay in `admin-routes.ts` behind `ADMIN_ROLE`. Only the
 * read is public.
 *
 * What this can return: UI-chrome wording an operator typed, keyed by area,
 * locale and catalog key. What it cannot: anything actor-scoped. It reads one
 * table, and that table holds no account, instance, process or definition data.
 * It reads that table whole, so the answer never varies by caller and no
 * request can probe it for the presence of anything.
 */

import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import { listUiStringOverrides } from "../engine/ui-strings.js";
import type { HttpResult } from "./errors.js";
import { guarded } from "./routes.js";

/** `GET /ui-strings`. The bundle fetches this before its first render, so the pre-login screen carries an override too. */
export async function handleGetUiStrings(req: Request, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const overrides = await listUiStringOverrides(db);
    return { status: 200, body: { overrides } };
  });
}
