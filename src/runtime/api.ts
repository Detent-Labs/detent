/**
 * Runtime API Layer: the library boundary a UI (or, later, an HTTP server) can
 * call to run an instance without touching engine internals — create an
 * instance, resolve "what to display" for one, and submit data while
 * triggering a manual path. Not a transport: plain async TS functions.
 *
 * Callers never touch `ProcessBody` directly — only `processId`/`instanceId`.
 * This module resolves bodies internally via its own `createDefinitionStore`.
 */

import type { SQL } from "bun";
import { sql, withTransaction, newInstanceEventId, appendInstanceEvent, appendInstancePrincipals, PinMismatch } from "../engine/store.js";
import {
  GuardRefused,
  ConcurrencyConflict,
  AutomaticCascadeLoop,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
  UnknownDelegateError,
} from "../engine/transition.js";
import type { Actor } from "../cel/eval.js";
import { requireRole, can, ADMIN_ROLE, DEVELOPER_ROLE, AUTHOR_ROLE, AuthorizationError } from "../auth/authorize.js";
import { NotFoundError, InstanceNotRunningError } from "../errors.js";
import type { InstanceDraft } from "../engine/instance-drafts.js";
import { decodeCursor } from "../pagination.js";
import { historyEntry as historyEntrySchema, instanceEvent as instanceEventSchema } from "../schema/definition.js";
import type { InstanceId, Instance, HistoryEntry, InstanceEvent } from "../schema/definition.js";
import {
  MAX_RECORD_LIMIT,
  DEFAULT_RECORD_LIMIT,
  loadInstanceForRead,
  loadInstanceForActor,
  findStep,
  resolveCollaboration,
  CollaborationDisabledError,
  keysetPage,
  pagedRead,
  type Page,
} from "./internal.js";

export {
  GuardRefused,
  ConcurrencyConflict,
  AutomaticCascadeLoop,
  PinMismatch,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
  UnknownDelegateError,
  NotFoundError,
  InstanceNotRunningError,
};
export type { InstanceDraft };
export {
  MAX_LIST_LIMIT,
  MAX_RECORD_LIMIT,
  resolveCollaboration,
  CollaborationDisabledError,
} from "./internal.js";
export type { Page } from "./internal.js";
export {
  isResolvedViewField,
  SubmissionValidationError,
} from "./fields.js";
export type {
  ResolvedViewField,
  ResolvedViewNote,
  ResolvedViewEntry,
  ResolvedViewTab,
  AvailablePath,
  SubmissionIssue,
  DroppedAttribute,
} from "./fields.js";
export {
  createProcessInstance,
  getInstanceView,
  submitAndTransition,
  saveInstanceDraft,
  isCancellableAtStep,
  cancelInstance,
} from "./instances.js";
export type { InstanceView } from "./instances.js";
export { claimStep, releaseClaim, delegateClaim } from "./claims.js";
export { buildInstanceWhere, buildDataWhere, buildVisibleRowSet, listInstances, queryInstances, VERSION_MIN, VERSION_MAX } from "./queries.js";
export type {
  InstanceSummary,
  DegradedInstanceSummary,
  InstanceSummaryItem,
  DataComparison,
  InstanceListFilter,
  InstanceQueryFilter,
  InstanceDataItem,
  InstanceDataPage,
} from "./queries.js";
export {
  createReport,
  updateReport,
  deleteReport,
  getReport,
  listMyReports,
  resolveReportColumnChoices,
  previewReportColumnChoices,
  executeReport,
  previewReportDraft,
  reportResultToCsv,
  ReportOwnerInvariantError,
} from "./reports.js";
export type {
  ReportQuery,
  ReportColumn,
  Report,
  ReportInput,
  ReportPatch,
  ColumnChoice,
  ReportCell,
  MergeReportCell,
  ReportResultColumn,
  ReportExecutionRow,
  ReportExecutionResult,
} from "./reports.js";

// ============================================================
// Public types
// ============================================================

