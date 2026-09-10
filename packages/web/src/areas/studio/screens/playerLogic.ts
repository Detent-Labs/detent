import { isResolvedViewField, firstTabWithIssue, type ResolvedViewEntry, type ResolvedViewTab, type SubmissionIssue } from "form-ui";

/** Seeds the form's local edit state from a fresh InstanceView, keyed by
 * field id. A note contributes no key: it carries no `field` of its own. */
export function seedFormValues(fields: ResolvedViewEntry[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter(isResolvedViewField).map((f) => [f.field.id, f.value]));
}

/**
 * Shared by `doCreate` and `doCreateTest` (draft-play-instance-marker): call
 * whichever creation route the caller injects, then load the fresh view for
 * the id it returns. Kept as a plain function, not inlined per handler, so
 * both call sites are covered by the same test.
 */
export async function createAndOpenInstance<V extends { kind: "published" | "test"; status: string }>(
  create: () => Promise<{ instanceId: string }>,
  getView: (instanceId: string) => Promise<V>,
): Promise<{ instanceId: string; view: V }> {
  const created = await create();
  const view = await getView(created.instanceId);
  return { instanceId: created.instanceId, view };
}

/** Whether the Player's test-instance marker should render (draft-play-instance-marker). */
export function isTestInstance(view: { kind?: "published" | "test" } | undefined): boolean {
  return view?.kind === "test";
}

/**
 * The tab to open after a failed submission, or `undefined` when nothing
 * should move (form-view-tabs design.md, "The issue switch belongs to the
 * consumer"). A thin, screen-owned wrapper around form-ui's
 * `firstTabWithIssue`, kept here rather than inlined so the decision is
 * unit-tested the way every other piece of this screen's logic is.
 *
 * Pure and deterministic: the same `issuesByField` content always answers
 * the same tab. That is the property `PlayerScreen`'s `useEffect` leans on —
 * it keys itself on `validationIssues` (server state, stable across
 * unrelated re-renders) rather than on `issuesByField`, a `Map` rebuilt
 * fresh every render. Keying the effect on that Map instead would re-run it,
 * and so re-call this, on every unrelated re-render — reopening a tab the
 * operator had deliberately switched away from while the same stale issues
 * sat in state. See `form-tab-switch-effect.test.ts` for the structural pin
 * on that choice.
 */
export function tabToOpenOnFailure(
  fields: ResolvedViewEntry[],
  tabs: ResolvedViewTab[],
  issuesByField: Map<string, SubmissionIssue[]>,
): string | undefined {
  return firstTabWithIssue(fields, tabs, issuesByField);
}
