/**
 * The process-scoped permission grant store. `src/auth/authorize.ts` imports
 * `hasGrant` alone and holds no SQL of its own; the three admin routes import
 * `listGrants`, `writeGrant` and `revokeGrant`. A grant maps a role string
 * (a principal the identity provider names, never a scope of its own) to one
 * of the five process-scoped permissions and a scope.
 *
 * The write path is strict: `grantSchema` rejects an unknown scope `type` at
 * write time. The read path is lenient: `listGrants` returns the stored
 * `scope` unparsed, so a row a later version's reader cannot fully interpret
 * stays listable and revocable rather than throwing.
 *
 * `MAX_ROLE_LENGTH` is this module's own bound, not
 * `src/schema/compile.ts::MAX_KEY_LENGTH` — a grant is an installation
 * concern, never part of the definition contract, even though it picks the
 * same number for the same reason (an authored string that reaches storage
 * stays bounded).
 */
import type { SQL } from "bun";
import { z } from "zod";
import { processId, type ProcessId } from "../schema/definition.js";
import type { Permission } from "./authorize.js";

export const MAX_ROLE_LENGTH = 200;

const processScope = z.object({
  type: z.literal("process"),
  config: z.object({ processId }),
});

/** Strict on write: an unknown `type` fails to parse, so the route answers 400 rather than storing a row no reader can act on. */
export const grantSchema = z.object({
  role: z.string().min(1).max(MAX_ROLE_LENGTH),
  permission: z.enum(["publish", "cancel", "migrate", "read", "visibility"]),
  scope: z.discriminatedUnion("type", [processScope]),
});

export type PermissionGrant = z.infer<typeof grantSchema>;

/**
 * Does any role in `roles` hold `permission` over `processId`, per a stored
 * grant? Called only where the global role already answered false, so this
 * is the one round trip `can` spends on a call it would otherwise refuse.
 *
 * An empty `roles` array matches no grant by construction — returning early
 * skips the query rather than relying on how an empty array behaves inside
 * `= ANY($2)`. `db.array(roles, "TEXT")` is the driver's own encoding for a
 * `text[]` bind parameter, the same helper `src/auth/users.ts` and
 * `src/engine/admin-queries.ts` use for every `role`/`status` array filter.
 */
export async function hasGrant(roles: readonly string[], permission: Permission, processId: ProcessId, db: SQL): Promise<boolean> {
  if (roles.length === 0) return false;
  const rows = (await db`
    SELECT 1 FROM permission_grants
    WHERE permission = ${permission}
      AND role = ANY(${db.array([...roles], "TEXT")})
      AND scope->>'type' = 'process'
      AND scope->'config'->>'processId' = ${processId}
    LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

/** Every stored grant, ordered so two calls over an unchanged store return the same sequence. Returns the raw stored `scope`, parsed nowhere — the lenient read path. */
export async function listGrants(db: SQL): Promise<PermissionGrant[]> {
  const rows = (await db`
    SELECT role, permission, scope FROM permission_grants
    ORDER BY permission, role, scope
  `) as { role: string; permission: string; scope: unknown }[];
  return rows as PermissionGrant[];
}

/** Idempotent: the triple is the primary key, so a repeated write changes nothing and still succeeds. */
export async function writeGrant(grant: PermissionGrant, db: SQL): Promise<void> {
  await db`
    INSERT INTO permission_grants (role, permission, scope)
    VALUES (${grant.role}, ${grant.permission}, ${grant.scope})
    ON CONFLICT (role, permission, scope) DO NOTHING
  `;
}

/** Exact three-column delete. Revoking a grant the store does not hold succeeds and changes nothing, for the same idempotence reason `writeGrant` states. */
export async function revokeGrant(grant: PermissionGrant, db: SQL): Promise<void> {
  await db`
    DELETE FROM permission_grants
    WHERE role = ${grant.role} AND permission = ${grant.permission} AND scope = ${grant.scope}
  `;
}
