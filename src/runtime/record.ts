/**
 * The instance runtime record for the Runtime API Layer: its history entries
 * and events merged into one chronologically ordered read.
 */

import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import type { Actor } from "../cel/eval.js";
import { requireRole, ADMIN_ROLE, DEVELOPER_ROLE, AUTHOR_ROLE, AuthorizationError } from "../auth/authorize.js";
import { decodeCursor } from "../pagination.js";
import { historyEntry as historyEntrySchema, instanceEvent as instanceEventSchema } from "../schema/definition.js";
import type { InstanceId, Instance, HistoryEntry, InstanceEvent } from "../schema/definition.js";
import { DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT, loadInstanceForRead, keysetPage, type Page } from "./internal.js";

export type InstanceRecordElement = { kind: "transition"; entry: HistoryEntry } | { kind: "event"; event: InstanceEvent };

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
