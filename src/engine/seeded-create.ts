/**
 * Create an instance seeded from another instance's data, evaluating an input
 * mapping and resolving the target's initial-step assignment. The shared seam
 * between `core.spawnSubprocess` (subprocess.ts) and `process.start`
 * (../handlers/process-start.ts): both handlers agree on exactly these five
 * steps and nothing wider — target resolution and the drive-to-rest stay each
 * caller's own, since the two differ there (see design.md,
 * ponytail-seeded-instance-creation).
 *
 * Deliberately not in store.ts, whose persistence-only remit excludes both the
 * CEL evaluation and the resolver call this function makes (store.ts:526-528,
 * registry.ts:209-212, transition.ts:696).
 *
 * Drop events (`mapping.entry-dropped`) carry the SOURCE instance's id; the
 * unresolved-assignment event carries the CREATED instance's id. Both
 * `test/subprocess.test.ts` (its `mappingDroppedEvents(parent.instanceId)`
 * assertions) and `test/process-chaining.test.ts:117`'s
 * `instance_events … kind = 'mapping.entry-dropped'` query rely on the drop
 * events landing on the source, not the created instance.
 */

import type { SQL } from "bun";
import { createInstance, withTransaction, appendInstanceEvent, newInstanceEventId, makeAssignmentUnresolvedEvent } from "./store.js";
import { buildGuardContext, evalFieldMap, SYSTEM_ACTOR } from "../cel/eval.js";
import { resolveStepAssignment, type AssignmentRegistry } from "./registry.js";
import type { Instance, InstanceEvent, ProcessBody, ProcessId, FieldId, Expression, StepId } from "../schema/definition.js";

export async function createSeededInstance(
  db: SQL,
  opts: {
    instanceId: string;
    processId: ProcessId;
    version: number;
    body: ProcessBody;
    source: { instance: Instance; body: ProcessBody };
    mapping: Record<FieldId, Expression>;
    link: { parent: { instanceId: string; stepId: StepId } } | { chainedFrom: string };
    assignmentRegistry: AssignmentRegistry;
    // Threaded straight through to createInstance's own opts.kind. Omitted
    // (or "published") for an ordinary spawn/chain target.
    kind?: Instance["kind"];
  },
): Promise<Instance> {
  const { instanceId, processId, version, body, source, mapping, link, assignmentRegistry, kind } = opts;

  // Seed from the mapping (source instance's context; targets keyed by the
  // created instance's fieldId). A raising entry is total: omitted rather
  // than failing creation, and recorded on the SOURCE instance.
  const { patch: seedData, drops } = evalFieldMap(mapping, buildGuardContext(source.body, source.instance, SYSTEM_ACTOR));
  const droppedAt = new Date().toISOString();
  const dropEvents: InstanceEvent[] = drops.map((d) => ({
    id: newInstanceEventId(),
    instanceId: source.instance.instanceId,
    transitionSeq: source.instance.transitionSeq,
    version: source.instance.version,
    kind: "mapping.entry-dropped",
    payload: { fieldId: d.fieldId, direction: "input", reason: d.reason },
    at: droppedAt,
  }));

  // Creation is a step entry, so an assignment-bearing initial step carries
  // candidates. Resolved HERE, before the transaction below opens: the target
  // body, its initial step and its seed data are all in hand, and a resolver
  // must not run while a connection and a row lock are held.
  const targetInitial = body.workflow.steps.find((s) => s.id === body.workflow.initialStep);
  const resolved = targetInitial
    ? await resolveStepAssignment(
        targetInitial,
        assignmentRegistry,
        { id: instanceId, startedBy: undefined, data: seedData as Instance["data"] },
        db,
      )
    : undefined;
  // A resolution that produced no candidate is the CREATED instance's fact, so
  // this event carries the created instance's id, its version and seq 0. It
  // rides createInstance's own event list rather than the source-scoped
  // dropEvents above, whose entries all carry the source instance's id.
  const createdEvents: InstanceEvent[] = resolved?.unresolved && targetInitial
    ? [makeAssignmentUnresolvedEvent({
        instanceId: instanceId as Instance["instanceId"],
        transitionSeq: 0,
        version,
        stepId: targetInitial.id,
        reason: resolved.unresolved,
        at: droppedAt,
      })]
    : [];

  // The drop events land on the source instance in the same transaction as
  // the created instance's creation: withTransaction nests as a savepoint
  // inside createInstance's own transaction when `db` is already one (see
  // store.ts::withTransaction), so both commit or roll back together.
  return withTransaction(db, async (tx) => {
    const created = await createInstance(
      body,
      {
        processId,
        version,
        instanceId,
        data: seedData as Instance["data"],
        assignment: resolved?.assignment,
        events: createdEvents,
        ...(kind !== undefined ? { kind } : {}),
        ...link,
      },
      tx,
    );
    for (const event of dropEvents) await appendInstanceEvent(tx, event);
    return created;
  });
}
