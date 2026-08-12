import type { UiLocale } from "../../../i18n/locale.js";
import type { InstanceSummary } from "../api/types.js";
import type { CatalogKey } from "../catalog.js";
import { processLabelOf, stepLabelOf } from "./inboxLogic.js";

export { processLabelOf, stepLabelOf };

/**
 * The started-cases view model. Pure, so a test asserts it without rendering a
 * component — the convention `inboxLogic.ts` already sets for this area.
 *
 * The screen carries no sort, filter or grouping control, so this module is
 * narrower than the inbox's. `GET /instances` already answers newest-first,
 * and a started list has one useful order.
 */

/** The catalog key naming a status. The status token itself stays as the engine stores it and never reaches a person. */
export function statusKey(status: InstanceSummary["status"]): CatalogKey {
  switch (status) {
    case "running":
      return "started.statusRunning";
    case "completed":
      return "started.statusCompleted";
    case "cancelled":
      return "started.statusCancelled";
    default:
      return "started.statusFaulted";
  }
}

/**
 * The stamp tone a status wears, as a class suffix.
 *
 * Four roles, matching the four the admin area's badges already carry:
 * open for live work, settled for a normal finish, dormant for a case closed
 * without finishing, refusal for a fault. `design-language.md` fixes that set,
 * so this adds no tone of its own.
 */
export function statusTone(status: InstanceSummary["status"]): "open" | "settled" | "dormant" | "refusal" {
  switch (status) {
    case "running":
      return "open";
    case "completed":
      return "settled";
    case "cancelled":
      return "dormant";
    default:
      return "refusal";
  }
}

/**
 * The date a row prints, in the reader's locale.
 *
 * A started case is answered by when it was raised, not by how long a step has
 * held it — which is what the inbox's `waitingLabel` measures instead.
 */
export function startedOnLabel(item: InstanceSummary, locale: UiLocale): string {
  const at = new Date(item.createdAt);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleDateString(locale);
}
