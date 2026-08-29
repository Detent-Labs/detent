import type { InstanceListParams } from "../api/client.js";
import type { LocalizedText, LocaleCode } from "../api/types.js";

/** All-instances filter state, covering six of the filters InstanceListFilter supports (process, status, current step, startedBy, claimedBy and kind — scope is not among them; the client always sends "all"). Empty string means unfiltered. */
export interface InstanceFilterState {
  processId: string;
  status: string;
  currentStepId: string;
  startedBy: string;
  claimedBy: string;
  kind: string;
}

export const EMPTY_INSTANCE_FILTER: InstanceFilterState = {
  processId: "",
  status: "",
  currentStepId: "",
  startedBy: "",
  claimedBy: "",
  kind: "",
};

/** Builds the request params for GET /instances?scope=all from filter state, dropping empty fields (unfiltered) rather than sending them as empty-string values. */
export function toListParams(filter: InstanceFilterState, limit: number, cursor?: string): InstanceListParams {
  return {
    processId: filter.processId || undefined,
    status: filter.status || undefined,
    currentStepId: filter.currentStepId || undefined,
    startedBy: filter.startedBy || undefined,
    claimedBy: filter.claimedBy || undefined,
    kind: filter.kind || undefined,
    limit,
    cursor,
  };
}

/**
 * A process's authored label, not a catalog string: it resolves to the
 * process's own `baseLocale` entry, which the author wrote and the UI locale
 * does not change.
 */
export function labelText(label: LocalizedText, baseLocale: LocaleCode): string {
  return label[baseLocale] ?? Object.values(label)[0] ?? "";
}
