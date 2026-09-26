/**
 * Instance file attachments for the Runtime API Layer: upload, list and
 * read.
 */

import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import type { Actor } from "../cel/eval.js";
import { NotFoundError } from "../errors.js";
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

// Metadata only — never `data` — so a list response can never carry file
// bytes by accident. `getAttachment` returns the bytes separately.
export type InstanceAttachment = {
  id: string;
  instanceId: InstanceId;
  actorId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

/**
 * Upload a file attachment to an instance. Uses `loadInstanceForActor`'s
 * visibility rule, the same one `postComment` applies.
 *
 * `data` and `sizeBytes` are trusted as already decoded and checked against
 * the configured size cap by the caller (the HTTP wrapper): the same
 * division of labour `postComment` already applies to `text`. This function
 * performs no independent decoding and no independent size check.
 */
export async function uploadAttachment(
  instanceId: InstanceId,
  actor: Actor,
  attachment: { filename: string; contentType: string; data: Uint8Array; sizeBytes: number },
  db: SQL = sql,
): Promise<InstanceAttachment> {
  const { instance, body } = await loadInstanceForActor(instanceId, actor, db);
  const step = findStep(body, instance.currentStepId as string);
  if (!resolveCollaboration(body, step, "attachments")) {
    throw new CollaborationDisabledError(instance.instanceId, "attachments");
  }
  const id = `attachment_${crypto.randomUUID()}`;
  const rows = (await db`
    INSERT INTO instance_attachments (id, instance_id, actor_id, filename, content_type, size_bytes, data)
    VALUES (${id}, ${instance.instanceId}, ${actor.id}, ${attachment.filename}, ${attachment.contentType}, ${attachment.sizeBytes}, ${Buffer.from(attachment.data)})
    RETURNING id, instance_id, actor_id, filename, content_type, size_bytes, created_at
  ` as unknown) as { id: string; instance_id: string; actor_id: string; filename: string; content_type: string; size_bytes: number; created_at: Date }[];
  const row = rows[0]!;
  return {
    id: row.id,
    instanceId: row.instance_id as InstanceId,
    actorId: row.actor_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * List an instance's attachments, oldest first, keyset-paginated by
 * `(created_at, id)` ascending — the same shape `listComments` uses,
 * including its `created_at::text` lossless-cursor fix. Applies the same
 * visibility rule `uploadAttachment` applies. Never selects `data`.
 */
export async function listAttachments(
  instanceId: InstanceId,
  actor: Actor,
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceAttachment>> {
  await loadInstanceForActor(instanceId, actor, db);
  const limit = Math.min(page.limit ?? DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT);

  // Never selects `data`: this list is metadata only (see InstanceAttachment
  // above) so a page response can never carry file bytes by accident.
  const rows = await pagedRead<{
    id: string;
    instance_id: string;
    actor_id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    created_at: Date;
    created_at_cursor: string;
  }>(db, "instance_attachments", "id, instance_id, actor_id, filename, content_type, size_bytes, created_at", instanceId, limit, page.cursor);
  const { pageRows, cursor } = keysetPage(rows, limit, (r) => [r.created_at_cursor, r.id]);
  const items: InstanceAttachment[] = pageRows.map((r) => ({
    id: r.id,
    instanceId: r.instance_id as InstanceId,
    actorId: r.actor_id,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at.toISOString(),
  }));
  return { items, cursor };
}

/**
 * Read one attachment's bytes. Applies the same visibility rule
 * `uploadAttachment` applies, then scopes the row lookup to BOTH
 * `attachmentId` and `instanceId` — without that second predicate, an actor
 * who may read instance A could download an attachment belonging to
 * instance B just by guessing its id, since `loadInstanceForActor` only
 * checks that the actor may read instance A. An `attachmentId` that does
 * not exist, or belongs to a different instance, is not found: this
 * mirrors `getInstanceRecord`'s own convention of a message-bearing
 * `NotFoundError`, not a distinct "wrong instance" error.
 */
export async function getAttachment(
  instanceId: InstanceId,
  attachmentId: string,
  actor: Actor,
  db: SQL = sql,
): Promise<{ filename: string; contentType: string; data: Uint8Array }> {
  await loadInstanceForActor(instanceId, actor, db);
  const rows = (await db`
    SELECT filename, content_type, data FROM instance_attachments
    WHERE id = ${attachmentId} AND instance_id = ${instanceId}
  ` as unknown) as { filename: string; content_type: string; data: Uint8Array }[];
  if (rows.length === 0) throw new NotFoundError(`attachment not found: ${attachmentId}`);
  const row = rows[0]!;
  return { filename: row.filename, contentType: row.content_type, data: row.data };
}
