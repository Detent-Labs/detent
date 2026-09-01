/**
 * One-off backfill for `instance_principals` (instance-visibility-set).
 *
 * Every instance created before that relation existed carries no principals,
 * so `GET /instances?scope=visible` returns nothing for anyone who took part
 * in one. This derives a set for those instances from what the engine already
 * recorded, in one statement per source:
 *
 *   - the starter (`body.startedBy`)
 *   - the current step's assignment candidates and claimant
 *   - the acting actor on every history entry (`entry.actorId`)
 *
 * It cannot recover a candidate on a step the instance has already left and
 * who never acted: nothing records that. Those readers stay unseen until the
 * instance moves again. Accepted rather than reconstructed, since replaying
 * assignment resolution against every historical body would resolve today's
 * group memberships, not the ones in force then.
 *
 * Idempotent through `ON CONFLICT DO NOTHING`, so a second run writes nothing
 * and a run interrupted halfway is safe to repeat. Safe to run while the
 * engine writes: it never deletes, and the live write path appends the same
 * rows under the same conflict rule.
 *
 * Run inside the devcontainer, after deploying the engine:
 *   bun run scripts/backfill-instance-principals.ts
 */
import { sql, initSchema } from "../src/engine/store.js";

await initSchema();

const before = (await sql`SELECT count(*) AS n FROM instance_principals`) as { n: string }[];

// The starter. `created_at` comes from the instance row so the duplicated
// paging key matches what the list orders by, exactly as the live path does.
const starters = await sql`
  INSERT INTO instance_principals (instance_id, principal, created_at)
  SELECT i.instance_id, i.body->>'startedBy', i.created_at
  FROM instances i
  WHERE i.body->>'startedBy' IS NOT NULL
  ON CONFLICT DO NOTHING`;

// The current step's candidates, one row per array element.
const candidates = await sql`
  INSERT INTO instance_principals (instance_id, principal, created_at)
  SELECT i.instance_id, c.value, i.created_at
  FROM instances i,
       LATERAL jsonb_array_elements_text(i.body->'assignment'->'candidates') AS c(value)
  WHERE jsonb_typeof(i.body->'assignment'->'candidates') = 'array'
  ON CONFLICT DO NOTHING`;

// The current claimant, who need not appear among the candidates: a
// delegation target never joins that list.
const claimants = await sql`
  INSERT INTO instance_principals (instance_id, principal, created_at)
  SELECT i.instance_id, i.body->'assignment'->>'claimedBy', i.created_at
  FROM instances i
  WHERE i.body->'assignment'->>'claimedBy' IS NOT NULL
  ON CONFLICT DO NOTHING`;

// Everyone who ever drove a transition on the instance.
const actors = await sql`
  INSERT INTO instance_principals (instance_id, principal, created_at)
  SELECT h.instance_id, h.entry->>'actorId', i.created_at
  FROM history_entries h
  JOIN instances i ON i.instance_id = h.instance_id
  WHERE h.entry->>'actorId' IS NOT NULL
  ON CONFLICT DO NOTHING`;

const after = (await sql`SELECT count(*) AS n FROM instance_principals`) as { n: string }[];
const covered = (await sql`
  SELECT count(*) AS n FROM instances i
  WHERE NOT EXISTS (SELECT 1 FROM instance_principals p WHERE p.instance_id = i.instance_id)`) as { n: string }[];

const rows = (r: unknown) => (r as { count?: number }).count ?? 0;
console.log(`starters:   ${rows(starters)}`);
console.log(`candidates: ${rows(candidates)}`);
console.log(`claimants:  ${rows(claimants)}`);
console.log(`actors:     ${rows(actors)}`);
console.log(`principal rows: ${before[0]!.n} -> ${after[0]!.n}`);
console.log(`instances still without any principal: ${covered[0]!.n}`);

process.exit(0);
