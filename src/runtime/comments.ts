/**
 * Instance comments for the Runtime API Layer: post and list.
 */

import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import type { Actor } from "../cel/eval.js";
import type { InstanceId } from "../schema/definition.js";
import {
  DEFAULT_RECORD_LIMIT,
  MAX_RECORD_LIMIT,
  loadInstanceForActor,
  findStep,
  resolveCollaboration,
  CollaborationDisabledError,
  keysetPage,
  pagedRead,
  type Page,
} from "./internal.js";

// Not `Comment` — that name collides with the DOM's own `Comment` node
// interface, in scope wherever a caller's TypeScript config includes the
// `DOM` lib (e.g. packages/web).
export type InstanceComment = {
  id: string;
  instanceId: InstanceId;
  actorId: string;
  text: string;
  createdAt: string;
};

/**
 * Post a free-text comment on an instance. Uses `loadInstanceForActor`'s
 * visibility rule — the same one `getInstanceView` applies — not
 * `getInstanceRecord`'s narrower audit-trail one, since a comment thread sits
 * beside the field view, not the record.
 *
 * `text` is trusted as already validated non-empty and within bound by the
 * caller (the HTTP wrapper's Zod schema): the same division of labour
 * `delegateClaim` already applies to `toActorId`. This function performs no
 * independent length or emptiness check.
 */
export async function postComment(instanceId: InstanceId, actor: Actor, text: string, db: SQL = sql): Promise<InstanceComment> {
  const { instance, body } = await loadInstanceForActor(instanceId, actor, db);
  const step = findStep(body, instance.currentStepId as string);
  if (!resolveCollaboration(body, step, "comments")) {
    throw new CollaborationDisabledError(instance.instanceId, "comments");
  }
  const id = `comment_${crypto.randomUUID()}`;
  const rows = (await db`
    INSERT INTO instance_comments (id, instance_id, actor_id, text)
    VALUES (${id}, ${instance.instanceId}, ${actor.id}, ${text})
    RETURNING id, instance_id, actor_id, text, created_at
  ` as unknown) as { id: string; instance_id: string; actor_id: string; text: string; created_at: Date }[];
  const row = rows[0]!;
  return { id: row.id, instanceId: row.instance_id as InstanceId, actorId: row.actor_id, text: row.text, createdAt: row.created_at.toISOString() };
}

/**
 * List an instance's comments, oldest first, keyset-paginated by
 * `(created_at, id)` ascending — the reverse order `listInstances` and
 * `getInstanceRecord` sort in, matching a comment thread's natural reading
 * order. Applies the same visibility rule `postComment` applies.
 */
export async function listComments(
  instanceId: InstanceId,
  actor: Actor,
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceComment>> {
  await loadInstanceForActor(instanceId, actor, db);
  const limit = Math.min(page.limit ?? DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT);

  const rows = await pagedRead<{ id: string; instance_id: string; actor_id: string; text: string; created_at: Date; created_at_cursor: string }>(
    db,
    "instance_comments",
    "id, instance_id, actor_id, text, created_at",
    instanceId,
    limit,
    page.cursor,
  );
  const { pageRows, cursor } = keysetPage(rows, limit, (r) => [r.created_at_cursor, r.id]);
  const items: InstanceComment[] = pageRows.map((r) => ({
    id: r.id,
    instanceId: r.instance_id as InstanceId,
    actorId: r.actor_id,
    text: r.text,
    createdAt: r.created_at.toISOString(),
  }));
  return { items, cursor };
}
