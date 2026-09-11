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

/**
 * How many of `tabKey`'s FIELDS still carry an issue, counting a group's
 * members under the group's own tab. The sibling above counts issues; this
 * counts the fields holding them, which is what the switch announcement says
 * a participant still has to deal with. Two issues on one field are one field
 * to go back to.
 */
export function tabIssueFieldCount(
  entries: ResolvedViewEntry[],
  tabKey: string,
  issuesByField: Map<string, SubmissionIssue[]> | undefined,
): number {
  if (!issuesByField || issuesByField.size === 0) return 0;
  let count = 0;
  for (const entry of entries) {
    if (!isResolvedViewField(entry)) continue;
    if (owningTab(entry, entries) !== tabKey) continue;
    if ((issuesByField.get(entry.field.id)?.length ?? 0) > 0) count++;
  }
  return count;
}

/**
 * The live-region sentence a consumer announces when a failed submission
 * opened a tab the participant did not choose themselves. A count under one
 * announces nothing: an empty issue set is not worth speaking over whatever a
 * screen reader is already reading.
 *
 * The caller hands in both whole sentences from its own catalog, `{tab}` and
 * `{count}` still in place. A translator therefore sees each sentence entire,
 * per `design-language.md`'s "Never assemble a sentence from fragments", and
 * this package keeps the screen catalog it does not ship. `EntityTabs.tsx`'s
 * move announcer already spends the same two placeholders the same way.
 */
export function tabSwitchAnnouncement(
  sentences: { one: string; many: string },
  tabLabel: string,
  fieldCount: number,
): string {
  if (fieldCount < 1) return "";
  return (fieldCount === 1 ? sentences.one : sentences.many).replace("{tab}", tabLabel).replace("{count}", String(fieldCount));
}

/**
 * The tab a focus-moving key press moves focus to, as an index into the drawn
 * strip; `undefined` for a key the strip leaves alone. Arrow keys wrap at the
 * row's ends, `Home` and `End` jump to it — the WAI-ARIA tabs pattern's
 * manual-activation variant, the one `ProcessTabRow.tsx` already follows.
 * Focus moves alone: `Enter` and `Space` are what open a tab, and a `<button>`
 * turns both into the click a strip listens for.
 *
 * These four keys are a convenience OVER the plain-button pattern, not the
 * roving-tabindex variant: every tab stays tabbable, and no tab carries a
 * `tabIndex`. Both strips in this product read this one function — the
 * participant's `FieldForm`, and the studio form editor's own
 * `FormTabStrip.tsx` — so one key cannot come to mean two things.
 *
 * Extracted because this repo ships no DOM test library, so no test here can
 * fire the event that calls it.
 */
export function nextTabIndex(key: string, from: number, count: number): number | undefined {
  if (count === 0 || from < 0 || from >= count) return undefined;
  if (key === "ArrowRight") return (from + 1) % count;
  if (key === "ArrowLeft") return (from - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
}
