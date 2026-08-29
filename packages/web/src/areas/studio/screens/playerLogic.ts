/** Seeds the form's local edit state from a fresh InstanceView, keyed by field id. */
export function seedFormValues(fields: { field: { id: string }; value: unknown }[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f.field.id, f.value]));
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
