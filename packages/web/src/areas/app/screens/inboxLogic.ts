import { resolveText } from "form-ui";
import type { UiLocale } from "../../../i18n/locale.js";
import { t } from "../catalog.js";
import type { InstanceSummary } from "../api/types.js";

export type SortKey = "waiting" | "recent" | "process";
export type GroupKey = "process" | "none";

/** The time an inbox row's waiting duration is measured from — the current
 * step's entry, falling back to the instance's creation for an instance that
 * predates `currentStepEnteredAt`. */
export function waitingSince(item: InstanceSummary): string {
  return item.currentStepEnteredAt ?? item.createdAt;
}

export function processLabelOf(item: InstanceSummary, locale: UiLocale): string {
  return resolveText(item.processLabel, locale, item.processBaseLocale) || item.processId;
}

export function stepLabelOf(item: InstanceSummary, locale: UiLocale): string {
  return resolveText(item.stepLabel, locale, item.processBaseLocale) || item.currentStepId;
}

/** Distinct `{processId, label}` pairs present in the loaded set, for the filter control. */
export function processOptions(items: InstanceSummary[], locale: UiLocale): { processId: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const item of items) if (!seen.has(item.processId)) seen.set(item.processId, processLabelOf(item, locale));
  return [...seen.entries()].map(([processId, label]) => ({ processId, label }));
}

export function filterByProcess(items: InstanceSummary[], processId: string | "all"): InstanceSummary[] {
  return processId === "all" ? items : items.filter((i) => i.processId === processId);
}

/** Operates entirely over the already-loaded set — no request. */
export function sortItems(items: InstanceSummary[], sort: SortKey, locale: UiLocale): InstanceSummary[] {
  const copy = [...items];
  if (sort === "waiting") copy.sort((a, b) => waitingSince(a).localeCompare(waitingSince(b))); // oldest (longest-waiting) first
  else if (sort === "recent") copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else copy.sort((a, b) => processLabelOf(a, locale).localeCompare(processLabelOf(b, locale)));
  return copy;
}

export interface InboxGroup {
  processId?: string;
  label?: string;
  items: InstanceSummary[];
}

/** "none" is one group with no heading; "process" clusters by processId, in
 * the order each process first appears in the (already sorted) list. */
export function groupItems(items: InstanceSummary[], group: GroupKey, locale: UiLocale): InboxGroup[] {
  if (group === "none") return [{ items }];
  const order: string[] = [];
  const byProcess = new Map<string, InstanceSummary[]>();
  for (const item of items) {
    if (!byProcess.has(item.processId)) {
      order.push(item.processId);
      byProcess.set(item.processId, []);
    }
    byProcess.get(item.processId)!.push(item);
  }
  return order.map((processId) => ({
    processId,
    label: processLabelOf(byProcess.get(processId)![0]!, locale),
    items: byProcess.get(processId)!,
  }));
}

export function isClaimedByCurrentUser(item: InstanceSummary, actorId: string): boolean {
  return item.assignment?.claimedBy === actorId;
}

export function isUnclaimed(item: InstanceSummary): boolean {
  return !item.assignment?.claimedBy;
}

/** UI chrome, so it goes through the catalog like everything else — `now`
 * is a parameter (not `Date.now()` read internally) so this stays pure and
 * testable. */
export function waitingLabel(iso: string, locale: UiLocale, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t(locale, "tasks.waitingJustNow");
  if (minutes < 60) return `${minutes}${t(locale, "tasks.waitingMinutesSuffix")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t(locale, "tasks.waitingHoursSuffix")}`;
  return `${Math.floor(hours / 24)}${t(locale, "tasks.waitingDaysSuffix")}`;
}
