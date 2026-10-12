/**
 * Bulk instance seeding for the row-limit tests. One statement copies a real
 * instance row `count` times under fresh ids, so a test can reach the report
 * row limit without 1001 `createInstance` calls. The generated columns
 * (`process_id`, `version`, `status` and the rest) derive from the copied
 * `body`, so each clone matches the same filters as its template. Clones carry
 * no history, event or outbox rows.
 */
import type { SQL } from "bun";

/** Inserts `count` clones of `templateId`. Returns the new ids, newest first. */
export async function cloneInstances(db: SQL, templateId: string, count: number): Promise<string[]> {
  const rows = (await db`
    WITH n AS (SELECT g, 'inst_' || gen_random_uuid()::text AS id FROM generate_series(1, ${count}::int) g)
    INSERT INTO instances (instance_id, transition_seq, body, created_at)
    SELECT n.id, t.transition_seq, jsonb_set(t.body, '{instanceId}', to_jsonb(n.id)),
           t.created_at - n.g * interval '1 millisecond'
    FROM instances t CROSS JOIN n
    WHERE t.instance_id = ${templateId}
    RETURNING instance_id, created_at
  `) as unknown as { instance_id: string; created_at: Date }[];
  return rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).map((r) => r.instance_id);
}

/** Makes `principal` a participant of every instance of `processId`, the way `appendInstancePrincipals` does for one. */
export async function addPrincipalToProcess(db: SQL, processId: string, principal: string): Promise<void> {
  await db`INSERT INTO instance_principals (instance_id, principal, created_at)
    SELECT i.instance_id, ${principal}, i.created_at
    FROM instances i
    WHERE i.process_id = ${processId}
    ON CONFLICT DO NOTHING`;
}
