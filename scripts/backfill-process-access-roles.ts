/**
 * One-time, idempotent rollout migration for `process_access_roles`
 * (process-access-roles). For every process already carrying a draft or a
 * published version, adds every account holding `system:developer` or
 * `system:author` to that process's Developer list.
 *
 * Idempotent through `ON CONFLICT DO NOTHING` against the table's
 * `(process_id, kind, principal)` primary key: a second run adds nothing a
 * first run already covered.
 *
 * Run inside the devcontainer:
 *   bun run scripts/backfill-process-access-roles.ts
 */
import type { SQL } from "bun";
import { sql, initSchema } from "../src/engine/store.js";
import { DEVELOPER_ROLE, AUTHOR_ROLE } from "../src/auth/authorize.js";

export async function backfillProcessAccessRoles(
  db: SQL = sql
): Promise<{ inserted: number }> {
  const result = await db`
    INSERT INTO process_access_roles (process_id, kind, principal)
    SELECT p.process_id, 'developer', u.user_id
    FROM (SELECT process_id FROM drafts UNION SELECT process_id FROM definitions) p
    CROSS JOIN auth_users u
    WHERE u.roles && ${db.array([DEVELOPER_ROLE, AUTHOR_ROLE], "TEXT")}
    ON CONFLICT DO NOTHING
  `;
  return { inserted: (result as unknown as { count?: number }).count ?? 0 };
}

async function main(): Promise<void> {
  await initSchema();
  const { inserted } = await backfillProcessAccessRoles(sql);
  console.log(`process_access_roles rows inserted: ${inserted}`);
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
