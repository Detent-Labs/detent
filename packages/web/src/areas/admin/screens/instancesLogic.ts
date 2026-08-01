import type { InstanceListParams } from "../api/client.js";
import type { LocalizedText, LocaleCode } from "../api/types.js";

/** All-instances filter state, one field per InstanceListFilter the server accepts (minus scope, which the client always sends as "all"). Empty string means unfiltered. */
export interface InstanceFilterState {
  processId: string;
  status: string;
  currentStepId: string;
  startedBy: string;
  claimedBy: string;
}

export const EMPTY_INSTANCE_FILTER: InstanceFilterState = {
  processId: "",
  status: "",
  currentStepId: "",
  startedBy: "",
  claimedBy: "",
};

/** Builds the request params for GET /instances?scope=all from filter state, dropping empty fields (unfiltered) rather than sending them as empty-string values. */
export function toListParams(filter: InstanceFilterState, limit: number, cursor?: string): InstanceListParams {
  return {
    processId: filter.processId || undefined,
    status: filter.status || undefined,
    currentStepId: filter.currentStepId || undefined,
    startedBy: filter.startedBy || undefined,
    claimedBy: filter.claimedBy || undefined,
    limit,
    cursor,
  };
}

/** No i18n in the admin area (unlike packages/app) — resolves to the process's own baseLocale entry. */
export function labelText(label: LocalizedText, baseLocale: LocaleCode): string {
  return label[baseLocale] ?? Object.values(label)[0] ?? "";
}
