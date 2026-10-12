import type { ProcessId, SubprocessSpec } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import type { ProcessSummary } from "../api/types.js";

export type DraftSubprocessSpec = DraftOf<SubprocessSpec>;

/**
 * The spec after an author picks `processId` in "Which process it calls".
 *
 * With no spec yet, the first pick writes a whole one: a pinned binding at the
 * process's newest version and two empty mappings. A later pick changes
 * `processId` alone, except that a pinned binding also takes the new
 * process's newest version, since the old number names nothing there. A
 * process the list does not carry leaves `pinnedVersion` as it was.
 */
export function specForProcess(
  processId: string,
  processes: readonly ProcessSummary[],
  current: DraftSubprocessSpec | undefined,
): DraftSubprocessSpec {
  const newest = processes.find((p) => p.processId === processId)?.version;
  if (!current) {
    return {
      processId: processId as ProcessId,
      versionBinding: "pinned",
      pinnedVersion: newest,
      inputMapping: {},
      outputMapping: {},
    };
  }
  const next: DraftSubprocessSpec = { ...current, processId: processId as ProcessId };
  if (current.versionBinding === "pinned" && newest !== undefined) next.pinnedVersion = newest;
  return next;
}
