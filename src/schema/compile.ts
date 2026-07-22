/**
 * Publish-time compile pass.
 *
 * Validates every duration-typed value (see `validateDurations`) and injects
 * the engine-owned cancel-sink — and, for a contracted process, the
 * reserved "cancelled" outcome bound to it — into a ProcessBody. This runs
 * BEFORE definitionHash = JCS(ProcessBody) is taken, so the hash covers the
 * sink and instances rehydrate against a body that actually contains the step
 * their cancel HistoryEntry references.
 *
 * Deterministic (same authored body -> identical compiled body) and idempotent
 * (an already-compiled body is returned unchanged). Rejects a body that authors
 * the reserved cancellation identity.
 *
 * Returns the VALIDATED PARSE OUTPUT, never the input. The contract schemas
 * strip undeclared content and are also the deserializer every read goes
 * through, so compile is where stripping must happen: hashing the input would
 * cover keys that no read reproduces, and the resulting pin would never
 * rehydrate.
 */

import {
  authoredProcessBody,
  publishedProcessBody,
  parseIsoDuration,
  MAX_TIMER_DURATION_MS,
  CANCEL_SINK_STEP_ID,
  CANCEL_SINK_KEY,
  RESERVED_CANCEL_OUTCOME,
  type Action,
  type ProcessBody,
  type Step,
} from "./definition.js";

/** A duration-typed value outside the grammar, or a timer duration past the bound. */
export interface DurationIssue {
  /** Where in the body, e.g. `steps[1].timers[0].duration`. */
  loc: string;
  value: string;
  message: string;
}

/** A published body carries a duration the engine cannot arm from. */
export class DurationValidationError extends Error {
  constructor(readonly issues: DurationIssue[]) {
    super(issues.map((i) => `${i.loc}: ${i.message} (${JSON.stringify(i.value)})`).join("; "));
    this.name = "DurationValidationError";
  }
}

const GRAMMAR = "unsupported ISO 8601 duration (W/D/H/M/S only, no calendar units, at least one component)";
const OUT_OF_RANGE = `timer duration exceeds the ${MAX_TIMER_DURATION_MS} ms bound (a fireAt past it leaves the four-digit-year range)`;

/**
 * Publish-time duration check, returning located issues ([] when the body is
 * clean). Lives here, not as a Zod refinement, because `definition.ts` is also
 * the deserializer for stored immutable bodies: tightening a refinement would
 * make an already-published definition throw on READ, and its pinned instances
 * unrehydratable. Validation that may tighten over time belongs on the write
 * path — the same placement CEL checking and plugin-config validation take.
 *
 * The grammar applies to every duration-typed field. The magnitude bound
 * applies to `Timer.duration` alone: it exists to keep `entryInstant + duration`
 * inside the four-digit-year window, and `retryPolicy.baseDelay` /
 * `action.timeout` compute no instant, so bounding them would be a limit with
 * no reason behind it.
 */
export function validateDurations(body: ProcessBody): DurationIssue[] {
  const issues: DurationIssue[] = [];
  const grammar = (value: string | undefined, loc: string) => {
    if (value === undefined) return;
    if (parseIsoDuration(value) === null) issues.push({ loc, value, message: GRAMMAR });
  };
  const actions = (list: Action[] | undefined, loc: string) =>
    (list ?? []).forEach((a, i) => {
      grammar(a.timeout, `${loc}[${i}].timeout`);
      grammar(a.retry?.baseDelay, `${loc}[${i}].retry.baseDelay`);
    });

  body.workflow.steps.forEach((s, si) => {
    const sloc = `steps[${si}]`;
    actions(s.onEntry, `${sloc}.onEntry`);
    actions(s.onExit, `${sloc}.onExit`);
    actions(s.onCancel, `${sloc}.onCancel`);
    (s.paths ?? []).forEach((p, pi) => actions(p.onPath, `${sloc}.paths[${pi}].onPath`));
    (s.timers ?? []).forEach((t, ti) => {
      const loc = `${sloc}.timers[${ti}].duration`;
      if (t.duration !== undefined) {
        const ms = parseIsoDuration(t.duration);
        if (ms === null) issues.push({ loc, value: t.duration, message: GRAMMAR });
        else if (ms > MAX_TIMER_DURATION_MS) issues.push({ loc, value: t.duration, message: OUT_OF_RANGE });
      }
      actions(t.onFire.actions, `${sloc}.timers[${ti}].onFire`);
    });
  });
  return issues;
}

export function compileProcessBody(body: ProcessBody): ProcessBody {
  // Before the idempotent return, so re-compiling an already-compiled body
  // checks the same values rather than trusting the shape.
  const durations = validateDurations(body);
  if (durations.length > 0) throw new DurationValidationError(durations);

  // Idempotent: an already-compiled (published-valid) body is a no-op. A body
  // that merely collides with the reserved identity is NOT published-valid and
  // falls through to authored validation below, which rejects it.
  const compiled = publishedProcessBody.safeParse(body);
  if (compiled.success) return compiled.data;

  // The parse OUTPUT is what gets compiled, hashed and stored: the schemas strip
  // undeclared content, so returning the input instead would let an unknown key
  // into definitionHash that every read then strips back out, leaving the pin
  // unreproducible and its instances unrehydratable.
  const parsed = authoredProcessBody.parse(body); // also rejects reserved-identity collisions

  const contracted = parsed.contract !== undefined;

  const sink: Step = {
    id: CANCEL_SINK_STEP_ID,
    key: CANCEL_SINK_KEY,
    // Known limitation (design.md D4): this synthesized string has no
    // translation table, so a non-English baseLocale sees the literal
    // English word under its own base-locale key.
    label: { en: "Cancelled", [parsed.baseLocale]: "Cancelled" },
    type: "task",
    terminal: true,
    ...(contracted ? { outcome: RESERVED_CANCEL_OUTCOME } : {}),
  };

  const contract = contracted
    ? { ...parsed.contract!, outcomes: [...(parsed.contract!.outcomes ?? []), RESERVED_CANCEL_OUTCOME] }
    : parsed.contract;

  return {
    ...parsed,
    contract,
    workflow: { ...parsed.workflow, steps: [...parsed.workflow.steps, sink] },
  };
}
