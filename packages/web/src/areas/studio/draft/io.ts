import { processBody, type ProcessBody } from "workflow-engine/schema";

/**
 * A `DefinitionVersion` wrapper (`examples/*.json`, anything pulled from the
 * definition store) carries its real content under `.definition`; a raw
 * `ProcessBody` carries it at the top level. Shared by every entry point
 * that accepts either on-disk shape.
 */
function unwrapDefinitionVersion(value: unknown): unknown {
  return value !== null && typeof value === "object" && "definition" in value ? (value as { definition: unknown }).definition : value;
}

/**
 * A locally loaded child process JSON for cross-process checks
 * (`checkSubprocessChildRefs`), used by `StepsPanel`'s subprocess step
 * editor. A real, complete file, so it's parsed straight through the actual
 * `processBody` schema. Tolerates the same two on-disk shapes the round-trip
 * test found in `examples/`: a published `ProcessVersion` wrapper (body under
 * `.definition`) or a raw, unwrapped body.
 */
export function parseChildProcessJson(text: string): ProcessBody {
  const value: unknown = JSON.parse(text);
  return processBody.parse(unwrapDefinitionVersion(value));
}