export type InstanceRecordElement = { kind: "transition"; entry: HistoryEntry } | { kind: "event"; event: InstanceEvent };

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
 * Read one instance's runtime record — its `HistoryEntry` rows merged with
 * its `InstanceEvent` rows into one chronologically ordered, discriminated
 * sequence, ordered `transitionSeq` ascending then `at` ascending (an event
 * never advances the sequence and may share one with a transition or with
 * other events — see CLAUDE.md's runtime-record section). The merge and its
 * ordering rule live here, not with callers: exporting two unmerged arrays
 * would export the ordering rule to every consumer instead. An unknown
 * instance has written nothing, so its record is an empty sequence, not an
 * error — matching `findOrphanKeys`'s and `listInstances`'s choice not to
 * invent a not-found case for a filter that simply matches nothing.
 *
 * Authorization mirrors `cancelInstance`'s two-path shape: `ADMIN_ROLE` is
 * tried first and needs no instance load at all (this query never joins on
 * `instances`); only the fallback — the caller holds an authoring role and
 * started the instance themselves — needs `loadInstanceForRead` to learn
 * `startedBy`. A caller satisfying neither collapses "doesn't exist" and
 * "not mine" into the same opaque `AuthorizationError`.
 *
 * Either authoring role satisfies that fallback, `DEVELOPER_ROLE` and
 * `AUTHOR_ROLE` alike: the studio Player renders this record beside the form,
 * and both roles reach the Player. The starter condition is what bounds it —
 * neither role reads a record it did not create.
 */
export async function getInstanceRecord(
  instanceId: InstanceId,
  actor: Actor,
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<InstanceRecordElement>> {
  try {
    requireRole(actor, ADMIN_ROLE);
  } catch (err) {
    if (!(err instanceof AuthorizationError)) throw err;
    let instance: Instance;
    try {
      ({ instance } = await loadInstanceForRead(instanceId, db));
    } catch {
      throw new AuthorizationError(`actor '${actor.id}' may not read the record of instance '${instanceId}'`);
    }
    const authoring = actor.roles.includes(DEVELOPER_ROLE) || actor.roles.includes(AUTHOR_ROLE);
    if (!authoring || instance.startedBy !== actor.id) {
      throw new AuthorizationError(`actor '${actor.id}' may not read the record of instance '${instanceId}'`);
    }
  }
  const limit = Math.min(page.limit ?? DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT);
  const [cursorSeqRaw, cursorAt, cursorId] = page.cursor ? decodeCursor(page.cursor, 3) : [undefined, undefined, undefined];
  const cursorSeq = cursorSeqRaw !== undefined ? Number(cursorSeqRaw) : null;

  const rows = (await db`
    SELECT id, transition_seq, kind, payload, at FROM (
      SELECT id, transition_seq, 'transition' AS kind, entry AS payload, (entry->>'at') AS at
      FROM history_entries WHERE instance_id = ${instanceId}
      UNION ALL
      SELECT id, transition_seq, 'event' AS kind, event AS payload, (event->>'at') AS at
      FROM instance_events WHERE instance_id = ${instanceId}
    ) record
    WHERE (
      ${cursorSeq}::int IS NULL
      OR (transition_seq, at, id) > (${cursorSeq}::int, ${cursorAt ?? null}::text, ${cursorId ?? null})
    )
    ORDER BY transition_seq ASC, at ASC, id ASC
    LIMIT ${limit + 1}
  ` as unknown) as { id: string; transition_seq: number; kind: "transition" | "event"; payload: unknown; at: string }[];

  const { pageRows, cursor } = keysetPage(rows, limit, (r) => [String(r.transition_seq), r.at, r.id]);
  const items: InstanceRecordElement[] = pageRows.map((r) => {
    const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return r.kind === "transition"
      ? { kind: "transition" as const, entry: historyEntrySchema.parse(payload) }
      : { kind: "event" as const, event: instanceEventSchema.parse(payload) };
  });
  return { items, cursor };
}

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
// ============================================================
// Per-instance visibility administration (instance-visibility-set)
// ============================================================

/** The three visibility operations, distinguished by what each writes. */
export type VisibilityOp = "revoked" | "restored" | "granted";

/**
 * Shared body of `revokeVisibility` / `restoreVisibility` / `grantVisibility`:
 * gate, mutate, record, in one transaction.
 *
 * The gate is the process-scoped `"visibility"` permission against the
 * instance's own process, not a bare `ADMIN_ROLE` check. It answers the same
 * today — `PERMISSION_ROLE` maps it to `ADMIN_ROLE` — and it lets an
 * installation admit a per-process administrator later by writing one grant,
 * with no code change and no scope inside a role string.
 *
 * Loading the instance first is deliberate: the permission names a process,
 * and only the instance knows which one. A caller with no standing therefore
 * learns nothing an unauthorized read would not already tell them, since the
 * load itself is unauthenticated and the refusal follows it.
 */
async function changeVisibility(
  instanceId: InstanceId,
  targetActorId: string,
  actor: Actor,
  op: VisibilityOp,
  db: SQL,
): Promise<void> {
  const { instance } = await loadInstanceForRead(instanceId, db);
  if (!(await can(actor, "visibility", instance.processId, db))) {
    throw new AuthorizationError(`actor '${actor.id}' may not change visibility of instance '${instanceId}'`);
  }
  await withTransaction(db, async (tx) => {
    if (op === "revoked") {
      await tx`INSERT INTO instance_principals_denied (instance_id, actor_id)
        VALUES (${instanceId}, ${targetActorId}) ON CONFLICT DO NOTHING`;
    } else if (op === "restored") {
      await tx`DELETE FROM instance_principals_denied
        WHERE instance_id = ${instanceId} AND actor_id = ${targetActorId}`;
    } else {
      // A grant is an ordinary principal append, so a granted actor is
      // indistinguishable from a participant afterwards. It also lifts any
      // standing revocation: granting someone you are still denying would
      // leave the grant inert and nothing on screen would say why.
      await appendInstancePrincipals(tx, instanceId, [targetActorId]);
      await tx`DELETE FROM instance_principals_denied
        WHERE instance_id = ${instanceId} AND actor_id = ${targetActorId}`;
    }
    await appendInstanceEvent(tx, {
      id: newInstanceEventId(),
      instanceId: instance.instanceId,
      transitionSeq: instance.transitionSeq,
      version: instance.version,
      kind: "visibility.changed",
      payload: { op, actorId: targetActorId, byActorId: actor.id },
      at: new Date().toISOString(),
    } as InstanceEvent);
  });
}

/** Remove one actor's sight of one instance. Names the person, never the principal they matched by. */
export async function revokeVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "revoked", db);
}

/** Undo a revocation, returning the actor to the visibility they had before. */
export async function restoreVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "restored", db);
}

/** Give one actor sight of an instance they never took part in. */
export async function grantVisibility(instanceId: InstanceId, targetActorId: string, actor: Actor, db: SQL = sql): Promise<void> {
  return changeVisibility(instanceId, targetActorId, actor, "granted", db);
}

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
