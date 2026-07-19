/**
 * Publish-time compile pass.
 *
 * Injects the engine-owned cancel-sink — and, for a contracted process, the
 * reserved "cancelled" outcome bound to it — into a ProcessBody. This runs
 * BEFORE definitionHash = JCS(ProcessBody) is taken, so the hash covers the
 * sink and instances rehydrate against a body that actually contains the step
 * their cancel HistoryEntry references.
 *
 * Deterministic (same authored body -> identical compiled body) and idempotent
 * (an already-compiled body is returned unchanged). Rejects a body that authors
 * the reserved cancellation identity.
 */

import {
  authoredProcessBody,
  publishedProcessBody,
  CANCEL_SINK_STEP_ID,
  CANCEL_SINK_KEY,
  RESERVED_CANCEL_OUTCOME,
  type ProcessBody,
  type Step,
} from "./definition.js";

export function compileProcessBody(body: ProcessBody): ProcessBody {
  // Idempotent: an already-compiled (published-valid) body is a no-op. A body
  // that merely collides with the reserved identity is NOT published-valid and
  // falls through to authored validation below, which rejects it.
  if (publishedProcessBody.safeParse(body).success) return body;

  authoredProcessBody.parse(body); // reject reserved-identity collisions

  const contracted = body.contract !== undefined;

  const sink: Step = {
    id: CANCEL_SINK_STEP_ID,
    key: CANCEL_SINK_KEY,
    label: "Cancelled",
    type: "task",
    terminal: true,
    ...(contracted ? { outcome: RESERVED_CANCEL_OUTCOME } : {}),
  };

  const contract = contracted
    ? { ...body.contract!, outcomes: [...(body.contract!.outcomes ?? []), RESERVED_CANCEL_OUTCOME] }
    : body.contract;

  return {
    ...body,
    contract,
    workflow: { ...body.workflow, steps: [...body.workflow.steps, sink] },
  };
}
