/**
 * The inverse of the cancel-sink injection `compile.ts::compileProcessBody`
 * performs past its `authoredProcessBody.parse`: it turns a published
 * (compiled) body back into the authored shape.
 *
 * Beside `compile.ts` rather than in the studio, so the injection and its
 * inverse sit together — an eighth compile-pass addition is only safe if
 * whoever writes it sees this. `test/strip-compiled.test.ts` asserts the round
 * trip over every definition in `examples/` and fails if the two drift. In the
 * package's `exports` map because the studio is the caller: it seeds a draft
 * from a published version, and it diffs a draft against one. A draft holds
 * the authored shape (process-drafts spec), and `authoredProcessBody` rejects
 * the reserved sink id, key and outcome outright.
 */
import { CANCEL_SINK_STEP_ID, RESERVED_CANCEL_OUTCOME, type ProcessBody } from "./definition.js";

export function stripCompiledContent(body: ProcessBody): ProcessBody {
  const steps = body.workflow.steps.filter((s) => s.id !== CANCEL_SINK_STEP_ID);
  const stripped: ProcessBody = { ...body, workflow: { ...body.workflow, steps } };

  if (stripped.contract?.outcomes?.includes(RESERVED_CANCEL_OUTCOME)) {
    stripped.contract = {
      ...stripped.contract,
      outcomes: stripped.contract.outcomes.filter((o) => o !== RESERVED_CANCEL_OUTCOME),
    };
  }
  return stripped;
}
