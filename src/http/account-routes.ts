/**
 * The self-scoped account routes, `GET` and `PATCH /account/me`. Each takes the
 * caller's id from the resolved actor and accepts nothing that names another
 * account: no `:id` segment and no role check, so any resolvable session
 * reaches them. `admin-routes.ts` is the operator's act-on-any-account surface;
 * this file is act-on-your-own, and the two stay separate route families on
 * purpose (design.md, "Self-scoping by token identity, not a role check").
 *
 * Same framework-agnostic handler shape as `routes.ts`, and the same
 * `resolveActor` and `guarded` helpers, imported from it. `guarded` paired with
 * `resolveActor` and no `requireRole` is the shape `handleClaim` and
 * `handleGetInstanceView` already use.
 */
import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import { getAccountById, updateAccount, validateDisplayName, DISPLAY_NAME_MAX_LENGTH, type AccountRecord } from "../auth/users.js";
import type { ActorResolver } from "../auth/resolve.js";
import { AuthorizationError } from "../auth/authorize.js";
import { RequestShapeError, type HttpResult } from "./errors.js";
import { resolveActor, guarded, readJson } from "./routes.js";

/**
 * The locale values `packages/web`'s `UiLocale` type declares
 * (`packages/web/src/i18n/locale.ts`). Restated here rather than imported: the
 * engine carries no dependency on the web package. A locale added there without
 * this list is refused with 400, which is the loud failure — a stored value the
 * two shipped catalogs do not cover would render nothing.
 */
const SUPPORTED_LOCALES = ["en", "de"];

/** The two keys `PATCH /account/me` accepts. Every other key is a 400, not a silently ignored field: a self-service write path is a trust boundary. */
const WRITABLE_KEYS = ["displayName", "locale"];

/**
 * The local-account response. `roles` comes from the stored row rather than
 * from the resolved actor: this is the account of record, the same source
 * `email` and `managerUserId` come from. The federated branch has no row and
 * reports the actor's own roles instead, and carries neither name field.
 *
 * Both names ship because they answer different questions. `displayName` is
 * what to print, resolved to the email where the column is `NULL`;
 * `storedDisplayName` is what the account actually set, so the page's editable
 * name box seeds from a value that is empty when no name is on record.
 */
const localBody = (id: string, account: AccountRecord) => ({
  id,
  displayName: account.displayName,
  storedDisplayName: account.storedDisplayName,
  email: account.email,
  roles: account.roles,
  managerUserId: account.managerUserId,
  locale: account.locale,
  editable: true,
});

/**
 * A resolvable actor whose id matches no `auth_users` row reads as federated,
 * never as missing: a `"bps"`-issued token guarantees an active local row, so
 * the absence names an externally issued identity. Under `devHeaderResolver` it
 * means only that `X-Actor-Id` named no local account, and the answer is the
 * same in both cases. The route returns no 404 for a resolvable actor.
 */
export async function handleGetAccount(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const account = await getAccountById(actor.id, db);
    if (!account) return { status: 200, body: { id: actor.id, roles: actor.roles, editable: false } };
    return { status: 200, body: localBody(actor.id, account) };
  });
}

/**
 * Parse the body into the change set the write applies. Every rejection here is
 * a `RequestShapeError`, so the request reaches no query and changes no row.
 *
 * The 200-character bound and the empty-after-trim rule come from
 * `validateDisplayName` (`src/auth/users.ts`), the same helper
 * `PATCH /admin/users/:id/name` calls. Two validators would drift.
 */
function parseAccountChanges(body: Record<string, unknown>): { displayName?: string | null; locale?: string } {
  for (const key of Object.keys(body)) {
    if (!WRITABLE_KEYS.includes(key)) {
      throw new RequestShapeError(`'${key}' is not a writable account field; this route sets ${WRITABLE_KEYS.join(" and ")} only`);
    }
  }
  const changes: { displayName?: string | null; locale?: string } = {};
  if ("displayName" in body) {
    const raw = body.displayName;
    if (raw !== null && typeof raw !== "string") throw new RequestShapeError("displayName must be a string or null");
    const checked = validateDisplayName(raw);
    if (!checked.ok) {
      throw new RequestShapeError(
        checked.reason === "empty" ? "displayName must not be empty" : `displayName is at most ${DISPLAY_NAME_MAX_LENGTH} characters`,
      );
    }
    changes.displayName = checked.displayName;
  }
  if ("locale" in body) {
    const raw = body.locale;
    if (typeof raw !== "string" || !SUPPORTED_LOCALES.includes(raw)) {
      throw new RequestShapeError(`locale must be one of: ${SUPPORTED_LOCALES.join(", ")}`);
    }
    changes.locale = raw;
  }
  return changes;
}

/**
 * The write refuses a federated actor with 403 rather than ignoring it: there
 * is no row to write, and a silent success would tell the page its change
 * landed. The refusal reads off the update's own result, so no separate
 * existence check can disagree with it.
 */
export async function handlePatchAccount(req: Request, resolver: ActorResolver, db: SQL = sql): Promise<HttpResult> {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    const raw = await readJson(req);
    // `readJson` types the body as an object and does not check it — an array
    // decodes as one too, so that shape still needs its own rejection here.
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new RequestShapeError("request body must be a JSON object");
    const changes = parseAccountChanges(raw as Record<string, unknown>);
    const updated = await updateAccount(actor.id, changes, db);
    if (!updated) throw new AuthorizationError(`actor '${actor.id}' has no local account to change`);
    return { status: 200, body: localBody(actor.id, updated) };
  });
}
