import { isResolvedViewField, type ResolvedViewEntry, type ResolvedViewTab, type SubmissionIssue } from "./types.js";

/**
 * The tab rules, as pure functions over a resolved view. `FieldForm` reads
 * them on every render — the open tab is derived, never stored — and so does
 * each consumer, which owns the `activeTab` it passes back in. One behavior,
 * three call sites.
 */

/** True for an entry the strip's `tabKey` panel draws: a ROOT entry (a member
 * of a group draws inside its group, not on its own) whose `tab` names that
 * tab. `drawnTabs` and `FieldForm`'s panel filter share this predicate, so a
 * drawn tab always has something to draw. */
function drawsOnTab(entry: ResolvedViewEntry, tabKey: string): boolean {
  return !entry.group && entry.tab === tabKey;
}

/**
 * The tabs the strip draws, in the view's own order. A tab holding no
 * resolved entry is not drawn: a tab whose entries all resolved invisible
 * arrives here as a tab no entry names, and so does a tab its author left
 * empty. That is what gives an author a conditional tab, with no `visible` of
 * the tab's own.
 */
export function drawnTabs(entries: ResolvedViewEntry[], tabs: ResolvedViewTab[]): ResolvedViewTab[] {
  return tabs.filter((tab) => entries.some((entry) => drawsOnTab(entry, tab.key)));
}

/**
 * The tab an entry draws on. A group's members carry no `tab` of their own —
 * the authoring rules forbid one — so a member's tab is its group's, and a
 * group nested in a group walks up again. The hop count is bounded by the
 * entry count, so a malformed cycle terminates rather than hanging.
 */
function owningTab(entry: ResolvedViewEntry, entries: ResolvedViewEntry[]): string | undefined {
  let current = entry;
  for (let hops = 0; hops <= entries.length; hops++) {
    if (current.tab !== undefined) return current.tab;
    if (current.group === undefined) return undefined;
    const groupKey = current.group;
    const parent = entries.find((e) => isResolvedViewField(e) && e.field.key === groupKey);
    if (!parent) return undefined;
    current = parent;
  }
  return undefined;
}

/**
 * How many issues the entries on `tabKey` hold, counting a group's members
 * under the group's own tab. `FieldForm` draws it beside the tab's label, and
 * that same number is the tab's screen-reader text: color alone carries no
 * state.
 */
export function tabIssueCount(
  entries: ResolvedViewEntry[],
  tabKey: string,
  issuesByField: Map<string, SubmissionIssue[]> | undefined,
): number {
  if (!issuesByField || issuesByField.size === 0) return 0;
  let count = 0;
  for (const entry of entries) {
    if (!isResolvedViewField(entry)) continue;
    if (owningTab(entry, entries) !== tabKey) continue;
    count += issuesByField.get(entry.field.id)?.length ?? 0;
  }
  return count;
}

/**
 * The first drawn tab, in the strip's own order, holding an entry that
 * carries an issue; `undefined` when no drawn tab holds one.
 *
 * A consumer calls this after a submission fails and sets its own
 * `activeTab` to the answer: a required field on an unopened tab otherwise
 * blocks the submission with nothing on screen to explain it. The switch
 * belongs to the consumer — `FieldForm` holds no tab state, so it can start
 * no switch of its own.
 */
export function firstTabWithIssue(
  entries: ResolvedViewEntry[],
  tabs: ResolvedViewTab[],
  issuesByField: Map<string, SubmissionIssue[]> | undefined,
): string | undefined {
  return drawnTabs(entries, tabs).find((tab) => tabIssueCount(entries, tab.key, issuesByField) > 0)?.key;
}
